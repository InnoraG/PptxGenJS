// ir/synergy-solver.mjs — Synergy Engine S1: the Interaction Solver (M2: touch / point-at / press).
// ─────────────────────────────────────────────────────────────────────────────
// PowerPoint cannot bend joints at runtime, so interactions are solved by INVERSE PLACEMENT: pick the clip
// frame where the effector is at its most useful pose (contact), then place + time the presenter's window so
// that pose's effector lands exactly on the target:
//
//     framePos = targetPoint − projectedEffectorOffset(clip, tContact)
//
// All geometry goes through the CALIBRATED projection (synergy-geometry.modelToSlide — held-out median error
// 0.102 in). The playScene is frozen at tContact (duration = tContact, fill=hold), so the contact pose holds
// while the paired effect fires — causation the audience can see, zero runtime computation.
// ─────────────────────────────────────────────────────────────────────────────
import { fkJointTrajectories, skinnedPointsAt, meshRestBBox, modelToSlide, DEFAULT_CALIBRATION } from './synergy-geometry.mjs';

const DEFAULT_SLIDE_W = 13.333; // T24: default only — every solve honors req.slideW/req.slideH
const DEFAULT_SLIDE_H = 7.5;

// Verb table (M2 subset). effector = the joint that makes contact; mode = which clip frame counts as contact;
// standoffIn = how far the effector STOPS from the target point (point-at gestures at, never touches).
export const VERBS = {
  touch: { effector: 'mixamorig:RightHand', mode: 'reach', standoffIn: 0 },
  'point-at': { effector: 'mixamorig:RightHand', mode: 'reach', standoffIn: 1.0 },
  press: { effector: 'mixamorig:RightHand', mode: 'dwell', standoffIn: 0 },
};

/**
 * Find the CONTACT FRAME of a clip for an effector: the sample where the effector is furthest from the body
 * axis in the required horizontal direction (reach), optionally restricted to low velocity (dwell = a held
 * press reads as pressing; impulse verbs come in M3).
 * dirSign: -1 = effector extends toward model −x (renders slide-LEFT of the presenter; no mirror — calibrated),
 *          +1 = toward model +x (slide-right).
 * → { tMs, world:[x,y,z], reach, speed }
 */
export function contactFrame(glbBuf, animId, effector, dirSign = -1, mode = 'reach', hz = 30) {
  const traj = fkJointTrajectories(glbBuf, animId, hz, [effector, 'mixamorig:Hips']);
  const eff = traj.joints[effector];
  const hips = traj.joints['mixamorig:Hips'];
  if (!eff || !eff.length) throw new Error(`contactFrame: no trajectory for ${effector}`);
  const n = eff.length;
  const dt = 1 / hz;
  // A contact must be a real GESTURE, not the rest pose (the hand already "reaches" at rest — picking frame 0
  // is geometrically fine but expressively dead). Score by reach GAIN over frame 0, take the top of the arc,
  // then within that apex band pick the CALMEST frame (freeze-time jitter × speed = position error).
  const gain = new Array(n);
  const spd = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    gain[i] = ((eff[i][0] - hips[i][0]) - (eff[0][0] - hips[0][0])) * dirSign
      + Math.abs(eff[i][1] - eff[0][1]) * 0.25; // vertical excursion counts a little (raised-arm gestures)
    if (i > 0 && i < n - 1) {
      spd[i] = Math.hypot(eff[i + 1][0] - eff[i - 1][0], eff[i + 1][1] - eff[i - 1][1], eff[i + 1][2] - eff[i - 1][2]) / (2 * dt);
    }
  }
  // STABILITY over PowerPoint's freeze-time slop: PP lands the fill-hold within ~±100ms of the requested
  // duration (measured: a momentarily-slow frame inside a moving arc still froze 0.5in off). The contact frame
  // must therefore be stable across a ±100ms WINDOW — drift = |eff(t+0.1s) − eff(t−0.1s)| in model units.
  const K = Math.max(1, Math.round(0.1 * hz));
  const drift = new Array(n).fill(Infinity);
  for (let i = K; i < n - K; i++) {
    drift[i] = Math.hypot(eff[i + K][0] - eff[i - K][0], eff[i + K][1] - eff[i - K][1], eff[i + K][2] - eff[i - K][2]);
  }
  drift[n - 1] = 0; // clip end: fill-hold makes the final pose perfectly stable (the calibration-probe trick)
  const maxGain = Math.max(...gain);
  let best = gain.indexOf(maxGain);
  if (maxGain > 0.05) {
    const band = mode === 'dwell' ? 0.7 : 0.8; // apex band: dwell searches wider for a held frame
    let calmest = Infinity;
    for (let i = 0; i < n; i++) {
      if (gain[i] >= maxGain * band && drift[i] < calmest) { calmest = drift[i]; best = i; }
    }
  }
  const tMs = Math.round(traj.times[best] * 1000);
  return { tMs, world: eff[best], reach: (eff[best][0] - hips[best][0]) * dirSign,
    speed: Number.isFinite(drift[best]) ? drift[best] / 0.2 : 0, // ±100ms drift expressed as u/s-equivalent
    driftIn: Number.isFinite(drift[best]) ? drift[best] : 0,
    durationMs: traj.durationMs };
}

