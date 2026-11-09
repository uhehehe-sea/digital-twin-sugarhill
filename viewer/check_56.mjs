import fs from 'fs';

const html = fs.readFileSync('C:/Users/jaeso/.gemini/antigravity/scratch/factory_digital_twin/viewer/index_v2.html', 'utf8');

const all56 = [
  'asset-drawer',         'asset-grid-container', 'badge-ktx2-status',
  'btn-cad-edges',        'btn-drawer-toggle',    'btn-floor-refl',
  'btn-mode-rotate',      'btn-mode-scale',       'btn-mode-translate',
  'btn-pbr-mode',         'btn-snap-toggle',      'btn-space-toggle',
  'btn-splat',            'btn-start-render',     'btn-tb-gate-toggle',
  'btn-wireframe',        'btn-xray',             'canvas3d',
  'console-log',          'drop-banner',          'gate-detail-text',
  'gate-percent-text',    'gate-progress-bar',    'gate-state-pill',
  'hud-coords',           'hud-speed',            'inp-pos-x',
  'inp-pos-y',            'inp-pos-z',            'inp-rot-x',
  'inp-rot-y',            'inp-rot-z',            'inp-scl-x',
  'inp-scl-y',            'inp-scl-z',            'input-blender-path',
  'mat-physics-readout',  'material-swatch-grid', 'modal-nvidia-catalog',
  'outliner-list',        'placed-count-badge',   'render-loading-overlay',
  'render-modal-overlay', 'render-result-img',    'render-spinner',
  'render-status-text',   'sel-bbox-dim',         'sel-grid-snap',
  'sel-obj-badge',        'sel-rot-snap',         'simready-grid-list',
  'solver-badge',         'tooltip',              'val-body-count',
  'val-selected-mass',    'viewport-container'
];

const missing = all56.filter(id => !html.includes(`id="${id}"`) && !html.includes(`id='${id}'`));
console.log('Missing count:', missing.length);
console.log('Missing IDs:', missing);
