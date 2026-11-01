import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../js/planner.js';
import { allocate } from '../js/planner/budget.js';
import { daysBetween, parseDate } from '../js/dates.js';

const TODAY = new Date(2026, 0, 1);
const base = { type: 'wedding', name: 'A & B', date: '2027-01-01', guests: 200, budget: 1_000_000, currency: 'INR', city: 'Pune', vibe: 'traditional', prefs: [] };
const plan = (over = {}, today = TODAY) => buildPlan({ ...base, ...over }, today);

test('allocate always sums to the exact total', () => {
  for (const total of [1, 7, 999, 100_001, 1_000_000_007]) {
    const out = allocate(total, { a: 22, b: 28, c: 10, d: 10, e: 10, f: 6, g: 4, h: 10 });
    assert.equal(Object.values(out).reduce((s, n) => s + n, 0), total);
  }
});

test('budget lines sum to the total for every event type and preference mix', () => {
  for (const type of ['wedding', 'birthday', 'community']) {
    for (const prefs of [[], ['kids'], ['lowkey', 'outdoor', 'tech'], ['kids', 'lowkey', 'outdoor', 'tech', 'elders', 'vegetarian']]) {
      const p = plan({ type, prefs, budget: 123_457 });
      assert.equal(p.budget.lines.reduce((s, l) => s + l.amount, 0), 123_457);
      assert.equal(p.budget.lines.reduce((s, l) => s + l.pct, 0), 100);
      assert.ok(p.budget.lines.some((l) => l.id === 'contingency'));
      assert.ok(p.budget.lines.every((l) => l.amount >= 0));
    }
  }
});

test('preferences shift the budget sensibly', () => {
  const get = (p, id) => p.budget.lines.find((l) => l.id === id).pct;
  assert.ok(get(plan({ prefs: ['kids'] }), 'entertainment') > get(plan(), 'entertainment'));
  assert.ok(get(plan({ prefs: ['outdoor'] }), 'contingency') > get(plan(), 'contingency'));
  assert.ok(get(plan({ prefs: ['lowkey'] }), 'catering') > get(plan(), 'catering'));
});

test('flags an unrealistically low budget per guest', () => {
  assert.ok(plan({ budget: 50_000 }).budget.warnings.some((w) => /Very tight/.test(w)));
  assert.equal(plan({ budget: 2_000_000 }).budget.warnings.length, 0);
});

test('timeline is sorted by date and ends on the event date', () => {
  const m = plan().timeline.milestones;
  for (let i = 1; i < m.length; i++) assert.ok(m[i - 1].date <= m[i].date);
  assert.equal(m.at(-1).date, '2027-01-01');
});

test('timeline compresses when there is not enough time and never goes into the past', () => {
  const p = plan({ date: '2026-02-01' });
  assert.equal(p.timeline.compressed, true);
  assert.equal(p.timeline.daysAvailable, 31);
  assert.ok(p.timeline.milestones.every((x) => x.date >= '2026-01-01'));
  assert.ok(p.vendors.every((v) => v.bookBy >= '2026-01-01' && v.bookBy <= '2026-02-01'));
});

test('ample time leaves the timeline uncompressed', () => {
  assert.equal(plan().timeline.compressed, false);
});

test('context adds the right milestones and vendors', () => {
  const names = (p) => p.vendors.map((v) => v.name);
  assert.ok(names(plan({ prefs: ['outdoor'] })).includes('Tent / canopy rental'));
  assert.ok(!names(plan()).includes('Tent / canopy rental'));
  assert.ok(names(plan({ guests: 200 })).includes('Security / crowd marshals'));
  assert.ok(!names(plan({ guests: 50 })).includes('Security / crowd marshals'));
  assert.ok(plan({ prefs: ['elders'] }).timeline.milestones.some((x) => /accessibility/i.test(x.title)));
});

