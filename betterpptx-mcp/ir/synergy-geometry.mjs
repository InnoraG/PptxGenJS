// ir/synergy-geometry.mjs — Synergy Engine S0: the Geometry Kernel.
// ─────────────────────────────────────────────────────────────────────────────
// Everything the interaction director needs to know about WHERE things are — computed, never guessed:
//   • fkJointTrajectories: forward kinematics over a GLB clip → per-joint world paths (model units).
//   • meshRestBBox / restHeight: the model's bind-pose bounds (the scale + anchor basis PP uses).
//   • modelToSlide: model units → slide inches, per the MEASURED am3d rendering law.
//   • projectedEffectorOffset: where a joint lands relative to the frame — the inverse-placement primitive.
//   • clipEnvelope: per-clip world bounds over time → exact viewportMargin instead of the flat 2.2.
//
// THE MEASURED LAW (COM probes, research-demos/2026-07-13-synergy-calibration, PP 365 16.0.x):
//   L1  The live render is UNIFORM (isotropic). The graphicFrame is only a clipping WINDOW — it NEVER
//       stretches the model. (Per-axis-fill was disproven: unclipped T-pose arm span is constant across
//       frame widths; apparent fill in narrow frames was arm CLIPPING.)
//   L2  viewportSz sets the zoom: with viewportSz = frameH_in × 1454545 the rest-pose mesh height renders
//       exactly frameH_in on the slide (the historical 1600000 constant overshot by the measured 1.10).
//       Larger viewportSz = more zoomed IN. Dividing viewportSz by m scales the rendered model by 1/m.
//   L3  Anchor: the mesh rest-bbox CENTER maps to the frame center (both axes; bottom-gap measurements
//       confirmed vertical centering, cx-off ≈ 0 confirmed horizontal).
//   L4  camera rotateY=180 (face-audience default) mirrors model X on the slide (x → −x); depth (Z) has no
//       measurable first-order effect at presenter scale (perspective term pending marker probe — see
//       fitCalibration; kPz defaults 0).
//   L5  The POSTER raster IS stretched to the frame in static contexts (exports/first paint) — so windows
//       must match the poster's aspect (square). That fix lives in the director (square placement()).
// ─────────────────────────────────────────────────────────────────────────────
import { parseGlb } from './kinetic-transplant.mjs';

// Rest-fit constant of L2: viewportSz per inch of frame height at which restHeight fills the frame exactly.
export const REST_FIT_VIEWPORT_PER_INCH = 1454545;

// ── accessor decode (mirrors kinetic-transplant's reader; kept local: different stride/type support) ────────
const COMP_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function readAccessor(json, bin, ai) {
  const a = json.accessors[ai];
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const n = TYPE_COUNT[a.type] || 1;
  const cb = COMP_BYTES[a.componentType] || 4;
  const stride = bv.byteStride || n * cb;
  const out = new Array(a.count);
  for (let i = 0; i < a.count; i++) {
    const row = new Array(n);
    for (let j = 0; j < n; j++) {
      const o = base + i * stride + j * cb;
      row[j] = a.componentType === 5126 ? bin.readFloatLE(o)
        : a.componentType === 5123 ? bin.readUInt16LE(o)
        : a.componentType === 5125 ? bin.readUInt32LE(o)
        : bin.readUInt8(o);
    }
    out[i] = n === 1 ? row[0] : row;
  }
  return out;
}

// ── quaternion / matrix helpers ──────────────────────────────────────────────
function quatToMat3(q) {
  const [x, y, z, w] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}
