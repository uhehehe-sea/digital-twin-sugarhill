import fs from 'fs';

// Check OBJ lines
const content = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/factory_precision.obj', 'utf8');
const lines = content.split('\n');

const oLines = lines.filter(l => l.startsWith('o '));
console.log('Total "o " lines in obj:', oLines.length);

const sectionalLines = oLines.filter(l => l.includes('Door_Sectional'));
console.log('Sectional door "o " lines:', sectionalLines);
