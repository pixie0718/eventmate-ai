// UI wiring. All user/AI text goes in via textContent (no HTML parsing) to prevent XSS.
import { validateInput, PREFS } from './validate.js';
import { buildPlan, parseDate, daysBetween } from './planner.js';
import { requestAiIdeas, isValidKey } from './ai.js';

const STORAGE_KEY = 'eventmate:v1';
const $ = (id) => document.getElementById(id);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

// ---------- storage (best effort; may be blocked) ----------
function load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? {}; } catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* ignore */ }
}

let state = load();
let currentPlan = null;
let apiKey = ''; // memory only, deliberately never persisted
let lastAiCall = 0;

const fmtMoney = (n, cur) => new Intl.NumberFormat(undefined, { style: 'currency', currency: cur, maximumFractionDigits: 0 }).format(n);
const fmtDate = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parseDate(iso));

// ---------- form ----------
function readForm() {
  const f = $('planner-form');
  const data = new FormData(f);
  return {
    type: data.get('type'), name: data.get('name'), date: data.get('date'), guests: data.get('guests'),
    budget: data.get('budget'), currency: data.get('currency'), city: data.get('city'), vibe: data.get('vibe'),
    prefs: data.getAll('prefs'),
  };
}

function writeForm(v) {
  const f = $('planner-form');
  for (const key of ['type', 'name', 'date', 'guests', 'budget', 'currency', 'city', 'vibe']) {
    if (v[key] !== undefined && f.elements[key]) f.elements[key].value = v[key];
  }
  for (const box of f.querySelectorAll('input[name="prefs"]')) box.checked = (v.prefs ?? []).includes(box.value);
}

function showErrors(errors) {
  for (const name of ['type', 'name', 'date', 'guests', 'budget', 'currency', 'vibe']) {
    const field = $('planner-form').elements[name];
    const out = $(`err-${name}`);
    if (!field || !out) continue;
    out.textContent = errors[name] ?? '';
    if (errors[name]) field.setAttribute('aria-invalid', 'true'); else field.removeAttribute('aria-invalid');
  }
  const first = Object.keys(errors)[0];
  if (first) $('planner-form').elements[first]?.focus();
}

// ---------- rendering ----------
function renderSummary(plan) {
  const { input, budget, timeline } = plan;
  const cards = [
    ['Event', input.name], ['Date', fmtDate(input.date)],
    ['Days left', String(timeline.daysAvailable)], ['Per guest', fmtMoney(budget.perGuest, input.currency)],
  ];
  const box = $('summary');
  box.replaceChildren(...cards.map(([label, value]) => el('div', { class: 'stat' }, el('dt', { text: label }), el('dd', { text: value }))));

  const notes = $('notices');
  notes.replaceChildren();
  if (timeline.compressed) {
    notes.append(el('p', { class: 'notice', text: `Tight schedule: only ${timeline.daysAvailable} days left of the ideal ${timeline.idealDays}. Deadlines were compressed, so start with the earliest items.` }));
  }
  for (const w of budget.warnings) notes.append(el('p', { class: 'notice', text: w }));
}

function renderBudget(plan) {
  const { budget, input } = plan;
  const body = $('budget-body');
  body.replaceChildren(...budget.lines.map((l) => {
    const fill = el('span', { class: 'fill' });
    fill.style.width = `${l.pct}%`; // CSSOM is allowed under the CSP; an inline style attribute is not
    const bar = el('span', { class: 'bar', 'aria-hidden': 'true' }, fill);
    return el('tr', {},
      el('th', { scope: 'row', text: l.label }),
      el('td', { text: `${l.pct}%` }),
      el('td', { class: 'num', text: fmtMoney(l.amount, input.currency) }),
      el('td', {}, bar));
  }));
  $('budget-total').textContent = fmtMoney(budget.total, input.currency);
  $('catering-note').textContent = `Catering works out to about ${fmtMoney(budget.cateringPerHead, input.currency)} per guest.`;
}

function checkbox(id, label, extra) {
  const input = el('input', { type: 'checkbox', id });
  input.checked = Boolean(state.checked?.[id]);
  input.addEventListener('change', () => {
    state.checked = { ...state.checked, [id]: input.checked };
    save(state);
    updateProgress();
  });
  return el('li', {}, input, el('label', { for: id }, el('span', { class: 'title', text: label }), ...extra));
}

