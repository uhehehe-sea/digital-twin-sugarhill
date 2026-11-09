import fs from 'fs';
import path from 'path';

const htmlPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html';
let html = fs.readFileSync(htmlPath, 'utf8');

// Find the style tag
const sStart = html.indexOf('<style>');
const sEnd = html.indexOf('</style>');
let css = html.substring(sStart + 7, sEnd);

// Strip conflicting legacy rules:
// 1. body { ... display: flex ... }
css = css.replace(/body\s*\{[^}]*display:\s*flex[^}]*\}/g, '');
// 2. #main-workspace { ... }
css = css.replace(/#main-workspace\s*\{[^}]*\}/g, '');
// 3. #sidebar { ... }
css = css.replace(/#sidebar\s*\{[^}]*\}/g, '');
// 4. #asset-drawer { ... }
css = css.replace(/#asset-drawer[^{]*\{[^}]*\}/g, '');
// 5. any other body { padding: ... } from .win-body
css = css.replace(/body\s*\{[^}]*padding:\s*12px\s*14px[^}]*\}/g, '');

html = html.substring(0, sStart + 7) + css + html.substring(sEnd);

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('Successfully purged conflicting CSS rules!');
