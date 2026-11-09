import fs from 'fs';

const spec = fs.readFileSync('<home>/.gemini/antigravity/brain/ca245e8d-539e-41a1-ba4f-c90b97927b89/FACTORY_DIGITAL_TWIN_SPEC.md', 'utf8');

const lines = spec.split('\n');
lines.forEach(l => {
  if (l.includes('도어') || l.includes('화물') || l.includes('Door') || l.includes('Cargo') || l.includes('Sectional') || l.includes('북측') || l.includes('남측') || l.includes('동측') || l.includes('서측')) {
    console.log(l);
  }
});
