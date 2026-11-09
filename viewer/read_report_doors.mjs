import fs from 'fs';

const report = JSON.parse(fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/eval_report.json', 'utf8'));

if (report.params) console.log('Params:', JSON.stringify(report.params, null, 2));

const doorBodies = Object.keys(report.bodies || {}).filter(k => k.toLowerCase().includes('door') || k.toLowerCase().includes('cargo') || k.toLowerCase().includes('sectional') || k.toLowerCase().includes('rollup'));
console.log('Door bodies in eval_report:', doorBodies);
