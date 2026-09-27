// ir/kinetic-transplant.mjs
// ─────────────────────────────────────────────────────────────────────────────
// IN-PROCESS custom-N kinetic transplant — build a per-deck kinetic presenter by
// swapping ANIMATION TRACKS on an already-built rigged character, with ZERO cloud.
//
// The base character is prebuilt (mesh + skin + skeleton, already matte + slim, and
// it already has a poster). Only the animation clips are interchanged. That is a pure
// glTF buffer edit — a bone-name channel copy from the kinetic library onto the base —
// so it runs here, in the engine, at deck-compile time, in milliseconds. No GPU, no
// Blender, no Modal. Modal is only ever touched for the ONE-TIME steps: rigging the
// base avatar (TRELLIS/UniRig) and baking the kinetic library (Blender retarget).
//
// Bone names match because both derive from mixamorig and the canonical rig was baked
// to its LOCAL axes (mixamo_bake COPY_ROTATION LOCAL). Channels copy library-node →
// same-named character-node; bones the character lacks (or the library root) are
// skipped; the character keeps its mesh/skin untouched; old clips are replaced.
//
// Port of bake/transplant_kinetic.py (kept as the reference implementation).
// ─────────────────────────────────────────────────────────────────────────────

const GLB_MAGIC = 0x46546c67; // "glTF" — pure buffer surgery; no external deps
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

// componentType → bytes-per-component
const COMP_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Parse a GLB buffer → { json, bin }. bin is a Buffer (may be empty). */
export function parseGlb(buf) {
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(buf);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('kinetic-transplant: not a GLB (bad magic)');
  let off = 12; // 12-byte header: magic, version, length
  let json = null;
  let bin = Buffer.alloc(0);
  while (off + 8 <= buf.length) {
    const clen = buf.readUInt32LE(off);
    const ctype = buf.readUInt32LE(off + 4);
    const cdata = buf.subarray(off + 8, off + 8 + clen);
    if (ctype === CHUNK_JSON) json = JSON.parse(cdata.toString('utf8'));
    else if (ctype === CHUNK_BIN) bin = Buffer.from(cdata); // copy — we mutate/append
    off += 8 + clen;
  }
  if (!json) throw new Error('kinetic-transplant: GLB has no JSON chunk');
  return { json, bin };
}

/** Serialize { json, bin } back into a padded, spec-valid GLB Buffer. */
export function serializeGlb(json, bin) {
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  if (jsonBuf.length % 4) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(4 - (jsonBuf.length % 4), 0x20)]); // pad ' '
  let binBuf = bin || Buffer.alloc(0);
  if (binBuf.length % 4) binBuf = Buffer.concat([binBuf, Buffer.alloc(4 - (binBuf.length % 4), 0)]); // pad \0
  const total = 12 + 8 + jsonBuf.length + 8 + binBuf.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  let o = 12;
  out.writeUInt32LE(jsonBuf.length, o);
  out.writeUInt32LE(CHUNK_JSON, o + 4);
  jsonBuf.copy(out, o + 8);
  o += 8 + jsonBuf.length;
  out.writeUInt32LE(binBuf.length, o);
  out.writeUInt32LE(CHUNK_BIN, o + 4);
  binBuf.copy(out, o + 8);
  return out;
}

// ── Quaternion helpers for bind-pose-aware retargeting ───────────────────────
// A naive channel copy writes the LIBRARY's absolute local rotations onto the character's bones. That is only
// correct when both skeletons share the same REST pose — they don't (mixamorig rigs differ by several degrees,
// occasionally ~180°), so the copied motion is distorted and dampened. The fix: apply the library's motion as a
// DELTA from its own rest, re-based onto the character's rest:  q_char(t) = q_charRest · q_libRest⁻¹ · q_lib(t).
// When the rests already match this reduces to identity (q_lib), so it never hurts an aligned bone.
function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
function quatConj(q) { return [-q[0], -q[1], -q[2], q[3]]; }
function quatNorm(q) {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}
function quatDot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]; }
function quatSlerp(a, b, amount) {
  let end = b;
  let dot = quatDot(a, b);
  if (dot < 0) {
    end = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) return quatNorm(a.map((value, axis) => value + amount * (end[axis] - value)));
  const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
  const sinTheta = Math.sin(theta) || 1;
  const left = Math.sin((1 - amount) * theta) / sinTheta;
  const right = Math.sin(amount * theta) / sinTheta;
  return quatNorm(a.map((value, axis) => value * left + end[axis] * right));
}
function quatDegrees(a, b) {
  const dot = Math.min(1, Math.abs(quatDot(quatNorm(a), quatNorm(b))));
  return 2 * Math.acos(dot) * 180 / Math.PI;
}

// q and -q encode the same orientation, but some native consumers interpolate
// the four stored components before normalizing. Keep every serialized track
// in one quaternion hemisphere so an equivalent sign change cannot become a
// visible long-path spin or one-frame collapse in PowerPoint.
function continuousQuaternionRows(rows) {
  let previous = null;
  return rows.map(raw => {
    let current = quatNorm(raw);
    if (previous && quatDot(previous, current) < 0) current = current.map(value => -value);
    previous = current;
    return current;
  });
}

function parentIndexes(nodes) {
  const parents = Array(nodes?.length || 0).fill(-1);
  (nodes || []).forEach((node, parentIndex) => {
    for (const childIndex of node.children || []) parents[childIndex] = parentIndex;
  });
  return parents;
}

function hierarchyOrder(parents) {
  const depths = Array(parents.length).fill(undefined);
  const depth = (index, trail = new Set()) => {
    if (depths[index] !== undefined) return depths[index];
    if (trail.has(index)) throw new Error('kinetic-transplant: skeleton hierarchy contains a cycle');
    trail.add(index);
    const parent = parents[index];
    const value = parent < 0 ? 0 : depth(parent, trail) + 1;
    trail.delete(index);
    depths[index] = value;
    return value;
  };
  return parents.map((_, index) => index).sort((a, b) => depth(a) - depth(b) || a - b);
}

function quatRotateVector(qRaw, vector) {
  const q = quatNorm(qRaw);
  const pure = [vector[0], vector[1], vector[2], 0];
  const rotated = quatMul(quatMul(q, pure), quatConj(q));
  return rotated.slice(0, 3);
}

// Uniform root travel must follow the destination presenter's stature. The
// kinetic source skeleton is human-scale, while the slim PowerPoint-safe Joe,
// Louise, and Pete rigs are uniformly smaller. Measure the rest hierarchy in
// model units so root displacement scales without touching geometry or skin.
function skeletonStature(nodes) {
  const parents = parentIndexes(nodes);
  const order = hierarchyOrder(parents);
  const worldTranslations = Array(nodes.length);
  const worldRotations = Array(nodes.length);
  const worldScales = Array(nodes.length);
  for (const index of order) {
    const node = nodes[index] || {};
    const localTranslation = Array.isArray(node.translation) ? node.translation.slice(0, 3) : [0, 0, 0];
    const localRotation = Array.isArray(node.rotation) ? quatNorm(node.rotation.slice(0, 4)) : [0, 0, 0, 1];
    const localScale = Array.isArray(node.scale) ? node.scale.slice(0, 3) : [1, 1, 1];
    const parent = parents[index];
    if (parent < 0) {
      worldTranslations[index] = localTranslation;
      worldRotations[index] = localRotation;
      worldScales[index] = localScale;
      continue;
    }
    const parentScale = worldScales[parent];
    const scaledLocal = localTranslation.map((value, axis) => value * parentScale[axis]);
    const rotatedLocal = quatRotateVector(worldRotations[parent], scaledLocal);
    worldTranslations[index] = rotatedLocal.map((value, axis) => value + worldTranslations[parent][axis]);
    worldRotations[index] = quatNorm(quatMul(worldRotations[parent], localRotation));
    worldScales[index] = localScale.map((value, axis) => value * parentScale[axis]);
  }
  const namedHeight = name => {
    const index = (nodes || []).findIndex(node => node?.name === name);
    return index >= 0 ? worldTranslations[index]?.[1] : undefined;
  };
  const head = namedHeight('mixamorig:Head');
  const toeHeights = ['mixamorig:LeftToeBase', 'mixamorig:RightToeBase'].map(namedHeight).filter(Number.isFinite);
  if (Number.isFinite(head) && toeHeights.length) {
    const commonBoneStature = head - Math.min(...toeHeights);
    if (commonBoneStature > 1e-6) return commonBoneStature;
  }
  const heights = (nodes || []).flatMap((node, index) => /^mixamorig:/.test(node?.name || '')
    ? [worldTranslations[index]?.[1]].filter(Number.isFinite)
    : []);
  if (heights.length < 2) return 1;
  const stature = Math.max(...heights) - Math.min(...heights);
  return stature > 1e-6 ? stature : 1;
}

