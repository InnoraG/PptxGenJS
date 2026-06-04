/**
 * PptxGenJS: 3D Model Auto-Fit
 *
 * Derives the am3d transform (meterPerModelUnit + preTrans) from a GLB model's
 * geometry so PowerPoint frames any model correctly. Without this, the library
 * emits one model's hardcoded camera/trans for every model, which shoves most
 * models out of the camera frustum and renders them invisible ("empty").
 *
 * The normalization mirrors what native PowerPoint stores (validated against 49
 * frame instances across 13 reference GLBs):
 *   meterPerModelUnit = 1 / worldMaxExtent   (model's largest axis -> 1 meter)
 *   preTrans          = -worldCenter * mpu * EMU_PER_METER  (center -> origin)
 * Every model is thus normalized to a 1-meter box at the world origin, which the
 * fixed default camera / objViewport / lights frame consistently.
 */
import { SLIDE_OBJECT_TYPES } from './core-enums';
const EMU_PER_METER = 36000000;
const RATIONAL_DENOMINATOR = 1000000;
const GLB_MAGIC = 0x46546c67; // "glTF" little-endian
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON" little-endian
function base64ToBytes(b64) {
    try {
        if (typeof Buffer !== 'undefined')
            return new Uint8Array(Buffer.from(b64, 'base64'));
        // eslint-disable-next-line no-undef
        if (typeof atob === 'function') {
            // eslint-disable-next-line no-undef
            const bin = atob(b64);
            const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++)
                out[i] = bin.charCodeAt(i);
            return out;
        }
    }
    catch (_a) {
        /* fall through */
    }
    return null;
}
/** Parse the JSON chunk out of a binary glTF (GLB) container. */
function parseGlbJson(bytes) {
    if (!bytes || bytes.length < 20)
        return null;
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(0, true) !== GLB_MAGIC)
        return null;
    // header: magic(4) version(4) length(4); first chunk: length(4) type(4) data...
    const chunkLen = view.getUint32(12, true);
    const chunkType = view.getUint32(16, true);
    if (chunkType !== GLB_CHUNK_JSON)
        return null;
    const start = 20;
    const end = start + chunkLen;
    if (end > bytes.length)
        return null;
    let jsonStr = '';
    if (typeof Buffer !== 'undefined') {
        jsonStr = Buffer.from(bytes.buffer, bytes.byteOffset + start, chunkLen).toString('utf8');
    }
    else if (typeof TextDecoder !== 'undefined') {
        // eslint-disable-next-line no-undef
        jsonStr = new TextDecoder('utf-8').decode(bytes.subarray(start, end));
    }
    else {
        return null;
    }
    try {
        return JSON.parse(jsonStr);
    }
    catch (_a) {
        return null;
    }
}
function identity() {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}
function multiply(a, b) {
    const r = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            let s = 0;
            for (let k = 0; k < 4; k++)
                s += a[i * 4 + k] * b[k * 4 + j];
            r[i * 4 + j] = s;
        }
    }
    return r;
}
/** Build a row-major matrix from glTF TRS (translation, rotation-quaternion, scale). */
function fromTRS(t, q, s) {
    const tr = t || [0, 0, 0];
    const qt = q || [0, 0, 0, 1];
    const sc = s || [1, 1, 1];
    const x = qt[0], y = qt[1], z = qt[2], w = qt[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = sc[0], sy = sc[1], sz = sc[2];
    return [
        (1 - (yy + zz)) * sx, (xy - wz) * sy, (xz + wy) * sz, tr[0],
        (xy + wz) * sx, (1 - (xx + zz)) * sy, (yz - wx) * sz, tr[1],
        (xz - wy) * sx, (yz + wx) * sy, (1 - (xx + yy)) * sz, tr[2],
        0, 0, 0, 1,
    ];
}
/** glTF node local matrix (transposes glTF column-major matrix to row-major, or builds from TRS). */
function nodeMatrix(node) {
    const m = node.matrix;
    if (Array.isArray(m) && m.length === 16) {
        return [
            m[0], m[4], m[8], m[12],
            m[1], m[5], m[9], m[13],
            m[2], m[6], m[10], m[14],
            m[3], m[7], m[11], m[15],
        ];
    }
    return fromTRS(node.translation, node.rotation, node.scale);
}
function transformPoint(m, p) {
    return [
        m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3],
        m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7],
        m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
    ];
}
/** Compute the world-space axis-aligned bounding box by walking the scene graph. */
function worldAabb(gltf) {
    const nodes = gltf.nodes;
    const meshes = gltf.meshes;
    const accessors = gltf.accessors;
    if (!nodes || !meshes || !accessors)
        return null;
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let found = false;
    const scenes = gltf.scenes;
    const sceneIdx = typeof gltf.scene === 'number' ? gltf.scene : 0;
    const rootNodes = scenes && scenes[sceneIdx] && Array.isArray(scenes[sceneIdx].nodes)
        ? scenes[sceneIdx].nodes
        : nodes.map((_, i) => i);
    const visit = (nodeIdx, parent) => {
        const node = nodes[nodeIdx];
        if (!node)
            return;
        const world = multiply(parent, nodeMatrix(node));
        const meshIdx = node.mesh;
        if (typeof meshIdx === 'number' && meshes[meshIdx]) {
            const prims = meshes[meshIdx].primitives;
            for (const prim of prims || []) {
                const attrs = prim.attributes;
                const accIdx = attrs ? attrs.POSITION : undefined;
                if (typeof accIdx !== 'number')
                    continue;
                const acc = accessors[accIdx];
                if (!acc || !Array.isArray(acc.min) || !Array.isArray(acc.max))
                    continue;
                const lo = acc.min;
                const hi = acc.max;
                const corners = [
                    [lo[0], lo[1], lo[2]], [hi[0], lo[1], lo[2]], [lo[0], hi[1], lo[2]], [lo[0], lo[1], hi[2]],
                    [hi[0], hi[1], lo[2]], [hi[0], lo[1], hi[2]], [lo[0], hi[1], hi[2]], [hi[0], hi[1], hi[2]],
                ];
                for (const c of corners) {
                    const w = transformPoint(world, c);
                    for (let k = 0; k < 3; k++) {
                        if (w[k] < min[k])
                            min[k] = w[k];
                        if (w[k] > max[k])
                            max[k] = w[k];
                    }
                }
                found = true;
            }
        }
        const children = node.children;
        for (const c of children || [])
            visit(c, world);
    };
    for (const ni of rootNodes)
        visit(ni, identity());
    return found ? { min, max } : null;
}
/** Compute the am3d fit transform (mpu + preTrans) from raw GLB bytes. Returns null on any failure. */
export function computeFitFromGlbBytes(bytes) {
    const gltf = parseGlbJson(bytes);
    if (!gltf)
        return null;
    const box = worldAabb(gltf);
    if (!box)
        return null;
    const ext = [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]];
    const maxExtent = Math.max(ext[0], ext[1], ext[2]);
    if (!Number.isFinite(maxExtent) || maxExtent <= 0)
        return null;
    const center = [(box.max[0] + box.min[0]) / 2, (box.max[1] + box.min[1]) / 2, (box.max[2] + box.min[2]) / 2];
    const mpu = 1 / maxExtent;
    const n = Math.round(mpu * RATIONAL_DENOMINATOR);
    if (n < 1)
        return null;
    return {
        meterPerModelUnit: { n, d: RATIONAL_DENOMINATOR },
        preTrans: {
            dx: Math.round(-center[0] * mpu * EMU_PER_METER),
            dy: Math.round(-center[1] * mpu * EMU_PER_METER),
            dz: Math.round(-center[2] * mpu * EMU_PER_METER),
        },
    };
}
/**
 * For every model3d object on the given slides, derive and apply the geometry-fit
 * transform when the caller has not supplied an explicit `trans` and the model is
 * not raw-XML passthrough. Must run after media encoding (GLB bytes available as
 * base64 in `_relsMedia[].data`) and before slide XML generation.
 */
export function applyModel3DAutoFit(slides) {
    for (const slide of slides || []) {
        const objects = slide._slideObjects;
        if (!objects)
            continue;
        for (const obj of objects) {
            if (obj._type !== SLIDE_OBJECT_TYPES.model3d)
                continue;
            const options = obj.options;
            if (!options || options._model3dXml)
                continue;
            // If the caller fully specified framing (both mpu and preTrans), respect it.
            const existing = options.trans || {};
            if (existing.meterPerModelUnit && existing.preTrans)
                continue;
            const rid = obj.model3dRid;
            if (!rid)
                continue;
            const rel = slide._relsMedia.find(r => r.rId === rid);
            if (!rel || !rel.data)
                continue;
            const bytes = typeof rel.data === 'string' ? base64ToBytes(rel.data) : new Uint8Array(rel.data);
            if (!bytes)
                continue;
            const fit = computeFitFromGlbBytes(bytes);
            // Merge: derived framing fills the gaps; any caller-provided field (rot/scale/
            // postTrans, or an explicit mpu/preTrans) takes precedence.
            if (fit)
                options.trans = Object.assign(Object.assign({}, fit), existing);
        }
    }
}
//# sourceMappingURL=gen-model3d-fit.js.map