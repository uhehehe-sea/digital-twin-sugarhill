import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const winIds = ['win-inspector', 'win-assets', 'win-gate-anim'];
winIds.forEach(id => {
  const winIdx = html.indexOf(`id="${id}"`);
  console.log(`Window [${id}] exists:`, winIdx !== -1);
  if (winIdx !== -1) {
    const nextWin = html.indexOf('class="win-corner-grip"', winIdx);
    console.log(`  Has corner grip:`, nextWin !== -1 && (nextWin - winIdx < 4000));
  }
});