// Opt-in world-root motion must not infer an inverse from a sheared, singular,
// matrix-authored or animated parent frame. Legacy local motion never calls
// this helper. Only the named skeletal chains needed by the measurement are
// evaluated; unrelated mesh-node transforms are not rewritten or inspected.
function worldRootMotionContext(sourceNodes, targetNodes, animation, rootBoneName, profileNodes) {
  const invalid = (message, code = 'MOTION_ROOT_WORLD_FRAME_UNSUPPORTED') => {
    const error = new Error(`kinetic-transplant: ${message}`);
    error.code = code;
    throw error;
  };
  const rootIndex = (nodes, label) => {
    const found = nodes.flatMap((node, index) => node.name === rootBoneName ? [index] : []);
    if (found.length !== 1) invalid(`${label} root identity is missing or ambiguous`, 'MOTION_ROOT_WORLD_ROOT_INVALID');
    return found[0];
  };
  const hierarchy = (nodes, overrides = null) => {
    const parents = Array(nodes.length).fill(-1);
    nodes.forEach((node, parent) => {
      for (const child of node.children || []) {
        if (!Number.isInteger(child) || child < 0 || child >= nodes.length || parents[child] >= 0) invalid('world-root hierarchy is invalid');
        parents[child] = parent;
      }
    });
    const ancestors = index => {
      const result = [];
      const seen = new Set([index]);
      for (let current = parents[index]; current >= 0; current = parents[current]) {
        if (seen.has(current)) invalid('world-root hierarchy contains a cycle');
        seen.add(current); result.push(current);
      }
      return result;
    };
    const cache = new Map();
    const state = (index, trail = new Set()) => {
      if (index < 0) return { rotation: [0, 0, 0, 1], scale: 1, position: [0, 0, 0] };
      if (cache.has(index)) return cache.get(index);
      if (trail.has(index)) invalid('world-root hierarchy contains a cycle');
      trail.add(index);
      const node = nodes[index];
      if (node.matrix !== undefined) invalid('world-root skeletal chains require explicit TRS, not matrices');
      const basis = node.name && overrides?.[node.name] ? overrides[node.name] : node;
      const translation = basis.translation || [0, 0, 0];
      const rotation = basis.rotation || [0, 0, 0, 1];
      const scale = basis.scale || [1, 1, 1];
      if (!Array.isArray(translation) || translation.length !== 3 || !translation.every(Number.isFinite)
        || !Array.isArray(rotation) || rotation.length !== 4 || !rotation.every(Number.isFinite) || Math.hypot(...rotation) <= 1e-12
        || !Array.isArray(scale) || scale.length !== 3 || !scale.every(value => Number.isFinite(value) && value > 1e-12)
        || Math.max(...scale) - Math.min(...scale) > 1e-6 * Math.max(...scale)) {
        invalid('world-root skeletal frames must be finite, positive and uniformly scaled');
      }
      const parent = state(parents[index], trail);
      const localPosition = quatRotateVector(parent.rotation, translation.map(value => value * parent.scale));
      const result = {
        rotation: quatNorm(quatMul(parent.rotation, quatNorm(rotation))),
        scale: parent.scale * scale[0],
        position: localPosition.map((value, axis) => value + parent.position[axis]),
      };
      if (!Number.isFinite(result.scale) || result.scale <= 1e-12) invalid('world-root parent scale is singular');
      cache.set(index, result); trail.delete(index); return result;
    };
    // Stature is a forward measurement, not an inverse-frame operation.
    // Existing descendant bones can have nonuniform scale (including small
    // exporter residuals). Compose their exact affine linear maps instead of
    // treating that scale as uniform or rejecting an otherwise sound root.
    const affineCache = new Map();
    const applyLinear = (matrix, vector) => [0, 1, 2].map(row =>
      matrix[row] * vector[0] + matrix[3 + row] * vector[1] + matrix[6 + row] * vector[2]);
    const affineState = (index, trail = new Set()) => {
      if (index < 0) return { linear: [1, 0, 0, 0, 1, 0, 0, 0, 1], position: [0, 0, 0] };
      if (affineCache.has(index)) return affineCache.get(index);
      if (trail.has(index)) invalid('world-root stature hierarchy contains a cycle');
      trail.add(index);
      const node = nodes[index];
      if (node.matrix !== undefined) invalid('world-root stature skeletal chains require explicit TRS, not matrices');
      const basis = node.name && overrides?.[node.name] ? overrides[node.name] : node;
      const translation = basis.translation || [0, 0, 0];
      const rotation = basis.rotation || [0, 0, 0, 1];
      const scale = basis.scale || [1, 1, 1];
      if (!Array.isArray(translation) || translation.length !== 3 || !translation.every(Number.isFinite)
        || !Array.isArray(rotation) || rotation.length !== 4 || !rotation.every(Number.isFinite) || Math.hypot(...rotation) <= 1e-12
        || !Array.isArray(scale) || scale.length !== 3 || !scale.every(value => Number.isFinite(value) && value > 1e-12)) {
        invalid('world-root stature chains must have finite positive TRS');
      }
      const parent = affineState(parents[index], trail);
      const localColumns = [0, 1, 2].map(axis => quatRotateVector(rotation, [0, 1, 2].map(component => component === axis ? scale[axis] : 0)));
      const linear = localColumns.flatMap(column => applyLinear(parent.linear, column));
      const position = applyLinear(parent.linear, translation).map((value, axis) => value + parent.position[axis]);
      if (!linear.every(Number.isFinite) || !position.every(Number.isFinite)) invalid('world-root stature transform overflows');
      const result = { linear, position };
      affineCache.set(index, result); trail.delete(index); return result;
    };
    const stature = () => {
      const indexFor = name => {
        const found = nodes.flatMap((node, index) => {
          const semanticName = String(node.name || '').split(':').at(-1);
          return semanticName === name ? [index] : [];
        });
        if (found.length !== 1) invalid(`world-root stature needs an unambiguous ${name} joint`, 'MOTION_ROOT_WORLD_STATURE_INVALID');
        return found[0];
      };
      const head = affineState(indexFor('Head')).position[1];
      const floor = Math.min(affineState(indexFor('LeftToeBase')).position[1], affineState(indexFor('RightToeBase')).position[1]);
      const height = head - floor;
      if (!Number.isFinite(height) || height <= 1e-6) invalid('world-root stature must be positive in model Y-up coordinates', 'MOTION_ROOT_WORLD_STATURE_INVALID');
      return height;
    };
    return { parents, ancestors, state, stature };
  };
  const sourceRoot = rootIndex(sourceNodes, 'source');
  const targetRoot = rootIndex(targetNodes, 'target');
  const source = hierarchy(sourceNodes);
  const target = hierarchy(targetNodes);
  const targetRest = hierarchy(targetNodes, profileNodes);
  const sourceAncestors = source.ancestors(sourceRoot);
  const targetAncestors = target.ancestors(targetRoot);
  const targetAncestorNames = new Set(targetAncestors.map(index => targetNodes[index].name).filter(Boolean));
  for (const channel of animation.channels || []) {
    if (sourceAncestors.includes(channel.target?.node)
      || targetAncestorNames.has(sourceNodes[channel.target?.node]?.name)) {
      invalid('world-root motion does not accept animated source or destination ancestors', 'MOTION_ROOT_WORLD_ANIMATED_PARENT_UNSUPPORTED');
    }
  }
  const rootTranslations = (animation.channels || []).filter(channel => channel.target?.node === sourceRoot && channel.target.path === 'translation');
  if (rootTranslations.length !== 1) invalid('world-root motion requires exactly one root translation track', 'MOTION_ROOT_WORLD_ROOT_INVALID');
  const sourceFrame = source.state(source.parents[sourceRoot]);
  const targetFrame = target.state(target.parents[targetRoot]);
  const sourceStature = source.stature();
  const targetStature = targetRest.stature();
  const targetAnchor = targetNodes[targetRoot].translation || [0, 0, 0];
  if (!Array.isArray(targetAnchor) || targetAnchor.length !== 3 || !targetAnchor.every(Number.isFinite)) invalid('world-root destination anchor is invalid');
  return { sourceRoot, targetRoot, sourceFrame, targetFrame, sourceStature, targetStature, targetAnchor: [...targetAnchor] };
}

function sampleQuaternion(times, values, interpolation, time) {
  if (!times.length || !values.length) return [0, 0, 0, 1];
  if (time <= times[0]) return quatNorm(values[0]);
  if (time >= times[times.length - 1]) return quatNorm(values[values.length - 1]);
  let low = 0;
  let high = times.length - 1;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (times[mid] <= time) low = mid;
    else high = mid;
  }
  if (String(interpolation || 'LINEAR').toUpperCase() === 'STEP') return quatNorm(values[low]);
  const span = times[high] - times[low] || 1;
  return quatSlerp(quatNorm(values[low]), quatNorm(values[high]), (time - times[low]) / span);
}

