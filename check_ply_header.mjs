import fs from 'fs';

const plyPath = 'C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/sugarhill_iteration_30000.ply';
const buf = fs.readFileSync(plyPath);
let idx = buf.indexOf('end_header\n');
let offset = idx !== -1 ? idx + 11 : buf.indexOf('end_header\r\n') + 12;
const header = buf.subarray(0, offset).toString('utf8');
console.log(header);
