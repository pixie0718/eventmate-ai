// Calendar-date helpers. Dates are local (no time zones), so "today" never drifts by a day.

const MS_DAY = 86_400_000;

/** @param {string} iso YYYY-MM-DD @returns {Date} local midnight of that day */
export function parseDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** @param {Date} date @returns {string} YYYY-MM-DD in local time */
export function formatDate(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** @param {Date} date @param {number} n days to add (may be negative) @returns {Date} a new date */
export function addDays(date, n) {
  const r = new Date(date);
  r.setDate(r.getDate() + n);
  return r;
}

/** @param {Date} a @param {Date} b @returns {number} whole days from a to b */
export function daysBetween(a, b) {
  return Math.round((b.getTime() - a.getTime()) / MS_DAY);
}

/** @param {Date} date @returns {Date} local midnight of the same day */
export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}
