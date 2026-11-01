// Small helpers shared by the planning modules.
import { parseDate, daysBetween } from '../dates.js';
import { TIMELINES } from '../data/timelines.js';

/**
 * True when an extra (milestone or vendor) applies to this event.
 * @param {import('../types.js').Condition} when
 * @param {import('../types.js').EventInput} input
 */
export function appliesTo(when, input) {
  return 'pref' in when ? input.prefs.includes(when.pref) : input.guests >= when.minGuests;
}

/**
 * How much of the ideal lead time is left (0..1); every deadline is scaled by it.
 * @param {import('../types.js').EventInput} input
 * @param {Date} today
 */
export function scheduleFactor(input, today) {
  const available = Math.max(0, daysBetween(today, parseDate(input.date)));
  return { available, factor: Math.min(1, available / TIMELINES[input.type].ideal) };
}
