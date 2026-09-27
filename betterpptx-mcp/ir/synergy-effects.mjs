// ir/synergy-effects.mjs — Synergy Engine S2: the Effect Synthesizer (M3: push / carry / knock-over).
// ─────────────────────────────────────────────────────────────────────────────
// The gesture is the VERB; these functions synthesize its OBJECT — the native animation the target plays,
// derived from CONTACT GEOMETRY (never canned): a push flies the target along the hand's measured velocity
// vector; a carried object rides the hand's RENDERED path as a multi-point custom motion path; a knock-over
// teeters then falls away from the contact side. Everything is computed from the EMPIRICAL clip timelines
// (rendered truth per video millisecond — see solveBestEmpirical), so the timing is the real render's timing.
//
// Wire format (measured constraints): motion paths are slide-fraction strings "M 0 0 L x y L x y … E"
// (relative to the object's own start position; x fractions of slide WIDTH, y of slide HEIGHT); timing keys
// are `duration`/`delay` in ms (never *Ms) — engine.mjs defaults *Ms-only cues to 500ms.
// ─────────────────────────────────────────────────────────────────────────────

import { timedMotionPathAnimations, validateTimedMotionSamples } from './timed-motion-path.mjs';

const DEFAULT_SLIDE_W = 13.333; // T24: default only — pass dims per call
const DEFAULT_SLIDE_H = 7.5;

/** Smoothed slide-space velocity (in/s) of an empirical timeline at index i (±k samples). */
function velocityAt(tl, i, k = 2) {
  const a = Math.max(0, i - k);
  const b = Math.min(tl.length - 1, i + k);
  const dt = (tl[b][0] - tl[a][0]) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0, speed: 0 };
  const vx = (tl[b][1] - tl[a][1]) / dt;
  const vy = (tl[b][2] - tl[a][2]) / dt;
  return { vx, vy, speed: Math.hypot(vx, vy) };
}

/**
 * IMPULSE candidates from an empirical timeline: fast, directed hand moments (a strike/shove) usable as the
 * contact instant for push / knock-over. → [{ tMs, idx, xIn, yIn, dir:{x,y} (unit), speedInPerS }]
 */
export function impulseCandidates(timeline, { minSpeed = 3.0, maxContactMs = 4000 } = {}) {
  const out = [];
  for (let i = 2; i < timeline.length - 2; i++) {
    if (timeline[i][0] > maxContactMs) break;
    const v = velocityAt(timeline, i);
    if (v.speed < minSpeed) continue;
    out.push({ tMs: timeline[i][0], idx: i, xIn: timeline[i][1], yIn: timeline[i][2],
      dir: { x: v.vx / v.speed, y: v.vy / v.speed }, speedInPerS: +v.speed.toFixed(2) });
  }
  // keep local speed maxima only (one candidate per strike)
  return out.filter((c, j) => (j === 0 || c.speedInPerS >= out[j - 1].speedInPerS)
    && (j === out.length - 1 || c.speedInPerS >= out[j + 1].speedInPerS));
}

/**
 * CARRY segments from an empirical timeline: plateau (grab) → sustained travel → plateau (drop).
 * → [{ grabMs, dropMs, grab:{x,y}, drop:{x,y}, travelIn, samples:[[tMs,x,y]…] (uniform-Δt within the segment) }]
 */