/**
 * PLATEAU candidates — the ROBUST contact primitive. PowerPoint's am3d player warps playScene time
 * (measured, freeze-sweep 2026-07-13: near-native rate early, compressed to finish within the node duration,
 * then a ~400ms blend BACK TO REST after the node ends — fill=hold does NOT hold scene time). Any knife-edge
 * pose is therefore untimeable. But a pose the clip HOLDS ≥350ms natively stays on-target across the warp:
 * play the FULL clip (duration = clip length → 1:1 rate, calibration-proven) and aim the plateau.
 * → [{ tMs (plateau midpoint), windowMs:[start,end], world (mean pose), driftIn, gain }]
 */
export function candidateFrames(glbBuf, animId, effector, dirSign = -1, hz = 30) {
  const traj = fkJointTrajectories(glbBuf, animId, hz, [effector, 'mixamorig:Hips']);
  const eff = traj.joints[effector];
  const hips = traj.joints['mixamorig:Hips'];
  const n = eff.length;
  const gains = new Array(n);
  let maxGain = 0;
  for (let i = 0; i < n; i++) {
    gains[i] = ((eff[i][0] - hips[i][0]) - (eff[0][0] - hips[0][0])) * dirSign
      + Math.abs(eff[i][1] - eff[0][1]) * 0.5; // vertical excursion is a first-class gesture too
    if (gains[i] > maxGain) maxGain = gains[i];
  }
  // maximal contiguous runs where the effector stays inside a 0.06u ball (a HELD pose)
  const MIN_MS = 350;
  const out = [];
  let s = 0;
  const flush = (a, b) => {
    const ms = (traj.times[b] - traj.times[a]) * 1000;
    if (ms < MIN_MS) return;
    const mid = Math.round((a + b) / 2);
    const gm = Math.max(...gains.slice(a, b + 1));
    if (maxGain > 0.05 && gm < maxGain * 0.35) return; // must still be a real gesture, not just resting
    const mean = [0, 1, 2].map(ax => eff.slice(a, b + 1).reduce((t, p) => t + p[ax], 0) / (b - a + 1));
    out.push({ tMs: Math.round(traj.times[mid] * 1000), windowMs: [Math.round(traj.times[a] * 1000), Math.round(traj.times[b] * 1000)],
      world: mean, driftIn: 0, gain: gm, clipDurationMs: traj.durationMs });
  };
  for (let i = 1; i < n; i++) {
    const d = Math.hypot(eff[i][0] - eff[s][0], eff[i][1] - eff[s][1], eff[i][2] - eff[s][2]);
    if (d > 0.06) { flush(s, i - 1); s = i; }
  }
  flush(s, n - 1);
  // fallback: no plateau (a fully continuous clip) → the clip END (blend-to-rest lands there anyway)
  return out.length ? out : [{ tMs: traj.durationMs, windowMs: [traj.durationMs, traj.durationMs], world: eff[n - 1], driftIn: 0, gain: 0, clipDurationMs: traj.durationMs }];
}

