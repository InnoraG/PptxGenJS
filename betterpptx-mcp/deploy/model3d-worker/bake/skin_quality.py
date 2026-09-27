"""Skinned-geometry sanity gate for the presenter clip-baker (pygltflib + numpy, MIT).

NO bpy here — like gltf_ops, this runs in the worker process (the GPL boundary stays inside Blender).

WHY THIS EXISTS
---------------
gltf_ops.validate() proves the animation STRUCTURE (animId order, 1 skin, no Draco, COLOR_0) but says
nothing about whether the SKIN WEIGHTS actually deform the mesh sanely. UniRig auto-rigging is
mesh-sensitive: some meshes rig with garbage weights and the performer ships "T1, confidence 1.0, valid"
while being visually collapsed/exploded — a defect only a human eyeballing render_preview used to catch
(2026-07-10 presenter-roster: Avatar_Male smeared into a horizontal streak, Astronaut exploded, Ranger
rendered blank, Singer crushed to a speck — all passed the structural gate).

This module reproduces the render_preview verdict WITHOUT rendering: it applies the exact same linear-blend
skinning PowerPoint/Blender would, at rest AND under each baked gesture pose, and measures the deformed
geometry. Three orthogonal, wide-margin signals (calibrated on the roster; see thresholds below):

  1. DEGENERATE / UNDERSIZED rest geometry — the baked mesh is flattened to ~target_height; a rest bbox an
     order of magnitude smaller means the bind pose collapsed (Ranger 0.0, Singer 0.08 vs good 1.1-1.65).
  2. POSED EXPLOSION — worst gesture-frame deformed bbox diagonal / rest diagonal. Bad weights fling the
     mesh apart when a joint rotates (Avatar_Male 22x, Astronaut 21x vs good <=1.12).
  3. OUTLIER VERTICES — fraction of verts flung far from the posed centroid (Avatar_Male 0.46, Astronaut
     0.49 vs good 0.0).

Plus a TIER pass-through: UniRig/normalize already emits a skeleton-labeling tier+confidence; T3 (labeling
failed) is a real signal that was being ignored (Singer was T3 / conf 0.064).

assess() never raises on a broken mesh — it returns renderable=False + reasons so the caller can reject or
tier-down. It DOES raise (GLB unreadable / no skin) only when the input isn't a skinned GLB at all.
"""
import numpy as np
from pygltflib import GLTF2

# --- accessor decoding ----------------------------------------------------------------------------
_NCOMP = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
_NPTYPE = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
_NORM_DIV = {5121: 255.0, 5123: 65535.0, 5120: 127.0, 5122: 32767.0}

# --- gate thresholds (calibrated 2026-07-10 on research-demos/2026-07-10-presenter-roster) ---------
# Good performers cluster far from every bound; every threshold sits in the empty gap between the
# tightest good value and the loosest bad value, so none is a knife-edge.
MIN_SIZE_FRAC = 0.25       # baked max rest dim must be >= this * target_height (good >=0.62x; bad <=0.22x)
POSED_GROWTH_MAX = 3.0     # worst posed bbox diagonal / rest diagonal (good <=1.12; bad 21-22)
POSED_OUTLIER_MAX = 0.03   # worst fraction of verts flung far under a pose (good 0.0; bad 0.46-0.49)
OUTLIER_RADIUS_K = 8.0     # a vertex is an outlier when its centroid distance > K * median distance
DEGENERATE_ABS = 1e-3      # any rest dim at/below this => collapsed to a line/point (Ranger)
REJECT_TIERS = {"T3"}      # UniRig/normalize skeleton-labeling tiers that hard-fail the performer


def _read_accessor(g, blob, idx):
    """Decode a glTF accessor to an (count, ncomp) float64 array. Handles packed + interleaved bufferViews."""
    a = g.accessors[idx]
    if getattr(a, "sparse", None) is not None:
        raise ValueError("sparse accessors are not supported by the skin-quality gate")
    ncomp = _NCOMP[a.type]
    npty = _NPTYPE[a.componentType]
    itemsize = np.dtype(npty).itemsize
    bv = g.bufferViews[a.bufferView]
    base = (bv.byteOffset or 0) + (a.byteOffset or 0)
    comp_bytes = ncomp * itemsize
    stride = bv.byteStride or comp_bytes
    if stride == comp_bytes:
        arr = np.frombuffer(blob, dtype=npty, count=a.count * ncomp, offset=base).reshape(a.count, ncomp)
    else:  # interleaved: take the first comp_bytes of each stride-sized row
        raw = np.frombuffer(blob, dtype=np.uint8, count=stride * a.count, offset=base).reshape(a.count, stride)
        arr = raw[:, :comp_bytes].copy().view(npty).reshape(a.count, ncomp)
    out = arr.astype(np.float64)
    if a.normalized and a.componentType in _NORM_DIV:
        out = out / _NORM_DIV[a.componentType]
        if a.componentType in (5120, 5122):
            out = np.maximum(out, -1.0)
    return out