// 4x4 row-major TRS compose + multiply (only what FK needs)
function trs(t, q, s) {
  const m = quatToMat3(q);
  return [
    m[0] * s[0], m[1] * s[1], m[2] * s[2], t[0],
    m[3] * s[0], m[4] * s[1], m[5] * s[2], t[1],
    m[6] * s[0], m[7] * s[1], m[8] * s[2], t[2],
    0, 0, 0, 1,
  ];
}
function mat4Mul(a, b) {
  const r = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    r[i * 4 + j] = a[i * 4] * b[j] + a[i * 4 + 1] * b[4 + j] + a[i * 4 + 2] * b[8 + j] + a[i * 4 + 3] * b[12 + j];
  }
  return r;
}
function slerp(q0, q1, f) {
  let d = q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3];
  let b = q1;
  if (d < 0) { d = -d; b = [-q1[0], -q1[1], -q1[2], -q1[3]]; }
  if (d > 0.9995) { // lerp + normalize
    const o = q0.map((v, i) => v + (b[i] - v) * f);
    const n = Math.hypot(...o);
    return o.map(v => v / n);
  }
  const th = Math.acos(d);
  const s0 = Math.sin((1 - f) * th) / Math.sin(th);
  const s1 = Math.sin(f * th) / Math.sin(th);
  return q0.map((v, i) => v * s0 + b[i] * s1);
}

// ── rest-pose structure ──────────────────────────────────────────────────────
function nodeLocals(json) {
  return (json.nodes || []).map(n => ({
    t: n.translation ? n.translation.slice() : [0, 0, 0],
    r: n.rotation ? n.rotation.slice() : [0, 0, 0, 1],
    s: n.scale ? n.scale.slice() : [1, 1, 1],
    matrix: n.matrix || null,
  }));
}
function parentMap(json) {
  const parent = new Array((json.nodes || []).length).fill(-1);
  (json.nodes || []).forEach((n, i) => (n.children || []).forEach(c => { parent[c] = i; }));
  return parent;
}
function worldMatrices(json, locals, overrides = null) {
  const n = locals.length;
  const parent = parentMap(json);
  const world = new Array(n);
  const order = [];
  const visit = (i) => { if (parent[i] >= 0 && world[parent[i]] === undefined) visit(parent[i]);
    if (world[i] === undefined) { world[i] = null; order.push(i); } };
  for (let i = 0; i < n; i++) visit(i);
  for (const i of order) {
    const o = overrides && overrides[i];
    const l = locals[i];
    const local = l.matrix && !o
      ? [l.matrix[0], l.matrix[4], l.matrix[8], l.matrix[12],
         l.matrix[1], l.matrix[5], l.matrix[9], l.matrix[13],
         l.matrix[2], l.matrix[6], l.matrix[10], l.matrix[14],
         l.matrix[3], l.matrix[7], l.matrix[11], l.matrix[15]] // glTF column-major → row-major
      : trs(o?.t || l.t, o?.r || l.r, o?.s || l.s);
    world[i] = parent[i] >= 0 ? mat4Mul(world[parent[i]], local) : local;
  }
  return world;
}

/** Bind-pose world bbox of all mesh POSITION accessors (the basis of PP's scale + anchor — law L2/L3). */
export function meshRestBBox(glbBuf) {
  const { json } = parseGlb(glbBuf);
  const locals = nodeLocals(json);
  const world = worldMatrices(json, locals);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  (json.nodes || []).forEach((n, ni) => {
    if (n.mesh == null) return;
    const w = world[ni];
    for (const prim of json.meshes[n.mesh].primitives || []) {
      const acc = json.accessors[prim.attributes && prim.attributes.POSITION];
      if (!acc || !acc.min || !acc.max) continue;
      for (const cx of [acc.min[0], acc.max[0]]) for (const cy of [acc.min[1], acc.max[1]]) for (const cz of [acc.min[2], acc.max[2]]) {
        const px = w[0] * cx + w[1] * cy + w[2] * cz + w[3];
        const py = w[4] * cx + w[5] * cy + w[6] * cz + w[7];
        const pz = w[8] * cx + w[9] * cy + w[10] * cz + w[11];
        if (px < lo[0]) lo[0] = px; if (px > hi[0]) hi[0] = px;
        if (py < lo[1]) lo[1] = py; if (py > hi[1]) hi[1] = py;
        if (pz < lo[2]) lo[2] = pz; if (pz > hi[2]) hi[2] = pz;
      }
    }
  });
  const meshH = hi[1] - lo[1];
  // SKIN-AWARE FALLBACK: some Mixamo re-exports store the skinned mesh's POSITION accessors in a
  // space that does NOT match the skeleton (mesh node carries a tiny scale, skin joints carry the
  // real scale). The mesh RENDERS correctly (skinning uses the joints) but the raw accessor×node
  // bbox is degenerate. When that happens, fall back to the SKELETON rest bbox (skin joint world
  // positions), which is always in the true render frame. A well-formed GLB (e.g. Joe) has a sane
  // mesh bbox and never triggers this — so existing actors are byte-identical.
  const sk = skeletonRestBBox(json, world);
  if (sk && (meshH < 0.05 || (sk.h > 0 && meshH < 0.2 * sk.h))) return sk;
  return { lo, hi, w: hi[0] - lo[0], h: meshH, d: hi[2] - lo[2],
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2] };
}

