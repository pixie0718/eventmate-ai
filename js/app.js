// Entry point: owns the state and wires the form, buttons and renderers together.
import { validateInput } from './validate.js';
import { buildPlan } from './planner.js';
import { formatDate } from './dates.js';
import { $, $input, $select, el } from './ui/dom.js';
import { load, save } from './ui/storage.js';
import { readForm, writeForm, showErrors } from './ui/form.js';
import { renderPlan } from './ui/render.js';
import { initAiState, isAiAvailable, clearAiOutput, runAiPlan, askAiQuestion } from './ui/ai-panel.js';

let state = load(); // { input, checked: { [checkboxId]: boolean } }
/** @type {import('./types.js').Plan | null} */
let currentPlan = null;

const checks = {
  get: (id) => Boolean(state.checked?.[id]),
  set(id, value) {
    state.checked = { ...state.checked, [id]: value };
    save(state);
  },
};

function show(plan, options) {
  currentPlan = plan;
  renderPlan(plan, checks, options);
}

function onSubmit(event) {
  event.preventDefault();
  const { ok, errors, value } = validateInput(readForm());
  showErrors(errors);
  if (!ok) return;
  const sameEvent = state.input && JSON.stringify(state.input) === JSON.stringify(value);
  state = { input: value, checked: sameEvent ? state.checked : {} };
  save(state);
  clearAiOutput();
  const plan = buildPlan(value);
  show(plan);
  if (isAiAvailable()) runAiPlan(plan);
}

function onDownload() {
  if (!currentPlan) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(currentPlan, null, 2)], { type: 'application/json' }));
  el('a', { href: url, download: 'eventmate-plan.json' }).click();
  URL.revokeObjectURL(url);
}

/** Highlights the hero card that matches the selected event type. */
function syncEventTypeCards() {
  const type = $select('type').value;
  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.event-type'))) {
    b.setAttribute('aria-pressed', String(b.dataset.type === type));
  }
}

/**
 * The hero cards pick the event type, then take the user to the form.
 * @param {HTMLElement} button
 */
function onPickEventType(button) {
  const select = $select('type');
  select.value = button.dataset.type ?? select.value;
  syncEventTypeCards();
  $('form-heading').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  select.focus({ preventScroll: true });
}

function init() {
  $input('date').min = formatDate(new Date());

  for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.event-type'))) {
    b.addEventListener('click', () => onPickEventType(b));
  }
  $select('type').addEventListener('change', syncEventTypeCards);
  $('planner-form').addEventListener('submit', onSubmit);
  $('print-button').addEventListener('click', () => window.print());
  $('download-button').addEventListener('click', onDownload);
  $('ai-button').addEventListener('click', () => currentPlan && runAiPlan(currentPlan));
  $('chat-form').addEventListener('submit', (event) => {
    event.preventDefault();
    if (currentPlan) askAiQuestion(currentPlan, $input('chat-input').value);
  });
  for (const chip of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.chip'))) {
    chip.addEventListener('click', () => currentPlan && askAiQuestion(currentPlan, chip.dataset.question ?? ''));
  }
  initAiState();
  syncEventTypeCards();

  if (state.input) {
    writeForm(state.input);
    syncEventTypeCards();
    const { ok, value } = validateInput(state.input);
    if (ok) show(buildPlan(value), { focus: false });
  }
}

init();
