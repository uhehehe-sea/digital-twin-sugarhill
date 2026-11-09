import fs from 'fs';

const lines = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/brain/ca245e8d-539e-41a1-ba4f-c90b97927b89/.system_generated/logs/transcript.jsonl', 'utf8').trim().split('\n');

lines.forEach(l => {
  const step = JSON.parse(l);
  if (step.source === 'USER_EXPLICIT' && step.content) {
    if (step.content.includes('화물') || step.content.includes('문') || step.content.includes('도어')) {
      console.log(`[Step ${step.step_index}]:`, step.content);
      console.log('---');
    }
  }
});
