// Copies only the browser files into dist/, so server code and tests are never published as static files.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
for (const entry of ['index.html', 'css', 'js']) cpSync(join(root, entry), join(dist, entry), { recursive: true });
console.log('Built dist/ (index.html, css/, js/)');
