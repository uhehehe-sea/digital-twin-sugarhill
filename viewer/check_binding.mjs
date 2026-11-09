import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

console.log('initFloatingWindows called count:', (js.match(/initFloatingWindows\(\)/g) || []).length);
console.log('window.initFloatingWindows bound:', js.includes('window.initFloatingWindows = initFloatingWindows;'));
