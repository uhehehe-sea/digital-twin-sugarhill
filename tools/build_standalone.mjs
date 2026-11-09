// Build a single-file HTML demo (no server needed) by inlining shared libs into the template.
//   node tools/build_standalone.mjs  →  dist/sugarhill_twin_demo.html
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viewer = path.join(root, 'viewer');
let html = fs.readFileSync(path.join(viewer, 'standalone', 'twin_demo.template.html'), 'utf8');
html = html.replace(/\/\*INLINE:([\w/.-]+)\*\//g, (_, rel) => {
  const src = fs.readFileSync(path.join(viewer, rel), 'utf8');
  if (src.includes('</script')) throw new Error(`${rel} contains </script`);
  return `\n// ---- inlined from viewer/${rel} ----\n${src}`;
});
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', 'sugarhill_twin_demo.html');
fs.writeFileSync(out, html);
console.log(`${out}  ${(html.length / 1024).toFixed(1)} KB`);
