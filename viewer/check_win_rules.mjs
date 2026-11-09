import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const matches = html.match(/#win-inspector[^{]*\{[^}]*\}/g);
console.log('Matches for #win-inspector:', matches);

const flMatches = html.match(/\.floating-win[^{]*\{[^}]*\}/g);
console.log('Matches for .floating-win:', flMatches);
