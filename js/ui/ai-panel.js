// The AI parts of the page: personalisation of the plan and the Q&A chat.
// Everything here is optional: if the AI is off or fails, the rule-based plan stays untouched.
import { requestAiPlan, requestAiChat, fetchAiAvailable } from '../ai.js';
import { $, $button, $input, el, errorMessage } from './dom.js';

const COOLDOWN_MS = 3000;
const lastCall = { plan: 0, chat: 0 };
let available = false;

function setStatus(msg, isError = false) {
  const s = $('ai-status');
  s.textContent = msg;
  s.classList.toggle('error', isError);
}

const tooSoon = (kind) => {
  if (Date.now() - lastCall[kind] < COOLDOWN_MS) return true;
  lastCall[kind] = Date.now();
  return false;
};

/** Checks whether the server has an AI key and tells the user either way. */
export async function initAiState() {
  available = await fetchAiAvailable();
  const state = $('ai-state');
  state.textContent = available
    ? '✨ AI is on: it will personalise your plan after you create it.'
    : 'AI is off (no key configured on the server). You still get the full rule-based plan.';
  state.classList.toggle('on', available);
  $button('ai-button').disabled = !available;
  $button('chat-button').disabled = !available;
  for (const chip of document.querySelectorAll('.chip')) /** @type {HTMLButtonElement} */ (chip).disabled = !available;
  if (!available) setStatus('AI is unavailable right now. Your plan is complete without it.');
}

export const isAiAvailable = () => available;

function renderBox(id, title, nodes) {
  const box = $(id);
  box.replaceChildren(...(nodes.length ? [el('h4', { text: `✨ ${title}` }), el('ul', {}, ...nodes)] : []));
  box.hidden = nodes.length === 0;
}

const note = (text) => el('li', { text });
const itemNode = (i) => el('li', {}, el('strong', { text: i.title }), el('span', { text: ` ${i.description}` }));

/** Removes AI suggestions and the chat from a previous plan. */
export function clearAiOutput() {
  for (const id of ['ai-budget', 'ai-timeline', 'ai-vendors']) renderBox(id, '', []);
  $('ai-results').replaceChildren();
  $('chat-log').replaceChildren();
  setStatus('');
}

/**
 * Asks the AI to personalise the plan and fills the AI boxes. Never throws: failures become a status message.
 * @param {import('../types.js').Plan} plan
 */
export async function runAiPlan(plan) {
  if (!available) return setStatus('AI is unavailable right now. Your plan above is complete without it.');
  if (tooSoon('plan')) return setStatus('Please wait a few seconds between requests.', true);
  const button = $button('ai-button');
  button.disabled = true;
  setStatus('Asking AI to personalise your plan…');
  try {
    const ai = await requestAiPlan({ plan, notes: $input('ai-notes').value });
    renderBox('ai-budget', 'AI budget tips', ai.budgetTips.map(note));
    renderBox('ai-timeline', 'AI timeline notes', ai.timelineNotes.map(note));
    renderBox('ai-vendors', 'AI vendor tasks', ai.vendorTasks.map(itemNode));
    $('ai-results').replaceChildren(
      ...ai.ideas.map((i) => el('li', {}, el('strong', { text: i.title }), el('p', { text: i.description }))),
      ...ai.tips.map((t) => el('li', { class: 'tip' }, el('p', { text: `Tip: ${t}` }))),
    );
    setStatus('Done. AI suggestions were added to each section. Figures come from the plan; review AI advice before relying on it.');
  } catch (err) {
    setStatus(`${errorMessage(err)} Your plan above is complete without it.`, true);
  } finally {
    button.disabled = !available;
  }
}

/** One chat message. `who` is "You" or "EventMate AI"; text always goes in via textContent. */
function message(kind, who, text) {
  const body = el('p', { text });
  return { node: el('li', { class: `msg ${kind}` }, el('span', { class: 'who', text: who }), body), body };
}

/**
 * Adds the question and the AI's answer to the chat log.
 * @param {import('../types.js').Plan} plan
 * @param {string} question
 */
export async function askAiQuestion(plan, question) {
  const q = question.trim();
  if (!q) return;
  if (tooSoon('chat')) return setStatus('Please wait a few seconds between questions.', true);
  const log = $('chat-log');
  const answer = message('ai pending', 'EventMate AI', 'Thinking…');
  log.append(message('user', 'You', q).node, answer.node);
  answer.node.scrollIntoView({ block: 'nearest' });
  $button('chat-button').disabled = true;
  $input('chat-input').value = '';
  try {
    answer.body.textContent = await requestAiChat({ plan, question: q });
  } catch (err) {
    answer.body.textContent = `${errorMessage(err)} Your plan is unaffected.`;
    answer.node.classList.add('failed');
  } finally {
    answer.node.classList.remove('pending');
    $button('chat-button').disabled = !available;
    answer.node.scrollIntoView({ block: 'nearest' });
  }
}
