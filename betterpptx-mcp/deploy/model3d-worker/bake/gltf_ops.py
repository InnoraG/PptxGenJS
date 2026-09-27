"""Pure-Python (pygltflib, MIT) glTF post-processing for the presenter clip-baker.

NO bpy here — this runs in the worker process (the GPL boundary stays inside the Blender subprocess).
Two jobs, both load-bearing against the `embedded{animId+1}` parity guard (verify-3d-embed-parity.mjs):

  1. reorder_animations() — force gltf.animations[] into the frozen clipMap order so index == animId.
     Blender's exporter does NOT guarantee animations[] order matches NLA/action order, and its sort key
     has regressed across versions. Reordering the top-level animations list is safe: each animation's
     samplers reference accessors by absolute index, unaffected by the list order.

  2. validate() — the loud-failure gate. A silent off-by-one plays the WRONG gesture in a sold deck, so
     every check RAISES; nothing is a warning.
"""
import numpy as np
from pygltflib import GLTF2, Node

_BLOCKED_EXTS = {"KHR_draco_mesh_compression", "EXT_meshopt_compression"}

# PowerPoint's model3d viewer renders a ~1-unit model as a speck but AUTO-FITS any model above a size threshold
# to its frame (verified: targets 60/90/120 render identically). Blender's glTF round-trip in the Baker
# normalizes every performer down to ~1 unit (a 0.01 root scale + unit-height canonical rig), landing it BELOW
# that threshold. normalize_scale rescales (+ centers) the baked GLB to RENDER_TARGET_HEIGHT so PP fits it to the
# frame instead of rendering a speck. NOTE: this fixes SIZE only; camera FRAMING (pitch/crop) is separate (the
# stage3d camera / model up-axis) and still needs tuning — a real performer currently frames its lower body.
RENDER_TARGET_HEIGHT = 100.0


def _quat_to_mat(q):
    x, y, z, w = q
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ], dtype=float)


def _node_matrix(n):
    if n.matrix:  # glTF matrix is column-major (16 floats)
        return np.array(n.matrix, dtype=float).reshape(4, 4).T
    m = np.eye(4)
    if n.translation:
        m[:3, 3] = n.translation
    r = np.eye(4)
    if n.rotation:
        r[:3, :3] = _quat_to_mat(n.rotation)
    s = np.eye(4)
    if n.scale:
        s[0, 0], s[1, 1], s[2, 2] = n.scale
    return m @ r @ s


def _world_mesh_bbox(g):
    """World-space bbox of all mesh nodes at rest pose (walk the scene graph accumulating node transforms)."""
    scene = g.scenes[g.scene or 0]
    lo = np.array([1e30] * 3)
    hi = np.array([-1e30] * 3)
    found = False

    def visit(ni, parent):
        nonlocal lo, hi, found
        n = g.nodes[ni]
        world = parent @ _node_matrix(n)
        if n.mesh is not None:
            for pr in g.meshes[n.mesh].primitives:
                acc = g.accessors[pr.attributes.POSITION]
                if acc.min and acc.max:
                    mn, mx = acc.min, acc.max
                    for cx in (mn[0], mx[0]):
                        for cy in (mn[1], mx[1]):
                            for cz in (mn[2], mx[2]):
                                wc = world @ np.array([cx, cy, cz, 1.0])
                                lo = np.minimum(lo, wc[:3])
                                hi = np.maximum(hi, wc[:3])
                                found = True
        for c in (n.children or []):
            visit(c, world)

    for ri in (scene.nodes or []):
        visit(ri, np.eye(4))
    return (lo, hi) if found else (None, None)


