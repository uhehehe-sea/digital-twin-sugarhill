import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const targetStr = `let activeZIndex = 50;

function initFloatingWindows() {`;

const idx = js.indexOf(targetStr);
console.log('Found initFloatingWindows at index:', idx);