/**
 * INVERSE PLACEMENT: solve the window position so the effector's contact pose lands on the target point.
 * req = {
 *   glbBuf, animId, verb,                       // what plays
 *   markerRest?: [x,y,z],                       // optional EXACT skinned point (e.g. a calibration marker);
 *                                               //   default: the effector joint origin at tContact
 *   targetPoint: {x,y},                         // slide inches (usually a target bbox edge/center)
 *   frame: {w,h}, viewportMargin,               // the window (square, per the director convention)
 *   stageZone?: {x0,x1},                        // optional lateral band the window must stay inside
 *   calib?, rest?                               // calibration + rest bbox (computed if omitted)
 * }
 * → { framePos:{x,y}, contactMs, effectorSlide:{x,y}, residualIn, verdicts:[{code,msg}] }
 */
export function solvePlacement(req) {
  const tolIn = Number.isFinite(req?.tolIn) ? req.tolIn : 0.25;
  const SW = Number(req.slideW) || DEFAULT_SLIDE_W, SH = Number(req.slideH) || DEFAULT_SLIDE_H; // T24
  const verb = VERBS[req.verb];
  if (!verb) throw new Error(`solvePlacement: unknown verb ${req.verb}`);
  const rest = req.rest || meshRestBBox(req.glbBuf);
  const calib = req.calib || DEFAULT_CALIBRATION;
  const m = req.viewportMargin || 1;
  const { w, h } = req.frame;
  // 1. contact pose. dirSign: reach toward the target — decided after a provisional placement at slide center;
  //    for M2 the window is placed BESIDE the target, so the sign is simply which side has room.
  const roomLeft = req.targetPoint.x;                 // space to the left of the target
  const roomRight = SW - req.targetPoint.x;
  // presenter stands on the side with MORE room, reaching back toward the target:
  // presenter right-of-target → hand extends slide-LEFT (model −x, dirSign −1) and vice versa.
  // req.forceSide ('left'|'right') overrides — solveBest searches both sides for occlusion-free placements.
  const presenterRight = req.forceSide ? req.forceSide === 'right' : roomRight >= roomLeft;
  const dirSign = presenterRight ? -1 : +1;
  const c = contactFrame(req.glbBuf, req.animId, verb.effector, dirSign, verb.mode);
  // FREEZE-TIME ROBUSTNESS (measured, M2 gate run 1): the playScene freeze (duration=tContact) lands within
  // ~±1 video frame of tContact, so contact poses chosen at HIGH effector speed smear that jitter into position
  // error (0.5in at 1.8 u/s vs 0.05in at slow frames). Surface the risk so solveBest can prefer calm contacts.
  const freezeRiskIn = c.speed * 0.04 * (req.frame.h / (req.viewportMargin || 1) / (req.rest || meshRestBBox(req.glbBuf)).h);
  // exact skinned contact point (marker or joint) at the frozen time
  const restPoint = req.markerRest || null;
  const world = restPoint
    ? skinnedPointsAt(req.glbBuf, req.animId, c.tMs / 1000, [{ bone: verb.effector, rest: restPoint }])[0].world
    : c.world;
  // 2. standoff: stop short of the target along the reach direction (point-at gestures, never touches)
  const target = { x: req.targetPoint.x + verb.standoffIn * (presenterRight ? 1 : -1), y: req.targetPoint.y };
  // 3. inverse placement (modelToSlide algebra, solved for frame x,y)
  const s = h / m / rest.h * (calib.kS || 1);
  const mirror = calib.mirrorX ? -1 : 1;
  const fx = target.x - w / 2 - (calib.kX || 0) - (world[0] - rest.center[0]) * mirror * s;
  const fy = target.y - h / 2 - (calib.kY || 0) + (world[1] - rest.center[1]) * s;
  // 4. clamp on-slide (+ stage zone), then report the residual the clamp introduced
  const verdicts = [];
  let cx = Math.max(0.1, Math.min(SW - w - 0.1, fx));
  let cy = Math.max(0.1, Math.min(SH - h - 0.1, fy));
  if (req.stageZone) {
    cx = Math.max(req.stageZone.x0, Math.min((req.stageZone.x1 ?? SW) - w, cx));
  }
  if (Math.abs(cx - fx) > 0.005 || Math.abs(cy - fy) > 0.005) {
    verdicts.push({ code: 'FRAME_CLAMPED', msg: `window moved ${(Math.hypot(cx - fx, cy - fy)).toFixed(2)}in to stay on-slide/in-zone` });
  }
  const eff = modelToSlide(world, { frameBbox: { x: cx, y: cy, w, h }, viewportMargin: m, calib, rest });
  const residualIn = Math.hypot(eff.x - target.x, eff.y - target.y);
  if (residualIn > tolIn) verdicts.push({ code: 'UNREACHABLE', msg: `contact misses target by ${residualIn.toFixed(2)}in after clamping (tolIn ${tolIn})` });
  // OCCLUDES_CONTENT: the presenter's BODY (projected rest bbox, centered in the window) covering the target
  // reads as standing ON the content (M2 gate slide 3 showed it). Report the overlap fraction of the target.
  let occlusionFrac = 0;
  if (req.targetBbox) {
    const s2 = h / m / rest.h * (calib.kS || 1);
    const body = { x: cx + w / 2 + (calib.kX || 0) - rest.w / 2 * s2, w: rest.w * s2,
      y: cy + h / 2 + (calib.kY || 0) - rest.h / 2 * s2, h: rest.h * s2 };
    const t = req.targetBbox;
    const ox = Math.max(0, Math.min(body.x + body.w, t.x + t.w) - Math.max(body.x, t.x));
    const oy = Math.max(0, Math.min(body.y + body.h, t.y + t.h) - Math.max(body.y, t.y));
    occlusionFrac = (ox * oy) / Math.max(1e-6, t.w * t.h);
    if (occlusionFrac > 0.35) verdicts.push({ code: 'OCCLUDES_CONTENT', msg: `body covers ${(occlusionFrac * 100).toFixed(0)}% of the target` });
  }
  return { framePos: { x: +cx.toFixed(3), y: +cy.toFixed(3) }, contactMs: c.tMs, clipDurationMs: c.durationMs,
    effectorSlide: { x: +eff.x.toFixed(3), y: +eff.y.toFixed(3) }, residualIn: +residualIn.toFixed(3),
    freezeRiskIn: +freezeRiskIn.toFixed(3), occlusionFrac: +occlusionFrac.toFixed(3), dirSign, presenterRight, verdicts };
}

