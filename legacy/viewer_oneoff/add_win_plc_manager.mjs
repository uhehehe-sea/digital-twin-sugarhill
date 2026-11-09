import fs from 'fs';
import path from 'path';

const p = (process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js';
let js = fs.readFileSync(p, 'utf8');

// Add win-plc to winIds
js = js.replace(
  "const winIds = ['win-inspector', 'win-assets', 'win-gate-anim'];",
  "const winIds = ['win-inspector', 'win-assets', 'win-gate-anim', 'win-plc'];"
);

// Add resetWinPosition for win-plc
const resetWinPlcCode = `  } else if (winId === 'win-plc') {
    win.style.left = '420px';
    win.style.right = 'auto';
    win.style.top = '58px';
    win.style.bottom = 'auto';
    win.style.width = '480px';
    win.style.height = '370px';`;

js = js.replace(
  "  } else if (winId === 'win-gate-anim') {",
  `${resetWinPlcCode}\n  } else if (winId === 'win-gate-anim') {`
);

// Add resetFloatingWindows for win-plc
js = js.replace(
  "['win-inspector', 'win-assets', 'win-gate-anim'].forEach(resetWinPosition);",
  "['win-inspector', 'win-assets', 'win-gate-anim', 'win-plc'].forEach(resetWinPosition);"
);

fs.writeFileSync(p, js, 'utf8');
console.log('Successfully added win-plc to floating window manager!');
