// Reads, restores and validates the planner form.
import { $, $form } from './dom.js';

const FIELDS = ['type', 'name', 'date', 'guests', 'budget', 'currency', 'city', 'vibe'];
const VALIDATED_FIELDS = ['type', 'name', 'date', 'guests', 'budget', 'currency', 'vibe'];

/** @returns {Record<string, any>} raw (unvalidated) form values */
export function readForm() {
  const data = new FormData($form('planner-form'));
  return { ...Object.fromEntries(FIELDS.map((k) => [k, data.get(k)])), prefs: data.getAll('prefs') };
}

/** Restores saved values into the form. @param {Record<string, any>} values */
export function writeForm(values) {
  const form = $form('planner-form');
  for (const key of FIELDS) {
    if (values[key] !== undefined && form.elements[key])
      /** @type {HTMLInputElement} */ (form.elements[key]).value = values[key];
  }
  for (const box of /** @type {NodeListOf<HTMLInputElement>} */ (form.querySelectorAll('input[name="prefs"]')))
    box.checked = (values.prefs ?? []).includes(box.value);
}

/** Shows each error next to its field (aria-invalid + role=alert text) and focuses the first bad one. */
export function showErrors(errors) {
  const form = $form('planner-form');
  for (const name of VALIDATED_FIELDS) {
    const field = form.elements[name];
    const out = $(`err-${name}`);
    if (!field || !out) continue;
    out.textContent = errors[name] ?? '';
    if (errors[name]) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  const first = Object.keys(errors)[0];
  if (first) /** @type {HTMLElement | undefined} */ (form.elements[first])?.focus();
}
