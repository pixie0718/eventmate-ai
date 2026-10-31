// Rule-based planning engine. Pure and deterministic: same input + same "today" => same plan.
// Works fully offline; the optional AI layer (ai.js) only adds extra ideas on top.
import { parseDate, formatDate, addDays, daysBetween, startOfDay } from './dates.js';
import { BUDGET_TEMPLATES, PER_GUEST_BASELINE_INR, INR_RATE } from './data/budgets.js';
import { TIMELINES } from './data/timelines.js';
import { VENDORS } from './data/vendors.js';
import { IDEAS } from './data/ideas.js';

export { parseDate, formatDate, addDays, daysBetween, startOfDay };

const MAX_IDEAS = 6;
const VIBE_MATCH_SCORE = 3;
const NEEDED_PREF_SCORE = 2;
const TIGHT_BUDGET_RATIO = 0.5;
const LARGE_EVENT_GUESTS = 300;

/** How much of the ideal lead time is left (0..1); every deadline is scaled by it. */
function scheduleFactor(input, today) {
  const available = Math.max(0, daysBetween(today, parseDate(input.date)));
  return { available, factor: Math.min(1, available / TIMELINES[input.type].ideal) };
}

// ---------- Budget ----------

function shift(weights, from, to, points) {
  if (!(from in weights) || !(to in weights)) return;
  const moved = Math.min(points, weights[from] - 1);
  weights[from] -= moved;
  weights[to] += moved;
}

function adjustWeights(type, prefs) {
  const w = Object.fromEntries(BUDGET_TEMPLATES[type].map(([id, , pct]) => [id, pct]));
  const fun = 'entertainment' in w ? 'entertainment' : 'program';
  if (prefs.includes('kids')) shift(w, 'catering', fun, 3);
  if (prefs.includes('lowkey')) shift(w, fun, 'catering', 3);
  if (prefs.includes('outdoor')) shift(w, 'venue', 'contingency', 3); // weather backup
  if (prefs.includes('tech')) shift(w, 'decor' in w ? 'decor' : 'outreach', 'av' in w ? 'av' : fun, 2);
  return w;
}

/** Largest-remainder rounding so the lines always add up to exactly `total`. */
export function allocate(total, weights) {
  const entries = Object.entries(weights);
  const sum = entries.reduce((s, [, w]) => s + w, 0);
  const raw = entries.map(([id, w]) => ({ id, exact: (total * w) / sum }));
  const out = raw.map((r) => ({ id: r.id, amount: Math.floor(r.exact), frac: r.exact % 1 }));
  let left = total - out.reduce((s, r) => s + r.amount, 0);
  [...out].sort((a, b) => b.frac - a.frac).forEach((r) => { if (left > 0) { r.amount += 1; left -= 1; } });
  return Object.fromEntries(out.map((r) => [r.id, r.amount]));
}

function buildBudget(input) {
  const weights = adjustWeights(input.type, input.prefs);
  const amounts = allocate(input.budget, weights);
  const labels = Object.fromEntries(BUDGET_TEMPLATES[input.type].map(([id, label]) => [id, label]));
  const lines = Object.keys(weights).map((id) => ({
    id, label: labels[id], amount: amounts[id], pct: weights[id],
  }));

  const perGuest = input.budget / input.guests;
  const baseline = PER_GUEST_BASELINE_INR[input.type] * INR_RATE[input.currency];
  const warnings = [];
  if (perGuest < baseline * TIGHT_BUDGET_RATIO) {
    warnings.push('Very tight budget per guest. Consider fewer guests, a simpler menu or a free/community venue.');
  } else if (perGuest < baseline) {
    warnings.push('Budget per guest is on the tight side. Prioritise must-have vendors and keep the buffer.');
  }
  if (input.guests > LARGE_EVENT_GUESTS) warnings.push('Large guest list: lock the venue and caterer early and plan crowd flow.');

  return {
    total: input.budget, perGuest: Math.round(perGuest), cateringPerHead: Math.round(amounts.catering / input.guests),
    lines, warnings,
  };
}

// ---------- Timeline ----------

