import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const idx = js.indexOf('btn-drawer-toggle');
if (idx !== -1) {
  console.log(js.substring(idx - 100, idx + 200));
}
