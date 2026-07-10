/**
 * Build step: writes dist/tokens.css from the token source.
 * Runs after tsc via `node dist/generate-css.js`.
 */
import { writeFileSync } from 'fs';
import { join } from 'path';
import { generateCss } from './index';

const outPath = join(__dirname, 'tokens.css');
writeFileSync(outPath, generateCss(), 'utf8');
console.log(`wrote ${outPath}`);
