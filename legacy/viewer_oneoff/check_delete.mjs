import fs from 'fs';

const html = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v2.html', 'utf8');
const js = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/editor_v2.js', 'utf8');

// Check all occurrences of 'deleteSelected' in html and js
console.log('HTML has deleteSelected:', html.includes('deleteSelected()'));
const delIdx = js.indexOf('function deleteSelected');
console.log('JS has deleteSelected:', delIdx !== -1);
if (delIdx !== -1) {
  console.log(js.substring(delIdx, delIdx + 600));
}