// Minimal valid 1x1 transparent PNG. Used to REPAIR zero-length bufferViews: a byteLength=0 bufferView is
// invalid glTF, and PowerPoint's loader responds by silently refusing to play ANY animation on the model (frozen
// rest pose — isolated 2026-07-13 via COM A/B renders). A pre-fix slimmed base may carry them (dropped images), so
// the transplant heals the base in passing instead of propagating the freeze.
const PLACEHOLDER_PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360606060000000050001a5f64540' +
  '0000000049454e44ae426082', 'hex');

/** Build a { name→animation, slug→animation } lookup for a library glTF. */
function indexLibraryAnims(lj) {
  const bySlug = {};
  for (const a of lj.animations || []) {
    bySlug[a.name] = a;
    const us = a.name.indexOf('_');
    if (us > -1) bySlug[a.name.slice(us + 1)] = a; // "00_sprint" → "sprint"
  }
  return bySlug;
}

/**
 * Transplant an exact ordered set of semantic motions from one or more source
 * libraries onto a base character GLB.  Each selection has:
 *   { motionId, sourceSlug, outputSlug?, library, libraryKey? }
 *
 * `motionId` is the stable semantic ID owned by the authoring catalog.  It is
 * mapped to a private animId only in the returned build result; it is never a
 * PowerPoint/public authoring field.  This generalizes the old one-library
 * kinetic path so one presenter bundle can mix ordinary gestures and kinetic
 * motions while still obeying the 18-animation PowerPoint ceiling.
 */
