// Rule-based planning engine. Pure and deterministic: same input + same "today" => same plan.
// Works fully offline; the optional AI layer (js/ai/) only adds extra ideas on top.
// Each part of the plan lives in js/planner/; this file just puts them together.
import { startOfDay } from './dates.js';
import { buildBudget } from './planner/budget.js';
import { buildTimeline } from './planner/timeline.js';
import { buildVendors } from './planner/vendors.js';
import { buildIdeas } from './planner/ideas.js';

/**
 * @param {import('./types.js').EventInput} input validated input (see validate.js)
 * @param {Date} today
 * @returns {import('./types.js').Plan}
 */
export function buildPlan(input, today = new Date()) {
  const t0 = startOfDay(today);
  const budget = buildBudget(input);
  return {
    input,
    budget,
    timeline: buildTimeline(input, t0),
    vendors: buildVendors(input, budget, t0),
    ideas: buildIdeas(input),
  };
}
