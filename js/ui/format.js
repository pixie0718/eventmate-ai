// Display formatting for money, dates and "how far away" labels (locale-aware, no DOM).
import { parseDate } from '../dates.js';

/** @param {number} amount @param {string} currency ISO code, e.g. "INR" */
export const fmtMoney = (amount, currency) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);

/** Short form for the donut centre, e.g. "₹8L". @param {number} amount @param {string} currency */
export const fmtCompactMoney = (amount, currency) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(amount);

/** @param {string} iso a YYYY-MM-DD date */
export const fmtDate = (iso) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(parseDate(iso));

/** @param {Date} date */
export const fmtMonth = (date) => new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date);

/** "Today", "in 3 days" or "2 days ago". @param {number} days days from today (negative = past) */
export function whenLabel(days) {
  if (days === 0) return 'Today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}