export function transplantMotionSet(charBuf, selections, {
  strict = true,
  // Presenter-safe default: retain the destination skeleton's authored local
  // translations and scales. Mixamo-derived libraries often contain absolute
  // TRS tracks for every bone; even a mathematically rebased translation/scale
  // can make PowerPoint evaluate a skinned character in the wrong bind space.
  // PowerPoint owns whole-object travel/resize, so ordinary presenter motion
  // needs rotations only. `root-motion` additionally keeps bounded hips travel;
  // `full-trs` remains available for explicitly verified same-rig assets/tests.
  channelPolicy = 'rotation-only',
  rootBoneName = 'mixamorig:Hips',
  // Optional private construction/bind profile.  It lets the output GLB keep
  // its PowerPoint-safe neutral node transforms while rotation retargeting is
  // still computed from the rig's true construction rest.
  targetRestProfile = null,
  // Optional presentation boundary pose. When supplied with a positive blend
  // duration, each emitted clip starts at this exact local pose, preserves the
  // complete source motion, and returns to the pose at the end. This prevents
  // PowerPoint's stopped/static model from snapping into a distant first key.
  animationBoundaryPoseProfile = null,
  animationBoundaryBlendMs = 0,
  // `local` preserves the historical per-joint rebase. `global` carries each
  // bone's global-rest-frame relative rotation. `world-delta` instead preserves
  // the world-axis pose change (pose * rest^-1), for sources such as native BVH.
  // Both global modes reconstruct local output rotations in hierarchy order.
  // The explicit choice is source-owned; there is no automatic policy guessing.
  rotationRetargetSpace = 'local',
  // A native world-axis take may be authored from an arbitrary captured pose
  // rather than a neutral construction rest. `rest` preserves the historical
  // behavior; `first-frame` anchors the source delta to its first sampled pose,
  // so the destination starts in its own authored rest without dropping any
  // subsequent motion. This is explicit source policy, never inferred from a
  // clip name or visual heuristic.
  rotationReference = 'rest',
} = {}) {
  if (!Array.isArray(selections) || !selections.length) {
    const error = new Error('transplantMotionSet needs a non-empty motion selection');
    error.code = 'MOTION_SELECTION_REQUIRED';
    throw error;
  }
  if (selections.length > 18) {
    const error = new Error(`one PowerPoint presenter bundle supports at most 18 motions; received ${selections.length}`);
    error.code = 'MOTION_BUNDLE_LIMIT_EXCEEDED';
    error.maximum = 18;
    error.requested = selections.length;
    throw error;
  }
  if (!['rotation-only', 'root-motion', 'full-trs'].includes(channelPolicy)) {
    const error = new Error(`unsupported kinetic channel policy: ${channelPolicy}`);
    error.code = 'MOTION_CHANNEL_POLICY_INVALID';
    throw error;
  }
  if (!['local', 'global', 'world-delta'].includes(rotationRetargetSpace)) {
    const error = new Error(`unsupported rotation retarget space: ${rotationRetargetSpace}`);
    error.code = 'MOTION_ROTATION_RETARGET_SPACE_INVALID';
    throw error;
  }
  if (!['rest', 'first-frame'].includes(rotationReference)) {
    const error = new Error(`unsupported rotation reference: ${rotationReference}`);
    error.code = 'MOTION_ROTATION_REFERENCE_INVALID';
    throw error;
  }
  if (rotationReference === 'first-frame' && rotationRetargetSpace !== 'world-delta') {
    const error = new Error('first-frame rotation references require world-delta retargeting');
    error.code = 'MOTION_ROTATION_REFERENCE_UNSUPPORTED';
    throw error;
  }
  if (!Number.isFinite(Number(animationBoundaryBlendMs)) || Number(animationBoundaryBlendMs) < 0) {
    const error = new Error(`animation boundary blend must be a non-negative duration; received ${animationBoundaryBlendMs}`);
    error.code = 'MOTION_BOUNDARY_BLEND_INVALID';
    throw error;
  }
  const boundaryBlendSeconds = Number(animationBoundaryBlendMs) / 1000;
  const boundaryNodes = animationBoundaryPoseProfile?.nodes && typeof animationBoundaryPoseProfile.nodes === 'object'
    ? animationBoundaryPoseProfile.nodes
    : null;
  if (boundaryBlendSeconds > 0 && !boundaryNodes) {
    const error = new Error('animation boundary blend requires a name-keyed pose profile');
    error.code = 'MOTION_BOUNDARY_POSE_REQUIRED';
    throw error;
  }
  const c = parseGlb(charBuf);
  const cj = c.json;
  const cbin = c.bin; // base buffer, read-only; new bytes accumulate in `appended`

  cj.bufferViews = cj.bufferViews || [];
  cj.accessors = cj.accessors || [];
  cj.buffers = cj.buffers || [{ byteLength: cbin.length }];

  // bone name → character node index
  const cnode = {};
  (cj.nodes || []).forEach((n, i) => {
    if (n.name) cnode[n.name] = i;
  });

  // Rest-pose rotations (by bone name) for the bind-pose-aware retarget. Default identity when a node has none.
  const restRot = (nodes) => {
    const m = {};
    (nodes || []).forEach((n) => { if (n.name) m[n.name] = n.rotation ? n.rotation.slice(0, 4) : [0, 0, 0, 1]; });
    return m;
  };
  const restTranslation = (nodes) => {
    const m = {};
    (nodes || []).forEach((n) => { if (n.name) m[n.name] = n.translation ? n.translation.slice(0, 3) : [0, 0, 0]; });
    return m;
  };
  const restScale = (nodes) => {
    const m = {};
    (nodes || []).forEach((n) => { if (n.name) m[n.name] = n.scale ? n.scale.slice(0, 3) : [1, 1, 1]; });
    return m;
  };
  const profileNodes = targetRestProfile?.nodes && typeof targetRestProfile.nodes === 'object'
    ? targetRestProfile.nodes
    : null;
  const charRest = profileNodes
    ? Object.fromEntries(Object.entries(profileNodes).map(([name, node]) => [name, Array.isArray(node.rotation) ? node.rotation.slice(0, 4) : [0, 0, 0, 1]]))
    : restRot(cj.nodes);
  const charRestTranslation = profileNodes
    ? Object.fromEntries(Object.entries(profileNodes).map(([name, node]) => [name, Array.isArray(node.translation) ? node.translation.slice(0, 3) : [0, 0, 0]]))
    : restTranslation(cj.nodes);
  const charRestScale = profileNodes
    ? Object.fromEntries(Object.entries(profileNodes).map(([name, node]) => [name, Array.isArray(node.scale) ? node.scale.slice(0, 3) : [1, 1, 1]]))
    : restScale(cj.nodes);
  const charStature = skeletonStature(cj.nodes || []);
  const libraryCache = new Map();
  const libraryFor = (selection, index) => {
    const key = String(selection.libraryKey || `source-${index}`);
    const cached = libraryCache.get(key);
    if (cached) return cached;
    if (!selection.library) {
      const error = new Error(`motion ${selection.motionId || selection.sourceSlug || index} has no source library`);
      error.code = 'MOTION_SOURCE_MISSING';
      throw error;
    }
    const parsed = parseGlb(selection.library);
    const entry = {
      json: parsed.json,
      bin: parsed.bin,
      bySlug: indexLibraryAnims(parsed.json),
      rest: restRot(parsed.json.nodes),
      restTranslation: restTranslation(parsed.json.nodes),
      restScale: restScale(parsed.json.nodes),
      stature: skeletonStature(parsed.json.nodes || []),
    };
    libraryCache.set(key, entry);
    return entry;
  };

  // Append-once accounting: collect appended chunks and concat a single time at the end
  // (avoids the O(n²) blowup of Buffer.concat-per-accessor on a 20 MB buffer).
  const appended = [];
  let appendLen = 0; // bytes appended after the base buffer so far

  // HEAL zero-length bufferViews in the base (invalid glTF → PowerPoint freezes all animation). Image views get
  // a real 1x1 PNG; any other gets 4 null bytes. Data is appended, the view repointed — indexes stay stable.
  let healed = 0;
  {
    const imageViews = new Set((cj.images || []).map((im) => im.bufferView).filter((v) => v != null));
    cj.bufferViews.forEach((bv, i) => {
      if (bv.byteLength > 0) return;
      const data = imageViews.has(i) ? PLACEHOLDER_PNG : Buffer.alloc(4, 0);
      const total = cbin.length + appendLen;
      const pad = total % 4 ? 4 - (total % 4) : 0;
      if (pad) { appended.push(Buffer.alloc(pad, 0)); appendLen += pad; }
      bv.byteOffset = cbin.length + appendLen;
      bv.byteLength = data.length;
      appended.push(data);
      appendLen += data.length;
      healed += 1;
    });
  }

  // Copy one library accessor's underlying bytes into the character buffer; append a
  // fresh bufferView + accessor referencing them; return the new character accessor index.
  const copyAccessor = (library, ai) => {
    const a = library.json.accessors[ai];
    if (!a) throw new Error(`kinetic-transplant: invalid source accessor ${ai}`);
    const bv = library.json.bufferViews[a.bufferView];
    if (!bv) throw new Error(`kinetic-transplant: missing source bufferView for accessor ${ai}`);
    if (a.sparse) throw new Error(`kinetic-transplant: sparse animation accessor ${ai} is unsupported`);
    // A GLB animation library commonly stores many animation accessors in one
    // large bufferView.  Copying that whole view for every sampler made a
    // three-clip mixed bundle exceed 1 GB.  Repack exactly this accessor's
    // values instead, preserving component/type/count while dropping unused
    // neighbouring animation data and source padding/stride.
    const componentBytes = COMP_BYTES[a.componentType];
    const componentCount = TYPE_COUNT[a.type];
    if (!componentBytes || !componentCount) throw new Error(`kinetic-transplant: unsupported accessor type ${a.componentType}/${a.type}`);
    const elementBytes = componentBytes * componentCount;
    const sourceStride = bv.byteStride || elementBytes;
    const sourceStart = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const data = Buffer.alloc(elementBytes * a.count);
    for (let valueIndex = 0; valueIndex < a.count; valueIndex += 1) {
      const from = sourceStart + valueIndex * sourceStride;
      const to = valueIndex * elementBytes;
      library.bin.copy(data, to, from, from + elementBytes);
    }
    const total = cbin.length + appendLen;
    const pad = total % 4 ? 4 - (total % 4) : 0; // 4-byte-align the accessor start
    if (pad) {
      appended.push(Buffer.alloc(pad, 0));
      appendLen += pad;
    }
    const off = cbin.length + appendLen;
    appended.push(data);
    appendLen += data.length;
    // This new view owns only the tightly packed accessor payload.  Retaining
    // the source view's (often whole-library) byteLength makes the GLB claim
    // bytes that were never appended and can make PowerPoint reject/freeze it.
    cj.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: data.length });
    const nacc = {
      bufferView: cj.bufferViews.length - 1,
      byteOffset: 0,
      componentType: a.componentType,
      count: a.count,
      type: a.type,
    };
    if (a.min) nacc.min = a.min;
    if (a.max) nacc.max = a.max;
    if (a.normalized) nacc.normalized = a.normalized;
    cj.accessors.push(nacc);
    return cj.accessors.length - 1;
  };

  const appendFloatAccessor = (rows, type) => {
    const componentCount = TYPE_COUNT[type];
    if (!componentCount || !rows.length) throw new Error(`kinetic-transplant: cannot append empty/unsupported ${type} accessor`);
    const buf = Buffer.alloc(rows.length * componentCount * 4);
    const mn = Array(componentCount).fill(Infinity);
    const mx = Array(componentCount).fill(-Infinity);
    rows.forEach((rawRow, k) => {
      const row = type === 'SCALAR' && !Array.isArray(rawRow) ? [rawRow] : rawRow;
      if (!Array.isArray(row) || row.length !== componentCount) throw new Error(`kinetic-transplant: invalid ${type} row`);
      for (let j = 0; j < componentCount; j++) {
        buf.writeFloatLE(row[j], (k * componentCount + j) * 4);
        if (row[j] < mn[j]) mn[j] = row[j];
        if (row[j] > mx[j]) mx[j] = row[j];
      }
    });
    const total = cbin.length + appendLen;
    const pad = total % 4 ? 4 - (total % 4) : 0;
    if (pad) { appended.push(Buffer.alloc(pad, 0)); appendLen += pad; }
    const off = cbin.length + appendLen;
    appended.push(buf); appendLen += buf.length;
    cj.bufferViews.push({ buffer: 0, byteOffset: off, byteLength: buf.length });
    cj.accessors.push({ bufferView: cj.bufferViews.length - 1, byteOffset: 0, componentType: 5126,
      count: rows.length, type, min: mn, max: mx });
    return cj.accessors.length - 1;
  };

  // Append a NEW rotation accessor whose quaternions are the library's, retargeted from the library's rest onto
  // the character's rest (bind-pose-aware). Decodes the library VEC4, transforms each key, re-encodes as float32.
  const retargetRotationAccessor = (library, ai, boneName) => {
    const qs = readAccessorFloats(library.json, library.bin, ai); // [[x,y,z,w], …]
    const pre = quatMul(charRest[boneName] || [0, 0, 0, 1], quatConj(library.rest[boneName] || [0, 0, 0, 1]));
    const rebased = continuousQuaternionRows(qs.map((q) => quatNorm(quatMul(pre, q))));
    return appendFloatAccessor(rebased, 'VEC4');
  };

  // Translation tracks in Mixamo-derived libraries usually contain the source
  // bone's absolute local rest offset, even when the visible motion is only a
  // root displacement. Copying them verbatim onto a differently proportioned
  // character moves every skinned bone into the source skeleton and tears the
  // mesh. Preserve only the animated delta and rebase it onto the destination.
  const retargetTranslationAccessor = (library, ai, boneName, rootMotionScale = 1, {
    anchor = null,
    maxHorizontalStatures = null,
    maxDisplacementStatures = null,
  } = {}) => {
    const values = readAccessorFloats(library.json, library.bin, ai);
    const sourceRest = library.restTranslation[boneName] || [0, 0, 0];
    const targetRest = charRestTranslation[boneName] || [0, 0, 0];
    const sourceReference = anchor === 'start'
      ? values[0]
      : anchor === 'end'
        ? values[values.length - 1]
        : sourceRest;
    const deltas = values.map(value => value.map((v, axis) => v - sourceReference[axis]));
    let displacementScale = 1;
    if (Number.isFinite(maxDisplacementStatures) && maxDisplacementStatures > 0) {
      const maximumDisplacement = Math.max(...deltas.map(delta => Math.hypot(...delta)));
      const sourceLimit = maxDisplacementStatures * (library.stature || 1);
      if (maximumDisplacement > sourceLimit && sourceLimit > 0) displacementScale = sourceLimit / maximumDisplacement;
    }
    let horizontalScale = 1;
    if (Number.isFinite(maxHorizontalStatures) && maxHorizontalStatures > 0) {
      const ranges = [0, 2].map(axis => {
        const axisValues = deltas.map(value => value[axis]);
        return Math.max(...axisValues) - Math.min(...axisValues);
      });
      const horizontalRange = Math.hypot(...ranges);
      const sourceLimit = maxHorizontalStatures * (library.stature || 1);
      if (horizontalRange > sourceLimit && sourceLimit > 0) horizontalScale = sourceLimit / horizontalRange;
    }
    const accessor = appendFloatAccessor(deltas.map(delta => delta.map((v, axis) => targetRest[axis]
      + rootMotionScale * displacementScale * (axis === 1 ? 1 : horizontalScale) * v)), 'VEC3');
    return { accessor, horizontalScale, displacementScale, anchor };
  };

  const retargetWorldRootAccessor = (library, sampler, context, rootMotionScale, maxHorizontalStatures, maxDisplacementStatures, rootMotionAxes) => {
    const inputAccessor = library.json.accessors[sampler.input];
    const outputAccessor = library.json.accessors[sampler.output];
    const invalid = message => {
      const error = new Error(`kinetic-transplant: ${message}`);
      error.code = 'MOTION_ROOT_WORLD_TRACK_INVALID';
      throw error;
    };
    if (inputAccessor?.componentType !== 5126 || inputAccessor?.type !== 'SCALAR' || inputAccessor.sparse
      || outputAccessor?.componentType !== 5126 || outputAccessor?.type !== 'VEC3' || outputAccessor.sparse
      || !['LINEAR', 'STEP'].includes(sampler.interpolation || 'LINEAR')) invalid('world-root motion requires ordinary FLOAT time/VEC3 tracks');
    const times = readAccessorFloats(library.json, library.bin, sampler.input);
    const values = readAccessorFloats(library.json, library.bin, sampler.output);
    if (!times.length || times.length !== values.length
      || !times.every((value, index) => Number.isFinite(value) && (index === 0 || value > times[index - 1]))
      || !values.every(row => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite))) invalid('world-root motion contains invalid keyframes');
    const sourceReference = values[0];
    const sourceWorldDeltas = values.map(row => quatRotateVector(context.sourceFrame.rotation,
      row.map((value, axis) => (value - sourceReference[axis]) * context.sourceFrame.scale)));
    // In-place is an explicit WORLD-axis policy, not a near-zero travel cap.
    // Filter XZ before displacement limits so rejected horizontal travel cannot
    // shrink the retained jump/crouch height through a combined vector norm.
    const targetWorldDeltas = sourceWorldDeltas.map(row => row.map((value, axis) =>
      rootMotionAxes === 'vertical' && axis !== 1 ? 0 : value * rootMotionScale));
    const maximumDisplacement = Math.max(...targetWorldDeltas.map(row => Math.hypot(...row)));
    const displacementLimit = maxDisplacementStatures * context.targetStature;
    const displacementScale = maximumDisplacement > displacementLimit ? displacementLimit / maximumDisplacement : 1;
    const horizontalRanges = [0, 2].map(axis => {
      const values = targetWorldDeltas.map(row => row[axis] * displacementScale);
      return Math.max(...values) - Math.min(...values);
    });
    const horizontalRange = Math.hypot(...horizontalRanges);
    const horizontalLimit = maxHorizontalStatures * context.targetStature;
    const horizontalScale = horizontalRange > horizontalLimit ? horizontalLimit / horizontalRange : 1;
    const boundedWorldDeltas = targetWorldDeltas.map(row => row.map((value, axis) => value * displacementScale * (axis === 1 ? 1 : horizontalScale)));
    const localRows = boundedWorldDeltas.map(row => quatRotateVector(quatConj(context.targetFrame.rotation), row)
      .map((value, axis) => context.targetAnchor[axis] + value / context.targetFrame.scale));
    const accessor = appendFloatAccessor(localRows, 'VEC3');
    return {
      accessor, horizontalScale, displacementScale, anchor: 'start',
      world: {
        schemaVersion: 'world-root-displacement-v1',
        axes: rootMotionAxes,
        sourceParentRotation: [...context.sourceFrame.rotation], sourceParentUniformScale: context.sourceFrame.scale,
        targetParentRotation: [...context.targetFrame.rotation], targetParentUniformScale: context.targetFrame.scale,
        sourceConstructionStature: context.sourceStature, targetConstructionStature: context.targetStature,
        automaticWorldStatureRatio: context.targetStature / context.sourceStature, requestedWorldScale: rootMotionScale,
        sourceLocalAnchor: [...sourceReference], targetLocalAnchor: [...context.targetAnchor],
        anchor: 'start', sourceKeyCount: times.length, firstTimeSeconds: times[0], lastTimeSeconds: times.at(-1),
        sourceTimeValuesUnchanged: true, nonRootTranslationsPreserved: true, scalesPreserved: true,
        maxDisplacementStatures, maxHorizontalStatures, displacementScale, horizontalScale,
        maximumSourceWorldDisplacement: Math.max(...sourceWorldDeltas.map(row => Math.hypot(...row))),
        maximumTargetWorldDisplacement: Math.max(...boundedWorldDeltas.map(row => Math.hypot(...row))),
        targetHorizontalWorldRange: horizontalRange * horizontalScale,
      },
    };
  };

  // Scale tracks are likewise absolute. Rebase their multiplicative delta so a
  // source rest scale never overwrites the destination rest scale.
  const retargetScaleAccessor = (library, ai, boneName) => {
    const values = readAccessorFloats(library.json, library.bin, ai);
    const sourceRest = library.restScale[boneName] || [1, 1, 1];
    const targetRest = charRestScale[boneName] || [1, 1, 1];
    return appendFloatAccessor(values.map(value => value.map((v, axis) => {
      const denominator = Math.abs(sourceRest[axis]) > 1e-12 ? sourceRest[axis] : 1;
      return targetRest[axis] * (v / denominator);
    })), 'VEC3');
  };

  const globalRetargetRotationAccessors = (library, animation, retargetSpace, sourceRotationReference = 'rest') => {
    const sourceNodes = library.json.nodes || [];
    const targetNodes = cj.nodes || [];
    const sourceParents = parentIndexes(sourceNodes);
    const targetParents = parentIndexes(targetNodes);
    const sourceOrder = hierarchyOrder(sourceParents);
    const targetOrder = hierarchyOrder(targetParents);
    const sourceByName = new Map(sourceNodes.map((node, index) => [node.name, index]).filter(([name]) => name));

    if (retargetSpace === 'world-delta') {
      // Quaternion-only global composition requires rigid positive-uniform TRS
      // on every participating ancestor. Do not silently discard matrix/shear
      // or reflected/nonuniform-scale basis changes in this explicit mode.
      // Imported near-unit rig scales carry ~2e-5 relative roundoff. Permit
      // at most 1e-4 without changing any authored scale value; larger actual
      // anisotropy remains unsupported rather than being silently normalized.
      for (const [nodes, parents, profile] of [[sourceNodes, sourceParents, null], [targetNodes, targetParents, profileNodes]]) {
        const checked = new Set();
        for (const [index, node] of nodes.entries()) {
          if (!node.name || !(nodes === sourceNodes ? cnode[node.name] !== undefined : sourceByName.has(node.name))) continue;
          for (let current = index; current >= 0 && !checked.has(current); current = parents[current]) {
            checked.add(current);
            const item = nodes[current], rest = profile?.[item.name] || item, scale = rest.scale || [1, 1, 1];
            if (item.matrix || !Array.isArray(scale) || scale.length !== 3 || !scale.every(value => Number.isFinite(value) && value > 0)
              || Math.max(...scale) - Math.min(...scale) > 1e-4 * Math.max(...scale)) {
              const error = new Error('world-delta rotations require rigid positive-uniform TRS in the mapped skeleton hierarchy');
              error.code = 'MOTION_WORLD_DELTA_BASIS_INVALID';
              throw error;
            }
          }
        }
      }
    }

    const targetLocalRest = targetNodes.map(node => {
      const profiled = node.name ? profileNodes?.[node.name] : null;
      // A first-frame source reference is an explicit presentation-boundary
      // policy: after the captured baseline is removed, the first emitted key
      // must equal the destination pose PowerPoint shows while stopped. The
      // private construction profile remains the right basis for historical
      // rest-referenced retargeting, but using it here would expose a T-pose
      // whenever the display GLB is intentionally seeded from its 00_idle pose.
      const rotation = sourceRotationReference === 'first-frame'
        ? (Array.isArray(node.rotation) ? node.rotation.slice(0, 4) : [0, 0, 0, 1])
        : (Array.isArray(profiled?.rotation)
          ? profiled.rotation.slice(0, 4)
          : (Array.isArray(node.rotation) ? node.rotation.slice(0, 4) : [0, 0, 0, 1]));
      return quatNorm(rotation);
    });
    const sourceLocalRest = sourceNodes.map(node => quatNorm(Array.isArray(node.rotation)
      ? node.rotation.slice(0, 4)
      : [0, 0, 0, 1]));
    const globalRest = (locals, parents, order) => {
      const globals = Array(locals.length);
      for (const nodeIndex of order) {
        const parent = parents[nodeIndex];
        globals[nodeIndex] = parent < 0 ? locals[nodeIndex] : quatNorm(quatMul(globals[parent], locals[nodeIndex]));
      }
      return globals;
    };
    const sourceGlobalRest = globalRest(sourceLocalRest, sourceParents, sourceOrder);
    const targetGlobalRest = globalRest(targetLocalRest, targetParents, targetOrder);

    const rotationBySourceNode = new Map();
    const uniqueTimes = new Set();
    const interpolationModes = new Set();
    for (const channel of animation.channels || []) {
      if (channel.target?.path !== 'rotation') continue;
      const sampler = animation.samplers?.[channel.sampler];
      if (!sampler) continue;
      const interpolation = String(sampler.interpolation || 'LINEAR').toUpperCase();
      if (interpolation === 'CUBICSPLINE') {
        const error = new Error('kinetic-transplant: global rotation retarget does not accept CUBICSPLINE channels');
        error.code = 'MOTION_GLOBAL_RETARGET_CUBICSPLINE_UNSUPPORTED';
        throw error;
      }
      const times = readAccessorFloats(library.json, library.bin, sampler.input);
      const values = readAccessorFloats(library.json, library.bin, sampler.output);
      if (times.length !== values.length) throw new Error('kinetic-transplant: rotation input/output count mismatch');
      interpolationModes.add(interpolation);
      if (retargetSpace === 'world-delta' && (!['LINEAR', 'STEP'].includes(interpolation) || interpolationModes.size > 1
        || (interpolation === 'STEP' && boundaryBlendSeconds > 0))) {
        const error = new Error('world-delta rotation channels require one consistent LINEAR or STEP interpolation policy; STEP boundary blending is unsupported');
        error.code = 'MOTION_WORLD_DELTA_INTERPOLATION_INVALID';
        throw error;
      }
      for (const time of times) uniqueTimes.add(Number(time));
      rotationBySourceNode.set(channel.target.node, { times, values, interpolation });
    }
    const times = [...uniqueTimes].sort((a, b) => a - b);
    if (!times.length) throw new Error('kinetic-transplant: global rotation retarget needs rotation keyframes');

    const rowsByBone = new Map();
    for (const targetNode of targetNodes) {
      if (targetNode.name && sourceByName.has(targetNode.name)) rowsByBone.set(targetNode.name, []);
    }
    const sourceGlobalPoseAt = time => {
      const sourceGlobalPose = Array(sourceNodes.length);
      for (const nodeIndex of sourceOrder) {
        const channel = rotationBySourceNode.get(nodeIndex);
        const localPose = channel
          ? sampleQuaternion(channel.times, channel.values, channel.interpolation, time)
          : sourceLocalRest[nodeIndex];
        const parent = sourceParents[nodeIndex];
        sourceGlobalPose[nodeIndex] = parent < 0 ? localPose : quatNorm(quatMul(sourceGlobalPose[parent], localPose));
      }
      return sourceGlobalPose;
    };
    // `first-frame` is deliberately computed from the complete source
    // hierarchy, including unmapped intermediary joints. Removing that whole
    // captured baseline is what makes a native take deterministic when its
    // first pose is not a neutral construction rest (for example a BVH bow
    // whose extra Neck1 joint is already pitched upward).
    const sourceReferenceGlobalPose = sourceRotationReference === 'first-frame'
      ? sourceGlobalPoseAt(times[0])
      : null;
    let maxParityErrorDegrees = 0;
    let worstParityBone = null;
    let worstParityTime = null;
    for (const time of times) {
      const sourceGlobalPose = sourceGlobalPoseAt(time);

      const targetGlobalPose = Array(targetNodes.length);
      const targetLocalPose = Array(targetNodes.length);
      for (const nodeIndex of targetOrder) {
        const node = targetNodes[nodeIndex];
        const parent = targetParents[nodeIndex];
        const parentPose = parent < 0 ? [0, 0, 0, 1] : targetGlobalPose[parent];
        const sourceIndex = node.name ? sourceByName.get(node.name) : undefined;
        let desiredGlobal;
        if (sourceIndex !== undefined) {
          // These are distinct authored policies, not interchangeable quaternion
          // orders. Existing global mode carries bone-rest-frame motion. Native
          // BVH (and other world-axis skeletal sources) instead needs the exact
          // world-space change applied BEFORE the destination rest orientation.
          // Keep that choice explicit so established sources never silently flip.
          const worldDelta = retargetSpace === 'world-delta';
          const sourceReference = worldDelta && sourceRotationReference === 'first-frame'
            ? sourceReferenceGlobalPose[sourceIndex]
            : sourceGlobalRest[sourceIndex];
          const sourceRelative = quatNorm(worldDelta
            ? quatMul(sourceGlobalPose[sourceIndex], quatConj(sourceReference))
            : quatMul(quatConj(sourceGlobalRest[sourceIndex]), sourceGlobalPose[sourceIndex]));
          desiredGlobal = quatNorm(worldDelta
            ? quatMul(sourceRelative, targetGlobalRest[nodeIndex])
            : quatMul(targetGlobalRest[nodeIndex], sourceRelative));
          const targetRelative = quatNorm(worldDelta
            ? quatMul(desiredGlobal, quatConj(targetGlobalRest[nodeIndex]))
            : quatMul(quatConj(targetGlobalRest[nodeIndex]), desiredGlobal));
          const parity = quatDegrees(sourceRelative, targetRelative);
          if (parity > maxParityErrorDegrees) {
            maxParityErrorDegrees = parity;
            worstParityBone = node.name;
            worstParityTime = time;
          }
        } else {
          desiredGlobal = quatNorm(quatMul(parentPose, targetLocalRest[nodeIndex]));
        }
        const localPose = parent < 0
          ? desiredGlobal
          : quatNorm(quatMul(quatConj(parentPose), desiredGlobal));
        // Recompose from the local value that will actually be serialized so
        // the parity gate cannot validate an un-emitted intermediate value.
        targetGlobalPose[nodeIndex] = parent < 0
          ? localPose
          : quatNorm(quatMul(parentPose, localPose));
        targetLocalPose[nodeIndex] = localPose;
        if (node.name && rowsByBone.has(node.name)) rowsByBone.get(node.name).push(localPose);
      }
    }
    if (maxParityErrorDegrees > 0.01) {
      const error = new Error(`global retarget parity drift ${maxParityErrorDegrees.toFixed(6)}° on ${worstParityBone} at ${worstParityTime}s`);
      error.code = 'RETARGET_GLOBAL_BASIS_MISMATCH';
      error.maxParityErrorDegrees = maxParityErrorDegrees;
      error.worstParityBone = worstParityBone;
      error.worstParityTime = worstParityTime;
      throw error;
    }
    let outputTimes = times;
    let outputRowsByBone = rowsByBone;
    if (boundaryBlendSeconds > 0) {
      outputTimes = [0, ...times.map(time => time + boundaryBlendSeconds), times[times.length - 1] + 2 * boundaryBlendSeconds];
      outputRowsByBone = new Map([...rowsByBone.entries()].map(([boneName, rows]) => {
        const boundaryRotation = boundaryNodes?.[boneName]?.rotation;
        if (!Array.isArray(boundaryRotation) || boundaryRotation.length !== 4) {
          const error = new Error(`animation boundary pose is missing rotation for ${boneName}`);
          error.code = 'MOTION_BOUNDARY_BONE_MISSING';
          error.boneName = boneName;
          throw error;
        }
        const boundary = quatNorm(boundaryRotation);
        return [boneName, [boundary, ...rows, boundary]];
      }));
    }
    const input = appendFloatAccessor(outputTimes, 'SCALAR');
    const outputsByBone = new Map([...outputRowsByBone.entries()].map(([boneName, rows]) => [
      boneName,
      appendFloatAccessor(continuousQuaternionRows(rows), 'VEC4'),
    ]));
    return { input, outputsByBone, times: outputTimes.length, sourceTimes: times.length, boundaryBlendMs: Number(animationBoundaryBlendMs), rotationReference: sourceRotationReference, sourceReferenceTimeSeconds: sourceRotationReference === 'first-frame' ? times[0] : null, maxParityErrorDegrees, worstParityBone, worstParityTime };
  };

  const newAnims = [];
  const report = [];
  const retargetValidation = [];
  const motionIdToAnimId = {};
  const seenMotionIds = new Set();
  selections.forEach((selection, selectionIndex) => {
    const motionId = String(selection?.motionId || selection?.outputSlug || selection?.sourceSlug || '').trim();
    const sourceSlug = String(selection?.sourceSlug || selection?.slug || '').trim();
    if (!motionId || !sourceSlug) {
      const error = new Error('each motion selection needs motionId and sourceSlug');
      error.code = 'MOTION_SELECTION_INVALID';
      throw error;
    }
    if (seenMotionIds.has(motionId)) {
      const error = new Error(`duplicate motion selection: ${motionId}`);
      error.code = 'MOTION_ID_DUPLICATE';
      throw error;
    }
    seenMotionIds.add(motionId);
    const library = libraryFor(selection, selectionIndex);
    const src = library.bySlug[sourceSlug];
    if (!src) {
      report.push({ motionId, sourceSlug, status: 'MISSING' });
      if (strict) {
        const error = new Error(`motion source ${sourceSlug} is missing for ${motionId}`);
        error.code = 'MOTION_SOURCE_MISSING';
        error.report = report;
        throw error;
      }
      return;
    }
    const selectionRetargetSpace = String(selection.rotationRetargetSpace || rotationRetargetSpace);
    if (!['local', 'global', 'world-delta'].includes(selectionRetargetSpace)) {
      const error = new Error(`unsupported rotation retarget space for ${motionId}: ${selectionRetargetSpace}`);
      error.code = 'MOTION_ROTATION_RETARGET_SPACE_INVALID';
      throw error;
    }
    const selectionRotationReference = selection.rotationReference === undefined
      ? rotationReference
      : String(selection.rotationReference);
    if (!['rest', 'first-frame'].includes(selectionRotationReference)) {
      const error = new Error(`unsupported rotation reference for ${motionId}: ${selectionRotationReference}`);
      error.code = 'MOTION_ROTATION_REFERENCE_INVALID';
      throw error;
    }
    if (selectionRotationReference === 'first-frame' && selectionRetargetSpace !== 'world-delta') {
      const error = new Error(`first-frame rotation references require world-delta retargeting for ${motionId}`);
      error.code = 'MOTION_ROTATION_REFERENCE_UNSUPPORTED';
      throw error;
    }
    if (selectionRetargetSpace === 'world-delta' && (selection.includeBones?.length || selection.excludeBones?.length)) {
      const error = new Error('world-delta retargeting requires the complete mapped skeleton without partial bone filters');
      error.code = 'MOTION_WORLD_DELTA_FILTER_UNSUPPORTED';
      throw error;
    }
    const selectionChannelPolicy = String(selection.channelPolicy || channelPolicy);
    if (!['rotation-only', 'root-motion', 'full-trs'].includes(selectionChannelPolicy)) {
      const error = new Error(`unsupported channel policy for ${motionId}: ${selectionChannelPolicy}`);
      error.code = 'MOTION_CHANNEL_POLICY_INVALID';
      throw error;
    }
    const rootMotionSpace = selection.rootMotionSpace === undefined || selection.rootMotionSpace === null
      ? 'local' : String(selection.rootMotionSpace);
    if (!['local', 'world'].includes(rootMotionSpace)) {
      const error = new Error(`unsupported root-motion space for ${motionId}: ${selection.rootMotionSpace}`);
      error.code = 'MOTION_ROOT_SPACE_INVALID';
      throw error;
    }
    const rootMotionAxes = selection.rootMotionAxes === undefined ? 'all' : selection.rootMotionAxes;
    if (!['all', 'vertical'].includes(rootMotionAxes)
      || (selection.rootMotionAxes !== undefined && (rootMotionSpace !== 'world' || selectionChannelPolicy !== 'root-motion'))) {
      const error = new Error('root-motion axes must be all or vertical under an explicit world-root motion policy');
      error.code = 'MOTION_ROOT_AXES_POLICY_INVALID';
      throw error;
    }
    if (rootMotionSpace === 'world' && (selectionChannelPolicy !== 'root-motion'
      || selection.rootMotionAnchor !== 'start' || boundaryBlendSeconds > 0)) {
      const error = new Error('world-root motion requires root-motion policy, start anchoring and no inserted boundary blend');
      error.code = 'MOTION_ROOT_WORLD_POLICY_INVALID';
      throw error;
    }
    const worldRootContext = rootMotionSpace === 'world'
      ? worldRootMotionContext(library.json.nodes || [], cj.nodes || [], src, rootBoneName, profileNodes) : null;
    const automaticRootMotionScale = worldRootContext
      ? worldRootContext.targetStature / worldRootContext.sourceStature
      : charStature / (library.stature || 1);
    const selectionRootMotionScale = selection.rootMotionScale === undefined
      ? automaticRootMotionScale
      : Number(selection.rootMotionScale);
    if (!Number.isFinite(selectionRootMotionScale) || selectionRootMotionScale <= 0) {
      const error = new Error(`invalid root-motion scale for ${motionId}: ${selection.rootMotionScale}`);
      error.code = 'MOTION_ROOT_SCALE_INVALID';
      throw error;
    }
    const maxHorizontalStatures = selection.rootMotionMaxHorizontalStatures === undefined
      ? (worldRootContext ? 0.5 : null)
      : Number(selection.rootMotionMaxHorizontalStatures);
    if (maxHorizontalStatures !== null && (!Number.isFinite(maxHorizontalStatures) || maxHorizontalStatures <= 0)) {
      const error = new Error(`invalid horizontal root-motion limit for ${motionId}: ${selection.rootMotionMaxHorizontalStatures}`);
      error.code = 'MOTION_ROOT_LIMIT_INVALID';
      throw error;
    }
    const maxDisplacementStatures = selection.rootMotionMaxStatures === undefined
      ? (worldRootContext ? 0.35 : null)
      : Number(selection.rootMotionMaxStatures);
    if (maxDisplacementStatures !== null && (!Number.isFinite(maxDisplacementStatures) || maxDisplacementStatures <= 0)) {
      const error = new Error(`invalid root-motion displacement limit for ${motionId}: ${selection.rootMotionMaxStatures}`);
      error.code = 'MOTION_ROOT_LIMIT_INVALID';
      throw error;
    }
    const rootMotionAnchor = selection.rootMotionAnchor === undefined || selection.rootMotionAnchor === null
      ? null
      : String(selection.rootMotionAnchor).toLowerCase();
    if (rootMotionAnchor !== null && !['start', 'end'].includes(rootMotionAnchor)) {
      const error = new Error(`invalid root-motion anchor for ${motionId}: ${selection.rootMotionAnchor}`);
      error.code = 'MOTION_ROOT_ANCHOR_INVALID';
      throw error;
    }
    const globalRotations = selectionRetargetSpace !== 'local'
      ? globalRetargetRotationAccessors(library, src, selectionRetargetSpace, selectionRotationReference)
      : null;
    // Build samplers PER CHANNEL (not shared) so each rotation output can be retargeted with its bone's rest pair.
    const samplers = [];
    const channels = [];
    let skipped = 0;
    let retargeted = 0;
    let retargetedTranslations = 0;
    let retargetedScales = 0;
    let preservedTranslations = 0;
    let preservedScales = 0;
    let rootMotionHorizontalScale = 1;
    let rootMotionDisplacementScale = 1;
    let rootMotionWorld = null;
    let filteredBones = 0;
    const includeBones = Array.isArray(selection.includeBones) && selection.includeBones.length
      ? new Set(selection.includeBones.map(String))
      : null;
    const excludeBones = new Set((selection.excludeBones || []).map(String));
    src.channels.forEach((ch) => {
      const boneName = library.json.nodes?.[ch.target.node]?.name;
      const cn = boneName ? cnode[boneName] : undefined;
      if (cn === undefined) {
        skipped += 1;
        return;
      }
      if ((includeBones && !includeBones.has(boneName)) || excludeBones.has(boneName)) {
        filteredBones += 1;
        return;
      }
      const sampler = src.samplers[ch.sampler];
      if (ch.target.path === 'translation'
        && selectionChannelPolicy !== 'full-trs'
        && !(selectionChannelPolicy === 'root-motion' && boneName === rootBoneName)) {
        preservedTranslations += 1;
        return;
      }
      if (ch.target.path === 'scale' && selectionChannelPolicy !== 'full-trs') {
        preservedScales += 1;
        return;
      }
      const input = ch.target.path === 'rotation' && globalRotations
        ? globalRotations.input
        : copyAccessor(library, sampler.input);
      let output;
      if (ch.target.path === 'rotation') {
        output = globalRotations
          ? globalRotations.outputsByBone.get(boneName)
          : retargetRotationAccessor(library, sampler.output, boneName); // bind-pose-aware
        if (output === undefined) throw new Error(`kinetic-transplant: global retarget produced no rotation for ${boneName}`);
        retargeted += 1;
      } else if (ch.target.path === 'translation') {
        const translated = worldRootContext && boneName === rootBoneName
          ? retargetWorldRootAccessor(library, sampler, worldRootContext, selectionRootMotionScale, maxHorizontalStatures, maxDisplacementStatures, rootMotionAxes)
          : retargetTranslationAccessor(library, sampler.output, boneName,
          boneName === rootBoneName ? selectionRootMotionScale : 1,
          boneName === rootBoneName ? {
            anchor: rootMotionAnchor,
            maxHorizontalStatures,
            maxDisplacementStatures,
          } : {});
        output = translated.accessor;
        if (boneName === rootBoneName) {
          rootMotionHorizontalScale = translated.horizontalScale;
          rootMotionDisplacementScale = translated.displacementScale;
          if (worldRootContext) rootMotionWorld = translated.world;
        }
        retargetedTranslations += 1;
      } else if (ch.target.path === 'scale') {
        output = retargetScaleAccessor(library, sampler.output, boneName);
        retargetedScales += 1;
      } else {
        output = copyAccessor(library, sampler.output);
      }
      samplers.push({ input, output, interpolation: sampler.interpolation || 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: cn, path: ch.target.path } });
    });
    if (worldRootContext && (!rootMotionWorld || retargetedTranslations !== 1 || retargetedScales !== 0)) {
      const error = new Error('world-root selection must emit exactly one root translation and no scale tracks');
      error.code = 'MOTION_ROOT_WORLD_ROOT_INVALID';
      throw error;
    }
    const outputSlug = String(selection.outputSlug || motionId).trim();
    const animId = newAnims.length;
    newAnims.push({ name: `${String(animId).padStart(2, '0')}_${outputSlug}`, samplers, channels });
    motionIdToAnimId[motionId] = animId;
    if (globalRotations) retargetValidation.push({
      motionId,
      sourceSlug,
      rotationRetargetSpace: selectionRetargetSpace,
      rotationReference: globalRotations.rotationReference,
      sourceReferenceTimeSeconds: globalRotations.sourceReferenceTimeSeconds,
      sampledTimes: globalRotations.times,
      sourceSampledTimes: globalRotations.sourceTimes,
      boundaryBlendMs: globalRotations.boundaryBlendMs,
      maxParityErrorDegrees: globalRotations.maxParityErrorDegrees,
      status: 'PASS',
    });
    report.push({ motionId, sourceSlug, rootMotionScale: selectionRootMotionScale, rootMotionAnchor, rootMotionHorizontalScale, rootMotionDisplacementScale,
      ...(rootMotionWorld ? { rootMotionSpace: 'world', rootMotionWorld } : {}),
      status: `ok policy=${selectionChannelPolicy} basis=${selectionRetargetSpace} ref=${selectionRotationReference} ch=${channels.length} skip=${skipped} filtered=${filteredBones} rot=${retargeted} trans=${retargetedTranslations} scale=${retargetedScales} preserveTrans=${preservedTranslations} preserveScale=${preservedScales}` });
  });

  const finalBin = appended.length ? Buffer.concat([cbin, ...appended]) : cbin;
  cj.animations = newAnims;
  cj.buffers[0].byteLength = finalBin.length;
  delete cj.buffers[0].uri; // ensure it stays GLB-embedded

  // PP-safety gate: never emit a zero-length bufferView (PowerPoint freezes all animation on invalid glTF).
  const zero = cj.bufferViews.map((bv, i) => (bv.byteLength > 0 ? -1 : i)).filter((i) => i >= 0);
  if (zero.length) throw new Error(`kinetic-transplant: zero-length bufferViews ${zero.join(',')} — PP would freeze`);

  return { glb: serializeGlb(cj, finalBin), motionIdToAnimId, report, retargetValidation, clips: newAnims.length, healed };
}

