import fs from 'fs';

const orig = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/index_v1_backup.html', 'utf8');
console.log('Original backup exists, length:', orig.length);
