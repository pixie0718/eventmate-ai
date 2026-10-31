// Dependency-free server: serves the static app and proxies AI requests to DeepSeek,
// so DEEPSEEK_API_KEY stays on the server and never reaches the browser.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname, normalize } from 'node:path';
import { validateInput } from './js/validate.js';
import { buildPlan } from './js/planner.js';
import { buildPrompt, buildChatPrompt } from './js/ai.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const STATIC = new Set(['index.html', 'css', 'js']);
const COOLDOWN_MS = 3000;
const MAX_TRACKED_CLIENTS = 1000;
const lastCall = new Map();

// The same policy as the <meta> tag in index.html, plus the directives a meta tag cannot carry.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};

function loadEnv() {
  const file = join(root, '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const send = (res, status, body, type = 'application/json', extraHeaders = {}) => {
  res.writeHead(status, { ...SECURITY_HEADERS, 'content-type': type, ...extraHeaders });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

/** API answers are per-request and must never be cached. */
const sendJson = (res, status, body) => send(res, status, body, 'application/json', { 'cache-control': 'no-store' });

async function readJson(req, limit = 10_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error('too large');
    chunks.push(c);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const reject = (res, status, body) => { sendJson(res, status, body); return null; };

/** Remembers when each client last called an endpoint; returns true while still cooling down. */
function isCoolingDown(client) {
  const now = Date.now();
  if (lastCall.size > MAX_TRACKED_CLIENTS) {
    for (const [key, at] of lastCall) if (now - at >= COOLDOWN_MS) lastCall.delete(key);
  }
  const cooling = now - (lastCall.get(client) ?? 0) < COOLDOWN_MS;
  if (!cooling) lastCall.set(client, now);
  return cooling;
}

/** Reads, validates and rate-limits an AI request; returns { plan, body } or null after replying. */
async function prepareAiRequest(req, res) {
  if (!process.env.DEEPSEEK_API_KEY) return reject(res, 503, { error: 'not configured' });
  const client = `${req.socket.remoteAddress}${req.url}`; // cooldown per client and endpoint
  if (isCoolingDown(client)) return reject(res, 429, { error: 'rate limited' });

  let body;
  try { body = await readJson(req); } catch { return reject(res, 400, { error: 'bad request' }); }
  const { ok, value } = validateInput(body?.input ?? {});
  if (!ok) return reject(res, 400, { error: 'invalid input' });
  return { plan: buildPlan(value), body };
}

async function askModel(prompt, res) {
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  let upstream;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch {
    return sendJson(res, 502, { error: 'upstream unreachable' });
  }
  if (!upstream.ok) return sendJson(res, upstream.status === 429 ? 429 : 502, { error: 'upstream error' });
  const data = await upstream.json();
  return sendJson(res, 200, { text: data?.choices?.[0]?.message?.content ?? '' });
}

async function handlePersonalize(req, res) {
  const ctx = await prepareAiRequest(req, res);
  if (ctx) await askModel(buildPrompt(ctx.plan, ctx.body.notes), res);
}

async function handleChat(req, res) {
  const ctx = await prepareAiRequest(req, res);
  if (ctx) await askModel(buildChatPrompt(ctx.plan, ctx.body.question), res);
}

/** Serves one static file with an ETag (so reloads can be 304) and gzip for text. */
async function handleStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  if (rel.startsWith('..') || !STATIC.has(rel.split(/[\\/]/)[0])) return send(res, 404, 'Not found', 'text/plain');
  let body;
  try { body = await readFile(join(root, rel)); } catch { return send(res, 404, 'Not found', 'text/plain'); }

  const etag = `"${createHash('sha1').update(body).digest('base64url')}"`;
  const headers = { etag, 'cache-control': 'no-cache', vary: 'accept-encoding' };
  if (req.headers['if-none-match'] === etag) return send(res, 304, '', TYPES[extname(rel)], headers);
  if (String(req.headers['accept-encoding']).includes('gzip')) {
    body = gzipSync(body);
    headers['content-encoding'] = 'gzip';
  }
  return send(res, 200, body, TYPES[extname(rel)] ?? 'application/octet-stream', headers);
}

/** @returns {import('node:http').Server} the HTTP server (not yet listening) */
export function createApp() {
  return createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname === '/api/status') return sendJson(res, 200, { ai: Boolean(process.env.DEEPSEEK_API_KEY) });
    const post = { '/api/personalize': handlePersonalize, '/api/chat': handleChat }[pathname];
    if (post) return req.method === 'POST' ? post(req, res) : sendJson(res, 405, { error: 'method' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
    return handleStatic(req, res, pathname);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv();
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, () => console.log(`EventMate AI on http://localhost:${port}${process.env.DEEPSEEK_API_KEY ? '' : ' (AI disabled: DEEPSEEK_API_KEY not set)'}`));
}
