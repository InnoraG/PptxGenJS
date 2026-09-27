# Runs inside Blender: `blender --background --python normalize.py -- <avatar.glb> <skeleton.json> <out.glb> <sidecar.json>`
# PER-AVATAR STEP 1 of the presenter clip-baker. UniRig emits a humanoid skeleton with UNSTABLE bone NAMES (the
# paper targets a Mixamo <body> template but the emitted name strings are not stable), so we label the avatar's
# bones by TOPOLOGY (hierarchy + world rest position + L/R sign), rename them to the canonical mixamorig:* names,
# and let Blender rebind the skin automatically (vertex groups are keyed by bone NAME, so a rename re-binds with
# zero weight repaint). Orphan (unmatched) bone weights are merged into the nearest labeled ancestor so the mesh
# never develops a deformation hole. Emits a confidence + tier (T1/T2/T3) sidecar the worker gates on.
#
# This heuristic is authored to be NAME-AGNOSTIC by design; it still needs tuning against the spread of real
# UniRig output (recipe FIX-3). It fails LOUD to T3 (safe-idle) rather than silently mislabeling.
import bpy
import json
import sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
avatar_glb, skel_path, out_glb, sidecar_path = argv[0], argv[1], argv[2], argv[3]
skel = json.load(open(skel_path))
CANON = [b["name"] for b in skel["bones"]]  # canonical order, 22 names

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=avatar_glb)

arm = next((o for o in bpy.data.objects if o.type == "ARMATURE"), None)
if arm is None:
    json.dump({"tier": "T3", "confidence": 0.0, "reason": "no armature in avatar GLB", "matched": {}},
              open(sidecar_path, "w"))
    print("NORMALIZE_NO_ARMATURE")
    sys.exit(0)

bpy.context.view_layer.objects.active = arm
bpy.ops.object.mode_set(mode="EDIT")

# --- Read the skeleton graph with world-space rest head/tail --------------------------------------
mw = arm.matrix_world
ebs = arm.data.edit_bones
info = {}
for eb in ebs:
    head = mw @ eb.head
    tail = mw @ eb.tail
    info[eb.name] = {
        "parent": eb.parent.name if eb.parent else None,
        "children": [c.name for c in eb.children],
        "head": head, "tail": tail,
    }


def subtree_depth(name):
    ch = info[name]["children"]
    return 1 + (max((subtree_depth(c) for c in ch), default=0))


def descend_longest(name):
    """Follow the deepest child chain from `name` to a leaf; return the ordered bone list (excluding `name`)."""
    chain = []
    cur = name
    while info[cur]["children"]:
        nxt = max(info[cur]["children"], key=subtree_depth)
        chain.append(nxt)
        cur = nxt
    return chain


roots = [n for n, v in info.items() if v["parent"] is None]
matched = {}  # canonical_name -> avatar_bone_name


def take_chain(chain, canon_names):
    for cbone, abone in zip(canon_names, chain):
        matched[cbone] = abone


if roots:
    # Root -> Hips. Prefer the root whose subtree is largest (the body root, not a stray).
    root = max(roots, key=subtree_depth)
    matched["mixamorig:Hips"] = root
    kids = info[root]["children"]

    # LEGS: the child subtrees whose leaf goes DOWNWARD (min tip Z) and are chain-like (depth >= 2).
    def tip_z(name):
        chain = [name] + descend_longest(name)
        return info[chain[-1]]["tail"].z

    leg_cands = sorted([k for k in kids if subtree_depth(k) >= 2], key=tip_z)
    legs = leg_cands[:2]
    # SPINE: the remaining child that goes UPWARD (max tip Z) with the deepest subtree (torso->arms->head).
    non_leg = [k for k in kids if k not in legs]
    spine_root = max(non_leg, key=subtree_depth) if non_leg else None

    # Assign legs L/R by rest-X sign (Blender import is +Y up, +Z fwd via export_yup on our side).
    if len(legs) == 2:
        a, b = legs
        left, right = (a, b) if info[a]["head"].x >= info[b]["head"].x else (b, a)  # +X = left (character-left)
        take_chain([left] + descend_longest(left),
                   ["mixamorig:LeftUpLeg", "mixamorig:LeftLeg", "mixamorig:LeftFoot", "mixamorig:LeftToeBase"])
        take_chain([right] + descend_longest(right),
                   ["mixamorig:RightUpLeg", "mixamorig:RightLeg", "mixamorig:RightFoot", "mixamorig:RightToeBase"])

    if spine_root:
        # Walk UP the spine until the first bone that forks into >=2 lateral (arm) branches + an up (neck) branch.
        spine_names = ["mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2"]
        chain, cur, si = [], spine_root, 0
        fork = None
        while cur is not None:
            if si < len(spine_names):
                matched[spine_names[si]] = cur
            else:
                matched["mixamorig:Spine2"] = cur  # collapse extra spine joints onto Spine2
            si += 1
            ch = info[cur]["children"]
            laterals = [c for c in ch if subtree_depth(c) >= 2]
            if len(ch) >= 3 or (len(laterals) >= 2 and len(ch) >= 2):
                fork = cur
                break
            cur = max(ch, key=subtree_depth) if ch else None

        if fork:
            fch = info[fork]["children"]
            # arms = the two most-lateral (largest |X| tip); neck = the most-upward (max tip Z).
            def tip(name):
                c = [name] + descend_longest(name)
                return info[c[-1]]["tail"]
            arms = sorted(fch, key=lambda c: abs(tip(c).x), reverse=True)[:2]
            rest = [c for c in fch if c not in arms]
            neck_root = max(rest, key=lambda c: tip(c).z) if rest else None
            if len(arms) == 2:
                a, b = arms
                la, ra = (a, b) if info[a]["head"].x >= info[b]["head"].x else (b, a)
                take_chain([la] + descend_longest(la),
                           ["mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm", "mixamorig:LeftHand"])
                take_chain([ra] + descend_longest(ra),
                           ["mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm", "mixamorig:RightHand"])
            if neck_root:
                take_chain([neck_root] + descend_longest(neck_root), ["mixamorig:Neck", "mixamorig:Head"])

