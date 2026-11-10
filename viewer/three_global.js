/*
 * three_global.js — loads the current three.js (ES modules, from node_modules via /vendor/three/)
 * and exposes it as the global `THREE` that the viewer scripts expect.
 *
 * The viewer was written against r128 (2021) classic scripts. Rather than rewriting 8,000 lines
 * at once, this file is the single place that absorbs the API changes since then:
 *
 *   colour       texture.encoding / renderer.outputEncoding  → colorSpace (accessors below)
 *   lights       r155 made light units physical. The scene is modelled in millimetres, so
 *                inverse-square falloff would make every lamp black; lights keep the old
 *                artistic behaviour: intensity × π, point lights fade by distance cutoff only.
 *   gizmo        TransformControls is no longer an Object3D → add getHelper() to the scene
 *                (handled in editor_v2.js with a fallback for the old behaviour)
 *   buffers      attribute.updateRange → addUpdateRange (handled where used, with a fallback)
 *
 * Classic scripts after this module are marked `defer`, so they run after it, in order.
 */
import * as NS from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const LEGACY_LIGHT_GAIN = Math.PI;   // r155 migration guide: old intensity × π ≈ same brightness

class PointLight extends NS.PointLight {
  constructor(color, intensity = 1, distance = 0, _decay) { super(color, intensity * LEGACY_LIGHT_GAIN, distance, 0); }
}
class SpotLight extends NS.SpotLight {
  constructor(color, intensity = 1, distance = 0, angle, penumbra, _decay) { super(color, intensity * LEGACY_LIGHT_GAIN, distance, angle, penumbra, 0); }
}
class DirectionalLight extends NS.DirectionalLight { constructor(color, intensity = 1) { super(color, intensity * LEGACY_LIGHT_GAIN); } }
class HemisphereLight extends NS.HemisphereLight { constructor(sky, ground, intensity = 1) { super(sky, ground, intensity * LEGACY_LIGHT_GAIN); } }
class AmbientLight extends NS.AmbientLight { constructor(color, intensity = 1) { super(color, intensity * LEGACY_LIGHT_GAIN); } }

// r128 colour API → colorSpace
const sRGBEncoding = 3001, LinearEncoding = 3000;
Object.defineProperty(NS.Texture.prototype, 'encoding', {
  configurable: true,
  get() { return this.colorSpace === NS.SRGBColorSpace ? sRGBEncoding : LinearEncoding; },
  set(v) { this.colorSpace = v === sRGBEncoding ? NS.SRGBColorSpace : NS.NoColorSpace; }
});
Object.defineProperty(NS.WebGLRenderer.prototype, 'outputEncoding', {
  configurable: true,
  get() { return this.outputColorSpace === NS.SRGBColorSpace ? sRGBEncoding : LinearEncoding; },
  set(v) { this.outputColorSpace = v === sRGBEncoding ? NS.SRGBColorSpace : NS.LinearSRGBColorSpace; }
});

RectAreaLightUniformsLib.init();   // area lights (ceiling fixtures) need their lookup textures once

window.THREE = Object.assign({}, NS, {
  OrbitControls, TransformControls, OBJLoader, GLTFLoader, KTX2Loader, HDRLoader, MeshoptDecoder, Reflector, RoomEnvironment,
  EffectComposer, RenderPass, GTAOPass, UnrealBloomPass, SMAAPass, OutputPass,
  PointLight, SpotLight, DirectionalLight, HemisphereLight, AmbientLight,
  sRGBEncoding, LinearEncoding
});
window.THREE_REVISION = NS.REVISION;
