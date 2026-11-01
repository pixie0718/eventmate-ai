// Dependency-free server: serves the static app and proxies AI requests to DeepSeek,
// so DEEPSEEK_API_KEY stays on the server and never reaches the browser.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, extname, normalize } from 'node:path';
import { handleApi, SECURITY_HEADERS } from './api/handlers.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};
const STATIC = new Set(['index.html', 'css', 'js']);

/** Loads KEY=value lines from a .env file into process.env, never overriding variables that are already set. */
export function loadEnv(file = join(root, '.env')) {
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
const sendJson = (res, status, body, headers = {}) =>
  send(res, status, body, 'application/json', { ...headers, 'cache-control': 'no-store' });

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

/** Serves one static file with an ETag (so reloads can be 304) and gzip for text. */
async function handleStatic(req, res, pathname) {
  const rel = normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  if (rel.startsWith('..') || !STATIC.has(rel.split(/[\\/]/)[0])) return send(res, 404, 'Not found', 'text/plain');
  let body;
  try {
    body = await readFile(join(root, rel));
  } catch {
    return send(res, 404, 'Not found', 'text/plain');
  }

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
  return createServer(async (req, res) => {
    // One bad request must never take the whole server down, so every failure becomes a plain error response.
    try {
      await route(req, res);
    } catch {
      if (!res.headersSent) send(res, 500, 'Server error', 'text/plain');
      else res.end();
    }
  });
}

/** @returns {string | null} the path of a request URL, or null when it cannot be parsed (for example "//") */
function pathOf(url) {
  try {
    return new URL(url ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

async function route(req, res) {
  const pathname = pathOf(req.url);
  if (pathname === null) return send(res, 400, 'Bad request', 'text/plain');
  if (pathname.startsWith('/api/')) {
    const { status, body, headers } = await handleApi({
      pathname,
      method: req.method ?? 'GET',
      contentType: req.headers['content-type'],
      readBody: () => readJson(req),
      client: String(req.socket.remoteAddress),
    });
    return sendJson(res, status, body, headers);
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', 'text/plain');
  return handleStatic(req, res, pathname);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  loadEnv();
  const port = Number(process.env.PORT) || 8080;
  createApp().listen(port, () =>
    console.log(
      `EventMate AI on http://localhost:${port}${process.env.DEEPSEEK_API_KEY ? '' : ' (AI disabled: DEEPSEEK_API_KEY not set)'}`,
    ),
  );
}