/**
 * Candidate-lattice search (design §3.3 step 2): when a single (clip, window) can't reach — a reach pose sits
 * HIGH in the window, so low targets push the window off-slide — try clip × window-height combos and return
 * the best solution (adds { animId, frame } to the solvePlacement result). Deterministic: first candidate
 * within tolIn wins; otherwise the global minimum residual with an UNREACHABLE verdict retained.
 */
// Candidate lattice = the CALIBRATED envelope only: window h 3.5-6.5in AND margin 1-2 (projection validated at
// h 3/5/6.5 × m 1/1.3/2; smaller raw windows hit PP's auto-fit floor and render the model larger than the law
// predicts — measured +0.5in effector error). margin>1 shrinks the BODY inside a calibrated window (body height
// = h/m), which is how low/tight targets get reached without leaving the envelope.
export function solveBest(req, { clips, heights = [6.5, 5.6, 5.0, 4.2, 3.5], margins = [1, 1.4, 1.8, 2.0], tolIn = 0.15, maxContactMs = 2500 } = {}) {
  const SW = Number(req.slideW) || DEFAULT_SLIDE_W, SH = Number(req.slideH) || DEFAULT_SLIDE_H; // T24
  const rest = req.rest || meshRestBBox(req.glbBuf);
  const calib = req.calib || DEFAULT_CALIBRATION;
  let best = null;
  const score = (r) => r.residualIn + r.occlusionFrac * 1.5 // reach the target + stay OFF the content
    + (r.frame.h / r.viewportMargin < 2.2 ? 0.3 : 0); // a <2.2in body reads too small on stage — soft penalty
  for (const side of ['left', 'right']) {
    const presenterRight = side === 'right';
    const dirSign = presenterRight ? -1 : +1;
    for (const animId of clips) {
      const verb = VERBS[req.verb];
      // the contact must occur while the slide is on screen (narrated dwell ~4-8s; default budget 2.5s)
      const cands = candidateFrames(req.glbBuf, animId, verb.effector, dirSign).filter(c => c.tMs <= maxContactMs);
      if (!cands.length) continue;
      for (const h of heights) {
        for (const m of margins) {
          for (const cand of cands) {
            const r = solveFrame({ ...req, rest, calib, viewportMargin: m, frame: { w: h, h } },
              verb, presenterRight, cand, tolIn);
            const scored = { ...r, animId, frame: { w: h, h }, viewportMargin: m };
            if (!best || score(scored) < score(best)) best = scored;
          }
        }
      }
    }
  }
  // EXACT-CORRECT the winner: candidates use the joint origin; the physical contact point (marker/fingertip)
  // is offset and rotates with the bone. Recompute it via the skinning math and shift the window by the delta —
  // the projection is affine, so one shift lands it exactly.
  if (best && req.markerRest) {
    const exact = skinnedPointsAt(req.glbBuf, best.animId, best.contactMs / 1000,
      [{ bone: VERBS[req.verb].effector, rest: req.markerRest }])[0].world;
    const s = best.frame.h / best.viewportMargin / rest.h * (calib.kS || 1);
    const mirror = calib.mirrorX ? -1 : 1;
    const exX = best.framePos.x + best.frame.w / 2 + (calib.kX || 0) + (exact[0] - rest.center[0]) * mirror * s;
    const exY = best.framePos.y + best.frame.h / 2 + (calib.kY || 0) - (exact[1] - rest.center[1]) * s;
    const tx = best.effectorSlide.x; // effectorSlide == the solved contact point (residual ~0 candidates)
    const ty = best.effectorSlide.y;
    let nx = best.framePos.x + (tx - exX);
    let ny = best.framePos.y + (ty - exY);
    // the shift must respect the slide bounds — clamp and surface any loss honestly
    const cnx = Math.max(0.1, Math.min(SW - best.frame.w - 0.1, nx));
    const cny = Math.max(0.1, Math.min(SH - best.frame.h - 0.1, ny));
    const lost = Math.hypot(cnx - nx, cny - ny);
    if (lost > 0.005) {
      best.residualIn = +(best.residualIn + lost).toFixed(3);
      best.verdicts.push({ code: 'FRAME_CLAMPED', msg: `exact-correction clamped by ${lost.toFixed(2)}in` });
    }
    best.framePos = { x: +cnx.toFixed(3), y: +cny.toFixed(3) };
  }
  return best;
}