def normalize_scale(in_path, out_path, target_height=RENDER_TARGET_HEIGHT):
    """Rescale + CENTER the baked GLB so its rendered height == target_height and its bbox center sits at the
    origin (the model3d camera's focal point) — fills the PP frame without cropping/off-centering. Adds a single
    scale+translate root above the existing scene roots (scales mesh + skin + animation together; safe)."""
    g = GLTF2().load(in_path)
    lo, hi = _world_mesh_bbox(g)
    if lo is None:
        g.save(out_path)
        return 1.0, 0.0
    height = float(max(hi - lo))  # largest world extent = the framing dimension
    if height <= 1e-9:
        g.save(out_path)
        return 1.0, 0.0
    s = float(target_height) / height
    center = (lo + hi) / 2.0
    # node transform is T * S; to land the scaled bbox center on the origin, translate by -s*center.
    trans = [float(-s * center[0]), float(-s * center[1]), float(-s * center[2])]
    scene = g.scenes[g.scene or 0]
    root = Node(scale=[s, s, s], translation=trans, children=list(scene.nodes or []))
    g.nodes.append(root)
    scene.nodes = [len(g.nodes) - 1]
    g.save(out_path)
    return s, height


def normalize_materials(in_path, out_path=None):
    """Force every material MATTE + non-metallic: metallicFactor=0, roughnessFactor=1.0, drop the
    metallic-roughness map. Human presenters (skin/cloth/hair) are never metallic or glossy — but some
    FBX->glTF conversions leak metallicFactor=0.5 (Mixamo 'Joe' did), which PowerPoint's studio-environment
    renderer turns into a GLASS/plastic sheen. This pure-Python pass (no bpy) fixes it deterministically for
    EVERY baked performer regardless of source (FBX / UniRig / TRELLIS). baseColorTexture (the albedo look) is
    untouched. Returns the number of materials normalized. Saves in place unless out_path is given."""
    g = GLTF2().load(in_path)
    n = 0
    for m in (g.materials or []):
        pbr = m.pbrMetallicRoughness
        if pbr is None:
            continue
        pbr.metallicFactor = 0.0
        pbr.roughnessFactor = 1.0
        pbr.metallicRoughnessTexture = None
        n += 1
    g.save(out_path or in_path)
    return n


