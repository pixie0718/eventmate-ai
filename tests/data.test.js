// Guards the template data: the planner rules rely on these invariants, so a typo in a table fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BUDGET_TEMPLATES, PER_GUEST_BASELINE_INR, INR_RATE } from '../js/data/budgets.js';
import { TIMELINES, EXTRA_MILESTONES } from '../js/data/timelines.js';
import { VENDORS, EXTRA_VENDORS } from '../js/data/vendors.js';
import { IDEAS } from '../js/data/ideas.js';
import { EVENT_TYPES, VIBES, PREFS, CURRENCIES } from '../js/validate.js';

const lineIds = (type) => new Set(BUDGET_TEMPLATES[type].map(([id]) => id));
const conditionIsValid = (when) =>
  'pref' in when ? PREFS.includes(when.pref) : Number.isInteger(when.minGuests) && when.minGuests > 0;

test('every event type has a budget, timeline, vendor list and baseline for every currency', () => {
  for (const type of EVENT_TYPES) {
    for (const table of [BUDGET_TEMPLATES, TIMELINES, VENDORS, PER_GUEST_BASELINE_INR]) assert.ok(table[type], type);
  }
  for (const currency of CURRENCIES) assert.ok(INR_RATE[currency] > 0, currency);
});

test('each budget template adds up to 100% and has the lines the rules rely on', () => {
  for (const type of EVENT_TYPES) {
    const lines = BUDGET_TEMPLATES[type];
    assert.equal(
      lines.reduce((sum, [, , pct]) => sum + pct, 0),
      100,
      type,
    );
    assert.equal(lineIds(type).size, lines.length, `${type}: duplicate line id`);
    for (const id of ['venue', 'catering', 'contingency']) assert.ok(lineIds(type).has(id), `${type} needs ${id}`);
  }
});

test('timelines count down from the ideal lead time to the event day', () => {
  for (const type of EVENT_TYPES) {
    const days = TIMELINES[type].items.map(([d]) => d);
    assert.equal(days[0], TIMELINES[type].ideal, type);
    assert.equal(days.at(-1), 0, type);
    assert.deepEqual(
      days,
      [...days].sort((a, b) => b - a),
      `${type} is not in order`,
    );
  }
});

test('every vendor sits in a budget line of its own event type', () => {
  for (const type of EVENT_TYPES) {
    for (const [name, category, priority] of VENDORS[type]) {
      assert.ok(lineIds(type).has(category), `${type}: ${name} -> ${category}`);
      assert.ok(['must', 'should', 'nice'].includes(priority), name);
    }
  }
});

test('extra vendors and milestones use known preferences and can be filed under every event type', () => {
  for (const { when } of [...EXTRA_MILESTONES, ...EXTRA_VENDORS])
    assert.ok(conditionIsValid(when), JSON.stringify(when));
  for (const type of EVENT_TYPES) {
    for (const { vendors } of EXTRA_VENDORS) {
      for (const { name, cats } of vendors)
        assert.ok(
          cats.some((id) => lineIds(type).has(id)),
          `${type}: ${name} has no budget line`,
        );
    }
  }
});

test('ideas use known event types, styles and preferences', () => {
  for (const [type, vibes, needs, title, text] of IDEAS) {
    assert.ok(EVENT_TYPES.includes(type), title);
    for (const vibe of vibes) assert.ok(VIBES.includes(vibe), `${title}: ${vibe}`);
    for (const need of needs) assert.ok(PREFS.includes(need), `${title}: ${need}`);
    assert.ok(title && text, 'idea needs a title and text');
  }
  for (const type of EVENT_TYPES)
    assert.ok(IDEAS.filter(([t]) => t === type).length >= 6, `${type} needs at least 6 ideas`);
});
