// ir/synergy-markers.mjs
// ─────────────────────────────────────────────────────────────────────────────
// Synergy Engine calibration markers — inject small, brightly-colored, SKINNED
// tetrahedra at chosen joints of a rigged GLB so that, when PowerPoint plays a
// clip, each marker rides its bone. The calibration harness renders the deck,
// color-keys the markers per frame, and solves the model→slide projection
// (docs/SYNERGY-ENGINE-DESIGN.md §2.3).
//
// How a marker stays glued to its bone: a skinned vertex v (mesh space) lands at
//   Σᵢ wᵢ · Gᵢ · IBMᵢ · v
// With a single weight-1 joint j the marker follows bone j for ALL poses.
// We choose v = the bone's REST WORLD POSITION (translation column of its rest
// world matrix): for a correctly-built skin, Gⱼ·IBMⱼ = identity at rest, so the
// marker renders exactly ON the joint at rest and rides it during clips.
//
// Buffer discipline mirrors kinetic-transplant.mjs (the reference): append-only
// bin growth, 4-byte-align every new accessor's data, never emit a zero-length
// bufferView (PP freezes all animation on invalid glTF), delete buffers[0].uri,
// refresh buffers[0].byteLength. No new nodes: marker primitives are appended to
// the FIRST skinned mesh, so they inherit that mesh node's skin binding.
// ─────────────────────────────────────────────────────────────────────────────

import { parseGlb, serializeGlb } from './kinetic-transplant.mjs';

// componentType → bytes-per-component (subset used for validation)
const COMP_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

const TARGET_ARRAY_BUFFER = 34962; // vertex attributes
const TARGET_ELEMENT_ARRAY = 34963; // indices

/** Default calibration set — six well-separated joints, six well-separated hues. */
export const DEFAULT_MARKERS = [
  { bone: 'mixamorig:Head', color: [1, 0, 0] },
  { bone: 'mixamorig:Hips', color: [0, 1, 0] },
  { bone: 'mixamorig:RightHand', color: [0, 0.35, 1] },
  { bone: 'mixamorig:LeftHand', color: [1, 0.9, 0] },
  { bone: 'mixamorig:RightFoot', color: [1, 0, 1] },
  { bone: 'mixamorig:LeftFoot', color: [0, 1, 1] },
];

// ── Column-major mat4 helpers (glTF convention) ──────────────────────────────

function mat4Mul(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

/** Compose local TRS → column-major mat4 (M = T·R·S). */
function trsToMat4(t, q, s) {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
  // rotation 3x3 from quaternion
  const r00 = 1 - 2 * (y * y + z * z);
  const r01 = 2 * (x * y - z * w);
  const r02 = 2 * (x * z + y * w);
  const r10 = 2 * (x * y + z * w);
  const r11 = 1 - 2 * (x * x + z * z);
  const r12 = 2 * (y * z - x * w);
  const r20 = 2 * (x * z - y * w);
  const r21 = 2 * (y * z + x * w);
  const r22 = 1 - 2 * (x * x + y * y);
  return [
    r00 * sx, r10 * sx, r20 * sx, 0, // col 0
    r01 * sy, r11 * sy, r21 * sy, 0, // col 1
    r02 * sz, r12 * sz, r22 * sz, 0, // col 2
    t[0], t[1], t[2], 1, // col 3
  ];
}

/** Rest WORLD matrix per node: compose local TRS (or node.matrix) from root down. */
function computeRestWorldMatrices(nodes) {
  const n = nodes.length;
  const parent = new Array(n).fill(-1);
  nodes.forEach((node, i) => {
    for (const c of node.children || []) parent[c] = i;
  });
  const local = nodes.map((node) =>
    node.matrix
      ? node.matrix.slice(0, 16) // already column-major per glTF spec
      : trsToMat4(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]));
  const world = new Array(n).fill(null);
  const resolve = (i, guard = 0) => {
    if (world[i]) return world[i];
    if (guard > n) throw new Error('synergy-markers: node parent cycle detected');
    world[i] = parent[i] === -1 ? local[i] : mat4Mul(resolve(parent[i], guard + 1), local[i]);
    return world[i];
  };
  for (let i = 0; i < n; i++) resolve(i);
  return world;
}

