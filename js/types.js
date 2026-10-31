// Shared JSDoc types (no runtime code). Checked by `npm run typecheck`.

/**
 * @typedef {object} EventInput  validated form values (see validate.js)
 * @property {string} type  wedding | birthday | community
 * @property {string} name
 * @property {string} date  YYYY-MM-DD
 * @property {number} guests
 * @property {number} budget  whole currency units
 * @property {string} currency
 * @property {string} city
 * @property {string} vibe
 * @property {string[]} prefs
 */

/**
 * @typedef {object} BudgetLine
 * @property {string} id
 * @property {string} label
 * @property {number} amount
 * @property {number} pct
 */

/**
 * @typedef {object} Plan
 * @property {EventInput} input
 * @property {{ total: number, perGuest: number, cateringPerHead: number, lines: BudgetLine[], warnings: string[] }} budget
 * @property {{ milestones: { id: string, title: string, detail: string, date: string, daysBefore: number }[],
 *   daysAvailable: number, idealDays: number, compressed: boolean }} timeline
 * @property {{ id: string, name: string, category: string, priority: string, note: string, bookBy: string }[]} vendors
 * @property {{ title: string, text: string }[]} ideas
 */

export {};
