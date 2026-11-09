import fs from 'fs';

const html = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v2.html', 'utf8');
const lines = html.split('\n');

lines.forEach((l, i) => {
  if (l.includes('<body') || l.includes('id="main-workspace"') || l.includes('id="win-') || l.includes('id="sidebar"') || l.includes('</body>') || l.includes('id="viewport-container"')) {
    console.log(`${i}: ${l.trim()}`);
  }
});
