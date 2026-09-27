# Runs inside Blender: `blender --background --python retarget_bake.py -- <skeleton.json> <clipmap.json> <mocap_dir> <out.glb>`
# OFFLINE (build-time, ONCE) CMU-BVH -> canonical retarget + multi-clip bake. Produces the ONE canonical
# clip-library GLB that every avatar's Baker.perform transplants from. Pure built-in bpy (io_anim_bvh +
# io_scene_gltf2) — NO addon, NO paid tool; the GPL stays inside this Blender subprocess. Raw BVH is a
# build-time asset only and is NEVER emitted (only baked skeletal tracks ride in the GLB) — CMU terms allow
# inclusion in sold products but forbid redistributing the motion as data.
#
# mocap_dir contains: cmu_clips.json (intent -> {bvh, start, end} | {synthesized}), cmu_bonemap.json
# (canonical -> BVH bone), and the *.bvh files. Output animId order == clipmap.clipNames (belt); the worker's
# pygltflib reorder + gate are the suspenders + loud assert.
import bpy
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _canonical_rig import build_canonical_armature  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1:]
skel_path, clipmap_path, mocap_dir, out_glb = argv[0], argv[1], argv[2], argv[3]
skel = json.load(open(skel_path))
clipmap = json.load(open(clipmap_path))
clip_names = clipmap["clipNames"]
clips = json.load(open(os.path.join(mocap_dir, "cmu_clips.json")))["clips"]
bonemap = json.load(open(os.path.join(mocap_dir, "cmu_bonemap.json")))["map"]

FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS

tgt, _ = build_canonical_armature("canonical", skel)
tgt_bones = set(b.name for b in tgt.data.bones)
tgt.animation_data_create()

# LOUD build-time assert: every bonemap canonical key must exist on the canonical rig (a stale map -> a
# rest-posed limb baked silently; fail here instead).
bad_keys = [c for c in bonemap if c not in tgt_bones]
if bad_keys:
    raise RuntimeError(f"bonemap references canonical bones not on the rig: {bad_keys}")

CHECK_BONES = ["mixamorig:LeftArm", "mixamorig:RightArm", "mixamorig:Head"]  # must actually move post-bake


def synthesize(clip_name, intent):
    """Hand-key a synthesized intent (no CMU provenance). enumerate = alternate the two hands."""
    action = bpy.data.actions.new(clip_name)
    tgt.animation_data.action = action
    pairs = [("mixamorig:LeftHand", 1, 20.0), ("mixamorig:RightHand", 1, -20.0)]
    for bone, axis, amp in pairs:
        pb = tgt.pose.bones[bone]
        pb.rotation_mode = "XYZ"
        for f in (1, 12, 24, 36):
            bpy.context.scene.frame_set(f)
            e = [0.0, 0.0, 0.0]
            e[axis] = math.radians(amp * math.sin(f / 18.0 * math.pi))
            pb.rotation_euler = e
            pb.keyframe_insert("rotation_euler", index=axis, frame=f)
    return action, 1, 36


def retarget(clip_name, intent, spec):
    """Import the BVH window, constrain canonical bones to it (rotation-only + hip location), bake to an action."""
    bvh_path = os.path.join(mocap_dir, spec["bvh"])
    if not os.path.exists(bvh_path):
        raise RuntimeError(f"missing BVH for {intent}: {bvh_path}")
    before = set(o.name for o in bpy.data.objects)
    # CMU BVH: cm scale (global_scale=0.01), +Y up / -Z forward, retime to scene fps.
    bpy.ops.import_anim.bvh(filepath=bvh_path, global_scale=0.01, axis_up="Y", axis_forward="-Z",
                            use_fps_scale=True, update_scene_fps=False, update_scene_duration=False)
    src = next(o for o in bpy.data.objects if o.name not in before and o.type == "ARMATURE")
    src_bones = set(b.name for b in src.data.bones)

    # Rotation-only retarget (proportion-tolerant) + one hip COPY_LOCATION for translation.
    for cbone, sbone in bonemap.items():
        if sbone not in src_bones:
            continue
        pb = tgt.pose.bones[cbone]
        c = pb.constraints.new("COPY_ROTATION")
        c.target = src
        c.subtarget = sbone
        c.target_space = "LOCAL"
        c.owner_space = "LOCAL"
    hips_src = bonemap.get("mixamorig:Hips")
    if hips_src in src_bones:
        cl = tgt.pose.bones["mixamorig:Hips"].constraints.new("COPY_LOCATION")
        cl.target = src
        cl.subtarget = hips_src

    fs, fe = int(spec.get("start", 1)), int(spec.get("end", 60))
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = fs, fe
    bpy.context.view_layer.objects.active = tgt
    with bpy.context.temp_override(active_object=tgt, selected_editable_objects=[tgt], object=tgt):
        bpy.ops.nla.bake(frame_start=fs, frame_end=fe, only_selected=False, visual_keying=True,
                         clear_constraints=True, clear_parents=False, use_current_action=False,
                         bake_types={"POSE"})
    action = tgt.animation_data.action
    bpy.data.objects.remove(src, do_unlink=True)
    return action, fs, fe


# --- Bake every clip in the frozen order ----------------------------------------------------------
for clip_name in clip_names:
    intent = clip_name.split("_", 1)[1]
    spec = clips.get(intent, {})
    if spec.get("synthesized"):
        action, fs, fe = synthesize(clip_name, intent)
    else:
        action, fs, fe = retarget(clip_name, intent, spec)

    action.name = clip_name
    # Assert the clip actually animates the arms/head (guards a stale bonemap silently baking a rest pose).
    if not spec.get("synthesized"):
        moved = set()
        for fc in action.fcurves:
            for cb in CHECK_BONES:
                if f'"{cb}"' in fc.data_path and len(fc.keyframe_points) > 1:
                    moved.add(cb)
        if not moved:
            raise RuntimeError(f"clip {clip_name}: no arm/head channels keyed — bonemap likely wrong for {spec.get('bvh')}")

    track = tgt.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.name = clip_name
    track.mute = True
    tgt.animation_data.action = None
    print("RETARGET_CLIP_OK", clip_name)

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = 60
bpy.ops.export_scene.gltf(
    filepath=out_glb, export_format="GLB",
    export_animations=True, export_animation_mode="ACTIONS", export_bake_animation=True,
    export_draco_mesh_compression_enable=False, export_skins=True,
    export_optimize_animation_size=False, use_selection=False, export_yup=True,
)
print("RETARGET_BAKE_OK", out_glb, "clips=", len(clip_names))