def slim_textures(in_path, out_path=None, color_cap=512, normal_cap=512, jpeg_quality=82):
    """LOADER-SAFE size reduction: downscale + recompress textures, and DROP any image no material
    still references (matte-normalize leaves spec/gloss maps unused). NO Draco/KTX2/meshopt — output
    stays plain PNG/JPEG that PowerPoint's glTF loader definitely renders. Mixamo characters ship 4K
    PNG normal+diffuse (~60MB). Default caps are 512 — OWNER-DECIDED (2026-07-13): "we are in presentation not
    in a movie, the most important is size; if something is not visible to eyes then it is ok" (a 1024 build was
    offered and declined after visual review). Callers can pass higher caps (1024) for a close-up hero shot or
    lower (256/384) to squeeze further. The ANIMATION keyframes (kinetic quality/fluidity) are a SEPARATE buffer
    and are never touched.
    Preserves every bufferView INDEX so accessors/animations stay valid. Dropped images become a 1x1
    transparent-PNG PLACEHOLDER — NEVER zero-length: a byteLength=0 bufferView is invalid glTF and makes
    PowerPoint's stricter loader silently refuse to play ANY animation (the model renders as a frozen rest
    pose; isolated 2026-07-13, research-demos/2026-07-12-presenter-cofire/isolate_strip.png).
    No-op (returns {'skipped':'no-PIL'}) if Pillow is unavailable. Returns a per-image report."""
    try:
        import io as _io
        from PIL import Image
    except Exception:
        return {'skipped': 'no-PIL'}
    g = GLTF2().load(in_path)
    if not g.images:
        return {'images': 0}
    blob = g.binary_blob()

    used_tex = set()
    def _add(t):
        if t is None:
            return
        if hasattr(t, 'index'):
            used_tex.add(t.index)
        elif isinstance(t, dict) and t.get('index') is not None:
            used_tex.add(t['index'])
        elif isinstance(t, int):
            used_tex.add(t)
    for m in (g.materials or []):
        pbr = m.pbrMetallicRoughness
        if pbr:
            _add(pbr.baseColorTexture); _add(pbr.metallicRoughnessTexture)
        _add(m.normalTexture); _add(m.occlusionTexture); _add(m.emissiveTexture)
        # EXTENSION texture refs count as used too — a scan that misses them replaces a REFERENCED map with the
        # placeholder (learned the hard way: Ch33_body references its Specular via KHR_materials_specular; zeroing
        # it forces specular strength to 0 in any renderer honoring the extension). Walk every material extension
        # dict for *Texture entries generically so new extensions can't repeat this bug.
        for ext in (m.extensions or {}).values():
            if isinstance(ext, dict):
                for k, v in ext.items():
                    if k.endswith('Texture') and isinstance(v, dict):
                        _add(v.get('index'))
    used_img = {g.textures[t].source for t in used_tex if g.textures[t].source is not None}
    normal_imgs = {g.textures[m.normalTexture.index].source for m in (g.materials or [])
                   if m.normalTexture is not None}

    report, new_bytes = {'dropped': [], 'kept': []}, {}
    for i, im in enumerate(g.images or []):
        if im.bufferView is None:
            continue
        bv = g.bufferViews[im.bufferView]
        raw = blob[bv.byteOffset: bv.byteOffset + bv.byteLength]
        if i not in used_img:
            ph = _io.BytesIO()
            Image.new('RGBA', (1, 1), (0, 0, 0, 0)).save(ph, 'PNG')
            new_bytes[im.bufferView] = ph.getvalue()  # valid 1x1 PNG, never zero-length (PP freezes on byteLength=0)
            im.mimeType = 'image/png'
            report['dropped'].append(im.name or f'img{i}')
            continue
        pil = Image.open(_io.BytesIO(raw))
        is_normal = i in normal_imgs
        cap = normal_cap if is_normal else color_cap
        if max(pil.size) > cap:
            s = cap / max(pil.size)
            pil = pil.resize((round(pil.width * s), round(pil.height * s)), Image.LANCZOS)
        out = _io.BytesIO()
        has_alpha = pil.mode in ('RGBA', 'LA') or (pil.mode == 'P' and 'transparency' in pil.info)
        if is_normal or has_alpha:
            pil.save(out, 'PNG', optimize=True); im.mimeType = 'image/png'
        else:
            pil.convert('RGB').save(out, 'JPEG', quality=jpeg_quality, optimize=True); im.mimeType = 'image/jpeg'
        new_bytes[im.bufferView] = out.getvalue()
        report['kept'].append({'name': im.name or f'img{i}', 'px': list(pil.size), 'bytes': len(out.getvalue())})

    parts, offset = [], 0
    for idx, bv in enumerate(g.bufferViews):
        data = new_bytes.get(idx, blob[bv.byteOffset: bv.byteOffset + bv.byteLength])
        pad = (-len(data)) % 4
        bv.byteOffset, bv.byteLength = offset, len(data)
        parts.append(data + b'\x00' * pad)
        offset += len(data) + pad
    newblob = b''.join(parts)
    g.buffers[0].byteLength = len(newblob)
    g.set_binary_blob(newblob)
    # PP-safety gate: a zero-length bufferView is invalid glTF and freezes ALL animation in PowerPoint.
    zero = [i for i, bv in enumerate(g.bufferViews) if not bv.byteLength]
    if zero:
        raise GateError(f"slim_textures produced zero-length bufferViews {zero} — PP would render a frozen model")
    g.save(out_path or in_path)
    report['bytes'] = len(newblob)
    return report


_COMP = {5126: ('<f4', 4), 5125: ('<u4', 4), 5123: ('<u2', 2), 5121: ('<u1', 1), 5122: ('<i2', 2), 5120: ('<i1', 1)}
_TYPE_N = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def _read_accessor(g, blob, ai):
    """Decode a FLOAT accessor to an (count, N) float32 array (honors bufferView byteStride)."""
    a = g.accessors[ai]; bv = g.bufferViews[a.bufferView]
    dt, sz = _COMP[a.componentType]; n = _TYPE_N[a.type]
    start = (bv.byteOffset or 0) + (a.byteOffset or 0)
    stride = bv.byteStride or (n * sz)
    out = np.empty((a.count, n), dtype=np.float32)
    for i in range(a.count):
        out[i] = np.frombuffer(blob, dtype=np.dtype(dt), count=n, offset=start + i * stride).astype(np.float32)
    return out

