// The browser side of the AI layer. It only talks to our own endpoints (server.js / Netlify function),
// which hold the AI provider key, so the key never reaches the browser.
import { MAX_NOTES, MAX_QUESTION } from './prompts.js';
import { parseAiResponse, parseChatReply } from './parse.js';

const API = { personalize: '/api/personalize', chat: '/api/chat', status: '/api/status' };
const DEFAULT_TIMEOUT_MS = 30_000;

/** POSTs JSON to one of our endpoints and maps failures to safe, user-facing messages. */
async function post(url, payload, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const message = err instanceof Error && err.name === 'AbortError' ? 'The AI request timed out.' : 'Could not reach the AI service.';
    throw new Error(message, { cause: err });
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new Error('Rate limit reached. Please wait a bit and retry.');
  if (res.status === 503) throw new Error('AI is not configured on the server.');
  if (!res.ok) throw new Error(`The AI service returned an error (${res.status}).`);
  const body = await res.json();
  return typeof body?.text === 'string' ? body.text : '';
}

/** @returns {Promise<import('../types.js').AiPlan>} */
export async function requestAiPlan({ plan, notes, ...options }) {
  const text = await post(API.personalize, { input: plan.input, notes: String(notes ?? '').slice(0, MAX_NOTES) }, options);
  return parseAiResponse(text);
}

/** @returns {Promise<string>} */
export async function requestAiChat({ plan, question, ...options }) {
  const text = await post(API.chat, { input: plan.input, question: String(question ?? '').slice(0, MAX_QUESTION) }, options);
  return parseChatReply(text);
}

/** True when the server has an AI key configured. Never throws: "unknown" counts as off. */
export async function fetchAiAvailable(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(API.status);
    return res.ok && (await res.json())?.ai === true;
  } catch {
    return false;
  }
}
