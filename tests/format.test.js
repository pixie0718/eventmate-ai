// Display formatting helpers (locale-dependent output is checked loosely on purpose).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtMoney, fmtCompactMoney, fmtDate, fmtMonth, whenLabel } from '../js/ui/format.js';

test('whenLabel says today, in N days or N days ago with correct plurals', () => {
  assert.equal(whenLabel(0), 'Today');
  assert.equal(whenLabel(1), 'in 1 day');
  assert.equal(whenLabel(5), 'in 5 days');
  assert.equal(whenLabel(-1), '1 day ago');
  assert.equal(whenLabel(-3), '3 days ago');
});

test('money is shown without decimals and the compact form is shorter', () => {
  assert.match(fmtMoney(1234567, 'INR'), /12,34,567|1,234,567/);
  assert.doesNotMatch(fmtMoney(1500, 'USD'), /\.\d/);
  assert.ok(fmtCompactMoney(1234567, 'USD').length < fmtMoney(1234567, 'USD').length);
});

test('dates are formatted from calendar dates without shifting the day', () => {
  assert.match(fmtDate('2027-03-09'), /9/);
  assert.match(fmtDate('2027-03-09'), /2027/);
  assert.ok(fmtMonth(new Date(2027, 2, 9)).length >= 3);
});