/**
 * Legacy one-library wrapper.  Kept for existing kinetic callers while the
 * Authoring-v3 path uses transplantMotionSet with catalog-owned semantic IDs.
 */
export function transplantKinetic(charBuf, libBuf, slugs, options = {}) {
  const selected = Array.isArray(slugs) ? slugs : [];
  const result = transplantMotionSet(charBuf, selected.map(slug => ({
    motionId: String(slug), sourceSlug: String(slug), outputSlug: String(slug), library: libBuf, libraryKey: 'kinetic',
  })), { strict: false, ...options });
  return { ...result, slugToAnimId: { ...result.motionIdToAnimId } };
}

/** Capture only the private local-TRS rest profile needed by the retargeter. */
export function extractRetargetRestProfile(charBuf) {
  const parsed = parseGlb(charBuf);
  return {
    schemaVersion: 'betterpptx.retarget-rest-profile.v1',
    nodes: Object.fromEntries((parsed.json.nodes || [])
      .filter(node => node.name)
      .map(node => [node.name, {
        rotation: node.rotation ? node.rotation.slice(0, 4) : [0, 0, 0, 1],
        translation: node.translation ? node.translation.slice(0, 3) : [0, 0, 0],
        scale: node.scale ? node.scale.slice(0, 3) : [1, 1, 1],
      }])),
  };
}

