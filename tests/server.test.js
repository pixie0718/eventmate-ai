import http from 'node:http';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp, loadEnv } from '../server.js';
import { formatDate, addDays } from '../js/dates.js';

const input = { type: 'wedding', name: 'A & B', date: formatDate(addDays(new Date(), 90)), guests: 100, budget: 500000, currency: 'INR', vibe: 'modern', prefs: [] };

async function withServer(fn) {
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); }
}
const post = (base, body, path = '/api/personalize') => fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

test('serves the app but not secrets or server code', async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/);
    assert.match(await page.text(), /<!doctype html>/i);
    const script = await fetch(`${base}/js/ui/render.js`);
    assert.match(script.headers.get('content-type'), /javascript/);
    assert.match(await script.text(), /^\/\/ Renders a plan/);
    for (const p of ['/.env', '/server.js', '/package.json', '/../server.js', '/js/../.env']) {
      assert.equal((await fetch(`${base}${p}`)).status, 404, p);
    }
  });
});

test('/api/personalize is disabled without a key, validates input and proxies with the server-side key', async () => {
  const realFetch = globalThis.fetch;
  const saved = process.env.DEEPSEEK_API_KEY;
  try {
    await withServer(async (base) => {
      delete process.env.DEEPSEEK_API_KEY;
      assert.equal((await post(base, { input })).status, 503);

      process.env.DEEPSEEK_API_KEY = 'test-key';
      assert.equal((await post(base, { input: { ...input, guests: -1 } })).status, 400);

      await new Promise((r) => setTimeout(r, 3100)); // per-IP cooldown
      let upstream;
      globalThis.fetch = async (url, opts) => {
        if (!String(url).startsWith('https://api.deepseek.com')) return realFetch(url, opts);
        upstream = { url, opts };
        return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '{"ideas":[]}' } }] }) };
      };
      const res = await post(base, { input, notes: 'vegan' });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).text, '{"ideas":[]}');
      assert.equal(upstream.opts.headers.authorization, 'Bearer test-key');
      assert.match(JSON.parse(upstream.opts.body).messages[0].content, /vegan/);

      assert.equal((await post(base, { input })).status, 429, 'second call inside the cooldown');

      // chat has its own cooldown bucket and builds its prompt on the server
      const chat = await post(base, { input, question: 'what to cut?' }, '/api/chat');
      assert.equal(chat.status, 200);
      assert.match(JSON.parse(upstream.opts.body).messages[0].content, /what to cut\?/);
    });
  } finally {
    globalThis.fetch = realFetch;
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
  }
});

test('/api/status reports whether an AI key is configured, without exposing it', async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  try {
    await withServer(async (base) => {
      delete process.env.DEEPSEEK_API_KEY;
      assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { ai: false });
      process.env.DEEPSEEK_API_KEY = 'secret-123';
      const text = await (await fetch(`${base}/api/status`)).text();
      assert.deepEqual(JSON.parse(text), { ai: true });
      assert.ok(!text.includes('secret-123'));
    });
  } finally {
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
  }
});

test('every response carries the security headers, and the header CSP matches the page CSP', async () => {
  const html = (await import('node:fs')).readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const meta = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  await withServer(async (base) => {
    for (const path of ['/', '/api/status', '/missing']) {
      const res = await fetch(`${base}${path}`);
      assert.equal(res.headers.get('x-frame-options'), 'DENY', path);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff', path);
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer', path);
      assert.ok(res.headers.get('content-security-policy').startsWith(meta), `${path}: header CSP must extend the meta CSP`);
      assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    }
    assert.equal((await fetch(`${base}/api/status`)).headers.get('cache-control'), 'no-store');
  });
});

test('static files support ETag revalidation (304) and gzip', async () => {
  await withServer(async (base) => {
    const first = await fetch(`${base}/css/styles.css`);
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.equal(first.headers.get('cache-control'), 'no-cache');
    const again = await fetch(`${base}/css/styles.css`, { headers: { 'if-none-match': etag } });
    assert.equal(again.status, 304);

    const raw = await new Promise((resolve, reject) => {
      http.get(`${base}/js/app.js`, { headers: { 'accept-encoding': 'gzip' } }, (res) => resolve(res)).on('error', reject);
    });
    assert.equal(raw.headers['content-encoding'], 'gzip');
    raw.resume();
  });
});

test('POST bodies must be JSON, so other sites cannot spend the AI quota with a plain form post', async () => {
  await withServer(async (base) => {
    const form = await fetch(`${base}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'a=1' });
    assert.equal(form.status, 415);
    const none = await fetch(`${base}/api/chat`, { method: 'POST', body: JSON.stringify({ input }) });
    assert.equal(none.status, 415, 'no content type');
  });
});

test('a rate-limited call says how many seconds to wait', async () => {
  const saved = process.env.DEEPSEEK_API_KEY;
  process.env.DEEPSEEK_API_KEY = 'test-key';
  try {
    await withServer(async (base) => {
      await post(base, { input: { ...input, guests: -1 } }, '/api/chat'); // starts (or continues) the cooldown, then fails validation
      const limited = await post(base, { input }, '/api/chat');
      assert.equal(limited.status, 429);
      assert.equal(limited.headers.get('retry-after'), '3');
      assert.equal(limited.headers.get('cache-control'), 'no-store');
    });
  } finally {
    if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
  }
});

test('loadEnv reads KEY=value lines, strips quotes and never overrides real environment variables', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eventmate-env-'));
  const file = join(dir, '.env');
  writeFileSync(file, ['# comment', 'EM_TEST_PLAIN=abc', 'EM_TEST_QUOTED="with space"', "EM_TEST_SINGLE='x'", 'EM_TEST_KEEP=from-file', 'not a line'].join('\n'));
  process.env.EM_TEST_KEEP = 'from-environment';
  try {
    loadEnv(file);
    assert.equal(process.env.EM_TEST_PLAIN, 'abc');
    assert.equal(process.env.EM_TEST_QUOTED, 'with space');
    assert.equal(process.env.EM_TEST_SINGLE, 'x');
    assert.equal(process.env.EM_TEST_KEEP, 'from-environment');
    assert.doesNotThrow(() => loadEnv(join(dir, 'missing.env')), 'a missing file is fine');
  } finally {
    for (const key of ['EM_TEST_PLAIN', 'EM_TEST_QUOTED', 'EM_TEST_SINGLE', 'EM_TEST_KEEP']) delete process.env[key];
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a request with an unparseable URL gets a 400 and the server keeps running', async () => {
  await withServer(async (base) => {
    const { port } = new URL(base);
    const raw = (path) => new Promise((resolve, reject) => {
      http.get({ host: '127.0.0.1', port, path }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject);
    });
    assert.equal(await raw('//'), 400);
    assert.equal(await raw('//'), 400, 'and again: the first one did not break anything');
    assert.equal((await fetch(`${base}/`)).status, 200, 'still serving after the bad requests');
  });
});

test('an unexpected failure while handling a request becomes a 500, not a crash', async () => {
  await withServer(async (base) => {
    const realNow = Date.now;
    Date.now = () => { throw new Error('boom'); }; // handleApi reads the clock for the cooldown
    const saved = process.env.DEEPSEEK_API_KEY;
    process.env.DEEPSEEK_API_KEY = 'k';
    try {
      const res = await post(base, { input }, '/api/chat');
      assert.equal(res.status, 500);
    } finally {
      Date.now = realNow;
      if (saved === undefined) delete process.env.DEEPSEEK_API_KEY; else process.env.DEEPSEEK_API_KEY = saved;
    }
    assert.equal((await fetch(`${base}/`)).status, 200);
  });
});
