// Framework-free API logic shared by server.js (local / any Node host) and the Netlify function.
// Each call takes plain values and returns { status, body }, so it is easy to test.
import { validateInput } from '../js/validate.js';
import { buildPlan } from '../js/planner.js';
import { buildPrompt, buildChatPrompt } from '../js/ai.js';

const COOLDOWN_MS = 3000;
const MAX_TRACKED_CLIENTS = 1000;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TOKENS = { personalize: 700, chat: 450 };
const lastCall = new Map();

// Same policy as the <meta> tag in index.html, plus the directives a meta tag cannot carry.
export const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const SECURITY_HEADERS = {
  'content-security-policy': CSP,
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
};

const reply = (status, body) => ({ status, body });

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

async function askModel(prompt, maxTokens, timeoutMs) {
  const base = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  let upstream;
  try {
    upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return reply(timedOut ? 504 : 502, { error: timedOut ? 'upstream timeout' : 'upstream unreachable' });
  }
  if (!upstream.ok) return reply(upstream.status === 429 ? 429 : 502, { error: 'upstream error' });
  const data = await upstream.json();
  return reply(200, { text: data?.choices?.[0]?.message?.content ?? '' });
}

/**
 * @param {object} request
 * @param {string} request.pathname  e.g. /api/chat
 * @param {string} request.method
 * @param {() => Promise<any>} request.readBody  parses the JSON body (may throw)
 * @param {string} request.client  identifies the caller for the cooldown
 * @param {number} [request.timeoutMs]  upstream timeout (Netlify's free plan allows about 10 s per function)
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleApi({ pathname, method, readBody, client, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (pathname === '/api/status') return reply(200, { ai: Boolean(process.env.DEEPSEEK_API_KEY) });
  const kind = { '/api/personalize': 'personalize', '/api/chat': 'chat' }[pathname];
  if (!kind) return reply(404, { error: 'not found' });
  if (method !== 'POST') return reply(405, { error: 'method' });
  if (!process.env.DEEPSEEK_API_KEY) return reply(503, { error: 'not configured' });
  if (isCoolingDown(`${client}${pathname}`)) return reply(429, { error: 'rate limited' });

  let body;
  try { body = await readBody(); } catch { return reply(400, { error: 'bad request' }); }
  const { ok, value } = validateInput(body?.input ?? {});
  if (!ok) return reply(400, { error: 'invalid input' });

  const plan = buildPlan(value);
  const prompt = kind === 'chat' ? buildChatPrompt(plan, body.question) : buildPrompt(plan, body.notes);
  return askModel(prompt, MAX_TOKENS[kind], timeoutMs);
}