/**
 * EMPIRICAL solve — the production path. PowerPoint's am3d player warps playScene time in ways that vary per
 * clip (measured: start latency, mid-clip compression, post-node blend-to-rest). Modeling it failed; MEASURING
 * it works: a one-time probe renders each clip and records the effector's slide position per VIDEO millisecond
 * (research-demos/2026-07-13-synergy-calibration/joe-clip-timelines.json). This solver inverse-projects those
 * timelines to model space, finds plateaus in RENDERED time (which absorb every player quirk), and solves
 * placement against them. Effect delay = real video time. The manifest is per (clip library, PP build) — the
 * same artifact class as clipMap/contacts, produced at bake time.
 * manifest = { probe: {x,y,w,h,m}, timelines: { animId: [[videoMs, xIn, yIn], ...] } }
 */
export function solveBestEmpirical(req, manifest, { clips, heights = [6.5, 5.6, 5.0, 4.2, 3.5], margins = [1, 1.4, 1.8, 2.0], tolIn = 0.15, maxContactMs = 4000, minHoldMs = 300 } = {}) {
  const SW = Number(req.slideW) || DEFAULT_SLIDE_W, SH = Number(req.slideH) || DEFAULT_SLIDE_H; // T24
  const rest = req.rest || meshRestBBox(req.glbBuf);
  const calib = req.calib || DEFAULT_CALIBRATION;
  const p = manifest.probe;
  const sProbe = p.h / (p.m || 1) / rest.h * (calib.kS || 1);
  const mirror = calib.mirrorX ? -1 : 1;
  // slide-pos (probe window) → model space (affine inverse of modelToSlide; z untracked, kPz=0 measured)
  const toModel = ([, x, y]) => [
    (x - (p.x + p.w / 2) - (calib.kX || 0)) / (sProbe * mirror) + rest.center[0],
    -(y - (p.y + p.h / 2) - (calib.kY || 0)) / sProbe + rest.center[1],
    rest.center[2]];
  let best = null;
  const score = (r) => r.residualIn + r.occlusionFrac * 1.5 + (r.frame.h / r.viewportMargin < 2.2 ? 0.3 : 0);
  for (const animId of (clips || Object.keys(manifest.timelines).map(Number))) {
    const tl = manifest.timelines[String(animId)];
    if (!tl || tl.length < 5) continue;
    // plateaus in RENDERED video time: maximal runs where the rendered effector stays inside 0.12in
    const cands = [];
    let s0 = 0;
    const flush = (a, b) => {
      const ms = tl[b][0] - tl[a][0];
      if (ms < minHoldMs) return;
      const mid = Math.round((a + b) / 2);
      if (tl[mid][0] > maxContactMs) return; // must happen while the slide is on screen
      const mean = tl.slice(a, b + 1).reduce((t, r) => [t[0] + r[1], t[1] + r[2]], [0, 0]).map(v => v / (b - a + 1));
      cands.push({ tMs: tl[mid][0], windowMs: [tl[a][0], tl[b][0]], world: toModel([0, mean[0], mean[1]]), driftIn: 0, gain: 1, clipDurationMs: Math.min(4500, req.clipDurations?.[animId] ?? 4500) });
    };
    for (let i = 1; i < tl.length; i++) {
      if (Math.hypot(tl[i][1] - tl[s0][1], tl[i][2] - tl[s0][2]) > 0.12) { flush(s0, i - 1); s0 = i; }
    }
    flush(s0, tl.length - 1);
    for (const side of ['left', 'right']) {
      const presenterRight = side === 'right';
      for (const cand of cands) {
        for (const h of heights) {
          for (const m of margins) {
            const r = solveFrame({ ...req, rest, calib, viewportMargin: m, frame: { w: h, h } }, VERBS[req.verb], presenterRight, cand, tolIn);
            const scored = { ...r, animId, frame: { w: h, h }, viewportMargin: m, empirical: true };
            if (!best || score(scored) < score(best)) best = scored;
          }
        }
      }
    }
  }
  return best;
}

