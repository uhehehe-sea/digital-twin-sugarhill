import fs from 'fs';
import path from 'path';

const basePath = (process.env.TWIN_ROOT || '.') + '/viewer';
const p = path.join(basePath, 'editor_v2.js');
let js = fs.readFileSync(p, 'utf8');

const target = "switch (e.code) {";
const replacement = `switch (e.code) {
      case 'BracketLeft':
        e.preventDefault();
        setCameraSpeedMultiplier(cameraSpeedScalar - 0.2);
        break;
      case 'BracketRight':
        e.preventDefault();
        setCameraSpeedMultiplier(cameraSpeedScalar + 0.2);
        break;`;

js = js.replace(target, replacement);
fs.writeFileSync(p, js, 'utf8');
console.log('Successfully added BracketLeft and BracketRight hotkeys to keydown switch!');
