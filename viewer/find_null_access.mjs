import fs from 'fs';

const js = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/editor_v2.js', 'utf8');

const missingIds = [
  'badge-ktx2-status',
  'asset-drawer',
  'btn-drawer-toggle',
  'val-selected-mass',
  'btn-mode-translate',
  'btn-mode-rotate',
  'btn-space-toggle',
  'btn-snap-toggle',
  'sel-grid-snap',
  'sel-rot-snap',
  'material-swatch-grid',
  'mat-physics-readout',
  'placed-count-badge',
  'val-body-count',
  'hud-speed',
  'btn-wireframe'
];

missingIds.forEach(id => {
  const regex = new RegExp(`document\\.getElementById\\(['"]${id}['"]\\)[^;\\n]*`, 'g');
  const matches = js.match(regex);
  if (matches) {
    console.log(`ID [${id}]:`, matches);
  }
});
