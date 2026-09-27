import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { extractRetargetRestProfile, parseGlb, serializeGlb, transplantMotionSet } from '../ir/kinetic-transplant.mjs';

const q = (axis, radians) => [axis === 0 ? Math.sin(radians / 2) : 0,
  axis === 1 ? Math.sin(radians / 2) : 0, axis === 2 ? Math.sin(radians / 2) : 0, Math.cos(radians / 2)];
const hash = buffer => createHash('sha256').update(buffer).digest('hex');
function fixture({ source = false, outerScale = 1, rootScale = null, delta = [10, 20, -30], mutate = null } = {}) {
  const dimension = source ? 100 : 1;
  const angle = Math.PI / 2;
  const nodes = [
    { name: 'OuterRoot', scale: [outerScale, outerScale, outerScale], children: [1] },
    { name: 'Armature', rotation: q(source ? 0 : 1, angle), scale: rootScale || (source ? [0.01, 0.01, 0.01] : [1, 1, 1]), children: [2] },
    { name: 'mixamorig:Hips', rotation: q(source ? 0 : 1, -angle), translation: source ? [0, 0, -100] : [0, 1, 0], children: [3, 4, 5] },
    { name: 'mixamorig:Head', translation: [0, dimension, 0] },
    { name: 'mixamorig:LeftToeBase', translation: [-dimension * 0.1, -dimension, 0] },
    { name: 'mixamorig:RightToeBase', translation: [dimension * 0.1, -dimension, 0] },
  ];
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes,
    materials: [{ name: 'matte', pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }],
    buffers: [{ byteLength: 0 }], bufferViews: [], accessors: [], animations: [] };
  const buffers = [];
  const append = (rows, type) => {
    const width = { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], buffer = Buffer.alloc(rows.length * width * 4);
    rows.forEach((row, i) => (Array.isArray(row) ? row : [row]).forEach((v, a) => buffer.writeFloatLE(v, (i * width + a) * 4)));
    const offset = buffers.reduce((s, b) => s + b.length, 0); buffers.push(buffer);
    json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: buffer.length });
    json.accessors.push({ bufferView: json.bufferViews.length - 1, componentType: 5126, type, count: rows.length });
    return json.accessors.length - 1;
  };
  const input = append([0, 0.5, 1], 'SCALAR');
  const animation = { name: 'probe', samplers: [], channels: [] };
  const track = (index, type, rows) => {
    const output = append(rows, type === 'rotation' ? 'VEC4' : 'VEC3');
    animation.samplers.push({ input, output, interpolation: 'LINEAR' });
    animation.channels.push({ sampler: animation.samplers.length - 1, target: { node: index, path: type } });
  };
  for (let i = 2; i < nodes.length; i++) {
    const t = nodes[i].translation || [0, 0, 0];
    track(i, 'translation', [t, t.map((v, a) => v + (i === 2 ? delta[a] * 0.5 : 0)), t.map((v, a) => v + (i === 2 ? delta[a] : 0))]);
    track(i, 'rotation', [nodes[i].rotation || [0, 0, 0, 1], nodes[i].rotation || [0, 0, 0, 1], nodes[i].rotation || [0, 0, 0, 1]]);
    track(i, 'scale', [[1, 1, 1], [1, 1, 1], [1, 1, 1]]);
  }
  json.animations.push(animation);
  mutate?.(json, { track, append });
  const bin = Buffer.concat(buffers); json.buffers[0].byteLength = bin.length;
  return serializeGlb(json, bin);
}
function readAccessor(model, index) {
  const a = model.json.accessors[index], v = model.json.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], start = (v.byteOffset || 0) + (a.byteOffset || 0), stride = v.byteStride || n * 4;
  return Array.from({ length: a.count }, (_, i) => {
    const row = Array.from({ length: n }, (_, a) => model.bin.readFloatLE(start + i * stride + a * 4));
    return n === 1 ? row[0] : row;
  });
}
function decoded(buffer) {
  const model = parseGlb(buffer), animation = model.json.animations[0];
  return { model, tracks: Object.fromEntries(animation.channels.map(c => {
    const s = animation.samplers[c.sampler];
    return [`${model.json.nodes[c.target.node].name}/${c.target.path}`, { times: readAccessor(model, s.input), values: readAccessor(model, s.output), interpolation: s.interpolation }];
  })) };
}
const selection = library => ({ motionId: 'probe', sourceSlug: 'probe', outputSlug: 'probe', library, channelPolicy: 'root-motion',
  rootMotionSpace: 'world', rootMotionAnchor: 'start', rootMotionMaxStatures: 0.35, rootMotionMaxHorizontalStatures: 0.5 });
