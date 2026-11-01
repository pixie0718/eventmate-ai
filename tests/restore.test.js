// Opening the page again: a saved event is put back into the form and its plan is shown straight away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { formatDate, addDays } from '../js/dates.js';

const SAVED = {
  type: 'birthday', name: 'Restored party', date: formatDate(addDays(new Date(), 40)),
  guests: 30, budget: 60000, currency: 'INR', city: 'Goa', vibe: 'fun', prefs: ['kids'],
};

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const { window } = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true, runScripts: 'outside-only' });
const { document } = window;
window.Element.prototype.scrollIntoView = () => {};
window.matchMedia = () => ({ matches: false });
Object.assign(globalThis, {
  window, document, localStorage: window.localStorage, FormData: window.FormData,
  matchMedia: window.matchMedia, HTMLElement: window.HTMLElement,
});
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ai: false }) });

window.localStorage.setItem('eventmate:v1', JSON.stringify({ input: SAVED, checked: {} }));
await import('../js/app.js');
await new Promise((resolve) => setTimeout(resolve, 20));

const form = document.getElementById('planner-form');

test('the saved values are written back into the form', () => {
  assert.equal(form.elements.name.value, 'Restored party');
  assert.equal(form.elements.type.value, 'birthday');
  assert.equal(form.elements.city.value, 'Goa');
  assert.equal(form.elements.guests.value, '30');
  const ticked = [...form.querySelectorAll('input[name="prefs"]')].filter((box) => box.checked).map((box) => box.value);
  assert.deepEqual(ticked, ['kids']);
});

test('the plan is rebuilt from the saved event without the user pressing anything', () => {
  assert.equal(document.getElementById('results').hidden, false);
  assert.match(document.getElementById('vendor-list').textContent, /Kids' corner/);
  assert.match(document.getElementById('idea-list').textContent, /Restored party/);
  assert.equal(document.querySelector('.event-type[data-type="birthday"]').getAttribute('aria-pressed'), 'true');
});

test('without AI the page says so and the AI buttons stay disabled', () => {
  assert.match(document.getElementById('ai-state').textContent, /AI is off/);
  assert.equal(document.getElementById('ai-button').disabled, true);
});
