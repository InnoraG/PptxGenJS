# Runs inside Blender: `blender --background --python mixamo_bake.py -- <skeleton.json> <clipmap.json> <mocap_dir> <out.glb>`
# OFFLINE (build-time, ONCE) Mixamo-FBX -> canonical multi-clip library bake. Mixamo animations already target the
# mixamorig:* skeleton == our canonical rig, so this is a near-IDENTITY name-match retarget (no bonemap guessing,
# unlike CMU): COPY_ROTATION LOCAL from each Mixamo body bone onto the same-named canonical bone, bake, stash.
# Finger channels are ignored by the 22-bone canonical. Presenter gestures remain in-place, while kinetic takes may
# explicitly preserve rest-relative Hips travel through the source-map `inPlace:false` policy. Never copy translation
# from any other bone: absolute per-bone FBX translations would overwrite the destination bind space and tear skins.
# Built-in io_scene_fbx only (no addon); GPL stays inside this Blender subprocess. Raw FBX is build-time-only, NEVER
# emitted (Mixamo terms: embed in product OK, no raw-file redistribution).
import bpy
import json
import math
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _canonical_rig import build_canonical_armature  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
skel_path, clipmap_path, mocap_dir, out_glb = argv[0], argv[1], argv[2], argv[3]
# Optional 5th arg = the intent->FBX take-map (default: the 18-clip gesture map). 6th arg = "loose" to make the
# arm/head sanity check a WARNING instead of fatal — kinetic clips (slides/jumps/rolls) can be leg-dominant.
clips_map_path = argv[4] if len(argv) > 4 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "mixamo_clips.json")
STRICT = (argv[5] if len(argv) > 5 else "strict") != "loose"
skel = json.load(open(skel_path))
clipmap = json.load(open(clipmap_path))
clip_names = clipmap["clipNames"]
clips = json.load(open(clips_map_path))["clips"]

FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS

tgt, _ = build_canonical_armature("canonical", skel)
tgt_bones = [b.name for b in tgt.data.bones]
tgt.animation_data_create()

CHECK_BONES = ["mixamorig:LeftArm", "mixamorig:RightArm", "mixamorig:Head"]  # must actually move post-bake
ROOT_BONE = "mixamorig:Hips"


def base_name(bone):
    """Strip the mixamorig prefix/namespace so 'mixamorig:LeftArm' / 'mixamorigLeftArm' / 'LeftArm' all compare equal."""
    n = bone.split(":")[-1]
    n = re.sub(r"^mixamorig", "", n)
    return n.lower()


def synthesize(clip_name):
    """Hand-key a synthesized intent (no provenance). enumerate = alternate the two hands."""
    action = bpy.data.actions.new(clip_name)
    tgt.animation_data.action = action
    for bone, axis, amp in (("mixamorig:LeftHand", 1, 20.0), ("mixamorig:RightHand", 1, -20.0)):
        pb = tgt.pose.bones[bone]
        pb.rotation_mode = "XYZ"
        for f in (1, 12, 24, 36):
            bpy.context.scene.frame_set(f)
            e = [0.0, 0.0, 0.0]
            e[axis] = math.radians(amp * math.sin(f / 18.0 * math.pi))
            pb.rotation_euler = e
            pb.keyframe_insert("rotation_euler", index=axis, frame=f)
    return action, 1, 36


def rebase_root_motion(action, frame_start, frame_end, spec):
    """Anchor baked Hips travel to the canonical rest pose without touching the skin/bind transform."""
    root_path = f'pose.bones["{ROOT_BONE}"].location'
    curves = [fc for fc in action.fcurves if fc.data_path == root_path]
    if len(curves) != 3:
        raise RuntimeError(f"expected three baked Hips location curves, got {len(curves)}")
    anchor = str(spec.get("rootAnchor", "start")).lower()
    if anchor not in {"start", "end"}:
        raise RuntimeError(f"unsupported rootAnchor {anchor!r}; expected start or end")
    anchor_frame = frame_end if anchor == "end" else frame_start
    scale = float(spec.get("rootMotionScale", 1.0))
    ranges = []
    for fc in curves:
        anchor_value = fc.evaluate(anchor_frame)
        values = []
        for key in fc.keyframe_points:
            key.co[1] = (key.co[1] - anchor_value) * scale
            key.handle_left[1] = (key.handle_left[1] - anchor_value) * scale
            key.handle_right[1] = (key.handle_right[1] - anchor_value) * scale
            values.append(key.co[1])
        fc.update()
        ranges.append(max(values) - min(values) if values else 0.0)
    if max(ranges, default=0.0) < 1e-5:
        raise RuntimeError(f"non-in-place clip preserved no Hips travel: ranges={ranges}")
    print("MIXAMO_ROOT_MOTION", {"anchor": anchor, "scale": scale, "ranges": ranges})