// Rest (bind-pose) bbox from the skin's JOINT world positions — the true render frame, robust to
// skinned meshes whose POSITION accessors live in a mismatched space. Returns null when there is no skin.
function skeletonRestBBox(json, world) {
  const joints = (json.skins && json.skins[0] && json.skins[0].joints) || null;
  const idxs = joints && joints.length ? joints : (json.nodes || []).map((n, i) => (/^mixamorig:/.test(n.name || '') ? i : -1)).filter(i => i >= 0);
  if (!idxs.length) return null;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const i of idxs) {
    const w = world[i]; if (!w) continue;
    const p = [w[3], w[7], w[11]]; // translation (this module's row-major convention)
    for (let k = 0; k < 3; k++) { if (p[k] < lo[k]) lo[k] = p[k]; if (p[k] > hi[k]) hi[k] = p[k]; }
  }
  if (!Number.isFinite(lo[1]) || !Number.isFinite(hi[1])) return null;
  return { lo, hi, w: hi[0] - lo[0], h: hi[1] - lo[1], d: hi[2] - lo[2],
    center: [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2], fromSkeleton: true };
}

/**
 * Forward kinematics: sample a clip's per-joint WORLD positions (model units).
 * → { animId, name, durationMs, times:[s...], joints: { boneName: [[x,y,z]...] } }
 * joints defaults to the effector set the solver cares about; pass null for ALL named nodes.
 */
export function fkJointTrajectories(glbBuf, animId, hz = 30, joints = DEFAULT_EFFECTORS) {
  const { json, bin } = parseGlb(glbBuf);
  const anim = (json.animations || [])[animId];
  if (!anim) throw new Error(`fk: no animation ${animId}`);
  const locals = nodeLocals(json);
  // decode channels once
  const chans = anim.channels.map(ch => {
    const s = anim.samplers[ch.sampler];
    return { node: ch.target.node, path: ch.target.path,
      times: readAccessor(json, bin, s.input), vals: readAccessor(json, bin, s.output) };
  });
  let dur = 0;
  for (const c of chans) if (c.times.length) dur = Math.max(dur, c.times[c.times.length - 1]);
  const nameOf = i => (json.nodes[i] && json.nodes[i].name) || `n${i}`;
  const want = joints ? new Set(joints) : null;
  const jointIdx = [];
  (json.nodes || []).forEach((n, i) => { if (!want || want.has(n.name)) jointIdx.push(i); });
  const nSamples = Math.max(2, Math.round(dur * hz) + 1);
  const times = Array.from({ length: nSamples }, (_, k) => Math.min(dur, k / hz));
  const out = {};
  for (const i of jointIdx) out[nameOf(i)] = [];
  const sample = (c, t) => {
    const ts = c.times;
    if (t <= ts[0]) return c.vals[0];
    if (t >= ts[ts.length - 1]) return c.vals[ts.length - 1];
    let j = 1; while (ts[j] < t) j++;
    const f = (t - ts[j - 1]) / (ts[j] - ts[j - 1]);
    const a = c.vals[j - 1], b = c.vals[j];
    if (c.path === 'rotation') return slerp(a, b, f);
    return a.map((v, k) => v + (b[k] - v) * f);
  };
  for (const t of times) {
    const overrides = {};
    for (const c of chans) {
      const v = sample(c, t);
      const o = overrides[c.node] || (overrides[c.node] = {});
      if (c.path === 'translation') o.t = v; else if (c.path === 'rotation') o.r = v; else if (c.path === 'scale') o.s = v;
    }
    const world = worldMatrices(json, locals, overrides);
    for (const i of jointIdx) {
      const w = world[i];
      out[nameOf(i)].push([w[3], w[7], w[11]]);
    }
  }
  return { animId, name: anim.name || `anim${animId}`, durationMs: Math.round(dur * 1000), times, joints: out };
}
export const DEFAULT_EFFECTORS = ['mixamorig:Hips', 'mixamorig:Head', 'mixamorig:RightHand',
  'mixamorig:LeftHand', 'mixamorig:RightFoot', 'mixamorig:LeftFoot'];

