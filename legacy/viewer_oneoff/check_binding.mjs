import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

console.log('initFloatingWindows called count:', (js.match(/initFloatingWindows\(\)/g) || []).length);
console.log('window.initFloatingWindows bound:', js.includes('window.initFloatingWindows = initFloatingWindows;'));