const options = target => ({ targetRestProfile: extractRetargetRestProfile(target), rotationRetargetSpace: 'global' });
const close = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('world root uses source and destination parent axes and the full outer-root stature scale', () => {
  const source = fixture({ source: true }), target = fixture({ outerScale: 0.5 });
  const result = transplantMotionSet(target, [selection(source)], options(target));
  const out = decoded(result.glb), track = out.tracks['mixamorig:Hips/translation'];
  assert.deepEqual(track.times, [0, 0.5, 1]);
  // Source world delta is [0.1, 0.3, 0.2]m. Target has half the source
  // stature and a 90deg Y / 0.5 parent, so its LOCAL delta is [-0.2,0.3,0.1].
  track.values[0].forEach((v, a) => close(v, [0, 1, 0][a]));
  track.values[2].forEach((v, a) => close(v, [-0.2, 1.3, 0.1][a]));
  const world = result.report[0].rootMotionWorld;
  close(world.sourceConstructionStature, 2); close(world.targetConstructionStature, 1);
  close(world.automaticWorldStatureRatio, 0.5); close(world.sourceParentUniformScale, 0.01); close(world.targetParentUniformScale, 0.5);
  assert.equal(world.sourceKeyCount, 3); assert.equal(world.displacementScale, 1); assert.equal(world.horizontalScale, 1);
  assert.equal(world.sourceTimeValuesUnchanged, true);
});

test('world root is the only added TRS track and preserves rotations, appearance, scales and original binary', () => {
  const source = fixture({ source: true }), target = fixture({ outerScale: 0.945 });
  const baseline = transplantMotionSet(target, [{ motionId: 'probe', sourceSlug: 'probe', outputSlug: 'probe', library: source }], options(target));
  const result = transplantMotionSet(target, [selection(source)], options(target));
  const before = parseGlb(target), a = decoded(baseline.glb), b = decoded(result.glb);
  assert.deepEqual(b.model.json.nodes, before.json.nodes); assert.deepEqual(b.model.json.materials, before.json.materials);
  assert.ok(b.model.bin.subarray(0, before.bin.length).equals(before.bin));
  assert.deepEqual(b.model.json.accessors.slice(0, before.json.accessors.length), before.json.accessors);
  assert.deepEqual(b.model.json.bufferViews.slice(0, before.json.bufferViews.length), before.json.bufferViews);
  assert.equal(Object.keys(b.tracks).length, 5);
  assert.deepEqual(Object.keys(b.tracks).filter(k => k.endsWith('/translation')), ['mixamorig:Hips/translation']);
  assert.equal(Object.keys(b.tracks).filter(k => k.endsWith('/scale')).length, 0);
  for (const [name, value] of Object.entries(a.tracks)) assert.deepEqual(b.tracks[name], value, `Changed rotation ${name}`);
  assert.deepEqual(result.retargetValidation, baseline.retargetValidation);
});

test('world start anchor retains the existing output root position, not a foreign construction offset', () => {
  const source = fixture({ source: true }), construction = fixture();
  const posed = parseGlb(construction); posed.json.nodes[2].translation = [0.25, 1.1, -0.1];
  const target = serializeGlb(posed.json, posed.bin);
  const result = transplantMotionSet(target, [selection(source)], options(construction));
  const track = decoded(result.glb).tracks['mixamorig:Hips/translation'];
  track.values[0].forEach((v, a) => close(v, posed.json.nodes[2].translation[a]));
  assert.deepEqual(parseGlb(result.glb).json.nodes, posed.json.nodes);
});

test('world limits bound world-space displacement and XZ range without changing original key clocks', () => {
  const source = fixture({ source: true, delta: [1000, 2000, -3000] }), target = fixture({ outerScale: 0.5 });
  const result = transplantMotionSet(target, [{ ...selection(source), rootMotionScale: 10, rootMotionMaxHorizontalStatures: 0.05 }], options(target));
  const world = result.report[0].rootMotionWorld;
  assert.ok(world.displacementScale > 0 && world.displacementScale < 1);
  assert.ok(world.horizontalScale > 0 && world.horizontalScale < 1);
  assert.ok(world.maximumTargetWorldDisplacement <= 0.35 * world.targetConstructionStature + 1e-9);
  assert.ok(world.targetHorizontalWorldRange <= 0.05 * world.targetConstructionStature + 1e-9);
  assert.deepEqual(decoded(result.glb).tracks['mixamorig:Hips/translation'].times, [0, 0.5, 1]);
});