// Regular tetrahedron centered on the origin: vertices (±1,±1,±1) with an even
// number of minus signs; edge length 2√2 → scale by size/(2√2) for edge ≈ size.
const TETRA_UNIT = [
  [1, 1, 1],
  [1, -1, -1],
  [-1, 1, -1],
  [-1, -1, 1],
];
// 4 faces = 12 indices (material is doubleSided, so winding is non-critical)
const TETRA_INDICES = [0, 1, 2, 0, 3, 1, 0, 2, 3, 1, 3, 2];

/**
 * Inject skinned marker tetrahedra at the given bones of a rigged GLB.
 *
 * @param {Buffer} glbBuf - source GLB
 * @param {Array<{bone:string, color:[number,number,number], offset?:[number,number,number]}>} markers
 *   offset (model units, rest space) shifts the marker off the joint — e.g. [0,0,+0.15] floats it in FRONT
 *   of the body so it cannot be occluded by the mesh (hips/feet markers sit INSIDE the flesh otherwise;
 *   learned in the first calibration run). The offset rides the bone like the marker itself.
 * @param {number} size - tetrahedron edge length in model units
 * @returns {{ glb: Buffer,
 *             injected: Array<{bone:string, color:number[], restWorld:[number,number,number]}>,
 *             skipped: string[] }}
 */
