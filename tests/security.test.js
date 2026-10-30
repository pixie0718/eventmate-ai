// Static guard-rails: fail the build if someone weakens the security posture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const html = read('index.html');

test('CSP forbids inline scripts, eval and third-party origins', () => {
  const csp = html.match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /script-src 'self'(?!.*unsafe)/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  assert.match(csp, /connect-src https:\/\/api\.anthropic\.com(;|$)/);
});

test('HTML has no inline scripts, inline handlers or inline styles', () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /\sstyle\s*=/i);
});

test('JS never uses dangerous sinks', () => {
  for (const f of readdirSync(join(root, 'js'))) {
    assert.doesNotMatch(read(`js/${f}`), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|new Function/, f);
  }
});

test('the API key is never persisted', () => {
  const app = read('js/app.js');
  assert.doesNotMatch(app, /(localStorage|sessionStorage)[^;]*apiKey/);
  assert.doesNotMatch(app, /save\([^)]*apiKey/);
});

test('every form control has an accessible label and the page declares a language', () => {
  assert.match(html, /<html lang="en">/);
  for (const [, id] of html.matchAll(/<(?:input|select|textarea)[^>]*\bid="([^"]+)"/g)) {
    assert.match(html, new RegExp(`<label[^>]*for="${id}"`), `no <label for="${id}">`);
  }
});