function startOfToday() {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

function whenLabel(days) {
  if (days === 0) return 'Today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}

function timelineState(done, days, isEvent) {
  if (done) return 'done';
  if (isEvent) return 'event';
  if (days < 0) return 'overdue';
  return days === 0 ? 'today' : 'upcoming';
}

function renderTimeline(plan) {
  const today = startOfToday();
  $('timeline-list').replaceChildren(...plan.timeline.milestones.map((m) => {
    const date = parseDate(m.date);
    const days = daysBetween(today, date);
    const id = `chk-${m.id}`;
    const input = el('input', { type: 'checkbox', id });
    input.checked = Boolean(state.checked?.[id]);
    const when = el('span', { class: 'tl-when', text: whenLabel(days) });
    const li = el('li', { class: 'tl-item' },
      el('div', { class: 'tl-date', 'aria-hidden': 'true' },
        el('span', { class: 'day', text: String(date.getDate()) }),
        el('span', { class: 'mon', text: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date) })),
      el('span', { class: 'tl-dot', 'aria-hidden': 'true' }),
      el('div', { class: 'tl-card' }, input,
        el('label', { for: id },
          el('span', { class: 'title', text: m.title }),
          el('span', { class: 'meta', text: `${fmtDate(m.date)} · ${m.detail}` }),
          when)));
    const refresh = () => { li.dataset.state = timelineState(input.checked, days, m.daysBefore === 0); };
    refresh();
    input.addEventListener('change', () => {
      state.checked = { ...state.checked, [id]: input.checked };
      save(state);
      refresh();
      updateProgress();
    });
    return li;
  }));
}

function renderVendors(plan) {
  $('vendor-list').replaceChildren(...plan.vendors.map((v) => {
    const category = plan.budget.lines.find((l) => l.id === v.category)?.label ?? '';
    return checkbox(`chk-${v.id}`, v.name, [
      el('span', { class: `badge ${v.priority}`, text: v.priority }),
      el('span', { class: 'meta', text: `Book by ${fmtDate(v.bookBy)} · ${category} · ${v.note}` }),
    ]);
  }));
}

function renderIdeas(plan) {
  $('idea-list').replaceChildren(...plan.ideas.map((i) => el('li', {}, el('strong', { text: i.title }), el('p', { text: i.text }))));
}

function updateProgress() {
  const boxes = document.querySelectorAll('#results input[type="checkbox"]');
  const done = [...boxes].filter((b) => b.checked).length;
  const pct = boxes.length ? Math.round((done / boxes.length) * 100) : 0;
  $('progress').value = pct;
  $('progress-text').textContent = `${done} of ${boxes.length} tasks done (${pct}%)`;
}

function renderPlan(plan, { focus = true } = {}) {
  currentPlan = plan;
  renderSummary(plan); renderBudget(plan); renderTimeline(plan); renderVendors(plan); renderIdeas(plan);
  $('ai-results').replaceChildren();
  $('results').hidden = false;
  updateProgress();
  if (focus) { $('results-heading').focus(); $('results-heading').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }
}

// ---------- handlers ----------
function onSubmit(event) {
  event.preventDefault();
  const { ok, errors, value } = validateInput(readForm());
  showErrors(errors);
  if (!ok) return;
  state = { input: value, checked: state.input && JSON.stringify(state.input) === JSON.stringify(value) ? state.checked : {} };
  save(state);
  renderPlan(buildPlan(value));
}

function onDownload() {
  if (!currentPlan) return;
  const blob = new Blob([JSON.stringify(currentPlan, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: 'eventmate-plan.json' });
  a.click();
  URL.revokeObjectURL(url);
}

function setAiStatus(msg, isError = false) {
  const s = $('ai-status');
  s.textContent = msg;
  s.classList.toggle('error', isError);
}

async function onAi() {
  if (!currentPlan) return;
  if (Date.now() - lastAiCall < 3000) return setAiStatus('Please wait a few seconds between requests.', true);
  apiKey = $('api-key').value.trim();
  if (!isValidKey(apiKey)) return setAiStatus('Enter a valid Anthropic API key (starts with sk-ant-).', true);
  lastAiCall = Date.now();
  const btn = $('ai-button');
  btn.disabled = true;
  setAiStatus('Asking Claude for ideas…');
  try {
    const { ideas, tips } = await requestAiIdeas({ apiKey, plan: currentPlan, notes: $('ai-notes').value });
    const out = $('ai-results');
    out.replaceChildren(
      ...ideas.map((i) => el('li', {}, el('strong', { text: i.title }), el('p', { text: i.description }))),
      ...tips.map((t) => el('li', { class: 'tip' }, el('p', { text: `Tip: ${t}` }))),
    );
    setAiStatus('Done. AI suggestions are below. Review them before relying on them.');
  } catch (err) {
    setAiStatus(err.message, true);
  } finally {
    btn.disabled = false;
  }
}

function init() {
  const dateInput = $('date');
  const today = new Date();
  dateInput.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  for (const p of PREFS) if (!document.querySelector(`input[value="${p}"]`)) console.warn('missing pref checkbox', p);

  $('planner-form').addEventListener('submit', onSubmit);
  $('print-button').addEventListener('click', () => window.print());
  $('download-button').addEventListener('click', onDownload);
  $('ai-button').addEventListener('click', onAi);

  if (state.input) {
    writeForm(state.input);
    const { ok, value } = validateInput(state.input);
    if (ok) renderPlan(buildPlan(value), { focus: false });
  }
}

init();
