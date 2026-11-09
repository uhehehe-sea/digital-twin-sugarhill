import fs from 'fs';

async function extractMaterials() {
  const urls = [
    'equipment_3d_printer_a01/simready_usd/payloads/materials.usda',
    'equipment_3d_printer_b01/simready_usd/payloads/materials.usda',
    'consumable_oil_seal_large_b01/simready_usd/payloads/materials.usda',
    'ibcTank_steel_stainless_a01/simready_usd/payloads/materials.usda',
    'equipment_machine_vise_c01/simready_usd/payloads/materials.usda'
  ];
  for (const u of urls) {
    const r = await fetch('https://huggingface.co/datasets/nvidia/simready-assets/resolve/main/' + u);
    const t = await r.text();
    console.log('====================================');
    console.log('FILE:', u);
    const parts = t.split('    def Material ');
    for (let i = 1; i < parts.length; i++) {
      const block = parts[i];
      const name = block.split('"')[1];
      const base = (block.match(/omni:simready:nonvisual:base = "([^"]+)"/) || [])[1];
      const coating = (block.match(/omni:simready:nonvisual:coating = "([^"]+)"/) || [])[1];
      const attrs = (block.match(/omni:simready:nonvisual:attributes = \[([^\]]+)\]/) || [])[1];
      const dens = (block.match(/pxr:usd:physics_density = ([0-9.]+)/) || [])[1];
      const dFric = (block.match(/pxr:usd:physics_dynamicFriction = ([0-9.]+)/) || [])[1];
      const sFric = (block.match(/pxr:usd:physics_staticFriction = ([0-9.]+)/) || [])[1];
      const rest = (block.match(/pxr:usd:physics_restitution = ([0-9.]+)/) || [])[1];
      const pType = (block.match(/pxr:usd:physics_type = "([^"]+)"/) || [])[1];
      const sem = (block.match(/semantics:labels:material = \[([^\]]+)\]/) || [])[1];
      const alb = (block.match(/inputs:diffuse_texture = @([^@]+)@/) || [])[1];
      const ior = (block.match(/float inputs:ior = ([0-9.]+)/) || [])[1];
      const spec = (block.match(/float inputs:specular_level = ([0-9.]+)/) || [])[1];
      console.log(JSON.stringify({ name, base, coating, attrs, dens, sFric, dFric, rest, pType, sem, ior, spec, alb }));
    }
  }
}
extractMaterials();