def compute_contacts(in_path, samples=48):
    """CONTACT-FRAME metadata per clip: the ms offset of each gesture's APEX/impact — the moment a paired
    content effect should fire (point fully extended, clap hands meet, kick contact). Measured as the frame of
    PEAK total rotational deviation from the clip's rest pose (frame 0), summed over all bone rotation channels
    — deterministic, pure pygltflib+numpy, no render. Idle/loop clips have no true apex (harmless — contactMs
    is only consumed for the gesture that CAUSES a paired effect). Returns [{name, animId, durationMs, contactMs,
    contactFrac, method}]. Consumed by the presenter-director's content pairing (delay = contactMs)."""
    g = GLTF2().load(in_path)
    blob = g.binary_blob()
    out = []
    for ai, anim in enumerate(g.animations or []):
        rot, dur = [], 0.0
        for ch in (anim.channels or []):
            if ch.target is None or ch.target.path != 'rotation':
                continue
            s = anim.samplers[ch.sampler]
            t = _read_accessor(g, blob, s.input)[:, 0]
            q = _read_accessor(g, blob, s.output)
            if len(t):
                dur = max(dur, float(t[-1]))
                rot.append((t, q))
        name = anim.name or f'anim{ai}'
        if not rot or dur <= 0:
            ms = int(round(0.4 * dur * 1000))
            out.append({'name': name, 'animId': ai, 'durationMs': int(round(dur * 1000)), 'contactMs': ms, 'contactFrac': 0.4, 'method': 'fallback'})
            continue
        ts = np.linspace(0, dur, samples)
        dev = np.zeros(samples)
        for (t, q) in rot:
            idx = np.searchsorted(t, ts, side='right').clip(1, len(t)) - 1
            d = np.abs((q[idx] * q[0]).sum(axis=1)).clip(0.0, 1.0)  # |dot(q_t, q_rest)|
            dev += 2.0 * np.arccos(d)                               # quaternion angular distance (radians)
        ci = int(np.argmax(dev))
        out.append({'name': name, 'animId': ai, 'durationMs': int(round(dur * 1000)),
                    'contactMs': int(round(float(ts[ci]) * 1000)), 'contactFrac': round(float(ts[ci] / dur), 3),
                    'method': 'peak-rot-deviation'})
    return out


class GateError(AssertionError):
    """Raised when a baked GLB violates the frozen clip contract. Fails the run, never a warning."""


def _canonical_clip_key(name):
    """Normalize a baked animation name to its frozen-contract clip key.

    Blender's glTF exporter in ACTIONS mode appends the armature OBJECT name to every animation
    (action '00_idle' on armature 'canonical' -> glTF animation '00_idle_canonical'). The action
    names are already the exact frozen clip_names, so strip that trailing '_canonical' suffix to
    recover the contract name. Names that already match the contract pass through unchanged, so this
    is backward-compatible with libraries baked without the suffix."""
    suffix = "_canonical"
    return name[:-len(suffix)] if name.endswith(suffix) else name


def reorder_animations(in_path, out_path, clip_names):
    """Load GLB, reorder animations[] to exactly `clip_names` order, save GLB. Returns the reordered GLTF2.

    Animation names are matched on their canonical key (exporter object-name suffix stripped) and then
    rewritten to the exact contract clip_name, so the emitted GLB carries the frozen names and validate() passes."""
    gltf = GLTF2().load(in_path)
    by_name = {}
    for a in gltf.animations:
        key = _canonical_clip_key(a.name)
        if key in by_name:
            raise GateError(f"duplicate animation name {a.name!r} (normalizes to {key!r})")
        by_name[key] = a
    missing = [n for n in clip_names if n not in by_name]
    if missing:
        raise GateError(f"expected clips missing from GLB: {missing} (have {sorted(by_name)})")
    extra = [k for k in by_name if k not in set(clip_names)]
    if extra:
        raise GateError(f"unexpected extra animations in GLB: {extra}")
    ordered = []
    for n in clip_names:
        a = by_name[n]
        a.name = n  # rewrite exporter-suffixed name to the exact contract clip name
        ordered.append(a)
    gltf.animations = ordered
    gltf.save(out_path)
    return gltf


