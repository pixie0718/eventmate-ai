// Budget lines: template percentages, tweaked by preferences, then rounded to exact amounts.
import { BUDGET_TEMPLATES, PER_GUEST_BASELINE_INR, INR_RATE } from '../data/budgets.js';

const TIGHT_BUDGET_RATIO = 0.5; // below this share of the baseline per guest the budget is "very tight"
const LARGE_EVENT_GUESTS = 300;
const MIN_LINE_PCT = 1; // a preference never drains a line below this
const BIG_SHIFT = 3; // budget points moved by kids / low-key / outdoor
const SMALL_SHIFT = 2; // budget points moved by tech

/** Returns the first id the budget actually has, so one rule works for every event type. */
const firstPresent = (weights, ...ids) => ids.find((id) => id in weights);

/** Moves up to `points` percent from one line to another (never below MIN_LINE_PCT). */
function shift(weights, from, to, points) {
  if (!(from in weights) || !(to in weights)) return;
  const moved = Math.min(points, weights[from] - MIN_LINE_PCT);
  weights[from] -= moved;
  weights[to] += moved;
}

/** @returns {Record<string, number>} percent per budget line id after applying the preferences */
function adjustWeights(type, prefs) {
  const w = Object.fromEntries(BUDGET_TEMPLATES[type].map(([id, , pct]) => [id, pct]));
  const fun = firstPresent(w, 'entertainment', 'program');
  if (prefs.includes('kids')) shift(w, 'catering', fun, BIG_SHIFT);
  if (prefs.includes('lowkey')) shift(w, fun, 'catering', BIG_SHIFT);
  if (prefs.includes('outdoor')) shift(w, 'venue', 'contingency', BIG_SHIFT); // weather backup
  if (prefs.includes('tech')) shift(w, firstPresent(w, 'decor', 'outreach'), firstPresent(w, 'av', fun), SMALL_SHIFT);
  return w;
}

/**
 * Largest-remainder rounding so the lines always add up to exactly `total`.
 * @param {number} total
 * @param {Record<string, number>} weights
 * @returns {Record<string, number>}
 */
export function allocate(total, weights) {
  const entries = Object.entries(weights);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const rows = entries.map(([id, w]) => {
    const exact = (total * w) / sum;
    return { id, amount: Math.floor(exact), frac: exact % 1 };
  });
  let left = total - rows.reduce((s, r) => s + r.amount, 0);
  for (const row of [...rows].sort((a, b) => b.frac - a.frac)) {
    if (left <= 0) break;
    row.amount += 1;
    left -= 1;
  }
  return Object.fromEntries(rows.map((r) => [r.id, r.amount]));
}

/** Warnings about the budget per guest and the guest list size. */
function budgetWarnings(input, perGuest) {
  const baseline = PER_GUEST_BASELINE_INR[input.type] * INR_RATE[input.currency];
  const warnings = [];
  if (perGuest < baseline * TIGHT_BUDGET_RATIO) {
    warnings.push('Very tight budget per guest. Consider fewer guests, a simpler menu or a free/community venue.');
  } else if (perGuest < baseline) {
    warnings.push('Budget per guest is on the tight side. Prioritise must-have vendors and keep the buffer.');
  }
  if (input.guests > LARGE_EVENT_GUESTS) warnings.push('Large guest list: lock the venue and caterer early and plan crowd flow.');
  return warnings;
}

/**
 * @param {import('../types.js').EventInput} input
 * @returns {import('../types.js').Plan['budget']}
 */
export function buildBudget(input) {
  const weights = adjustWeights(input.type, input.prefs);
  const amounts = allocate(input.budget, weights);
  const labels = Object.fromEntries(BUDGET_TEMPLATES[input.type].map(([id, label]) => [id, label]));
  const lines = Object.keys(weights).map((id) => ({ id, label: labels[id], amount: amounts[id], pct: weights[id] }));
  const perGuest = input.budget / input.guests;
  return {
    total: input.budget,
    perGuest: Math.round(perGuest),
    cateringPerHead: Math.round(amounts.catering / input.guests),
    lines,
    warnings: budgetWarnings(input, perGuest),
  };
}
