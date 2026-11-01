// Browser-level tests: the real index.html and js/app.js run inside jsdom with a fake fetch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import axe from 'axe-core';
import { formatDate, addDays } from '../js/dates.js';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
const { document } = window;

// jsdom lacks a few browser APIs the app uses.
window.Element.prototype.scrollIntoView = () => {};
window.matchMedia = () => ({ matches: false });
Object.assign(globalThis, {
  window,
  document,
  localStorage: window.localStorage,
  FormData: window.FormData,
  matchMedia: window.matchMedia,
  HTMLElement: window.HTMLElement,
});

const AI_PLAN = {
  ideas: [{ title: 'Lantern walk', description: 'Light the path.' }],
  vendorTasks: [{ title: 'Tent check', description: 'Confirm windproofing.' }],
  budgetTips: ['Keep the buffer.'],
  timelineNotes: ['Book early.'],
  tips: ['Breathe.'],
};
const ai = { on: true, chatAnswer: 'Trim decor first.', fail: false };
globalThis.fetch = async (url) => {
  const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
  if (url === '/api/status') return json({ ai: ai.on });
  if (ai.fail) return json({}, 502);
  if (url === '/api/personalize') return json({ text: JSON.stringify(AI_PLAN) });
  return json({ text: ai.chatAnswer });
};

// The app's 3 s AI cooldown is real; move the clock forward instead of waiting.
let clock = Date.now();
const realNow = Date.now;
Date.now = () => clock;
const advance = (ms = 5000) => {
  clock += ms;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
test.after(() => {
  Date.now = realNow;
});

const $ = (id) => document.getElementById(id);
const form = () => $('planner-form');
function fillForm(overrides = {}) {
  const values = {
    type: 'wedding',
    name: 'Asha & Ravi',
    date: formatDate(addDays(new Date(), 90)),
    guests: '120',
    budget: '800000',
    currency: 'INR',
    city: 'Pune',
    vibe: 'modern',
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form().elements[key].value = value;
}
const submit = async () => {
  form().dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
  await settle();
};

await import('../js/app.js');
await settle();

test('on load the page reports that AI is on', () => {
  assert.match($('ai-state').textContent, /AI is on/);
  assert.equal($('ai-button').disabled, false);
  assert.equal($('results').hidden, true);
});

test('an invalid form shows accessible errors and no plan', async () => {
  fillForm({ name: '', guests: '0' });
  await submit();
  assert.equal($('results').hidden, true);
  assert.equal(form().elements.name.getAttribute('aria-invalid'), 'true');
  assert.match($('err-name').textContent, /name/i);
  assert.match($('err-guests').textContent, /1 to 5000/);
});

test('the hero cards pick the event type', () => {
  const birthday = document.querySelector('.event-type[data-type="birthday"]');
  birthday.click();
  assert.equal(form().elements.type.value, 'birthday');
  assert.equal(birthday.getAttribute('aria-pressed'), 'true');
  assert.equal(document.querySelector('.event-type[data-type="wedding"]').getAttribute('aria-pressed'), 'false');
});

test('a valid form renders the whole plan, then AI personalises it', async () => {
  fillForm();
  form().elements.prefs[0].checked = true; // outdoor
  $('ai-notes').value = 'vegan menu';
  await submit();
  await settle();
  assert.equal($('results').hidden, false);
  assert.equal($('budget-body').rows.length, 8);
  assert.ok($('timeline-list').children.length >= 13);
  assert.ok($('vendor-list').children.length >= 10);
  assert.equal($('idea-list').children.length, 6);
  assert.match($('progress-text').textContent, /^0 of \d+ tasks done \(0%\)$/);
  // AI suggestions land inside the matching sections
  assert.match($('ai-budget').textContent, /Keep the buffer/);
  assert.match($('ai-timeline').textContent, /Book early/);
  assert.match($('ai-vendors').textContent, /Tent check/);
  assert.equal($('ai-results').children.length, 2);
});

test('ticking a task updates progress and is remembered', () => {
  const box = $('timeline-list').querySelector('input');
  box.checked = true;
  box.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.match($('progress-text').textContent, /^1 of /);
  assert.ok(JSON.parse(window.localStorage.getItem('eventmate:v1')).checked[box.id]);
  assert.equal(box.closest('li').dataset.state, 'done');
});

test('chat: a chip asks a question and the answer is shown as plain text', async () => {
  advance();
  ai.chatAnswer = 'Cut decor <img src=x onerror=alert(1)> first.';
  document.querySelector('.chip').click();
  await settle();
  const msgs = $('chat-log').querySelectorAll('.msg');
  assert.equal(msgs.length, 2);
  assert.ok(msgs[0].classList.contains('user'));
  assert.match(msgs[1].textContent, /Cut decor <img/);
  assert.equal($('chat-log').querySelector('img'), null, 'AI text is never parsed as HTML');
});

test('chat: typing a question works and clears the box', async () => {
  advance();
  $('chat-input').value = 'What to book first?';
  $('chat-form').dispatchEvent(new window.Event('submit', { cancelable: true, bubbles: true }));
  await settle();
  assert.equal($('chat-log').querySelectorAll('.msg').length, 4);
  assert.equal($('chat-input').value, '');
});

test('when the AI fails the plan stays and the user is told', async () => {
  advance();
  ai.fail = true;
  document.querySelector('.chip').click();
  await settle();
  const last = [...$('chat-log').querySelectorAll('.msg.ai')].at(-1);
  assert.ok(last.classList.contains('failed'));
  assert.match(last.textContent, /plan is unaffected/);
  assert.equal($('results').hidden, false);

  advance();
  await $('ai-button').click();
  await settle();
  assert.match($('ai-status').textContent, /Your plan above is complete without it/);
  ai.fail = false;
});

test('the rendered page has no accessibility violations (axe, structural rules)', async () => {
  window.eval(axe.source);
  const results = await window.axe.run(document, { rules: { 'color-contrast': { enabled: false } } });
  const summary = Array.from(results.violations, (v) => `${v.id}: ${Array.from(v.nodes, (n) => n.target).join(' | ')}`);
  assert.deepEqual(summary, []);
});

test('download saves the plan as a JSON file and print opens the print dialog', async () => {
  const realCreate = URL.createObjectURL;
  const realRevoke = URL.revokeObjectURL;
  const realClick = window.HTMLAnchorElement.prototype.click;
  const realPrint = window.print;
  let blob;
  let link;
  let printed = false;
  URL.createObjectURL = (b) => {
    blob = b;
    return 'blob:test';
  };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function click() {
    link = this;
  };
  window.print = () => {
    printed = true;
  };
  try {
    $('download-button').click();
    assert.equal(link.download, 'eventmate-plan.json');
    assert.equal(link.getAttribute('href'), 'blob:test');
    const saved = JSON.parse(await blob.text());
    assert.equal(saved.input.name, 'Asha & Ravi');
    assert.ok(saved.budget.lines.length > 0 && saved.timeline.milestones.length > 0);

    $('print-button').click();
    assert.equal(printed, true);
  } finally {
    Object.assign(URL, { createObjectURL: realCreate, revokeObjectURL: realRevoke });
    window.HTMLAnchorElement.prototype.click = realClick;
    window.print = realPrint;
  }
});
