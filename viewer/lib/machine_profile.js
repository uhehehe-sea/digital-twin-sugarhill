/*
 * machine_profile.js — per-machine facts the twin needs to predict real time (pure, testable).
 *
 *   A profile is the asset-registry entry for one machine: who it is (model, controller,
 *   how to reach it) and how it moves (acceleration, rapid speed, corner tolerance, loading
 *   and unloading time). Everything starts as an ASSUMED default and is replaced by measured
 *   values: type them in, or give calibrate() a few "predicted vs stopwatch" pairs.
 *
 *   source: 'assumed'  → shown as 가정값 in the UI
 *           'measured' → someone entered real values or ran a calibration (calibratedAt set)
 *
 * Browser: window.MachineProfile · Node: require('../viewer/lib/machine_profile.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MachineProfile = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULTS = {
    router: { accelMmS2: 600, rapidMmMin: 15000, junctionDevMm: 0.05, loadS: 40, unloadS: 45, toolChangeS: 20, toolLifeM: 3000 },
    lathe: { accelMmS2: 1500, rapidMmMin: 20000, junctionDevMm: 0.02, loadS: 30, unloadS: 30, toolChangeS: 8, toolLifeM: 2000 },
    am: { accelMmS2: 0, rapidMmMin: 0, junctionDevMm: 0, loadS: 20, unloadS: 30, toolChangeS: 0, toolLifeM: 0 }
  };
  const CONNECTIONS = ['none', 'http-push', 'mtconnect', 'opcua', 'mqtt'];
  // [min, max] for every numeric field a user may type
  const LIMITS = {
    accelMmS2: [0, 50000], rapidMmMin: [0, 200000], junctionDevMm: [0, 5], loadS: [0, 7200], unloadS: [0, 7200],
    toolChangeS: [0, 3600], toolLifeM: [0, 1e6], timeFactor: [0.2, 5], feedScale: [0.1, 3]
  };

  /** A full profile for a machine kind with every field present. */
  function defaults(kind) {
    return Object.assign({
      kind: kind || 'router', model: '', controller: '', connection: { type: 'none', url: '' },
      timeFactor: 1, feedScale: 1, source: 'assumed', calibratedAt: null, samples: []
    }, DEFAULTS[kind] || DEFAULTS.router);
  }

  /** Saved values over defaults (unknown keys dropped). */
  function merge(kind, saved) {
    const p = defaults(kind);
    if (!saved || typeof saved !== 'object') return p;
    for (const k of Object.keys(p)) {
      if (saved[k] === undefined || saved[k] === null) continue;
      if (k === 'connection') p.connection = Object.assign({ type: 'none', url: '' }, saved.connection);
      else p[k] = saved[k];
    }
    p.kind = kind || p.kind;
    return p;
  }

  /** null when the profile is acceptable, otherwise a message (Korean: shown to the user). */
  function validate(p) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return '프로파일은 객체여야 합니다';
    for (const k of Object.keys(LIMITS)) {
      if (p[k] === undefined) continue;
      const v = p[k], [lo, hi] = LIMITS[k];
      if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) return `${k} 값이 범위(${lo}~${hi}) 밖입니다`;
    }
    for (const k of ['model', 'controller']) if (p[k] !== undefined && (typeof p[k] !== 'string' || p[k].length > 120)) return `${k}는 120자 이하 문자열이어야 합니다`;
    if (p.connection !== undefined) {
      const c = p.connection;
      if (!c || typeof c !== 'object' || !CONNECTIONS.includes(c.type)) return `connection.type은 ${CONNECTIONS.join(', ')} 중 하나여야 합니다`;
      if (c.url !== undefined && (typeof c.url !== 'string' || c.url.length > 300)) return 'connection.url이 너무 깁니다';
      if (c.url && !/^(https?|opc\.tcp|mqtts?):\/\//i.test(c.url)) return 'connection.url은 http(s)://, opc.tcp://, mqtt(s):// 로 시작해야 합니다';
    }
    if (p.samples !== undefined && (!Array.isArray(p.samples) || p.samples.length > 200)) return 'samples는 200개 이하 배열이어야 합니다';
    return null;
  }

  /** The part of a profile that NcProgram.timing() needs. null for machines that do not run NC paths. */
  function kinOf(p) {
    if (!p || !(p.accelMmS2 > 0)) return null;
    return { accelMmS2: p.accelMmS2, rapidMmMin: p.rapidMmMin, junctionDevMm: p.junctionDevMm, feedScale: p.feedScale || 1, timeFactor: p.timeFactor || 1 };
  }

  /**
   * Calibration from measured runs. samples: [{ predictedS, actualS, label? }] where predictedS
   * was computed with timeFactor = 1. Returns the multiplier that makes total predicted time
   * equal total measured time, plus the mean absolute % error before and after.
   * Fewer than 1 valid sample → null.
   */
  function calibrate(samples) {
    const ok = (samples || []).filter(s => s && s.predictedS > 0 && s.actualS > 0);
    if (!ok.length) return null;
    const sp = ok.reduce((a, s) => a + s.predictedS, 0), sa = ok.reduce((a, s) => a + s.actualS, 0);
    const factor = sa / sp;
    const mape = f => ok.reduce((a, s) => a + Math.abs(s.predictedS * f - s.actualS) / s.actualS, 0) / ok.length * 100;
    return { factor, n: ok.length, errorBeforePct: mape(1), errorAfterPct: mape(factor) };
  }

  return { DEFAULTS, CONNECTIONS, LIMITS, defaults, merge, validate, kinOf, calibrate };
});
