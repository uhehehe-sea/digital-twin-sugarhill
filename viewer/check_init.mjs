import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');
const lines = js.split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('initFloatingWindows') || lines[i].includes('init3D') || lines[i].includes('addEventListener(\'load\'') || lines[i].includes('DOMContentLoaded')) {
    console.log(`${i}: ${lines[i]}`);
  }
}