export function injectJointMarkers(glbBuf, markers = DEFAULT_MARKERS, size = 0.05) {
  const { json, bin } = parseGlb(glbBuf);

  json.bufferViews = json.bufferViews || [];
  json.accessors = json.accessors || [];
  json.materials = json.materials || [];
  json.buffers = json.buffers || [{ byteLength: bin.length }];

  const skin = (json.skins || [])[0];
  if (!skin) throw new Error('synergy-markers: GLB has no skin — markers require a rigged model');

  // FIRST mesh with a skinned primitive: appending primitives there means the
  // markers inherit that mesh node's skin binding — no new nodes needed.
  const hostMesh = (json.meshes || []).find((m) =>
    (m.primitives || []).some((p) => p.attributes && p.attributes.JOINTS_0 !== undefined));
  if (!hostMesh) throw new Error('synergy-markers: no mesh with a skinned primitive (JOINTS_0) found');

  // bone name → node index, and node rest world matrices
  const nodeByName = {};
  (json.nodes || []).forEach((n, i) => {
    if (n.name && nodeByName[n.name] === undefined) nodeByName[n.name] = i;
  });
  const restWorld = computeRestWorldMatrices(json.nodes || []);

  // Append-once accounting (kinetic-transplant discipline): collect chunks,
  // concat a single time at the end.
  const appended = [];
  let appendLen = 0;

  /** Append raw bytes 4-byte-aligned; push a bufferView; return its index. */
  const appendView = (data, target) => {
    if (!data.length) throw new Error('synergy-markers: refusing to append a zero-length bufferView');
    const total = bin.length + appendLen;
    const pad = total % 4 ? 4 - (total % 4) : 0;
    if (pad) {
      appended.push(Buffer.alloc(pad, 0));
      appendLen += pad;
    }
    const off = bin.length + appendLen;
    appended.push(data);
    appendLen += data.length;
    const bv = { buffer: 0, byteOffset: off, byteLength: data.length };
    if (target) bv.target = target;
    json.bufferViews.push(bv);
    return json.bufferViews.length - 1;
  };

  const injected = [];
  const skipped = [];
  const scale = size / (2 * Math.SQRT2); // unit tetra edge = 2√2 → edge ≈ size

  for (const marker of markers) {
    const nodeIndex = nodeByName[marker.bone];
    const jointSlot = nodeIndex === undefined ? -1 : skin.joints.indexOf(nodeIndex);
    if (jointSlot < 0) {
      skipped.push(marker.bone);
      continue;
    }

    // v = the bone's rest WORLD position (translation column of its rest world
    // matrix). At rest Gⱼ·IBMⱼ = identity, so the marker sits exactly on the joint.
    const m = restWorld[nodeIndex];
    const off = marker.offset || [0, 0, 0];
    const v = [m[12] + off[0], m[13] + off[1], m[14] + off[2]];

    // POSITION — VEC3 float, WITH min/max
    const pos = Buffer.alloc(4 * 3 * 4);
    const mn = [Infinity, Infinity, Infinity];
    const mx = [-Infinity, -Infinity, -Infinity];
    TETRA_UNIT.forEach((u, k) => {
      for (let j = 0; j < 3; j++) {
        const p = v[j] + u[j] * scale;
        pos.writeFloatLE(p, (k * 3 + j) * 4);
        if (p < mn[j]) mn[j] = p;
        if (p > mx[j]) mx[j] = p;
      }
    });
    json.accessors.push({
      bufferView: appendView(pos, TARGET_ARRAY_BUFFER),
      byteOffset: 0, componentType: 5126, count: 4, type: 'VEC3', min: mn, max: mx,
    });
    const posAcc = json.accessors.length - 1;

    // NORMAL — radial unit normals from the tetra center (PowerPoint's renderer skips primitives
    // without normals — measured: normal-less markers rendered NOWHERE; learned calibration run 2)
    const nrm = Buffer.alloc(4 * 3 * 4);
    TETRA_UNIT.forEach((u, k) => {
      const len = Math.hypot(u[0], u[1], u[2]);
      for (let j = 0; j < 3; j++) nrm.writeFloatLE(u[j] / len, (k * 3 + j) * 4);
    });
    json.accessors.push({
      bufferView: appendView(nrm, TARGET_ARRAY_BUFFER),
      byteOffset: 0, componentType: 5126, count: 4, type: 'VEC3',
    });
    const nrmAcc = json.accessors.length - 1;

    // JOINTS_0 — VEC4 unsigned short, [j,0,0,0] per vertex
    const joints = Buffer.alloc(4 * 4 * 2);
    for (let k = 0; k < 4; k++) joints.writeUInt16LE(jointSlot, k * 8); // lanes 1..3 stay 0
    json.accessors.push({
      bufferView: appendView(joints, TARGET_ARRAY_BUFFER),
      byteOffset: 0, componentType: 5123, count: 4, type: 'VEC4',
    });
    const jointsAcc = json.accessors.length - 1;

    // WEIGHTS_0 — VEC4 float, [1,0,0,0] per vertex
    const weights = Buffer.alloc(4 * 4 * 4);
    for (let k = 0; k < 4; k++) weights.writeFloatLE(1, k * 16);
    json.accessors.push({
      bufferView: appendView(weights, TARGET_ARRAY_BUFFER),
      byteOffset: 0, componentType: 5126, count: 4, type: 'VEC4',
    });
    const weightsAcc = json.accessors.length - 1;

    // indices — SCALAR unsigned short, the 4 tetra faces
    const idx = Buffer.alloc(TETRA_INDICES.length * 2);
    TETRA_INDICES.forEach((ix, k) => idx.writeUInt16LE(ix, k * 2));
    json.accessors.push({
      bufferView: appendView(idx, TARGET_ELEMENT_ARRAY),
      byteOffset: 0, componentType: 5123, count: TETRA_INDICES.length, type: 'SCALAR',
    });
    const idxAcc = json.accessors.length - 1;

    // material — unlit-bright: full-saturation base + emissive so the color
    // survives scene lighting and stays color-keyable in renders
    const [r, g, b] = marker.color;
    json.materials.push({
      name: `marker_${marker.bone}`,
      pbrMetallicRoughness: { baseColorFactor: [r, g, b, 1], metallicFactor: 0, roughnessFactor: 1 },
      emissiveFactor: [Math.min(r, 1), Math.min(g, 1), Math.min(b, 1)],
      doubleSided: true,
    });

    hostMesh.primitives.push({
      attributes: { POSITION: posAcc, NORMAL: nrmAcc, JOINTS_0: jointsAcc, WEIGHTS_0: weightsAcc },
      indices: idxAcc,
      material: json.materials.length - 1,
      mode: 4, // TRIANGLES
    });

    injected.push({ bone: marker.bone, color: marker.color.slice(), restWorld: v });
  }

  const finalBin = appended.length ? Buffer.concat([bin, ...appended]) : bin;
  json.buffers[0].byteLength = finalBin.length;
  delete json.buffers[0].uri; // ensure it stays GLB-embedded

  // PP-safety gate: never emit a zero-length bufferView (PP freezes all animation).
  const zero = json.bufferViews.map((bv, i) => (bv.byteLength > 0 ? -1 : i)).filter((i) => i >= 0);
  if (zero.length) throw new Error(`synergy-markers: zero-length bufferViews ${zero.join(',')} — PP would freeze`);

  return { glb: serializeGlb(json, finalBin), injected, skipped };
}

