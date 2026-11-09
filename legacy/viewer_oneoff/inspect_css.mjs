import fs from 'fs';

const html = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v2.html', 'utf8');

// Find all CSS rules for body, main-workspace, viewport-container, sidebar
const cssMatches = html.match(/(?:body|#main-workspace|#viewport-container|#sidebar|\.floating-win)[^{]*\{[^}]*\}/g);
console.log('CSS rules found:', cssMatches ? cssMatches.length : 0);
if (cssMatches) {
  cssMatches.forEach(r => console.log('RULE:\n' + r + '\n---'));
}