// ── Contact frames (peak rotational deviation apex, in ms) ───────────────────
// The director pairs on-screen content to the frame where a gesture "lands". A clip's
// contact = the timestamp of its peak rotational deviation from the first keyframe,
// summed across all rotation channels. Pure float-accessor decode + quaternion math.

function readAccessorFloats(json, bin, accIndex) {
  const a = json.accessors[accIndex];
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const ncomp = TYPE_COUNT[a.type] || 1;
  const cb = COMP_BYTES[a.componentType] || 4;
  const stride = bv.byteStride || ncomp * cb;
  const out = [];
  for (let i = 0; i < a.count; i++) {
    const row = [];
    for (let j = 0; j < ncomp; j++) {
      const o = base + i * stride + j * cb;
      row.push(a.componentType === 5126 ? bin.readFloatLE(o) : bin.readUInt16LE(o)); // FLOAT vs normalized
    }
    out.push(ncomp === 1 ? row[0] : row);
  }
  return out;
}

/** quaternion angular distance (radians) between two [x,y,z,w] */
function quatAngle(a, b) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  d = Math.min(1, Math.abs(d));
  return 2 * Math.acos(d);
}

/**
 * Compute per-clip contact frames from a transplanted GLB.
 * Returns { slug: { contactMs, durationMs } }.
 */
