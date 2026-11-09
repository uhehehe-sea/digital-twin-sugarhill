import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const kIdx = js.indexOf("window.addEventListener('keydown'");
console.log(js.substring(kIdx, kIdx + 600));