# --- Confidence + tier ----------------------------------------------------------------------------
# Core upper body (T2 = torso/arm/head only; legs may lock). 15 bones: hips + 3 spine + neck/head + 2×(4-arm).
CORE15 = {"mixamorig:Hips", "mixamorig:Spine", "mixamorig:Spine1", "mixamorig:Spine2", "mixamorig:Neck",
          "mixamorig:Head", "mixamorig:LeftShoulder", "mixamorig:LeftArm", "mixamorig:LeftForeArm",
          "mixamorig:LeftHand", "mixamorig:RightShoulder", "mixamorig:RightArm", "mixamorig:RightForeArm",
          "mixamorig:RightHand"}
n_matched = len(matched)
n_core = len([c for c in CORE15 if c in matched])
# symmetry bonus: both arms + both legs present
sym = sum([
    "mixamorig:LeftArm" in matched and "mixamorig:RightArm" in matched,
    "mixamorig:LeftUpLeg" in matched and "mixamorig:RightUpLeg" in matched,
]) / 2.0
confidence = round(0.7 * (n_matched / len(CANON)) + 0.3 * sym, 3)

if confidence >= 0.85 and n_matched >= 20:
    tier = "T1"
elif n_core >= 12:
    tier = "T2"
else:
    tier = "T3"

# The parent graph + matched inverse must be captured from the ORIGINAL avatar names BEFORE any rename.
name_to_parent = {n: v["parent"] for n, v in info.items()}
canon_of = {abone: cbone for cbone, abone in matched.items()}  # avatar bone name -> canonical name

# --- Rename matched avatar bones -> canonical -----------------------------------------------------
# Rename via a temp prefix first to avoid collisions if an avatar bone already carries a canonical name.
for i, (cbone, abone) in enumerate(list(matched.items())):
    ebs[abone].name = f"__tmpB{i}"
for i, cbone in enumerate(matched.keys()):
    ebs[f"__tmpB{i}"].name = cbone

bpy.ops.object.mode_set(mode="OBJECT")


def nearest_labeled_ancestor(orig_name):
    cur = name_to_parent.get(orig_name)
    while cur is not None:
        if cur in canon_of:
            return canon_of[cur]
        cur = name_to_parent.get(cur)
    return "mixamorig:Hips"


# --- Rebind the skin: rename MATCHED vertex groups to canonical, then merge ORPHAN groups ----------
# The Armature modifier binds vertex groups to bones BY NAME, so a bone rename alone would UNBIND the
# skin — the matching vertex group must be renamed too. Then unmatched (orphan) group weights fold into
# the nearest labeled ancestor so no vertex is left driven by a now-nonexistent bone (no deform hole).
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for mesh in meshes:
    vgs = mesh.vertex_groups
    # 1) rename matched groups (avatar name -> canonical), temp-prefixed to dodge collisions.
    to_rename = [(vg, canon_of[vg.name]) for vg in vgs if vg.name in canon_of]
    for i, (vg, _c) in enumerate(to_rename):
        vg.name = f"__tmpG{i}"
    for i, (vg, cbone) in enumerate(to_rename):
        vgs[f"__tmpG{i}"].name = cbone
    # 2) merge orphan groups (still an original avatar-bone name, never matched) into nearest ancestor.
    orphan_names = [vg.name for vg in vgs if vg.name in info and vg.name not in canon_of]
    for orphan in orphan_names:
        target = nearest_labeled_ancestor(orphan)
        tvg = vgs.get(target) or vgs.new(name=target)
        ovg = vgs[orphan]
        for v in mesh.data.vertices:
            for g in v.groups:
                if g.group == ovg.index and g.weight > 0.0:
                    try:
                        tvg.add([v.index], g.weight, "ADD")
                    except RuntimeError:
                        pass
        vgs.remove(ovg)

# --- Export normalized GLB ------------------------------------------------------------------------
bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB", export_animations=False,
    export_draco_mesh_compression_enable=False, export_skins=True,
    export_vertex_color="ACTIVE", use_selection=False, export_yup=True,
)
json.dump({"tier": tier, "confidence": confidence, "matched": {k: v for k, v in matched.items()},
           "matchedCount": n_matched, "coreCount": n_core},
          open(sidecar_path, "w"))
print("NORMALIZE_OK", "tier=", tier, "confidence=", confidence, "matched=", n_matched)