function buildTimeline(input, today) {
  const event = parseDate(input.date);
  const { available, factor } = scheduleFactor(input, today);
  const tpl = TIMELINES[input.type];
  const items = tpl.items.map(([days, title, detail]) => [days, title, detail]);

  if (input.prefs.includes('outdoor')) items.push([7, 'Decide weather plan', 'Pick a go/no-go time and a covered backup area.']);
  if (input.prefs.includes('elders')) items.push([21, 'Check accessibility & seating', 'Ramps, shade, restrooms and reserved seats.']);
  if (input.guests > 200) items.push([30, 'Crowd & parking plan', 'Entry points, marshals and parking map.']);

  const milestones = items
    .map(([days, title, detail], i) => ({
      id: `t${days}-${i}`, title, detail, daysBefore: days,
      date: formatDate(addDays(event, -Math.round(days * factor))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || b.daysBefore - a.daysBefore);

  return { milestones, daysAvailable: available, idealDays: tpl.ideal, compressed: factor < 1 };
}

// ---------- Vendors ----------

function buildVendors(input, budget, today) {
  const event = parseDate(input.date);
  const ids = new Set(budget.lines.map((l) => l.id));
  const pick = (...c) => c.find((id) => ids.has(id)) ?? 'contingency';
  const { factor } = scheduleFactor(input, today);
  const list = VENDORS[input.type].map(([name, cat, priority, lead, note]) => ({ name, cat: pick(cat), priority, lead, note }));
  const p = input.prefs;

  if (p.includes('outdoor')) {
    list.push({ name: 'Tent / canopy rental', cat: pick('venue'), priority: 'must', lead: 45, note: 'Sidewalls help against rain and wind.' });
    list.push({ name: 'Generator / power backup', cat: pick('av', 'venue'), priority: 'should', lead: 30, note: 'Size it for sound and lighting.' });
  }
  if (input.guests >= 150) list.push({ name: 'Security / crowd marshals', cat: pick('safety', 'misc', 'venue'), priority: 'should', lead: 30, note: 'Roughly one marshal per 50 guests.' });
  if (p.includes('kids')) list.push({ name: 'Kids\' corner & supervisor', cat: pick('entertainment', 'program'), priority: 'should', lead: 21, note: 'Safe play area with an adult in charge.' });
  if (p.includes('elders')) list.push({ name: 'Accessibility support', cat: pick('venue'), priority: 'should', lead: 30, note: 'Ramp, reserved seats and drop-off point.' });
  if (p.includes('vegetarian')) list.push({ name: 'Pure-veg kitchen confirmation', cat: pick('catering'), priority: 'should', lead: 30, note: 'Ask for a separate kitchen or certification.' });
  if (p.includes('tech')) list.push({ name: 'Live-stream operator', cat: pick('av', 'photography', 'entertainment'), priority: 'nice', lead: 21, note: 'Test the internet speed at the venue.' });

  const order = { must: 0, should: 1, nice: 2 };
  return list
    .map((v, i) => {
      const bookBy = addDays(event, -Math.round(v.lead * factor));
      return {
        id: `v${i}`, name: v.name, category: v.cat, priority: v.priority, note: v.note,
        bookBy: formatDate(bookBy < today ? today : bookBy),
      };
    })
    .sort((a, b) => order[a.priority] - order[b.priority] || a.bookBy.localeCompare(b.bookBy));
}

// ---------- Ideas ----------

function buildIdeas(input) {
  const fill = (s) => s.replaceAll('{name}', input.name).replaceAll('{city}', input.city || 'your city');
  return IDEAS
    .map(([type, vibes, needs, title, text], i) => ({ type, vibes: /** @type {string[]} */ (vibes), needs: /** @type {string[]} */ (needs), title, text, i }))
    .filter((idea) => idea.type === input.type && idea.needs.every((n) => input.prefs.includes(n)))
    .map((idea) => ({ ...idea, score: (idea.vibes.includes(input.vibe) ? VIBE_MATCH_SCORE : 0) + idea.needs.length * NEEDED_PREF_SCORE }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, MAX_IDEAS)
    .map((idea) => ({ title: fill(idea.title), text: fill(idea.text) }));
}

// ---------- Public API ----------

/**
 * @param {import('./types.js').EventInput} input validated input (see validate.js)
 * @param {Date} today
 * @returns {import('./types.js').Plan}
 */
export function buildPlan(input, today = new Date()) {
  const t0 = startOfDay(today);
  const budget = buildBudget(input);
  const timeline = buildTimeline(input, t0);
  return {
    input, budget, timeline,
    vendors: buildVendors(input, budget, t0),
    ideas: buildIdeas(input),
  };
}