def retarget(clip_name, spec):
    fbx_path = os.path.join(mocap_dir, spec["fbx"])
    if not os.path.exists(fbx_path):
        raise RuntimeError(f"missing Mixamo FBX for {clip_name}: {fbx_path}")
    before = set(o.name for o in bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=fbx_path, automatic_bone_orientation=True)
    src = next(o for o in bpy.data.objects if o.name not in before and o.type == "ARMATURE")
    # Map canonical bone -> the Mixamo SRC bone with the same base name (identity match).
    src_by_base = {base_name(b.name): b.name for b in src.data.bones}
    fe = src.animation_data.action.frame_range if (src.animation_data and src.animation_data.action) else (1, 60)
    fs, fend = int(fe[0]), int(fe[1])

    # A previous non-in-place take can leave the evaluated target pose at its
    # last root offset after its action is stashed. Every new take starts from
    # the canonical rest location; only an explicit COPY_LOCATION below may
    # animate Hips away from it.
    tgt.pose.bones[ROOT_BONE].location = (0.0, 0.0, 0.0)

    for cbone in tgt_bones:
        sname = src_by_base.get(base_name(cbone))
        if not sname:
            continue
        c = tgt.pose.bones[cbone].constraints.new("COPY_ROTATION")
        c.target = src
        c.subtarget = sname
        c.target_space = "LOCAL"
        c.owner_space = "LOCAL"
        if cbone == ROOT_BONE and spec.get("inPlace", True) is False:
            location = tgt.pose.bones[cbone].constraints.new("COPY_LOCATION")
            location.target = src
            location.subtarget = sname
            # World-space sampling preserves the physical FBX trajectory even when Blender's
            # automatic bone orientation gives source and canonical Hips different local axes.
            location.target_space = "WORLD"
            location.owner_space = "WORLD"

    bpy.context.scene.frame_start, bpy.context.scene.frame_end = fs, fend
    bpy.context.view_layer.objects.active = tgt
    with bpy.context.temp_override(active_object=tgt, selected_editable_objects=[tgt], object=tgt):
        bpy.ops.nla.bake(frame_start=fs, frame_end=fend, only_selected=False, visual_keying=True,
                         clear_constraints=True, clear_parents=False, use_current_action=False, bake_types={"POSE"})
    action = tgt.animation_data.action
    if spec.get("inPlace", True) is False:
        rebase_root_motion(action, fs, fend, spec)
    # remove the imported Mixamo objects (armature + any mesh) — raw motion never ships.
    for o in [x for x in bpy.data.objects if x.name not in before]:
        bpy.data.objects.remove(o, do_unlink=True)
    return action, fs, fend


for clip_name in clip_names:
    intent = clip_name.split("_", 1)[1]
    spec = clips.get(intent, {})
    if spec.get("synthesized"):
        action, fs, fe = synthesize(clip_name)
    else:
        action, fs, fe = retarget(clip_name, spec)

    action.name = clip_name
    if not spec.get("synthesized"):
        moved = set()
        for fc in action.fcurves:
            for cb in CHECK_BONES:
                if f'"{cb}"' in fc.data_path and len(fc.keyframe_points) > 1:
                    moved.add(cb)
        if not moved:
            msg = f"clip {clip_name}: no arm/head channels keyed — check the Mixamo FBX / skeleton names for {spec.get('fbx')}"
            if STRICT:
                raise RuntimeError(msg)
            print("MIXAMO_WARN", msg)  # loose mode (kinetic): a leg-dominant clip is fine

    track = tgt.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.name = clip_name
    track.mute = True
    tgt.animation_data.action = None
    print("MIXAMO_CLIP_OK", clip_name)

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 60

# Purge orphaned RAW Mixamo actions before export. Each imported FBX brings its own action
# ("Armature|mixamo.com|Layer0[.NNN]") which lingers in bpy.data.actions after we remove the imported
# armature — and ACTIONS-mode export emits EVERY action in bpy.data, not just the target's NLA strips. Keep
# ONLY the canonical clip_names so the library is exactly N clips: no ~2x bloat, and no raw Mixamo motion
# data riding in the (Volume-cached) library GLB. transplant.py name-filters anyway, but a clean library is
# correct-by-construction (avoids substring-collision fragility) and better license hygiene.
_keep = set(clip_names)
_purged = 0
for _act in list(bpy.data.actions):
    if _act.name not in _keep:
        bpy.data.actions.remove(_act)
        _purged += 1
_remaining = sorted(a.name for a in bpy.data.actions)
print("MIXAMO_PURGE removed", _purged, "raw actions; kept", len(_remaining), "->", _remaining)
if len(_remaining) != len(clip_names):
    raise RuntimeError(f"expected exactly {len(clip_names)} clips after purge, got {len(_remaining)}: {_remaining}")

bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB",
    export_animations=True, export_animation_mode="ACTIONS", export_bake_animation=True,
    export_draco_mesh_compression_enable=False, export_skins=True,
    export_optimize_animation_size=False, use_selection=False, export_yup=True,
)
print("MIXAMO_BAKE_OK", out_glb, "clips=", len(clip_names))
