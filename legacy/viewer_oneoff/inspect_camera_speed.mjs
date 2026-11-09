import fs from 'fs';

const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

// Find camera speed logic
const sIdx = js.indexOf('updateWASDCameraMovement');
console.log(js.substring(sIdx, sIdx + 1500));