test('vendors are ordered must > should > nice and reference real budget lines', () => {
  const p = plan({ prefs: ['outdoor', 'kids', 'tech'] });
  const rank = { must: 0, should: 1, nice: 2 };
  for (let i = 1; i < p.vendors.length; i++) assert.ok(rank[p.vendors[i - 1].priority] <= rank[p.vendors[i].priority]);
  const ids = new Set(p.budget.lines.map((l) => l.id));
  assert.ok(p.vendors.every((v) => ids.has(v.category)));
  assert.equal(new Set(p.vendors.map((v) => v.id)).size, p.vendors.length);
});

test('ideas are personalised, respect required preferences and are capped at 6', () => {
  const p = plan({ type: 'birthday', name: 'Riya', prefs: [] });
  assert.ok(p.ideas.length >= 3 && p.ideas.length <= 6);
  assert.ok(!p.ideas.some((i) => /treasure hunt/i.test(i.title)), 'kids-only idea must not appear without kids');
  assert.ok(plan({ type: 'birthday', prefs: ['kids'], vibe: 'fun' }).ideas.some((i) => /treasure hunt/i.test(i.title)));
  assert.ok(plan({ type: 'birthday', name: 'Riya', vibe: 'elegant' }).ideas.some((i) => i.text.includes('Riya')));
  for (const type of ['wedding', 'birthday', 'community']) assert.equal(plan({ type }).ideas.length, 6);
});

test('plans are deterministic', () => {
  assert.deepEqual(plan(), plan());
});

test('date helpers', () => {
  assert.equal(daysBetween(parseDate('2026-01-01'), parseDate('2026-03-01')), 59);
});

test('guest-count rules switch on exactly at their thresholds', () => {
  const names = (guests) => plan({ guests }).vendors.map((v) => v.name);
  const crowdMilestone = (guests) => plan({ guests }).timeline.milestones.some((m) => /crowd & parking/i.test(m.title));
  const largeWarning = (guests) => plan({ guests, budget: 5_000_000 }).budget.warnings.some((w) => /Large guest list/.test(w));
  assert.ok(!names(149).includes('Security / crowd marshals'));
  assert.ok(names(150).includes('Security / crowd marshals'));
  assert.ok(!crowdMilestone(200));
  assert.ok(crowdMilestone(201));
  assert.ok(!largeWarning(300));
  assert.ok(largeWarning(301));
});

test('a budget between half and the full baseline gets the milder warning', () => {
  const warnings = plan({ guests: 200, budget: 200_000 }).budget.warnings; // INR 1000 per guest vs a 1500 baseline
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /tight side/);
});

test('currency changes the baseline the budget is judged against', () => {
  assert.ok(plan({ guests: 100, budget: 100_000, currency: 'INR' }).budget.warnings.length > 0);
  assert.equal(plan({ guests: 100, budget: 100_000, currency: 'GBP' }).budget.warnings.length, 0);
});

test('the tech preference moves budget to the sound / entertainment line', () => {
  const pct = (p, id) => p.budget.lines.find((l) => l.id === id).pct;
  const [plain, tech] = [plan(), plan({ prefs: ['tech'] })];
  assert.equal(pct(tech, 'decor'), pct(plain, 'decor') - 2);
  assert.equal(pct(tech, 'entertainment'), pct(plain, 'entertainment') + 2);
  const [plainCommunity, techCommunity] = [plan({ type: 'community' }), plan({ type: 'community', prefs: ['tech'] })];
  assert.equal(pct(techCommunity, 'outreach'), pct(plainCommunity, 'outreach') - 2);
  assert.equal(pct(techCommunity, 'av'), pct(plainCommunity, 'av') + 2);
});

test('an event today has everything due now and a fully compressed plan', () => {
  const p = plan({ date: '2026-01-01' });
  assert.equal(p.timeline.daysAvailable, 0);
  assert.ok(p.timeline.milestones.every((m) => m.date === '2026-01-01'));
  assert.ok(p.vendors.every((v) => v.bookBy === '2026-01-01'));
});
