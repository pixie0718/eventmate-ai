import test from 'node:test';
import assert from 'node:assert/strict';
import { validateInput, sanitizeText } from '../js/validate.js';

const TODAY = new Date(2026, 5, 15);
const good = { type: 'birthday', name: 'Riya', date: '2026-07-01', guests: '40', budget: '50000', currency: 'INR', city: 'Delhi', vibe: 'fun', prefs: ['kids'] };

test('accepts valid input and normalises numbers', () => {
  const r = validateInput(good, TODAY);
  assert.equal(r.ok, true);
  assert.equal(r.value.guests, 40);
  assert.equal(r.value.budget, 50000);
});

test('accepts today as the event date but rejects yesterday', () => {
  assert.equal(validateInput({ ...good, date: '2026-06-15' }, TODAY).ok, true);
  assert.match(validateInput({ ...good, date: '2026-06-14' }, TODAY).errors.date, /today or later/);
});

test('rejects impossible and far-future dates', () => {
  assert.ok(validateInput({ ...good, date: '2026-02-31' }, TODAY).errors.date);
  assert.ok(validateInput({ ...good, date: 'tomorrow' }, TODAY).errors.date);
  assert.ok(validateInput({ ...good, date: '2031-01-01' }, TODAY).errors.date);
});

test('rejects bad numbers', () => {
  for (const guests of ['0', '-5', '1.5', 'abc', '5001', '']) assert.ok(validateInput({ ...good, guests }, TODAY).errors.guests, guests);
  for (const budget of ['0', '-1', '2.5', 'NaN', '1e12', '']) assert.ok(validateInput({ ...good, budget }, TODAY).errors.budget, budget);
});

test('rejects unknown enum values', () => {
  assert.ok(validateInput({ ...good, type: 'funeral' }, TODAY).errors.type);
  assert.ok(validateInput({ ...good, currency: 'BTC' }, TODAY).errors.currency);
  assert.ok(validateInput({ ...good, vibe: '<script>' }, TODAY).errors.vibe);
});

test('requires a name and strips unknown preferences', () => {
  assert.ok(validateInput({ ...good, name: '   ' }, TODAY).errors.name);
  assert.deepEqual(validateInput({ ...good, prefs: ['kids', 'kids', 'hacker'] }, TODAY).value.prefs, ['kids']);
  assert.deepEqual(validateInput({ ...good, prefs: 'kids' }, TODAY).value.prefs, []);
});

test('sanitizeText removes control characters and caps length', () => {
  assert.equal(sanitizeText('a\u0000b\u0007c', 10), 'abc');
  assert.equal(sanitizeText('  x   y  ', 10), 'x y');
  assert.equal(sanitizeText('x'.repeat(100), 60).length, 60);
  assert.equal(sanitizeText(null, 5), '');
});

test('HTML in text fields is kept as inert text (it is rendered with textContent)', () => {
  const r = validateInput({ ...good, name: '<img src=x onerror=alert(1)>' }, TODAY);
  assert.equal(r.value.name, '<img src=x onerror=alert(1)>');
});