/**
 * EXACT skinned-point positions at a clip time: p_world(t) = G_j(t) · IBM_j · p_rest.
 * This is what a weight-1-skinned vertex (e.g. a calibration marker) actually does — the joint's inverse
 * bind matrix must be applied, so an off-joint rest point ORBITS the bone correctly as it rotates.
 * points = [{ bone:'mixamorig:RightHand', rest:[x,y,z] }, ...]; tSec clamped to the clip length.
 * → [{ bone, world:[x,y,z] }]
 */
export function skinnedPointsAt(glbBuf, animId, tSec, points) {
  const { json, bin } = parseGlb(glbBuf);
  const anim = (json.animations || [])[animId];
  if (!anim) throw new Error(`skinnedPointsAt: no animation ${animId}`);
  const skin = (json.skins || [])[0];
  if (!skin) throw new Error('skinnedPointsAt: no skin');
  const ibmFlat = readAccessor(json, bin, skin.inverseBindMatrices); // MAT4 column-major, per joint
  const locals = nodeLocals(json);
  const chans = anim.channels.map(ch => {
    const s = anim.samplers[ch.sampler];
    return { node: ch.target.node, path: ch.target.path,
      times: readAccessor(json, bin, s.input), vals: readAccessor(json, bin, s.output) };
  });
  let dur = 0;
  for (const c of chans) if (c.times.length) dur = Math.max(dur, c.times[c.times.length - 1]);
  const t = Math.max(0, Math.min(dur, tSec));
  const overrides = {};
  const sample = (c) => {
    const ts = c.times;
    if (t <= ts[0]) return c.vals[0];
    if (t >= ts[ts.length - 1]) return c.vals[ts.length - 1];
    let j = 1; while (ts[j] < t) j++;
    const f = (t - ts[j - 1]) / (ts[j] - ts[j - 1]);
    const a = c.vals[j - 1], b = c.vals[j];
    return c.path === 'rotation' ? slerp(a, b, f) : a.map((v, k) => v + (b[k] - v) * f);
  };
  for (const c of chans) {
    const v = sample(c);
    const o = overrides[c.node] || (overrides[c.node] = {});
    if (c.path === 'translation') o.t = v; else if (c.path === 'rotation') o.r = v; else if (c.path === 'scale') o.s = v;
  }
  const world = worldMatrices(json, locals, overrides);
  const nodeByName = {};
  (json.nodes || []).forEach((n, i) => { if (n.name && nodeByName[n.name] === undefined) nodeByName[n.name] = i; });
  return points.map(pt => {
    const ni = nodeByName[pt.bone];
    const slot = ni === undefined ? -1 : skin.joints.indexOf(ni);
    if (slot < 0) return { bone: pt.bone, world: null };
    const G = world[ni]; // row-major 4x4 (our layout)
    const M = ibmFlat[slot]; // glTF column-major 16 floats
    // q = IBM · p (column-major mat application)
    const [x, y, z] = pt.rest;
    const q = [
      M[0] * x + M[4] * y + M[8] * z + M[12],
      M[1] * x + M[5] * y + M[9] * z + M[13],
      M[2] * x + M[6] * y + M[10] * z + M[14],
    ];
    // w = G · q (row-major application)
    return { bone: pt.bone, world: [
      G[0] * q[0] + G[1] * q[1] + G[2] * q[2] + G[3],
      G[4] * q[0] + G[5] * q[1] + G[6] * q[2] + G[7],
      G[8] * q[0] + G[9] * q[1] + G[10] * q[2] + G[11],
    ] };
  });
}

