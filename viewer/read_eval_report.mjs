import fs from 'fs';

const report = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/eval_report.json', 'utf8');
const reportObj = JSON.parse(report);
console.log('Report keys:', Object.keys(reportObj));
if (reportObj.summary) console.log(JSON.stringify(reportObj.summary, null, 2));