# --- transforms -----------------------------------------------------------------------------------
def _quat_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w), 0.0],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w), 0.0],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y), 0.0],
        [0.0, 0.0, 0.0, 1.0],
    ], dtype=np.float64)


def _local_matrix(n, override):
    if n.matrix and not override:
        return np.array(n.matrix, dtype=np.float64).reshape(4, 4).T  # glTF matrix is column-major
    o = override or {}
    t = o.get("t", n.translation or [0.0, 0.0, 0.0])
    r = o.get("r", n.rotation or [0.0, 0.0, 0.0, 1.0])
    s = o.get("s", n.scale or [1.0, 1.0, 1.0])
    T = np.eye(4); T[:3, 3] = t
    S = np.eye(4); S[0, 0], S[1, 1], S[2, 2] = s
    return T @ _quat_mat(r) @ S


def _global_transforms(g, overrides):
    """Walk the scene graph accumulating node transforms; returns {node_idx: 4x4 global}. `overrides` maps a
    node index to a partial {'t','r','s'} TRS (an animation pose); unlisted channels keep the node's rest TRS."""
    scene = g.scenes[g.scene or 0]
    out = {}

    def visit(ni, parent):
        m = parent @ _local_matrix(g.nodes[ni], overrides.get(ni))
        out[ni] = m
        for c in (g.nodes[ni].children or []):
            visit(c, m)

    for ri in (scene.nodes or []):
        visit(ri, np.eye(4))
    return out


def _pose_overrides(g, blob, anim, t):
    """Sample one animation at time t (nearest keyframe) -> {node_idx: {'t'|'r'|'s': value}}. Nearest (not
    interpolated) is sufficient for a sanity gate and sidesteps quaternion slerp; the goal is to see whether
    ANY baked pose blows the mesh apart, and the keyframes are the poses that ship."""
    ov = {}
    for ch in anim.channels:
        if ch.target.node is None:
            continue
        smp = anim.samplers[ch.sampler]
        times = _read_accessor(g, blob, smp.input)[:, 0]
        vals = _read_accessor(g, blob, smp.output)
        k = int(np.argmin(np.abs(times - t)))
        slot = {"translation": "t", "rotation": "r", "scale": "s"}.get(ch.target.path)
        if slot:
            ov.setdefault(ch.target.node, {})[slot] = vals[k]
    return ov


def _anim_time_mid(g, blob, anim):
    lo, hi = np.inf, -np.inf
    for smp in anim.samplers:
        times = _read_accessor(g, blob, smp.input)
        lo = min(lo, float(times.min())); hi = max(hi, float(times.max()))
    return lo + (hi - lo) * 0.5


def _load_skin(path):
    """Return (gltf, blob, skin, ibm, prims) where prims is a list of (POSITION, JOINTS_0 int, WEIGHTS_0)."""
    g = GLTF2().load(path)
    blob = g.binary_blob()
    if not g.skins:
        raise ValueError("no skin in GLB (not a skinned performer)")
    skin = g.skins[0]
    ibm = _read_accessor(g, blob, skin.inverseBindMatrices).reshape(-1, 4, 4).transpose(0, 2, 1)
    prims = []
    for m in (g.meshes or []):
        for p in m.primitives:
            attrs = p.attributes
            if attrs.POSITION is None or getattr(attrs, "JOINTS_0", None) is None or getattr(attrs, "WEIGHTS_0", None) is None:
                continue  # static (unskinned) primitive — skip; skin quality is about the deformed body
            P = _read_accessor(g, blob, attrs.POSITION)
            J = _read_accessor(g, blob, attrs.JOINTS_0).astype(np.int64)
            W = _read_accessor(g, blob, attrs.WEIGHTS_0)
            prims.append((P, J, W))
    if not prims:
        raise ValueError("no skinned primitives (JOINTS_0/WEIGHTS_0) in GLB")
    return g, blob, skin, ibm, prims


def _skin_positions(prims, joint_mats):
    """Linear-blend skinning: for each vertex, sum_i w_i * (jointMatrix[joint_i] @ poseless_vertex)."""
    outs = []
    for P, J, W in prims:
        Ph = np.concatenate([P, np.ones((len(P), 1))], axis=1)
        acc = np.zeros((len(P), 3))
        for i in range(J.shape[1]):
            d = np.einsum("nij,nj->ni", joint_mats[J[:, i]], Ph)
            acc += W[:, i:i + 1] * d[:, :3]
        outs.append(acc)
    return np.concatenate(outs, axis=0)


def _joint_mats(g, skin, ibm, overrides):
    gl = _global_transforms(g, overrides)
    jm = np.tile(np.eye(4), (len(skin.joints), 1, 1))
    for k, jn in enumerate(skin.joints):
        if jn in gl:
            jm[k] = gl[jn] @ ibm[k]
    return jm


def _bbox_and_outliers(V):
    dims = V.max(axis=0) - V.min(axis=0)
    centroid = np.median(V, axis=0)
    dist = np.linalg.norm(V - centroid, axis=1)
    med = float(np.median(dist)) or 1e-9
    outlier_frac = float(np.mean(dist > OUTLIER_RADIUS_K * med))
    return dims, outlier_frac