test('vertical world-root policy freezes world XZ while retaining exact source height and clocks', () => {
  const source = fixture({ source: true, delta: [100000, 200000, -30] }), target = fixture({ outerScale: 0.5 });
  const vertical = transplantMotionSet(target, [{ ...selection(source), rootMotionAxes: 'vertical' }], options(target));
  const track = decoded(vertical.glb).tracks['mixamorig:Hips/translation'];
  assert.deepEqual(track.times, [0, 0.5, 1]);
  track.values[0].forEach((v, a) => close(v, [0, 1, 0][a]));
  track.values[1].forEach((v, a) => close(v, [0, 1.15, 0][a]));
  track.values[2].forEach((v, a) => close(v, [0, 1.3, 0][a]));
  const world = vertical.report[0].rootMotionWorld;
  assert.equal(world.axes, 'vertical');
  assert.equal(world.displacementScale, 1, 'large discarded XZ travel must not shrink preserved Y');
  assert.equal(world.horizontalScale, 1);
  assert.equal(world.targetHorizontalWorldRange, 0);
  close(world.maximumTargetWorldDisplacement, 0.15);
  const all = transplantMotionSet(target, [selection(source)], options(target));
  assert.ok(all.report[0].rootMotionWorld.displacementScale < 1);
  for (const [name, value] of Object.entries(decoded(all.glb).tracks)) if (name.endsWith('/rotation')) assert.deepEqual(decoded(vertical.glb).tracks[name], value);
});

test('all-axis world-root default is byte-identical to explicit all; vertical retains declared height limits', () => {
  const source = fixture({ source: true }), target = fixture();
  const omitted = transplantMotionSet(target, [selection(source)], options(target));
  const all = transplantMotionSet(target, [{ ...selection(source), rootMotionAxes: 'all' }], options(target));
  assert.deepEqual(omitted, all);
  const largeJump = fixture({ source: true, delta: [0, 0, -10000] });
  const limited = transplantMotionSet(target, [{ ...selection(largeJump), rootMotionAxes: 'vertical' }], options(target));
  assert.ok(limited.report[0].rootMotionWorld.displacementScale < 1);
  close(limited.report[0].rootMotionWorld.maximumTargetWorldDisplacement, 0.35 * limited.report[0].rootMotionWorld.targetConstructionStature);
  assert.equal(limited.report[0].rootMotionWorld.targetHorizontalWorldRange, 0);
});

test('root-axis options reject unsupported values and non-world or non-root combinations', () => {
  const source = fixture({ source: true }), target = fixture();
  for (const patch of [{ rootMotionAxes: null }, { rootMotionAxes: 'horizontal' }, { rootMotionAxes: ['y'] },
    { rootMotionAxes: 'vertical', rootMotionSpace: undefined }, { rootMotionAxes: 'all', rootMotionSpace: 'local' },
    { rootMotionAxes: 'vertical', channelPolicy: 'rotation-only' }, { rootMotionAxes: 'vertical', channelPolicy: 'full-trs' }]) {
    assert.throws(() => transplantMotionSet(target, [{ ...selection(source), ...patch }], options(target)), error => error.code === 'MOTION_ROOT_AXES_POLICY_INVALID');
  }
});

test('stature forward measurement preserves descendant anisotropy while root inverse frames stay strict', () => {
  const source = fixture({ source: true });
  const target = fixture({ outerScale: 0.5, mutate: json => {
    // An anisotropic, rotated knee lies below Hips and above a toe. It is not
    // an inverse root frame. Its exact affine transform makes left toe Y=-0.5
    // before the outer 0.5 scaling, hence target stature 1.25 (not 1 or 1.5).
    json.nodes[2].children = [3, 5, 6];
    json.nodes.push({ name: 'mixamorig:LeftLeg', rotation: q(2, Math.PI / 2), scale: [2, 3, 1], translation: [0, -0.5, 0], children: [4] });
    json.nodes[4].translation = [-0.5, 0, 0];
  } });
  const result = transplantMotionSet(target, [selection(source)], options(target));
  close(result.report[0].rootMotionWorld.targetConstructionStature, 1.25);
  assert.deepEqual(parseGlb(result.glb).json.nodes, parseGlb(target).json.nodes);
});

test('world defaults are bounded but omitted and explicit local policies have identical bytes and reports', () => {
  const source = fixture({ source: true }), target = fixture({ outerScale: 0.5 });
  const legacy = { ...selection(source), rootMotionSpace: undefined };
  const omitted = transplantMotionSet(target, [legacy], options(target));
  const explicit = transplantMotionSet(target, [{ ...legacy, rootMotionSpace: 'local' }], options(target));
  assert.equal(hash(omitted.glb), hash(explicit.glb)); assert.deepEqual(omitted, explicit);
  assert.ok(!Object.hasOwn(omitted.report[0], 'rootMotionSpace')); assert.ok(!Object.hasOwn(omitted.report[0], 'rootMotionWorld'));
  const world = transplantMotionSet(target, [{ ...selection(source), rootMotionMaxStatures: undefined, rootMotionMaxHorizontalStatures: undefined }], options(target));
  assert.equal(world.report[0].rootMotionWorld.maxDisplacementStatures, 0.35);
  assert.equal(world.report[0].rootMotionWorld.maxHorizontalStatures, 0.5);
});

