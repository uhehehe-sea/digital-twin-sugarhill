import fs from 'fs';
import { execSync } from 'child_process';

const SOLIDCRAFT_CLI = 'C:\\Users\\jaeso\\.gemini\\antigravity\\bin\\solidcraft-cli.exe';
const OUT_DIR = 'C:\\Users\\jaeso\\.gemini\\antigravity\\scratch\\factory_digital_twin';

const commands = [];

function addBox(name, x, y, z, dx, dy, dz) {
  commands.push({
    command: 'solid.box',
    params: {
      body_name: name,
      corner: [x, y, z],
      length: dx,
      width: dy,
      height: dz
    }
  });
}

function addCylZ(name, cx, cy, z, r, dz) {
  commands.push({
    command: 'solid.cylinder',
    params: {
      body_name: name,
      base: [cx, cy, z],
      axis: [0, 0, 1],
      radius: r,
      height: dz
    }
  });
}

function addCylX(name, x, cy, cz, r, dx) {
  commands.push({
    command: 'solid.cylinder',
    params: {
      body_name: name,
      base: [x, cy, cz],
      axis: [1, 0, 0],
      radius: r,
      height: dx
    }
  });
}

// ============================================================================
// 1. SKF Seal-Jet 630 PRO CNC Lathe (PP / FKM / FPM 씰 전용 CNC 선반 가공기)
//    - Dimensions: 2,450 × 1,480 × 1,820 mm (Origin at X=0..2450, Y=0..1480)
// ============================================================================
addBox('CNC_SealJet_BaseBed_CastIron', 0, 0, 0, 2450, 1480, 680);
addBox('CNC_SealJet_ChipPan_Stainless304', 80, 80, 680, 1850, 1320, 60);
addBox('CNC_SealJet_Enclosure_LeftTower', 0, 0, 680, 650, 1480, 1140);
addBox('CNC_SealJet_Enclosure_RearHood', 650, 680, 680, 1300, 800, 1140);
addBox('CNC_SealJet_Enclosure_RightTail', 1950, 0, 680, 500, 1480, 1140);
addBox('CNC_SealJet_SlidingDoor_Frame', 680, 40, 740, 1220, 60, 1020);
addBox('CNC_SealJet_SlidingDoor_PolycarbonateGlass', 740, 55, 820, 1100, 25, 820);

// Spindle Chuck & FKM / FPM / PP Semi-Finished Billet Tube inside Workzone
addCylX('CNC_SealJet_SpindleChuck_SUS316', 650, 740, 1220, 210, 180);
addCylX('CNC_SealJet_Billet_FKM_Viton_Black85A', 830, 740, 1220, 145, 220);
addCylX('CNC_SealJet_Billet_FKM_Viton_Brown80A', 1050, 740, 1220, 135, 120);
addCylX('CNC_SealJet_Billet_PP_Natural_SealRing', 1170, 740, 1220, 130, 95);

// 8-Station CNC Tool Turret & Vacuum Chip Suction Nozzle
addCylX('CNC_SealJet_Turret_Disc', 1420, 920, 1320, 175, 140);
addBox('CNC_SealJet_Turret_SlideCarriage', 1380, 880, 1050, 320, 420, 270);
addCylZ('CNC_SealJet_ChipExhaust_CycloneUnit', 2200, 1150, 1820, 160, 420);

// CNC Swivel Operator Control Pendant (Siemens / Seal-Jet CAM Screen)
addBox('CNC_SealJet_HMI_Arm', 1960, -180, 1350, 80, 220, 80);
addBox('CNC_SealJet_HMI_Panel_Cabinet', 1820, -240, 1120, 480, 110, 580);
addBox('CNC_SealJet_HMI_TouchScreen', 1860, -248, 1280, 400, 12, 320);

// ============================================================================
// 2. EOS M 290 / TruPrint Stainless Steel 3D Printer (SUS 316L / 304 / 314 SLM)
//    - Placed alongside at X=3200..5700, Y=0..1300, Z=0..2190 mm
// ============================================================================
addBox('SLM_3DPrinter_MainFrame_Base', 3200, 0, 0, 2500, 1300, 850);
addBox('SLM_3DPrinter_ProcessChamber_SUS304', 3200, 60, 850, 1450, 1240, 1150);
addBox('SLM_3DPrinter_ControlTower_Right', 4650, 0, 850, 1050, 1300, 1150);
addBox('SLM_3DPrinter_LaserOptics_TopHood', 3350, 200, 2000, 1150, 950, 240);
addBox('SLM_3DPrinter_LaserWarning_Beacon', 3900, 650, 2240, 90, 90, 140);

// Inert Argon Build Chamber Viewing Window & Glove Ports
addBox('SLM_3DPrinter_ChamberDoor_Frame', 3320, 0, 920, 1200, 60, 980);
addBox('SLM_3DPrinter_LaserShield_GreenGlass', 3450, -8, 1120, 680, 20, 520);
addCylZ('SLM_3DPrinter_BuildPlate_SUS316L', 3780, 580, 960, 140, 45);
addCylZ('SLM_3DPrinter_PrintedPart_SUS316L_Impeller', 3710, 560, 1005, 55, 110);
addCylZ('SLM_3DPrinter_PrintedPart_SUS314_HeatNozzle', 3860, 610, 1005, 48, 135);

// Argon Recirculating Filter Module (집진/아르곤 순환기)
addBox('SLM_3DPrinter_ArgonFilter_Unit', 5850, 150, 0, 780, 950, 1780);
addCylZ('SLM_3DPrinter_ArgonGas_Cylinder_1', 6720, 350, 0, 115, 1480);
addCylZ('SLM_3DPrinter_ArgonGas_Cylinder_2', 6720, 650, 0, 115, 1480);

const jsonPath = `${OUT_DIR}\\industrial_cnc_and_3dprinter.json`;
const scPath = `${OUT_DIR}\\industrial_cnc_and_3dprinter.sc`;
const stepPath = `${OUT_DIR}\\industrial_cnc_and_3dprinter.step`;
const objPath = `${OUT_DIR}\\industrial_cnc_and_3dprinter.obj`;

fs.writeFileSync(jsonPath, JSON.stringify(commands, null, 2));
console.log(`Generated ${commands.length} B-Rep bodies for CNC Seal-Jet & Stainless 3D Printer...`);
execSync(`"${SOLIDCRAFT_CLI}" run "${jsonPath}" --save "${scPath}" --out "${stepPath}" --out "${objPath}"`, { stdio: 'inherit' });
console.log(`✅ Exported STEP (${stepPath}) and OBJ (${objPath})`);