def assess(path, target_height=1.8, tier=None, confidence=None, max_clips=None):
    """Skin-quality gate for a baked performer GLB. Returns a verdict dict:

        {"renderable": bool, "reasons": [...], "metrics": {...}, "thresholds": {...}}

    `target_height` is the flatten target (model3d_app.RENDER_TARGET_HEIGHT_M); the size floor is relative to
    it. `tier`/`confidence` come from the normalize sidecar (skeleton labeling) and are folded into the verdict.
    `max_clips` caps how many animations are pose-sampled (None = all; the baked set is small, 18).
    """
    g, blob, skin, ibm, prims = _load_skin(path)

    rest = _skin_positions(prims, _joint_mats(g, skin, ibm, {}))
    rest_dims, rest_outlier = _bbox_and_outliers(rest)
    rest_max = float(rest_dims.max())
    rest_diag = float(np.linalg.norm(rest_dims)) or 1e-9

    anims = list(g.animations or [])
    if max_clips is not None:
        anims = anims[:max_clips]
    worst_growth, worst_growth_clip = 0.0, None
    worst_outlier, worst_outlier_clip = 0.0, None
    for anim in anims:
        t = _anim_time_mid(g, blob, anim)
        V = _skin_positions(prims, _joint_mats(g, skin, ibm, _pose_overrides(g, blob, anim, t)))
        dims, outlier = _bbox_and_outliers(V)
        growth = float(np.linalg.norm(dims)) / rest_diag
        if growth > worst_growth:
            worst_growth, worst_growth_clip = growth, anim.name
        if outlier > worst_outlier:
            worst_outlier, worst_outlier_clip = outlier, anim.name

    size_floor = MIN_SIZE_FRAC * float(target_height)
    reasons = []
    if rest_max <= DEGENERATE_ABS or float(rest_dims.min()) <= DEGENERATE_ABS:
        reasons.append(f"degenerate rest geometry: dims {rest_dims.round(4).tolist()} (a dim collapsed to ~0)")
    if rest_max < size_floor:
        reasons.append(f"undersized rest mesh: max dim {rest_max:.3f} < {size_floor:.3f} "
                       f"({MIN_SIZE_FRAC:.2f}x target {target_height}) — bind pose collapsed")
    if worst_growth > POSED_GROWTH_MAX:
        reasons.append(f"posed explosion: clip {worst_growth_clip!r} grows bbox {worst_growth:.1f}x rest "
                       f"(> {POSED_GROWTH_MAX}x) — bad skin weights fling the mesh apart")
    if worst_outlier > POSED_OUTLIER_MAX:
        reasons.append(f"outlier vertices: clip {worst_outlier_clip!r} flings {worst_outlier:.1%} of verts "
                       f"far from the body (> {POSED_OUTLIER_MAX:.0%}) — bad skin weights")
    if tier is not None and str(tier) in REJECT_TIERS:
        reasons.append(f"skeleton labeling tier {tier} (confidence {confidence}) — UniRig rig unusable")

    return {
        "renderable": not reasons,
        "reasons": reasons,
        "metrics": {
            "restDims": [round(float(x), 4) for x in rest_dims],
            "restMaxDim": round(rest_max, 4),
            "sizeFrac": round(rest_max / float(target_height), 4) if target_height else None,
            "restOutlier": round(rest_outlier, 4),
            "worstGrowth": round(worst_growth, 3),
            "worstGrowthClip": worst_growth_clip,
            "worstOutlier": round(worst_outlier, 4),
            "worstOutlierClip": worst_outlier_clip,
            "sampledClips": len(anims),
            "vertexCount": int(sum(len(P) for P, _, _ in prims)),
            "tier": tier,
            "confidence": confidence,
        },
        "thresholds": {
            "minSizeFrac": MIN_SIZE_FRAC, "sizeFloor": round(size_floor, 4),
            "posedGrowthMax": POSED_GROWTH_MAX, "posedOutlierMax": POSED_OUTLIER_MAX,
            "outlierRadiusK": OUTLIER_RADIUS_K, "rejectTiers": sorted(REJECT_TIERS),
        },
    }


if __name__ == "__main__":  # local calibration/verification: python skin_quality.py <glb> [<glb> ...]
    import json
    import sys
    for p in sys.argv[1:]:
        try:
            v = assess(p)
            m = v["metrics"]
            flag = "RENDERABLE " if v["renderable"] else "REJECT     "
            print(f"{flag} {p.split('/')[-1]}")
            print(f"    size={m['restMaxDim']} (frac {m['sizeFrac']})  growth={m['worstGrowth']} "
                  f"[{m['worstGrowthClip']}]  outlier={m['worstOutlier']} [{m['worstOutlierClip']}]  verts={m['vertexCount']}")
            for r in v["reasons"]:
                print(f"    - {r}")
        except Exception as e:
            print(f"ERROR      {p.split('/')[-1]}: {e}")
