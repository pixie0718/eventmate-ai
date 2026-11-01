// Dated milestones: the template for the event type plus extras, squeezed to the time that is left.
import { parseDate, formatDate, addDays } from '../dates.js';
import { TIMELINES, EXTRA_MILESTONES } from '../data/timelines.js';
import { appliesTo, scheduleFactor } from './rules.js';

/**
 * @param {import('../types.js').EventInput} input
 * @param {Date} today
 * @returns {import('../types.js').Plan['timeline']}
 */
export function buildTimeline(input, today) {
  const event = parseDate(input.date);
  const { available, factor } = scheduleFactor(input, today);
  const template = TIMELINES[input.type];
  const items = [
    ...template.items,
    ...EXTRA_MILESTONES.filter(({ when }) => appliesTo(when, input)).map(({ item }) => item),
  ];

  const milestones = items
    .map(([days, title, detail], i) => ({
      id: `t${days}-${i}`, title, detail, daysBefore: days,
      date: formatDate(addDays(event, -Math.round(days * factor))),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || b.daysBefore - a.daysBefore);

  return { milestones, daysAvailable: available, idealDays: template.ideal, compressed: factor < 1 };
}