test('existing local end anchoring and boundary-blended rotation paths remain available', () => {
  const source = fixture({ source: true }), target = fixture();
  const result = transplantMotionSet(target, [{ ...selection(source), rootMotionSpace: undefined, rootMotionAnchor: 'end' }], options(target));
  decoded(result.glb).tracks['mixamorig:Hips/translation'].values.at(-1).forEach((v, a) => close(v, [0, 1, 0][a]));
  const rest = extractRetargetRestProfile(target);
  const blended = transplantMotionSet(target, [{ motionId: 'probe', sourceSlug: 'probe', library: source }], {
    ...options(target), animationBoundaryBlendMs: 500, animationBoundaryPoseProfile: rest,
  });
  assert.equal(blended.retargetValidation[0].boundaryBlendMs, 500);
  assert.equal(blended.retargetValidation[0].sampledTimes, 5);
});

test('world policy rejects wrong mode, anchor, boundary blending, excluded root and missing root tracks', () => {
  const source = fixture({ source: true }), target = fixture();
  for (const patch of [{ rootMotionSpace: 'camera' }, { channelPolicy: 'full-trs' }, { channelPolicy: 'rotation-only' },
    { rootMotionAnchor: undefined }, { rootMotionAnchor: 'end' }, { excludeBones: ['mixamorig:Hips'] }]) {
    assert.throws(() => transplantMotionSet(target, [{ ...selection(source), ...patch }], options(target)), e => e.code?.startsWith('MOTION_ROOT_'));
  }
  assert.throws(() => transplantMotionSet(target, [selection(source)], { ...options(target), animationBoundaryBlendMs: 1,
    animationBoundaryPoseProfile: extractRetargetRestProfile(target) }), e => e.code === 'MOTION_ROOT_WORLD_POLICY_INVALID');
  const noRoot = fixture({ source: true, mutate: json => { json.animations[0].channels = json.animations[0].channels.filter(c => c.target.node !== 2 || c.target.path !== 'translation'); } });
  assert.throws(() => transplantMotionSet(target, [selection(noRoot)], options(target)), e => e.code === 'MOTION_ROOT_WORLD_ROOT_INVALID');
});

test('world motion rejects nonuniform, singular, mirrored and matrix-authored skeletal parent frames', () => {
  const source = fixture({ source: true }), target = fixture();
  for (const rootScale of [[1, 2, 1], [0, 0, 0], [-1, -1, -1]]) {
    const badSource = fixture({ source: true, rootScale });
    const badTarget = fixture({ rootScale });
    assert.throws(() => transplantMotionSet(target, [selection(badSource)], options(target)), e => e.code === 'MOTION_ROOT_WORLD_FRAME_UNSUPPORTED');
    assert.throws(() => transplantMotionSet(badTarget, [selection(source)], options(badTarget)), e => e.code === 'MOTION_ROOT_WORLD_FRAME_UNSUPPORTED');
  }
  const matrix = fixture({ source: true, mutate: json => { json.nodes[1].matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]; } });
  assert.throws(() => transplantMotionSet(target, [selection(matrix)], options(target)), e => e.code === 'MOTION_ROOT_WORLD_FRAME_UNSUPPORTED');
});

test('world motion rejects authored parent animation and invalid root interpolation', () => {
  const target = fixture();
  const animated = fixture({ source: true, mutate: (_json, { track }) => track(1, 'translation', [[0, 0, 0], [0, 0, 1], [0, 0, 2]]) });
  assert.throws(() => transplantMotionSet(target, [selection(animated)], options(target)), e => e.code === 'MOTION_ROOT_WORLD_ANIMATED_PARENT_UNSUPPORTED');
  const cubic = fixture({ source: true, mutate: json => { const c = json.animations[0].channels.find(c => c.target.path === 'translation' && c.target.node === 2); json.animations[0].samplers[c.sampler].interpolation = 'CUBICSPLINE'; } });
  assert.throws(() => transplantMotionSet(target, [selection(cubic)], options(target)), e => e.code === 'MOTION_ROOT_WORLD_TRACK_INVALID');
  const step = fixture({ source: true, mutate: json => { const c = json.animations[0].channels.find(c => c.target.path === 'translation' && c.target.node === 2); json.animations[0].samplers[c.sampler].interpolation = 'STEP'; } });
  assert.equal(decoded(transplantMotionSet(target, [selection(step)], options(target)).glb).tracks['mixamorig:Hips/translation'].interpolation, 'STEP');
});
