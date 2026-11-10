/*
 * capacity.js — "how many sheets, how many hours, which day" (pure, testable).
 *
 *   plan() turns one nested sheet (parts per sheet + its cycle time) and an order quantity
 *   into sheets, machine hours, working days and a finish date, with OEE applied:
 *
 *     availability  share of scheduled time the machine actually runs (breakdowns, waiting)
 *     performance   speed vs the ideal cycle (slow feeds, small stops)
 *     quality       share of parts that are good → more parts must be cut than ordered
 *
 *   No hidden constants: every assumption is an input and is echoed back in the result.
 *
 * Browser: window.Capacity · Node: require('../viewer/lib/capacity.js')
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Capacity = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_SHIFT = { hoursPerShift: 8, shiftsPerDay: 1, breakMinPerShift: 60, daysPerWeek: 5 };
  const DEFAULT_OEE = { availability: 0.85, performance: 0.9, quality: 0.98 };
  const clamp01 = (v, d) => (typeof v === 'number' && v > 0 && v <= 1 ? v : d);

  /**
   * input: {
   *   qty            ordered good parts (or sets, when a sheet holds a set)
   *   partsPerSheet  good parts (or sets) one sheet yields
   *   cycle          { loadS, runS, unloadS } for one sheet on one machine
   *   machines       identical machines working in parallel (default 1)
   *   setupS         one-off setup before the first sheet (default 0)
   *   shift, oee     see DEFAULT_SHIFT / DEFAULT_OEE
   *   start          Date / ISO string / ms for the finish-date estimate (optional)
   * }
   */
  function plan(input) {
    const i = input || {};
    const qty = Math.max(0, Math.floor(i.qty || 0)), pps = Math.max(1, Math.floor(i.partsPerSheet || 1));
    const c = i.cycle || {}, cycleS = Math.max(0, (c.loadS || 0) + (c.runS || 0) + (c.unloadS || 0));
    const machines = Math.max(1, Math.floor(i.machines || 1));
    const shift = Object.assign({}, DEFAULT_SHIFT, i.shift || {});
    const oee = { availability: clamp01(i.oee && i.oee.availability, DEFAULT_OEE.availability), performance: clamp01(i.oee && i.oee.performance, DEFAULT_OEE.performance), quality: clamp01(i.oee && i.oee.quality, DEFAULT_OEE.quality) };
    const partsToCut = Math.ceil(qty / oee.quality - 1e-9);
    const sheets = qty > 0 ? Math.ceil(partsToCut / pps) : 0;
    const netS = sheets * cycleS;                                            // pure machine time, all sheets
    const grossS = netS / (oee.availability * oee.performance) + (i.setupS || 0) * (sheets > 0 ? 1 : 0);   // scheduled machine time
    const sheetsOnBusiest = Math.ceil(sheets / machines);
    const elapsedS = sheets > 0 ? sheetsOnBusiest * cycleS / (oee.availability * oee.performance) + (i.setupS || 0) : 0;   // wall-clock with parallel machines
    const workSPerDay = Math.max(1, shift.shiftsPerDay * (shift.hoursPerShift * 3600 - shift.breakMinPerShift * 60));
    const workDays = elapsedS / workSPerDay;
    const res = {
      qty, partsPerSheet: pps, partsToCut, sheets, machines, cycleS,
      netHours: netS / 3600, grossHours: grossS / 3600, elapsedHours: elapsedS / 3600,
      workDays, workHoursPerDay: workSPerDay / 3600,
      sheetsPerHour: cycleS > 0 ? 3600 / cycleS * oee.availability * oee.performance * machines : 0,
      goodPartsPerHour: cycleS > 0 ? 3600 / cycleS * oee.availability * oee.performance * machines * pps * oee.quality : 0,
      oeePct: oee.availability * oee.performance * oee.quality * 100,
      shift, oee, finish: null
    };
    if (i.start !== undefined && i.start !== null && sheets > 0) res.finish = finishDate(i.start, elapsedS, shift);
    return res;
  }

  /**
   * Finish time when `workS` seconds of work start at `start`, working shift hours only.
   * Days: Monday first, daysPerWeek working days. Each working day starts at the start time's
   * clock time and offers shiftsPerDay × (hoursPerShift − breaks) of work.
   */
  function finishDate(start, workS, shift) {
    const sh = Object.assign({}, DEFAULT_SHIFT, shift || {});
    const perDay = Math.max(1, sh.shiftsPerDay * (sh.hoursPerShift * 3600 - sh.breakMinPerShift * 60));
    const d = new Date(start);
    if (isNaN(d.getTime())) return null;
    const isWork = x => ((x.getDay() + 6) % 7) < sh.daysPerWeek;            // Mon=0 … Sun=6
    let left = workS, guard = 0;
    while (!isWork(d) && guard++ < 14) d.setDate(d.getDate() + 1);
    while (left > perDay && guard++ < 100000) {
      left -= perDay;
      do { d.setDate(d.getDate() + 1); } while (!isWork(d) && guard++ < 100000);
    }
    // inside the last working day: add breaks proportionally so the clock time is realistic
    const spanS = sh.shiftsPerDay * sh.hoursPerShift * 3600;
    return new Date(d.getTime() + left / perDay * spanS * 1000);
  }

  /**
   * What-if table: the base plan plus each named variation of the input.
   * variations: [{ label, change: (input) => input' }]
   */
  function whatIf(input, variations) {
    const base = plan(input);
    return [{ label: '현재', plan: base, deltaPct: 0 }].concat((variations || []).map(v => {
      const p = plan(v.change(JSON.parse(JSON.stringify(Object.assign({}, input, { start: undefined })))));
      return { label: v.label, plan: p, deltaPct: base.elapsedHours > 0 ? (p.elapsedHours / base.elapsedHours - 1) * 100 : 0 };
    }));
  }

  return { DEFAULT_SHIFT, DEFAULT_OEE, plan, finishDate, whatIf };
});
