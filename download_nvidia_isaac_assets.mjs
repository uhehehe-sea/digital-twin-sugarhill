import fs from 'fs';
import path from 'path';

const BASE_DIR = (process.env.TWIN_ROOT || '.') + '/nvidia_isaac_assets';

// Expanded NVIDIA Isaac Sim / SimReady OpenUSD Assets:
// 1) Fixed Factory Safety & Utility
// 2) Stainless Steel 3D Printers & CNC/Seal Machining Equipment
// 3) Full Office Furniture & Supplies Pack
// 4) Official NVIDIA OmniPBR Material Library (Metal/Stainless, Plastic PP, Rubber FKM/FPM)
const WAREHOUSE_ASSETS = [
  {
    id: 'SM_WireSecurityRoom_B01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_WireSecurityRoom_B01_01',
    category: 'Under-Mezzanine Security Cage',
    description: '메자닌 1층 하부 철망 보안 케이지 (SimReady OpenUSD)'
  },
  {
    id: 'SM_GuardRail_A09_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_GuardRail_A09_01',
    category: 'Safety Guardrail',
    description: '공장 안전 가드레일 / 볼라드 보호대 (SimReady OpenUSD)'
  },
  {
    id: 'SM_DockSafetyGate_A02_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_DockSafetyGate_A02_01',
    category: 'North Cargo Dock Gate',
    description: '북측 화물 도어 구역 안전 게이트 (SimReady OpenUSD)'
  },
  {
    id: 'SM_ABCFireExtinguisher_A03_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_ABCFireExtinguisher_A03_01',
    category: 'Fire Safety Equipment',
    description: 'H빔 기둥 부착용 ABC 분말 소화기 (SimReady OpenUSD)'
  },
  {
    id: 'sm_watercooler_a01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_watercooler_a01_01',
    category: 'Restroom / Staircase Utility',
    description: '1층 화장실 옆 음수대 / 워터쿨러 (SimReady OpenUSD)'
  },
  {
    id: 'SM_FlammableDrumCabinet_A02_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_FlammableDrumCabinet_A02_01',
    category: 'Industrial Safety Cabinet',
    description: '방폭/안전 캐비닛 (배전반 및 유틸리티 구역, SimReady OpenUSD)'
  },
  // --- Stainless Steel Industrial Assets ---
  {
    id: 'SM_MetalStainlessTable_A03_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_MetalStainlessTable_A03_01',
    category: 'Stainless Steel 304/316 Equipment',
    description: '스테인리스 스틸(SUS 304/316) 후처리 및 정밀 측정 작업대 (SimReady OpenUSD)'
  },
  {
    id: 'SM_StainlessSteelIBCTank_A01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_StainlessSteelIBCTank_A01_01',
    category: 'Stainless Steel 316L Equipment',
    description: '스테인리스 스틸(SUS 316L) 산업용 액체/화학 IBC 탱크 (SimReady OpenUSD)'
  },
  // --- Office Furniture & Supplies (사무실 용품) ---
  {
    id: 'sm_officechairamf_a01_black_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_officechairamf_a01_black_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 실무자용 블랙 오피스 체어 (SimReady OpenUSD)'
  },
  {
    id: 'sm_fabricmanagerschair_a01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_fabricmanagerschair_a01_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 매니저용 하이백 패브릭 체어 (SimReady OpenUSD)'
  },
  {
    id: 'sm_officemonitor_a01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_officemonitor_a01_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 와이드 LCD 모니터 (SimReady OpenUSD)'
  },
  {
    id: 'sm_keyboard_a01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_keyboard_a01_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 PC 키보드 (SimReady OpenUSD)'
  },
  {
    id: 'sm_officemouse_b01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_officemouse_b01_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 무선 광마우스 (SimReady OpenUSD)'
  },
  {
    id: 'sm_officeprinter_a01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_officeprinter_a01_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 레이저 복합기/프린터 (SimReady OpenUSD)'
  },
  {
    id: 'SM_ComputerCart_A01_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_ComputerCart_A01_01',
    category: 'CNC / 3D Printer Operator Terminal',
    description: 'CNC 및 3D 프린터 현장 제어용 모바일 컴퓨터 카트 (SimReady OpenUSD)'
  },
  {
    id: 'SM_OfficeTrashCan_A03_Black_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/SM_OfficeTrashCan_A03_Black_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 블랙 휴지통 (SimReady OpenUSD)'
  },
  {
    id: 'sm_officepaperpack_a01_blue_01',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/general/sm_officepaperpack_a01_blue_01',
    category: 'Office Furniture & Supplies',
    description: '사무실 A4 복사용지 팩 (SimReady OpenUSD)'
  },
  // --- NVIDIA SimReady Assets (3D Printers, CNC Vise, FKM/PP Oil Seals, Office Desk/Cabinet/PC) ---
  {
    id: 'equipment_3d_printer_a01',
    repo: 'nvidia/simready-assets',
    folder: 'equipment_3d_printer_a01/simready_usd',
    onlyFiles: [
      'sm_equipment_3d_printer_a01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: '3D Printing Machine',
    description: '산업용 3D 프린터 A01 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'equipment_3d_printer_b01',
    repo: 'nvidia/simready-assets',
    folder: 'equipment_3d_printer_b01/simready_usd',
    onlyFiles: [
      'sm_equipment_3d_printer_b01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: '3D Printing Machine',
    description: '산업용 3D 프린터 B01 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'equipment_machine_vise_c01',
    repo: 'nvidia/simready-assets',
    folder: 'equipment_machine_vise_c01/simready_usd',
    onlyFiles: [
      'sm_equipment_machine_vise_c01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: 'CNC Machining Equipment',
    description: 'CNC 머시닝 센터 정밀 클램핑 바이스 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'consumable_oil_seal_large_b01',
    repo: 'nvidia/simready-assets',
    folder: 'consumable_oil_seal_large_b01/simready_usd',
    onlyFiles: [
      'sm_consumable_oil_seal_large_b01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: 'PP / FKM / FPM CNC Machined Seal',
    description: 'FKM/FPM/PP 소재 CNC 정밀 가공 오일 씰 파츠 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'desk_a01',
    repo: 'nvidia/simready-assets',
    folder: 'desk_a01/simready_usd',
    onlyFiles: [
      'sm_desk_a01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: 'Office Furniture & Supplies',
    description: '사무실 표준 오피스 데스크 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'computer_desktop_tower_a01',
    repo: 'nvidia/simready-assets',
    folder: 'computer_desktop_tower_a01/simready_usd',
    onlyFiles: [
      'sm_computer_desktop_tower_a01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: 'Office Furniture & Supplies',
    description: '사무실 CAD/CAM 워크스테이션 데스크탑 본체 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'cabinet_file_a01',
    repo: 'nvidia/simready-assets',
    folder: 'cabinet_file_a01/simready_usd',
    onlyFiles: [
      'sm_cabinet_file_a01_01.usd',
      'payloads/base.usda',
      'payloads/geometries.usd',
      'payloads/instances.usda',
      'payloads/materials.usda'
    ],
    category: 'Office Furniture & Supplies',
    description: '사무실 철제 파일 캐비닛 (NVIDIA SimReady OpenUSD)'
  },
  {
    id: 'nvidia_material_library',
    repo: 'nvidia/PhysicalAI-SimReady-Warehouse-01',
    folder: 'Props/modular/Modular_Warehouse/Library/Material Library',
    onlyFiles: [
      'Metal/Steel/Steel_A.mdl',
      'Metal/Chrome/Chrome_A.mdl',
      'Metal/Misc/Metal_Rough_A.mdl',
      'Metal/Textures/T_Steel_A1_Albedo.png',
      'Metal/Textures/T_Steel_A1_Normal.png',
      'Metal/Textures/T_Steel_A1_ORM.png',
      'Metal/Textures/T_Metal_Chrome_A_Albedo.png',
      'Metal/Textures/T_Metal_Chrome_A_Normal.png',
      'Metal/Textures/T_Metal_Chrome_A_ORM.png',
      'Metal/Textures/T_Metal_Rough_A_Albedo.png',
      'Metal/Textures/T_Metal_Rough_A_Normal.png',
      'Metal/Textures/T_Metal_Rough_A_ORM.png',
      'Plastic/Misc/Plastic_Glossy_White_A.mdl',
      'Plastic/Textures/T_Plastic_Glossy_White_A_Albedo.png',
      'Plastic/Textures/T_Plastic_Glossy_White_A_Normal.png',
      'Plastic/Textures/T_Plastic_Glossy_White_A_ORM.png',
      'Rubber/Generic/Rubber_Black_Glossy_A.mdl',
      'Rubber/Textures/T_Rubber_Black_Glossy_A_Albedo.png',
      'Rubber/Textures/T_Rubber_Black_Glossy_A_Normal.png',
      'Rubber/Textures/T_Rubber_Black_Glossy_A_ORM.png'
    ],
    category: 'NVIDIA OmniPBR Material Library',
    description: '스테인리스/스틸/플라스틱(PP)/고무(FKM·FPM) 공식 MDL 및 PBR 텍스처 라이브러리'
  }
];

async function listFilesRecursive(repo, folderPath) {
  const url = `https://huggingface.co/api/datasets/${repo}/tree/main/${encodeURIComponent(folderPath).replace(/%2F/g, '/')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to list ${url}: ${res.status}`);
  }
  const items = await res.json();
  let files = [];
  for (const item of items) {
    if (item.type === 'file') {
      files.push({ path: item.path, size: item.size });
    } else if (item.type === 'directory' && !item.path.endsWith('/.thumbs')) {
      const subFiles = await listFilesRecursive(repo, item.path);
      files = files.concat(subFiles);
    }
  }
  return files;
}

async function downloadFile(repo, remotePath, localPath) {
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
    return { skipped: true, size: fs.statSync(localPath).size };
  }
  const url = `https://huggingface.co/datasets/${repo}/resolve/main/${encodeURIComponent(remotePath).replace(/%2F/g, '/')}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(localPath, buf);
  return { skipped: false, size: buf.length };
}

async function main() {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: 'NVIDIA Isaac Sim / Omniverse SimReady Public OpenUSD Datasets (Hugging Face)',
    baseDirectory: BASE_DIR,
    assets: []
  };

  let totalBytes = 0;
  let totalFiles = 0;

  for (const asset of WAREHOUSE_ASSETS) {
    console.log(`\n📦 Fetching [${asset.id}] (${asset.description})...`);
    let fileList = [];
    if (asset.onlyFiles) {
      fileList = asset.onlyFiles.map(f => ({ path: `${asset.folder}/${f}`, size: 0 }));
    } else {
      fileList = await listFilesRecursive(asset.repo, asset.folder);
    }

    const assetRecord = {
      id: asset.id,
      repo: asset.repo,
      category: asset.category,
      description: asset.description,
      localFolder: path.join(BASE_DIR, asset.id).replace(/\\/g, '/'),
      mainUsd: null,
      files: []
    };

    for (const f of fileList) {
      const relPath = f.path.slice(asset.folder.length + 1);
      const localPath = path.join(BASE_DIR, asset.id, relPath);
      const dl = await downloadFile(asset.repo, f.path, localPath);
      totalBytes += dl.size;
      totalFiles += 1;
      if ((relPath.endsWith('.usd') || relPath.endsWith('.usda')) && !relPath.endsWith('_physics.usd') && !assetRecord.mainUsd) {
        assetRecord.mainUsd = localPath.replace(/\\/g, '/');
      }
      assetRecord.files.push({
        relativePath: relPath,
        sizeBytes: dl.size
      });
      console.log(`   ✔ ${relPath} (${(dl.size / 1024).toFixed(1)} KB)${dl.skipped ? ' [cached]' : ''}`);
    }
    manifest.assets.push(assetRecord);
  }

  const manifestPath = path.join(BASE_DIR, 'nvidia_simready_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`\n✅ Completed! Total synced: ${totalFiles} files (${(totalBytes / (1024 * 1024)).toFixed(2)} MB) in ${BASE_DIR}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