export function computeContacts(glbBuf) {
  const { json, bin } = parseGlb(glbBuf);
  const contacts = {};
  for (const anim of json.animations || []) {
    const slug = anim.name.includes('_') ? anim.name.slice(anim.name.indexOf('_') + 1) : anim.name;
    let bestT = 0;
    let bestDev = -1;
    let dur = 0;
    // accumulate per-timestamp deviation across all rotation channels
    const perT = new Map();
    for (const ch of anim.channels) {
      if (ch.target.path !== 'rotation') continue;
      const s = anim.samplers[ch.sampler];
      const times = readAccessorFloats(json, bin, s.input);
      const vals = readAccessorFloats(json, bin, s.output);
      if (!times.length) continue;
      dur = Math.max(dur, times[times.length - 1]);
      const first = vals[0];
      for (let i = 0; i < times.length; i++) {
        const dev = quatAngle(first, vals[i]);
        perT.set(times[i], (perT.get(times[i]) || 0) + dev);
      }
    }
    for (const [t, dev] of perT) {
      if (dev > bestDev) {
        bestDev = dev;
        bestT = t;
      }
    }
    contacts[slug] = { contactMs: Math.round(bestT * 1000), durationMs: Math.round(dur * 1000) };
  }
  return contacts;
}

// ── Default gesture-intent → kinetic-slug mapping ────────────────────────────
// The 31-clip kinetic pool is athletic/expressive motion. The director speaks in
// GESTURE INTENTS (greet, point, emphasize…). This maps each intent to the kinetic
// move that best embodies it. A deck picks ≤18 of these (the PowerPoint ceiling);
// the chosen order becomes slug→animId, and the intent→animId clipMap derives from it.
export const DEFAULT_KINETIC_INTENTS = {
  idle: 'scanning_lookup',
  greet: 'superhero_landing',
  talk: 'scanning_lookup',
  point: 'skyward_launch',
  emphasize: 'ground_pound',
  magnitude: 'atlas_lift',
  contrast: 'spin_kick',
  enumerate: 'stage_stomp',
  ask: 'scanning_lookup',
  present: 'magical_reveal',
  agree: 'victory_jump',
  bow: 'superhero_landing',
  think: 'scanning_lookup',
  disagree: 'shield_block',
  happy: 'victory_jump',
  surprise: 'backflip',
  walk: 'sprint',
  clap: 'victory_jump',
  reveal: 'magical_reveal',
  power: 'uppercut',
  launch: 'skyward_launch',
  land: 'superhero_landing',
  dodge: 'dive_roll',
  leap: 'heavy_jump',
  strike: 'heavy_kick',
  stretch: 'elastic_stretch',
  fly: 'flying',
};

/**
 * Given the chosen kinetic slugs (in animId order) and an intent→slug map, derive the
 * director's intent→animId clipMap. Intents whose slug isn't in the chosen set fall back
 * to the nearest available slug (or slot 0).
 */
export function deriveIntentClipMap(slugsInOrder, intentMap = DEFAULT_KINETIC_INTENTS) {
  const slugToId = {};
  slugsInOrder.forEach((s, i) => {
    slugToId[s] = i;
  });
  const clipMap = {};
  for (const [intent, slug] of Object.entries(intentMap)) {
    if (slug in slugToId) clipMap[intent] = slugToId[slug];
  }
  // guarantee an idle
  if (clipMap.idle === undefined) clipMap.idle = 0;
  return clipMap;
}
