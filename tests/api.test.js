// The framework-free API logic, the Netlify function wrapper and the static build script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { handleApi, CSP, SECURITY_HEADERS } from '../api/handlers.js';
import netlifyApi, { config } from '../netlify/functions/api.js';
import { formatDate, addDays } from '../js/dates.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const input = {
  type: 'wedding',
  name: 'A & B',
  date: formatDate(addDays(new Date(), 90)),
  guests: 100,
  budget: 500000,
  currency: 'INR',
  vibe: 'modern',
  prefs: [],
};
const JSON_HEADERS = { 'content-type': 'application/json' };
let seq = 0;
const call = (pathname, body, extra = {}) =>
  handleApi({
    pathname,
    method: 'POST',
    contentType: 'application/json',
    client: `test-${++seq}`,
    readBody: async () => body,
    ...extra,
  });

/** Runs fn with DEEPSEEK_API_KEY set (or removed) and fetch replaced, then restores both. */
async function withEnv({ key = 'k', upstream } = {}, fn) {
  const saved = { key: process.env.DEEPSEEK_API_KEY, fetch: globalThis.fetch };
  if (key === null) delete process.env.DEEPSEEK_API_KEY;
  else process.env.DEEPSEEK_API_KEY = key;
  if (upstream) globalThis.fetch = upstream;
  try {
    return await fn();
  } finally {
    if (saved.key === undefined) delete process.env.DEEPSEEK_API_KEY;
    else process.env.DEEPSEEK_API_KEY = saved.key;
    globalThis.fetch = saved.fetch;
  }
}
const ok = (text) => async () => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content: text } }] }),
});

test('/api/status reports the key without exposing it; unknown paths 404; wrong methods 405', async () => {
  await withEnv({ key: null }, async () =>
    assert.deepEqual((await handleApi({ pathname: '/api/status', method: 'GET' })).body, { ai: false }),
  );
  await withEnv({ key: 'secret-xyz' }, async () => {
    const res = await handleApi({ pathname: '/api/status', method: 'GET' });
    assert.deepEqual(res.body, { ai: true });
    assert.ok(!JSON.stringify(res).includes('secret-xyz'));
  });
  assert.equal((await handleApi({ pathname: '/api/nope', method: 'GET' })).status, 404);
  assert.equal((await handleApi({ pathname: '/api/chat', method: 'GET' })).status, 405);
});

test('AI endpoints: 503 without a key, 400 for bad input or body, 200 with the model text', async () => {
  await withEnv({ key: null }, async () => assert.equal((await call('/api/chat', { input })).status, 503));
  await withEnv({ upstream: ok('hello') }, async () => {
    assert.equal((await call('/api/chat', { input: { ...input, guests: -5 } })).status, 400);
    assert.equal(
      (
        await call('/api/chat', null, {
          readBody: async () => {
            throw new Error('bad json');
          },
        })
      ).status,
      400,
    );
    const res = await call('/api/personalize', { input, notes: 'vegan' });
    assert.deepEqual(res, { status: 200, body: { text: 'hello' }, headers: {} });
  });
});