export function carrySegments(timeline, { holdMs = 300, minTravelIn = 0.8, stepMs = 100, maxStartMs = 4000 } = {}) {
  timeline = validateTimedMotionSamples(timeline);
  if (![holdMs, minTravelIn, stepMs, maxStartMs].every(value => typeof value === 'number' && Number.isFinite(value)) || holdMs < 0 || minTravelIn < 0 || stepMs <= 0 || maxStartMs < 0) {
    const error = new Error('Carry detection requires finite nonnegative limits and a positive sample interval.');
    error.code = 'TIMED_MOTION_PATH_INVALID';
    throw error;
  }
  // plateaus: maximal runs inside a 0.12in ball
  const runs = [];
  let s = 0;
  for (let i = 1; i < timeline.length; i++) {
    const d = Math.hypot(timeline[i][1] - timeline[s][1], timeline[i][2] - timeline[s][2]);
    if (d > 0.12) {
      if (timeline[i - 1][0] - timeline[s][0] >= holdMs) runs.push([s, i - 1]);
      s = i;
    }
  }
  if (timeline[timeline.length - 1][0] - timeline[s][0] >= holdMs) runs.push([s, timeline.length - 1]);
  const out = [];
  for (let r = 0; r + 1 < runs.length; r++) {
    const [, aEnd] = runs[r];
    const [bStart] = runs[r + 1];
    const grab = timeline[aEnd];
    const drop = timeline[bStart];
    if (grab[0] > maxStartMs) continue;
    const travelIn = Math.hypot(drop[1] - grab[1], drop[2] - grab[2]);
    if (travelIn < minTravelIn) continue;
    // uniform-TIME resampling of the segment (uniform time steps → uniform per-segment path traversal syncs
    // the object to the hand without modeling PowerPoint's easing inside one long segment)
    const samples = [];
    for (let t = grab[0]; t <= drop[0]; t += stepMs) {
      let i = aEnd; while (i < bStart && timeline[i + 1][0] <= t) i++;
      const a = timeline[i]; const b = timeline[Math.min(i + 1, bStart)];
      const f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
      samples.push([t, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
    if (samples.at(-1)?.[0] !== drop[0]) samples.push([drop[0], drop[1], drop[2]]);
    out.push({ grabMs: grab[0], dropMs: drop[0], grab: { x: grab[1], y: grab[2] },
      drop: { x: drop[1], y: drop[2] }, travelIn: +travelIn.toFixed(2), samples });
  }
  return out;
}

/** Serialize uniform-time samples (slide inches, absolute) into a RELATIVE slide-fraction motion path.
 * T24: fractions are of the ACTUAL slide — pass dims for non-wide profiles (defaults preserved). */
export function pathDataFromSamples(samples, dims = {}) {
  const SW = Number(dims.slideW) || DEFAULT_SLIDE_W, SH = Number(dims.slideH) || DEFAULT_SLIDE_H;
  const [t0, x0, y0] = samples[0];
  const pts = samples.slice(1).map(([, x, y]) =>
    `L ${((x - x0) / SW).toFixed(4)} ${((y - y0) / SH).toFixed(4)}`);
  return `M 0 0 ${pts.join(' ')} E`;
}

/**
 * Synthesize the target's native animation for a verb, from solved contact geometry.
 *  push:       fly along the measured hand-velocity direction (distIn, default 2.2), launched at contact.
 *  knock-over: teeter at contact, then exit falling down-and-away 350ms later.
 *  carry:      ride the hand path (segment.samples → multi-L motionPathData), grab→drop.
 * D5-aware: opts.secondaryMotion (default true) adds D2 physical follow-through — an IMPACT SQUASH
 * at contact, a post-push SETTLE (overshoot + return), and a knock-over ROTATION before the exit —
 * all COMPUTED from the same contact geometry. Set secondaryMotion:false for reduced/static motion.
 * Returns the animation ARRAY to attach to the target content object. Wire keys: duration/delay (ms,
 * never *Ms — T8); custom paths carry both pathData + motionPathData (T9).
 */
export function synthesizeEffect(verb, contact, opts = {}) {
  const SW = Number(contact?.slideW) || DEFAULT_SLIDE_W, SH = Number(contact?.slideH) || DEFAULT_SLIDE_H; // T24
  const secondary = opts.secondaryMotion !== false;
  if (verb === 'push') {
    const d = contact.dir; // unit vector, slide space (measured hand velocity at impulse)
    const dist = contact.distIn ?? 2.2;
    const dur = contact.durationMs ?? 600;
    // D2 settle: overshoot ~8% past the target, then ease back to it — 2 chained short paths after the
    // primary fly. Reads as momentum + a soft stop instead of a dead halt.
    const primaryEnd = [d.x * dist / SW, d.y * dist / SH];
    const overshoot = [d.x * dist * 1.08 / SW, d.y * dist * 1.08 / SH];
    const path = `M 0 0 L ${overshoot[0].toFixed(4)} ${overshoot[1].toFixed(4)} L ${primaryEnd[0].toFixed(4)} ${primaryEnd[1].toFixed(4)} E`;
    const flat = `M 0 0 L ${primaryEnd[0].toFixed(4)} ${primaryEnd[1].toFixed(4)} E`;
    const chosen = secondary ? path : flat;
    const anims = [{ type: 'motion', pathData: chosen, motionPathData: chosen, trigger: 'withPrevious', delay: contact.tMs, duration: dur }];
    if (secondary) anims.unshift(impactSquash(contact.tMs)); // squash fires AT contact, before the fly reads
    return anims;
  }
  if (verb === 'knock-over') {
    const d = contact.dir;
    const anims = [];
    if (secondary) anims.push(impactSquash(contact.tMs, 100)); // a quick squash on the blow
    anims.push({ type: 'emphasis', effect: 'teeter', trigger: 'withPrevious', delay: contact.tMs, duration: 350 });
    if (secondary) anims.push({ type: 'emphasis', effect: 'spin', trigger: 'withPrevious', delay: contact.tMs + 200, duration: 500 }); // topple rotation
    anims.push({ type: 'exit', effect: 'fly', direction: (d.x >= 0 ? 'right' : 'left'), trigger: 'withPrevious',
      delay: contact.tMs + 350, duration: 700 });
    return anims;
  }
  if (verb === 'carry') {
    const seg = contact.segment;
    const samples = validateTimedMotionSamples(seg?.samples);
    if (samples[0][0] !== seg.grabMs || samples.at(-1)[0] !== seg.dropMs) {
      const error = new Error('Carry samples must begin at grabMs and end at dropMs.');
      error.code = 'TIMED_MOTION_PATH_INVALID';
      throw error;
    }
    return timedMotionPathAnimations(samples, { slideW: SW, slideH: SH });
  }
  throw new Error(`synthesizeEffect: unknown verb ${verb}`);
}

// D2 impact squash: a short growShrink emphasis at the contact instant — the object compresses when
// struck. Kept tiny (120ms) so it reads as a hit, not a pulse.
function impactSquash(tMs, duration = 120) {
  return { type: 'emphasis', effect: 'growShrink', trigger: 'withPrevious', delay: Math.max(0, tMs - 20), duration };
}

// D3 impact accent: a native starburst placed AT the solved contact point that flashes in and out
// (200ms entrance + 200ms exit) as the blow lands — a decorative punctuation, never a fact carrier.
// Omitted under reduced/static motion (it is pure motion decoration). accentColor is world-styled by
// the caller; contactPoint is in slide inches. Returns a content block (kind:'shape') the compiler
// injects, tagged _synergyAccent so D5 can strip it under a reduced/static policy.
export function impactAccentBlock(contactPoint, { tMs = 0, name = 'impact', accentColor = 'F59E0B', sizeIn = 0.6 } = {}) {
  const x = Math.max(0, (contactPoint?.x ?? 0) - sizeIn / 2), y = Math.max(0, (contactPoint?.y ?? 0) - sizeIn / 2);
  return {
    kind: 'shape', name, objectName: name, shape: 'star8', _synergyAccent: true,
    bbox: { x: +x.toFixed(3), y: +y.toFixed(3), w: sizeIn, h: sizeIn },
    style: { fill: accentColor, line: { color: accentColor, width: 0 } },
    altText: 'impact accent',
    animation: [
      { type: 'entrance', effect: 'flashOnce', trigger: 'withPrevious', delay: Math.max(0, tMs - 40), duration: 200 },
      { type: 'exit', effect: 'flashOnce', trigger: 'withPrevious', delay: Math.max(0, tMs + 160), duration: 200 },
    ],
  };
}
