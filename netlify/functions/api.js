// Netlify Function: serves /api/status, /api/personalize and /api/chat.
// The key comes from the DEEPSEEK_API_KEY environment variable set in the Netlify dashboard.
import { handleApi, SECURITY_HEADERS } from '../../api/handlers.js';

const MAX_BODY_BYTES = 10_000;
// Netlify's free plan stops a function after about 10 s, so answer with a clean error just before that.
const UPSTREAM_TIMEOUT_MS = 8500;

export default async (req, context) => {
  const { pathname } = new URL(req.url);
  const { status, body } = await handleApi({
    pathname,
    method: req.method,
    client: context?.ip ?? 'unknown',
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    readBody: async () => {
      const text = await req.text();
      if (text.length > MAX_BODY_BYTES) throw new Error('too large');
      return JSON.parse(text);
    },
  });
  return Response.json(body, { status, headers: { ...SECURITY_HEADERS, 'cache-control': 'no-store' } });
};

export const config = { path: ['/api/status', '/api/personalize', '/api/chat'] };