def validate(path, clipmap, require_mesh=True):
    """Run the full contract gate on a baked GLB. Raises GateError on any violation; returns a manifest dict.

    require_mesh=False relaxes the mesh-dependent checks (skins/COLOR_0/primitive) for the armature-only
    ordering proof; the real Baker.perform output (avatar mesh + skin + vertex color) runs with it True.
    """
    gltf = GLTF2().load(path)
    clip_map = clipmap["clipMap"]
    clip_names = clipmap["clipNames"]
    anims = gltf.animations or []

    # --- animId ordering (the single biggest risk) --------------------------------------------------
    if len(anims) != len(clip_map):
        raise GateError(f"animCount {len(anims)} != clipMap size {len(clip_map)}")
    got = [a.name for a in anims]
    if got != clip_names:
        raise GateError(f"animation order != frozen clipNames.\n  got:      {got}\n  expected: {clip_names}")
    for intent, animId in clip_map.items():
        if not (0 <= animId < len(anims)):
            raise GateError(f"clipMap[{intent}]={animId} out of range [0,{len(anims)})")
        if got[animId] != clip_names[animId]:
            raise GateError(f"clipMap[{intent}]={animId} does not index its own clip {clip_names[animId]!r}")

    # --- no PP-hostile compression ------------------------------------------------------------------
    used = set(gltf.extensionsUsed or [])
    bad = used & _BLOCKED_EXTS
    if bad:
        raise GateError(f"blocked extension(s) in extensionsUsed: {sorted(bad)} (PP rejects Draco/meshopt)")
    for m in (gltf.meshes or []):
        for p in m.primitives:
            pe = set((p.extensions or {}).keys())
            if pe & _BLOCKED_EXTS:
                raise GateError(f"blocked extension on a primitive: {sorted(pe & _BLOCKED_EXTS)}")

    # --- animation channels must target skeletal TRS, never morph-target weights (PP plays skeletal) -
    joint_nodes = set()
    for s in (gltf.skins or []):
        joint_nodes.update(s.joints or [])
    for a in anims:
        for ch in a.channels:
            path_ = ch.target.path
            if path_ == "weights":
                raise GateError(f"animation {a.name!r} targets morph-target weights; PP plays skeletal only")
            if path_ not in ("translation", "rotation", "scale"):
                raise GateError(f"animation {a.name!r} has unexpected channel path {path_!r}")
            if joint_nodes and ch.target.node is not None and ch.target.node not in joint_nodes:
                raise GateError(f"animation {a.name!r} targets node {ch.target.node} which is not a skin joint")

    skins = len(gltf.skins or [])
    has_color0 = any(
        "COLOR_0" in (p.attributes.__dict__ if hasattr(p.attributes, "__dict__") else {})
        or getattr(p.attributes, "COLOR_0", None) is not None
        for m in (gltf.meshes or []) for p in m.primitives
    )
    if require_mesh:
        if skins != 1:
            raise GateError(f"expected exactly 1 skin, got {skins}")
        if not has_color0:
            raise GateError("no COLOR_0 vertex-color attribute (we ship no texture — vertex color is the look)")

    return {
        "canonicalSkeletonVersion": clipmap.get("canonicalSkeletonVersion", "1"),
        "animCount": len(anims),
        "clipMap": clip_map,
        "clipNames": clip_names,
        "skins": skins,
        "hasColor0": has_color0,
        "nodeCount": len(gltf.nodes or []),
        "extensionsUsed": sorted(used),
    }
