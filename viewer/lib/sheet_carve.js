/*
 * sheet_carve.js — heightmap sheet for router plate cutting (pure, testable).
 *
 *   A router sheet is a grid of remaining-thickness values (one per top-surface
 *   vertex, init = sheet thickness). As the tool follows the G-code, carveSegment()
 *   lowers the vertices inside the tool's swept disc to the tool's current Z.
 *   Heights only ever decrease, so a pass never "uncuts" material, and a holding
 *   tab (where the G-code lifts the tool) is never carved through — the caller
 *   skips tab segments (see NcProgram.parse: segment.tab).
 *
 *   removedVolume()/removedMassKg() turn the heightmap into the material actually
 *   removed, so the twin can report it (mass = volume x the sheet material density).
 *
 * Browser: window.SheetCarve · Node: require('../viewer/lib/sheet_carve.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SheetCarve = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_VERTICES = 120000;   // cap so the sheet stays performant
  const MIN_CELL = 4;            // mm — coarsest grid that still shows the kerf

  /**
   * Grid dims for a sheet of L x W mm with a nominal cell size (mm).
   * Returns { nx, ny, cellX, cellY } where the grid has (nx+1)*(ny+1) vertices
   * and exactly spans the sheet (cellX = L/nx, cellY = W/ny).
   */
  function computeGrid(L, W, cell) {
    let c = Math.max(MIN_CELL, cell || MIN_CELL);
    let nx = Math.max(2, Math.ceil(L / c)), ny = Math.max(2, Math.ceil(W / c));
    while ((nx + 1) * (ny + 1) > MAX_VERTICES) {
      c *= 1.1;
      nx = Math.max(2, Math.ceil(L / c)); ny = Math.max(2, Math.ceil(W / c));
    }
    return { nx, ny, cellX: L / nx, cellY: W / ny, cell: c };
  }

  /**
   * Heightmap for a sheet. h is a Float32Array of (nx+1)*(ny+1) remaining
   * thicknesses (mm), vertex (ix, iy) sits at sheet position (ix*cellX, iy*cellY).
   */
  function createHeightmap(L, W, thickness, cell) {
    const g = computeGrid(L, W, cell);
    const h = new Float32Array((g.nx + 1) * (g.ny + 1));
    h.fill(thickness);
    return { L, W, thickness, nx: g.nx, ny: g.ny, cellX: g.cellX, cellY: g.cellY, h };
  }

  /** Distance from a point to a segment. */
  function distToSeg(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let u = 0;
    if (len2 > 0) u = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / len2));
    return Math.hypot(px - (x0 + dx * u), py - (y0 + dy * u));
  }

  /**
   * Carve one straight cut: lower every grid vertex within toolR of the segment
   * (x0,y0)-(x1,y1) to the remaining height implied by the tool tip Z
   * (zTip < 0, relative to the sheet top; target = thickness + zTip, clamped >= 0).
   * Heights only decrease. Returns { changed: [vertex indices], minIdx, maxIdx }.
   * The caller must NOT call this for tab segments (segment.tab).
   */
  function carveSegment(hm, x0, y0, x1, y1, zTip, toolR) {
    const target = Math.max(0, hm.thickness + zTip);
    const changed = [];
    let minIdx = Infinity, maxIdx = -Infinity;
    const minX = Math.min(x0, x1) - toolR, maxX = Math.max(x0, x1) + toolR;
    const minY = Math.min(y0, y1) - toolR, maxY = Math.max(y0, y1) + toolR;
    const ix0 = Math.max(0, Math.floor(minX / hm.cellX)), ix1 = Math.min(hm.nx, Math.ceil(maxX / hm.cellX));
    const iy0 = Math.max(0, Math.floor(minY / hm.cellY)), iy1 = Math.min(hm.ny, Math.ceil(maxY / hm.cellY));
    const w = hm.nx + 1;
    for (let iy = iy0; iy <= iy1; iy++) {
      const y = iy * hm.cellY;
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = ix * hm.cellX;
        if (distToSeg(x, y, x0, y0, x1, y1) > toolR + 1e-9) continue;
        const idx = iy * w + ix;
        if (hm.h[idx] > target + 1e-9) {
          hm.h[idx] = target;
          changed.push(idx);
          if (idx < minIdx) minIdx = idx;
          if (idx > maxIdx) maxIdx = idx;
        }
      }
    }
    return { changed, minIdx: changed.length ? minIdx : -1, maxIdx: changed.length ? maxIdx : -1 };
  }

  /** Removed volume (mm^3): sum over cells of mean carve depth x cell area. */
  function removedVolume(hm) {
    const w = hm.nx + 1;
    let vol = 0;
    for (let iy = 0; iy < hm.ny; iy++) {
      for (let ix = 0; ix < hm.nx; ix++) {
        const a = iy * w + ix, b = a + 1, c = a + w, d = c + 1;
        const depth = hm.thickness - (hm.h[a] + hm.h[b] + hm.h[c] + hm.h[d]) / 4;
        if (depth > 0) vol += depth * hm.cellX * hm.cellY;
      }
    }
    return vol;
  }

  /** Removed mass (kg) = removed volume (mm^3 -> m^3) x density (kg/m^3). */
  function removedMassKg(hm, densityKgM3) {
    return removedVolume(hm) * 1e-9 * densityKgM3;
  }

  return { MAX_VERTICES, MIN_CELL, computeGrid, createHeightmap, carveSegment, removedVolume, removedMassKg, distToSeg };
});