/**
 * The measured am3d projection (laws L1–L4): model point → slide inches.
 * ctx = { frameBbox:{x,y,w,h} in, viewportMargin (m), faceRotationY, rest: meshRestBBox(glb), calib? }
 *
 * CALIBRATED 2026-07-13 (marker probe 3, 16/16 skinned markers, 4 conditions, PP365 16.0.x):
 * held-out median error 0.102 in (max 0.193) — see research-demos/2026-07-13-synergy-calibration/calibration.json.
 *   • rotY180 does NOT mirror X (the camera yaw preserves handedness on the slide: model −x renders slide-left).
 *     The first draft assumed a mirror — the probe caught the hands swapped.
 *   • kPz = 0: no measurable perspective at presenter depth — the projection is affine (orthographic-like).
 *   • kX/kY: small constant anchor bias (PP centers on the skinned bind bounds, not exactly our accessor bbox).
 */
export const DEFAULT_CALIBRATION = Object.freeze({ kS: 1, kX: -0.097, kY: 0.069, kPz: 0, mirrorX: false });
export function modelToSlide(p, ctx) {
  const { frameBbox: f, rest } = ctx;
  const m = ctx.viewportMargin || 1;
  const calib = ctx.calib || DEFAULT_CALIBRATION;
  const s = (f.h / m / rest.h) * (calib.kS || 1); // inches per model unit — UNIFORM (L1+L2)
  const mirror = calib.mirrorX ? -1 : 1; // measured false at faceRotationY 180; non-180 yaws UNMEASURED
  const dx = (p[0] - rest.center[0]) * mirror;
  const dy = p[1] - rest.center[1];
  const dz = p[2] - rest.center[2];
  const persp = calib.kPz ? 1 + calib.kPz * dz : 1;
  return {
    x: f.x + f.w / 2 + (calib.kX || 0) + dx * s * persp,
    y: f.y + f.h / 2 + (calib.kY || 0) - dy * s * persp, // slide Y grows down; model Y grows up (L3 center anchor)
    inchesPerUnit: s,
  };
}

/** Where a joint lands RELATIVE to the frame origin — the inverse-placement primitive:
 *  framePos = target − offset (solver S1). */
export function projectedEffectorOffset(jointPos, ctx) {
  const at = modelToSlide(jointPos, { ...ctx, frameBbox: { x: 0, y: 0, w: ctx.frameBbox.w, h: ctx.frameBbox.h } });
  return { dx: at.x, dy: at.y };
}

/** Per-clip world envelope → the EXACT viewport margin (and lateral window need) for that clip,
 *  replacing the flat 2.2 default: margin = envelopeH / restH (≥1), lateralIn = envelopeW × inchesPerUnit. */
export function clipEnvelope(glbBuf, animId, hz = 15) {
  const rest = meshRestBBox(glbBuf);
  const traj = fkJointTrajectories(glbBuf, animId, hz, null); // all joints
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const arr of Object.values(traj.joints)) for (const p of arr) {
    for (let a = 0; a < 3; a++) { if (p[a] < lo[a]) lo[a] = p[a]; if (p[a] > hi[a]) hi[a] = p[a]; }
  }
  // joints are skeleton points; pad by the flesh radius (~half the rest depth) so the mesh fits too
  const pad = rest.d / 2;
  const envH = (hi[1] - lo[1]) + pad;
  const envW = (hi[0] - lo[0]) + pad * 2;
  return { rest, envW, envH,
    margin: Math.max(1, envH / rest.h),
    lateralFrac: envW / rest.w, // how much wider than rest the window must be
    durationMs: traj.durationMs };
}

/** Slide object registry (S0.4): bboxes + salience for solver targeting. Mirrors pickPairTarget's order. */
const SALIENCE = ['chart', 'metric', 'kpi', 'image', 'diagram', 'table', 'textbox', 'body', 'quote'];
export function buildObjectRegistry(slideSpec) {
  const out = [];
  for (const c of (slideSpec && slideSpec.content) || []) {
    if (!c || typeof c !== 'object' || !c.bbox) continue;
    const kind = String(c.kind || '').toLowerCase();
    out.push({ name: c.objectName || c.name || kind, kind, bbox: c.bbox,
      salience: SALIENCE.indexOf(kind) >= 0 ? SALIENCE.length - SALIENCE.indexOf(kind) : 0,
      authorAnimated: !!c.animation });
  }
  return out.sort((a, b) => b.salience - a.salience);
}
