import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

console.log('archMats matches:', (js.match(/archMats\./g) || []).length);
