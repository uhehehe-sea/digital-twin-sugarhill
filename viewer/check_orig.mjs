import fs from 'fs';

const orig = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v1_backup.html', 'utf8');
console.log('Original backup exists, length:', orig.length);
