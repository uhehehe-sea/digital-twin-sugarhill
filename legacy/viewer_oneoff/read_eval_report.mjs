import fs from 'fs';

const report = fs.readFileSync((process.env.TWIN_ROOT || '.') + '/viewer/eval_report.json', 'utf8');
const reportObj = JSON.parse(report);
console.log('Report keys:', Object.keys(reportObj));
if (reportObj.summary) console.log(JSON.stringify(reportObj.summary, null, 2));