// One (clip-frame, window) placement: the inverse-placement algebra for a specific candidate pose.
function solveFrame(req, verb, presenterRight, cand, tolIn = 0.25) {
  const SW = Number(req.slideW) || DEFAULT_SLIDE_W, SH = Number(req.slideH) || DEFAULT_SLIDE_H; // T24
  const { rest, calib } = req;
  const m = req.viewportMargin || 1;
  const { w, h } = req.frame;
  // Contact point: when a targetBbox is given, aim for the EDGE FACING the presenter (a hand reaching from the
  // left touches the left edge), standoff outward (between presenter and target). Else use targetPoint as-is.
  const target = req.targetBbox
    ? { x: presenterRight ? req.targetBbox.x + req.targetBbox.w + verb.standoffIn
                          : req.targetBbox.x - verb.standoffIn,
        y: req.targetBbox.y + req.targetBbox.h / 2 }
    : { x: req.targetPoint.x + verb.standoffIn * (presenterRight ? 1 : -1), y: req.targetPoint.y };
  const s = h / m / rest.h * (calib.kS || 1);
  const mirror = calib.mirrorX ? -1 : 1;
  const fx = target.x - w / 2 - (calib.kX || 0) - (cand.world[0] - rest.center[0]) * mirror * s;
  const fy = target.y - h / 2 - (calib.kY || 0) + (cand.world[1] - rest.center[1]) * s;
  const verdicts = [];
  let cx = Math.max(0.1, Math.min(SW - w - 0.1, fx));
  let cy = Math.max(0.1, Math.min(SH - h - 0.1, fy));
  if (req.stageZone) cx = Math.max(req.stageZone.x0, Math.min((req.stageZone.x1 ?? SW) - w, cx));
  if (Math.abs(cx - fx) > 0.005 || Math.abs(cy - fy) > 0.005) {
    verdicts.push({ code: 'FRAME_CLAMPED', msg: `window moved ${(Math.hypot(cx - fx, cy - fy)).toFixed(2)}in to stay on-slide/in-zone` });
  }
  const eff = modelToSlide(cand.world, { frameBbox: { x: cx, y: cy, w, h }, viewportMargin: m, calib, rest });
  const residualIn = Math.hypot(eff.x - target.x, eff.y - target.y);
  if (residualIn > tolIn) verdicts.push({ code: 'UNREACHABLE', msg: `contact misses target by ${residualIn.toFixed(2)}in after clamping (tolIn ${tolIn})` });
  let occlusionFrac = 0;
  if (req.targetBbox) {
    // VISUAL body, not the T-pose bbox: the rest bbox is arms-out square (1.15x1.15u), but the standing body
    // the audience sees is ~0.4 of that width — using the T-bbox made every near-target placement "occlude".
    const bw = rest.h * s * 0.4;
    const body = { x: cx + w / 2 + (calib.kX || 0) - bw / 2, w: bw,
      y: cy + h / 2 + (calib.kY || 0) - rest.h / 2 * s, h: rest.h * s };
    const t = req.targetBbox;
    const ox = Math.max(0, Math.min(body.x + body.w, t.x + t.w) - Math.max(body.x, t.x));
    const oy = Math.max(0, Math.min(body.y + body.h, t.y + t.h) - Math.max(body.y, t.y));
    occlusionFrac = (ox * oy) / Math.max(1e-6, t.w * t.h);
    if (occlusionFrac > 0.35) verdicts.push({ code: 'OCCLUDES_CONTENT', msg: `body covers ${(occlusionFrac * 100).toFixed(0)}% of the target` });
  }
  return { framePos: { x: +cx.toFixed(3), y: +cy.toFixed(3) }, contactMs: cand.tMs,
    contactWindowMs: cand.windowMs, clipDurationMs: cand.clipDurationMs,
    effectorSlide: { x: +eff.x.toFixed(3), y: +eff.y.toFixed(3) }, residualIn: +residualIn.toFixed(3),
    freezeRiskIn: +cand.driftIn.toFixed(3), occlusionFrac: +occlusionFrac.toFixed(3),
    dirSign: presenterRight ? -1 : 1, presenterRight, verdicts };
}