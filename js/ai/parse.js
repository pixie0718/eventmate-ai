// Validates what the model sends back. Anything unexpected is dropped; the UI shows the rest as plain text.
import { stripControl } from '../validate.js';

const MAX_ANSWER = 1200;
const MAX_TITLE = 80;
const MAX_DESCRIPTION = 300;
const MAX_NOTE = 200;
const LIMITS = { ideas: 5, vendorTasks: 4, budgetTips: 4, timelineNotes: 4, tips: 4 };

function cleanString(value, max) {
  if (typeof value !== 'string') return null;
  return stripControl(value).trim().slice(0, max) || null;
}

/** @returns {import('../types.js').AiItem[]} */
function cleanItems(list, limit) {
  const items = [];
  for (const i of Array.isArray(list) ? list : []) {
    const title = cleanString(i?.title, MAX_TITLE);
    const description = cleanString(i?.description, MAX_DESCRIPTION);
    if (title && description) items.push({ title, description });
  }
  return items.slice(0, limit);
}

/** @returns {string[]} */
function cleanStrings(list, limit) {
  const out = [];
  for (const t of Array.isArray(list) ? list : []) {
    const s = cleanString(t, MAX_NOTE);
    if (s) out.push(s);
  }
  return out.slice(0, limit);
}

/**
 * Validates the model output against a strict schema; anything unexpected is dropped.
 * @returns {import('../types.js').AiPlan}
 */
export function parseAiResponse(text) {
  const raw = String(text);
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  const bad = (cause) => new Error('The AI reply was not in the expected format.', { cause });
  if (start === -1 || end <= start) throw bad();
  let data;
  try { data = JSON.parse(raw.slice(start, end + 1)); } catch (err) { throw bad(err); }
  const result = {
    ideas: cleanItems(data.ideas, LIMITS.ideas),
    vendorTasks: cleanItems(data.vendorTasks, LIMITS.vendorTasks),
    budgetTips: cleanStrings(data.budgetTips, LIMITS.budgetTips),
    timelineNotes: cleanStrings(data.timelineNotes, LIMITS.timelineNotes),
    tips: cleanStrings(data.tips, LIMITS.tips),
  };
  if (Object.values(result).every((v) => v.length === 0)) throw new Error('The AI returned no usable suggestions.');
  return result;
}

/** Chat answers are free text: strip control characters and cap the length. */
export function parseChatReply(text) {
  const answer = cleanString(text, MAX_ANSWER);
  if (!answer) throw new Error('The AI returned an empty answer.');
  return answer;
}