test('AI endpoints: the server builds the prompt, caps tokens and rate-limits per client and endpoint', async () => {
  let sent;
  const upstream = async (url, opts) => {
    sent = JSON.parse(opts.body);
    return ok('x')();
  };
  await withEnv({ upstream }, async () => {
    await call('/api/chat', { input, question: 'cut 10%?' }, { client: 'same' });
    assert.match(sent.messages[0].content, /cut 10%\?/);
    assert.ok(sent.max_tokens <= 450);
    const limited = await call('/api/chat', { input }, { client: 'same' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers['retry-after'], '3', 'tells the client when to retry');
    assert.equal(
      (await call('/api/personalize', { input }, { client: 'same' })).status,
      200,
      'separate bucket per endpoint',
    );
    assert.ok(sent.max_tokens <= 700);
  });
});

test('AI endpoints: upstream timeouts and errors become clean JSON errors', async () => {
  const timeout = async () => {
    throw Object.assign(new Error('t'), { name: 'TimeoutError' });
  };
  const down = async () => {
    throw new Error('offline');
  };
  await withEnv({ upstream: timeout }, async () => assert.equal((await call('/api/chat', { input })).status, 504));
  await withEnv({ upstream: down }, async () => assert.equal((await call('/api/chat', { input })).status, 502));
  await withEnv({ upstream: async () => ({ ok: false, status: 429 }) }, async () =>
    assert.equal((await call('/api/chat', { input })).status, 429),
  );
  await withEnv({ upstream: async () => ({ ok: false, status: 500 }) }, async () =>
    assert.equal((await call('/api/chat', { input })).status, 502),
  );
});

test('Netlify function: routes, security headers, no-store and a clean answer', async () => {
  assert.deepEqual(config.path, ['/api/status', '/api/personalize', '/api/chat']);
  await withEnv({ upstream: ok('from model') }, async () => {
    const req = new Request('https://site.netlify.app/api/chat', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ input, question: 'hi' }),
    });
    const res = await netlifyApi(req, { ip: '203.0.113.9' });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'from model' });
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-frame-options'), 'DENY');

    const huge = new Request('https://site.netlify.app/api/chat', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: 'x'.repeat(20_000),
    });
    assert.equal((await netlifyApi(huge, { ip: '203.0.113.10' })).status, 400);
  });
});

test('netlify.toml publishes only dist/, wires the function and repeats the security headers', () => {
  const toml = readFileSync(join(root, 'netlify.toml'), 'utf8');
  assert.match(toml, /publish = "dist"/);
  assert.match(toml, /functions = "netlify\/functions"/);
  assert.ok(toml.includes(`Content-Security-Policy = "${CSP}"`), 'toml CSP must equal the server CSP');
  for (const header of ['X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy'])
    assert.ok(toml.includes(header), header);
  assert.ok(
    SECURITY_HEADERS['content-security-policy'].startsWith(
      readFileSync(join(root, 'index.html'), 'utf8').match(/Content-Security-Policy" content="([^"]+)"/)[1],
    ),
  );
});

test('build-static copies only the browser files into dist/', () => {
  execFileSync('node', ['scripts/build-static.js'], { cwd: root });
  assert.deepEqual(readdirSync(join(root, 'dist')).sort(), ['css', 'index.html', 'js']);
  assert.ok(existsSync(join(root, 'dist/js/app.js')));
  assert.ok(statSync(join(root, 'dist/index.html')).size > 1000);
  for (const secret of ['.env', 'server.js', 'api', 'tests', 'netlify'])
    assert.equal(existsSync(join(root, 'dist', secret)), false, secret);
});

test('POST endpoints reject anything that is not JSON before doing any work', async () => {
  await withEnv({ upstream: ok('never reached') }, async () => {
    for (const contentType of [
      undefined,
      null,
      'text/plain',
      'application/x-www-form-urlencoded',
      'multipart/form-data',
    ]) {
      assert.equal((await call('/api/chat', { input }, { contentType })).status, 415, String(contentType));
    }
    assert.equal((await call('/api/chat', { input }, { contentType: 'application/json; charset=utf-8' })).status, 200);
  });
});

test('Netlify function: passes Retry-After through and rejects non-JSON posts', async () => {
  await withEnv({ upstream: ok('x') }, async () => {
    const request = (headers) =>
      new Request('https://site.netlify.app/api/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ input, question: 'hi' }),
      });
    assert.equal((await netlifyApi(request({ 'content-type': 'text/plain' }), { ip: '203.0.113.20' })).status, 415);
    assert.equal((await netlifyApi(request(JSON_HEADERS), { ip: '203.0.113.21' })).status, 200);
    const limited = await netlifyApi(request(JSON_HEADERS), { ip: '203.0.113.21' });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '3');
  });
});

test('the cooldown table forgets old clients instead of growing forever', async () => {
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    await withEnv({ upstream: ok('x') }, async () => {
      for (let i = 0; i < 1010; i++) await call('/api/chat', { input }, { client: `crowd-${i}` });
      clock += 4000; // every earlier client is past its cooldown
      assert.equal((await call('/api/chat', { input }, { client: 'crowd-0' })).status, 200);
      assert.equal((await call('/api/chat', { input }, { client: 'crowd-0' })).status, 429);
    });
  } finally {
    Date.now = realNow;
  }
});