/**
 * Re-parse a (marker-injected) GLB and assert structural safety:
 *  - no zero-length bufferViews,
 *  - every accessor's absolute byteOffset is component-size aligned
 *    (4-aligned for all float/uint accessors — our appended data is 4-aligned
 *    by construction),
 *  - every mesh primitive references valid accessor/material indices.
 * Throws on the first violation; returns a summary on success.
 */
export function validateMarkers(glbBuf) {
  const { json, bin } = parseGlb(glbBuf);
  const problems = [];

  (json.bufferViews || []).forEach((bv, i) => {
    if (!(bv.byteLength > 0)) problems.push(`bufferView ${i} has zero byteLength`);
    const end = (bv.byteOffset || 0) + bv.byteLength;
    if (bv.buffer === 0 && end > bin.length) problems.push(`bufferView ${i} overruns bin (${end} > ${bin.length})`);
  });

  (json.accessors || []).forEach((a, i) => {
    if (a.bufferView === undefined) return; // sparse/zero-filled accessors have no view
    const bv = (json.bufferViews || [])[a.bufferView];
    if (!bv) {
      problems.push(`accessor ${i} references missing bufferView ${a.bufferView}`);
      return;
    }
    const cb = COMP_BYTES[a.componentType] || 4;
    const abs = (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (abs % cb !== 0) problems.push(`accessor ${i} byteOffset ${abs} not ${cb}-aligned`);
  });

  const nAcc = (json.accessors || []).length;
  const nMat = (json.materials || []).length;
  let primCount = 0;
  let markerPrims = 0;
  (json.meshes || []).forEach((mesh, mi) => {
    (mesh.primitives || []).forEach((p, pi) => {
      primCount += 1;
      for (const [attr, acc] of Object.entries(p.attributes || {})) {
        if (!(Number.isInteger(acc) && acc >= 0 && acc < nAcc)) {
          problems.push(`mesh ${mi} primitive ${pi} attribute ${attr} → invalid accessor ${acc}`);
        }
      }
      if (p.indices !== undefined && !(Number.isInteger(p.indices) && p.indices >= 0 && p.indices < nAcc)) {
        problems.push(`mesh ${mi} primitive ${pi} indices → invalid accessor ${p.indices}`);
      }
      if (p.material !== undefined) {
        if (!(Number.isInteger(p.material) && p.material >= 0 && p.material < nMat)) {
          problems.push(`mesh ${mi} primitive ${pi} → invalid material ${p.material}`);
        } else if ((json.materials[p.material].name || '').startsWith('marker_')) {
          markerPrims += 1;
        }
      }
    });
  });

  if (problems.length) throw new Error(`synergy-markers validate: ${problems.join('; ')}`);
  return {
    ok: true,
    bufferViews: (json.bufferViews || []).length,
    accessors: nAcc,
    materials: nMat,
    primitives: primCount,
    markerPrimitives: markerPrims,
  };
}
