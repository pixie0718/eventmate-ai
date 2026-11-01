// WCAG AA colour-contrast checks for the theme tokens (jsdom cannot compute real contrast, so we do the maths).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const AA = 4.5;

/** Reads `--token: #hex` declarations out of a CSS block. */
const tokens = (block) =>
  Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1], m[2]]));
const light = tokens(css.match(/:root \{([^}]*)\}/)[1]);
const dark = { ...light, ...tokens(css.match(/prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)[1]) };
const gradientStops = (name, block) =>
  [...block.match(new RegExp(`--${name}:[^;]*`))[0].matchAll(/#[0-9a-fA-F]{6}/g)].map((m) => m[0]);

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const check = (label, fg, bg) =>
  assert.ok(ratio(fg, bg) >= AA, `${label}: ${fg} on ${bg} is ${ratio(fg, bg).toFixed(2)}:1 (needs ${AA}:1)`);

for (const [mode, t, block] of [
  ['light', light, css.match(/:root \{([^}]*)\}/)[1]],
  ['dark', dark, css.match(/prefers-color-scheme: dark\) \{\s*:root \{([^}]*)\}/)[1]],
]) {
  test(`${mode} theme: body, muted, status and accent text meet AA`, () => {
    check('text/bg', t.text, t.bg);
    check('text/surface', t.text, t.surface);
    check('muted/bg', t.muted, t.bg);
    check('muted/surface', t.muted, t.surface);
    check('error/surface', t.error, t.surface);
    check('error/bg', t.error, t.bg);
    check('ok/surface', t.ok, t.surface);
    check('ok/bg', t.ok, t.bg);
    check('accent/surface', t.accent, t.surface);
    check('accent/bg', t.accent, t.bg);
    check('accent-text/accent', t['accent-text'], t.accent);
    check('text/warn-bg', t.text, t['warn-bg']);
  });
  test(`${mode} theme: gradient buttons are readable at both ends`, () => {
    const source = gradientStops('grad', mode === 'dark' ? block : css.match(/:root \{([^}]*)\}/)[1]);
    for (const stop of source) check('on-grad', t['on-grad'], stop);
  });
}

test('hero colours are readable on the hero gradient', () => {
  const stops = ['#24122a', '#4a2145', '#6b2d5c'];
  for (const stop of stops) {
    check('hero text', '#f8f1e7', stop);
    check('eyebrow', '#e3c48d', stop);
    check('tagline', '#eadfd0', stop);
    check('card caption', '#d9ccbb', stop);
  }
  check('cta', '#24122a', '#c9a46a');
  check('selected card', '#3b1a38', '#f8f1e7');
  check('selected caption', light.muted, '#f8f1e7');
});
