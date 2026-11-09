import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');
const sub = js.substring(147108);
console.log('Length of trailing block:', sub.length);
console.log(sub.substring(0, 1200));
