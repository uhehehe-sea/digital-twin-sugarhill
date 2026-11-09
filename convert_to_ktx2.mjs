import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { NodeBasisEncoder } from 'ktx2-encoder';

const textures = [
  {
    name: 'T_Steel_A1_Albedo',
    src: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Metal/Textures/T_Steel_A1_Albedo.png',
    dest: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Metal/Textures/T_Steel_A1_Albedo.ktx2',
    isSRGB: true,
    isUASTC: true
  },
  {
    name: 'T_Steel_A1_Normal',
    src: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Metal/Textures/T_Steel_A1_Normal.png',
    dest: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Metal/Textures/T_Steel_A1_Normal.ktx2',
    isSRGB: false,
    isUASTC: true
  },
  {
    name: 'T_Steel_A1_ORM',
    src: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Metal/Textures/T_Steel_A1_ORM.png',
    dest: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Metal/Textures/T_Steel_A1_ORM.ktx2',
    isSRGB: false,
    isUASTC: true
  },
  {
    name: 'T_Plastic_Glossy_White_A_Albedo',
    src: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Plastic/Textures/T_Plastic_Glossy_White_A_Albedo.png',
    dest: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Plastic/Textures/T_Plastic_Glossy_White_A_Albedo.ktx2',
    isSRGB: true,
    isUASTC: true
  },
  {
    name: 'T_Rubber_Black_Glossy_A_Normal',
    src: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Rubber/Textures/T_Rubber_Black_Glossy_A_Normal.png',
    dest: (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets/nvidia_material_library/Rubber/Textures/T_Rubber_Black_Glossy_A_Normal.ktx2',
    isSRGB: false,
    isUASTC: true
  }
];

async function run() {
  console.log('Initializing NodeBasisEncoder...');
  const encoder = new NodeBasisEncoder();
  await encoder.init();
  console.log('Encoder initialized!');

  const imageDecoder = async (buf) => {
    const img = sharp(buf);
    const { data, info } = await img
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    return {
      width: info.width,
      height: info.height,
      data: new Uint8Array(data)
    };
  };

  for (const item of textures) {
    if (!fs.existsSync(item.src)) {
      console.warn(`File not found: ${item.src}`);
      continue;
    }
    const origSize = fs.statSync(item.src).size;
    console.log(`Processing ${item.name} (${(origSize / 1024 / 1024).toFixed(2)} MB)...`);

    // Rescale down to max 2048x2048 for GPU efficiency
    const resizedBuffer = await sharp(item.src)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer();

    const ktx2Bytes = await encoder.encode(resizedBuffer, {
      imageDecoder,
      isUASTC: item.isUASTC,
      isSRGB: item.isSRGB,
      mipmaps: true,
      quality: 128
    });

    fs.writeFileSync(item.dest, Buffer.from(ktx2Bytes));
    const newSize = fs.statSync(item.dest).size;
    const ratio = ((1 - newSize / origSize) * 100).toFixed(1);
    console.log(`  -> Saved: ${item.dest} (${(newSize / 1024).toFixed(1)} KB, -${ratio}% size reduction)`);
  }
}

run().catch(console.error);
