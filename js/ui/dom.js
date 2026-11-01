// Tiny DOM helpers. Text only ever goes in via textContent, never as HTML.
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Looks up an element that index.html is guaranteed to contain; a miss is a programming error. */
export function $(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node;
}

/** Typed variants of $ for the controls we read or write. */
export const $input = (id) => /** @type {HTMLInputElement} */ ($(id));
export const $select = (id) => /** @type {HTMLSelectElement} */ ($(id));
export const $button = (id) => /** @type {HTMLButtonElement} */ ($(id));
export const $form = (id) => /** @type {HTMLFormElement} */ ($(id));
export const $progress = (id) => /** @type {HTMLProgressElement} */ ($(id));

/** Message of anything thrown, for showing to the user. */
export const errorMessage = (err) => (err instanceof Error ? err.message : String(err));

/**
 * Creates an element. `class` and `text` are special props; everything else becomes an attribute.
 * @param {string} tag
 * @param {Record<string, string>} [props]
 * @param {...(Node | string)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  node.append(...children);
  return node;
}

/** @param {string} tag @param {Record<string, string | number>} [attrs] @param {string} [text] @returns {SVGElement} */
export function svgEl(tag, attrs = {}, text) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  if (text !== undefined) node.textContent = text;
  return node;
}
