// Input validation + sanitising. Pure functions, no DOM, so they are unit-testable.
import { startOfDay } from './dates.js';

export const EVENT_TYPES = ['wedding', 'birthday', 'community'];
export const VIBES = ['traditional', 'modern', 'rustic', 'fun', 'elegant'];
export const PREFS = ['outdoor', 'kids', 'elders', 'vegetarian', 'lowkey', 'tech'];
export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];

// Control characters except tab, newline and carriage return.
// eslint-disable-next-line no-control-regex -- matching control characters is the whole point
export const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Strips control characters, collapses spaces and caps the length. @param {unknown} value @param {number} max @returns {string} */
export function sanitizeText(value, max) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/[ \t]+/g, ' ')
    .trim()
    .slice(0, max);
}

function isIsoDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

/**
 * @param {Record<string, any>} raw  untrusted form values
 * @returns {{ ok: boolean, errors: Record<string, string>, value: import('./types.js').EventInput }}
 * @param {Date} today  injected so tests are deterministic
 */
export function validateInput(raw, today = new Date()) {
  /** @type {Record<string, string>} */
  const errors = {};
  /** @type {any} */
  const value = {};

  value.type = String(raw.type ?? '');
  if (!EVENT_TYPES.includes(value.type)) errors.type = 'Choose an event type.';

  value.name = sanitizeText(raw.name, 60);
  if (!value.name) errors.name = 'Give your event a name (up to 60 characters).';

  value.date = String(raw.date ?? '');
  if (!isIsoDate(value.date)) {
    errors.date = 'Pick a valid date.';
  } else {
    const [y, m, d] = value.date.split('-').map(Number);
    const eventDay = new Date(y, m - 1, d);
    const t0 = startOfDay(today);
    const limit = new Date(t0.getFullYear() + 3, t0.getMonth(), t0.getDate());
    if (eventDay < t0) errors.date = 'The date must be today or later.';
    else if (eventDay > limit) errors.date = 'Pick a date within the next 3 years.';
  }

  value.guests = Number(raw.guests);
  if (!Number.isInteger(value.guests) || value.guests < 1 || value.guests > 5000) {
    errors.guests = 'Guests must be a whole number from 1 to 5000.';
  }

  value.budget = Number(raw.budget);
  if (!Number.isInteger(value.budget) || value.budget < 1 || value.budget > 1_000_000_000) {
    errors.budget = 'Budget must be a whole number greater than 0.';
  }

  value.currency = String(raw.currency ?? 'INR');
  if (!CURRENCIES.includes(value.currency)) errors.currency = 'Choose a supported currency.';

  value.city = sanitizeText(raw.city, 60);

  value.vibe = String(raw.vibe ?? 'modern');
  if (!VIBES.includes(value.vibe)) errors.vibe = 'Choose a style.';

  const prefs = Array.isArray(raw.prefs) ? raw.prefs : [];
  value.prefs = [...new Set(prefs.filter((p) => PREFS.includes(p)))];

  return { ok: Object.keys(errors).length === 0, errors, value };
}
