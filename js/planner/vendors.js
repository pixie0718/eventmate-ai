// Vendor checklist: the template for the event type plus extras, each with a "book by" date.
import { parseDate, formatDate, addDays } from '../dates.js';
import { VENDORS, EXTRA_VENDORS } from '../data/vendors.js';
import { appliesTo, scheduleFactor } from './rules.js';

const FALLBACK_CATEGORY = 'contingency';
const PRIORITY_ORDER = { must: 0, should: 1, nice: 2 };

/**
 * @param {import('../types.js').EventInput} input
 * @param {import('../types.js').Plan['budget']} budget  vendors are filed under its lines
 * @param {Date} today  a "book by" date is never earlier than this
 * @returns {import('../types.js').Plan['vendors']}
 */
export function buildVendors(input, budget, today) {
  const event = parseDate(input.date);
  const { factor } = scheduleFactor(input, today);
  const lineIds = new Set(budget.lines.map((l) => l.id));
  const categoryFor = (...candidates) => candidates.find((id) => lineIds.has(id)) ?? FALLBACK_CATEGORY;

  const base = VENDORS[input.type].map(([name, cat, priority, lead, note]) => ({ name, cat: categoryFor(cat), priority, lead, note }));
  const extras = EXTRA_VENDORS
    .filter(({ when }) => appliesTo(when, input))
    .flatMap(({ vendors }) => vendors.map(({ cats, ...v }) => ({ ...v, cat: categoryFor(...cats) })));

  return [...base, ...extras]
    .map((v, i) => {
      const bookBy = addDays(event, -Math.round(v.lead * factor));
      return {
        id: `v${i}`, name: v.name, category: v.cat, priority: v.priority, note: v.note,
        bookBy: formatDate(bookBy < today ? today : bookBy),
      };
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || a.bookBy.localeCompare(b.bookBy));
}
