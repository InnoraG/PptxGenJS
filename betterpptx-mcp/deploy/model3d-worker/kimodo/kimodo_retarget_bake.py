# Runs inside Blender:
# blender --background --python kimodo_retarget_bake.py -- <skeleton.json> <clipmap.json> <motion-root> <out.glb> <sources.json> <bonemap.json> [target.glb]
"""Retarget selected Kimodo SOMA77 BVH clips to the canonical BetterPPTX rig.

Raw BVH actions are purged before export. The output is a candidate-only GLB;
promotion remains a separate PowerPoint-oracle and provenance decision.
"""

import bpy
import json
import os
import sys
from mathutils import Vector


argv = sys.argv[sys.argv.index("--") + 1:]
if len(argv) not in {6, 7}:
    raise RuntimeError("expected skeleton, clipmap, motion-root, out-glb, sources, bonemap, and optional target GLB arguments")
skel_path, clipmap_path, motion_root, out_glb, sources_path, bonemap_path = argv[:6]
target_glb_path = argv[6] if len(argv) == 7 else ""

sys.path.insert(0, "/opt/bake")
from _canonical_rig import build_canonical_armature  # noqa: E402

skel = json.load(open(skel_path, encoding="utf-8"))
clipmap = json.load(open(clipmap_path, encoding="utf-8"))
clip_names = clipmap["clipNames"]
clips = json.load(open(sources_path, encoding="utf-8"))["clips"]
bonemap = json.load(open(bonemap_path, encoding="utf-8"))["map"]

FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.scene.render.fps = FPS
if target_glb_path:
    if not os.path.exists(target_glb_path):
        raise RuntimeError(f"missing direct retarget GLB: {target_glb_path}")
    bpy.ops.import_scene.gltf(filepath=target_glb_path)
    required_targets = set(bonemap)
    target_armatures = [
        obj for obj in bpy.data.objects
        if obj.type == "ARMATURE" and required_targets.issubset(set(bone.name for bone in obj.data.bones))
    ]
    if len(target_armatures) != 1:
        raise RuntimeError(f"expected one direct target armature, found {len(target_armatures)}")
    tgt = target_armatures[0]
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    tgt.animation_data_clear()
    tgt.animation_data_create()
    bpy.context.view_layer.objects.active = tgt
    tgt.select_set(True)
    bpy.ops.object.mode_set(mode="POSE")
else:
    tgt, _ = build_canonical_armature("canonical", skel)
tgt_bones = set(bone.name for bone in tgt.data.bones)
tgt.animation_data_create()

bad_targets = sorted(target for target in bonemap if target not in tgt_bones)
if bad_targets:
    raise RuntimeError(f"SOMA77 bonemap targets are not on canonical rig: {bad_targets}")

CHECK_BONES = ["mixamorig:LeftArm", "mixamorig:RightArm", "mixamorig:Head"]


def _normalized(vector, fallback):
    if vector.length <= 1e-8:
        return Vector(fallback)
    return vector.normalized()


def _interpolated_offset(samples, frame):
    if frame <= samples[0][0]:
        return Vector(samples[0][1])
    if frame >= samples[-1][0]:
        return Vector(samples[-1][1])
    for index in range(1, len(samples)):
        right_frame, right_value = samples[index]
        if frame <= right_frame:
            left_frame, left_value = samples[index - 1]
            amount = (frame - left_frame) / max(1, right_frame - left_frame)
            return Vector(left_value).lerp(Vector(right_value), amount)
    return Vector(samples[-1][1])


def _bake_authored_hand_ik(tgt, action, clip_name, spec, frame_start, frame_end):
    authored = spec.get("authoredTargets") or []
    if not authored:
        return action
    samples_by_hand = {"LeftHand": [], "RightHand": []}
    for row in authored:
        frame = min(frame_end, max(frame_start, frame_start + int(round(float(row["frameMs"]) * FPS / 1000.0))))
        for hand, target in (row.get("joints") or {}).items():
            if hand not in samples_by_hand:
                continue
            offset = target.get("offsetBodyHeights") or [0.0, 0.0, 0.0]
            samples_by_hand[hand].append((frame, tuple(float(value) for value in offset)))
    samples_by_hand = {
        hand: sorted(samples, key=lambda item: item[0])
        for hand, samples in samples_by_hand.items()
        if samples
    }
    if not samples_by_hand:
        return action

    tgt.animation_data.action = action
    target_objects = {}
    positions = {hand: {} for hand in samples_by_hand}
    for frame in range(frame_start, frame_end + 1):
        bpy.context.scene.frame_set(frame)
        hips = tgt.pose.bones["mixamorig:Hips"].head.copy()
        head = tgt.pose.bones["mixamorig:Head"].head.copy()
        left_arm = tgt.pose.bones["mixamorig:LeftArm"].head.copy()
        right_arm = tgt.pose.bones["mixamorig:RightArm"].head.copy()
        left_foot = tgt.pose.bones["mixamorig:LeftFoot"].head.copy()
        right_foot = tgt.pose.bones["mixamorig:RightFoot"].head.copy()
        right = _normalized(right_arm - left_arm, (-1.0, 0.0, 0.0))
        up = _normalized(head - hips, (0.0, 0.0, 1.0))
        # Mixamo's imported armature faces Blender -Y in this conversion path.
        # The opposite cross-product sends otherwise correct clap targets behind
        # the torso, which is visible only in the native PowerPoint playback.
        forward = _normalized(up.cross(right), (0.0, -1.0, 0.0))
        body_height = max(0.25, (head.z - min(left_foot.z, right_foot.z)))
        for hand, samples in samples_by_hand.items():
            lateral, vertical, depth = _interpolated_offset(samples, frame)
            position = hips + body_height * (right * lateral + up * vertical + forward * depth)
            positions[hand][frame] = tgt.matrix_world @ position

    for hand in samples_by_hand:
        empty = bpy.data.objects.new(f"{clip_name}-{hand}-IK", None)
        bpy.context.collection.objects.link(empty)
        target_objects[hand] = empty
        for frame in range(frame_start, frame_end + 1):
            empty.location = positions[hand][frame]
            empty.keyframe_insert(data_path="location", frame=frame)
        forearm = tgt.pose.bones[f"mixamorig:{hand.replace('Hand', 'ForeArm')}"]
        constraint = forearm.constraints.new("IK")
        constraint.target = empty
        constraint.chain_count = 2
        constraint.iterations = 100
        constraint.use_stretch = False

    bpy.context.view_layer.objects.active = tgt
    tgt.select_set(True)
    with bpy.context.temp_override(active_object=tgt, selected_editable_objects=[tgt], object=tgt):
        bpy.ops.nla.bake(
            frame_start=frame_start,
            frame_end=frame_end,
            only_selected=False,
            visual_keying=True,
            clear_constraints=True,
            clear_parents=False,
            use_current_action=True,
            bake_types={"POSE"},
        )
    baked_action = tgt.animation_data.action
    if baked_action is None:
        raise RuntimeError(f"authored hand IK produced no action for {clip_name}")
    baked_action.name = clip_name
    mapped_target_bones = set(bonemap)
    for curve in list(baked_action.fcurves):
        is_mapped_rotation = curve.data_path.endswith("rotation_quaternion") and any(
            f'"{bone}"' in curve.data_path for bone in mapped_target_bones
        )
        if not is_mapped_rotation:
            baked_action.fcurves.remove(curve)
    for empty in target_objects.values():
        bpy.data.objects.remove(empty, do_unlink=True)
    print("KIMODO_AUTHORED_HAND_IK_OK", clip_name, sorted(samples_by_hand), frame_start, frame_end)
    return baked_action


def retarget(clip_name, slug, spec):
    relative_bvh = str(spec.get("bvh") or "")
    if not relative_bvh or os.path.isabs(relative_bvh) or ".." in relative_bvh.replace("\\", "/").split("/"):
        raise RuntimeError(f"invalid relative BVH path for {slug}: {relative_bvh}")
    bvh_path = os.path.normpath(os.path.join(motion_root, relative_bvh))
    if os.path.commonpath([os.path.abspath(motion_root), os.path.abspath(bvh_path)]) != os.path.abspath(motion_root):
        raise RuntimeError(f"BVH path escapes motion root for {slug}: {relative_bvh}")
    if not os.path.exists(bvh_path):
        raise RuntimeError(f"missing selected Kimodo BVH for {slug}: {bvh_path}")

    before = set(obj.name for obj in bpy.data.objects)
    bpy.ops.import_anim.bvh(
        filepath=bvh_path,
        global_scale=0.01,
        axis_up="Y",
        axis_forward="-Z",
        use_fps_scale=True,
        update_scene_fps=False,
        update_scene_duration=False,
    )
    imported = [obj for obj in bpy.data.objects if obj.name not in before]
    src = next((obj for obj in imported if obj.type == "ARMATURE"), None)
    if src is None:
        raise RuntimeError(f"Blender did not import a SOMA77 armature for {slug}")
    src_bones = set(bone.name for bone in src.data.bones)
    missing_sources = sorted(source for source in bonemap.values() if source not in src_bones)
    if missing_sources:
        raise RuntimeError(f"SOMA77 BVH for {slug} is missing mapped bones: {missing_sources}")

    source_action = src.animation_data.action if src.animation_data else None
    if source_action is None:
        raise RuntimeError(f"SOMA77 BVH for {slug} has no animation action")
    frame_start = int(round(source_action.frame_range[0]))
    frame_end = int(round(source_action.frame_range[1]))
    if frame_end <= frame_start:
        raise RuntimeError(f"SOMA77 BVH for {slug} has an empty frame range")

    bpy.context.scene.frame_start = frame_start
    bpy.context.scene.frame_end = frame_end
    action = bpy.data.actions.new(clip_name)
    tgt.animation_data.action = action

    # The SOMA and Mixamo bones do not share local axes or bone rolls. Copying
    # their local Euler/quaternion channels therefore puts otherwise correct
    # hand motion behind the presenter. Rebase every mapped bone through its
    # armature-space rest orientation and bake the resulting global rotation
    # onto the canonical rig. The keyed result remains rotation-only, so it
    # cannot alter the presenter's proportions, bind translations, or scale.
    target_pairs = sorted(
        bonemap.items(),
        key=lambda item: len(tgt.data.bones[item[0]].parent_recursive),
    )
    source_rest_rotations = {
        source_bone: src.data.bones[source_bone].matrix_local.to_quaternion().normalized()
        for _, source_bone in target_pairs
    }
    target_rest_rotations = {
        target_bone: tgt.data.bones[target_bone].matrix_local.to_quaternion().normalized()
        for target_bone, _ in target_pairs
    }
    for target_bone, _ in target_pairs:
        pose_bone = tgt.pose.bones[target_bone]
        pose_bone.rotation_mode = "QUATERNION"
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)

    for frame in range(frame_start, frame_end + 1):
        bpy.context.scene.frame_set(frame)
        for target_bone, source_bone in target_pairs:
            source_pose_rotation = src.pose.bones[source_bone].matrix.to_quaternion().normalized()
            source_delta = source_pose_rotation @ source_rest_rotations[source_bone].inverted()
            desired_rotation = (source_delta @ target_rest_rotations[target_bone]).normalized()

            target_data_bone = tgt.data.bones[target_bone]
            if target_data_bone.parent:
                parent_pose_matrix = tgt.pose.bones[target_data_bone.parent.name].matrix
                local_rest_matrix = target_data_bone.parent.matrix_local.inverted() @ target_data_bone.matrix_local
                base_matrix = parent_pose_matrix @ local_rest_matrix
            else:
                base_matrix = target_data_bone.matrix_local.copy()

            desired_matrix = desired_rotation.to_matrix().to_4x4()
            desired_matrix.translation = base_matrix.to_translation()
            target_pose_bone = tgt.pose.bones[target_bone]
            target_pose_bone.matrix = desired_matrix
            target_pose_bone.keyframe_insert(
                data_path="rotation_quaternion",
                frame=frame,
                group=target_bone,
            )
        bpy.context.view_layer.update()

    action = _bake_authored_hand_ik(tgt, action, clip_name, spec, frame_start, frame_end)

    root_translation_scale = float(spec.get("rootTranslationScale", 1.0))
    if not 0.0 <= root_translation_scale <= 1.0:
        raise RuntimeError(f"invalid rootTranslationScale for {slug}: {root_translation_scale}")
    root_translation_ranges = {}
    if root_translation_scale != 1.0:
        root_path = 'pose.bones["mixamorig:Hips"].location'
        root_curves = {
            axis: next((item for item in action.fcurves if item.data_path == root_path and item.array_index == axis), None)
            for axis in (0, 1, 2)
        }
        # The current canonical authoring bake deliberately emits rotation-only
        # clips. In that mode there is no Hips location curve to compact, which
        # is already the strongest possible PowerPoint viewport bound. Older
        # full-TRS candidates still receive the configured scale below.
        if not any(root_curves.values()):
            print("KIMODO_RETARGET_VIEWPORT_ROOT_ROTATION_ONLY", slug, root_translation_scale)
            root_translation_scale = 1.0
        # Compact all translation axes. Blender's BVH import plus glTF Y-up
        # conversion can map generated forward travel into PowerPoint camera
        # depth; preserving one nominally vertical axis caused perspective blowup.
        # Turn rotation and every non-root joint channel remain untouched.
        for axis in ((0, 1, 2) if root_translation_scale != 1.0 else ()):
            curve = root_curves[axis]
            if curve is None or not curve.keyframe_points:
                raise RuntimeError(f"missing Hips location curve {axis} for {slug}")
            origin = float(curve.evaluate(frame_start))
            before = [float(point.co[1]) for point in curve.keyframe_points]
            for point in curve.keyframe_points:
                point.co[1] = origin + (float(point.co[1]) - origin) * root_translation_scale
                point.handle_left[1] = origin + (float(point.handle_left[1]) - origin) * root_translation_scale
                point.handle_right[1] = origin + (float(point.handle_right[1]) - origin) * root_translation_scale
            after = [float(point.co[1]) for point in curve.keyframe_points]
            root_translation_ranges[str(axis)] = {
                "before": max(before) - min(before),
                "after": max(after) - min(after),
            }
        action.update_tag()
        print("KIMODO_RETARGET_VIEWPORT_ROOT_SCALE", slug, root_translation_scale, json.dumps(root_translation_ranges, sort_keys=True))

    for obj in imported:
        bpy.data.objects.remove(obj, do_unlink=True)
    return action, frame_start, frame_end


for clip_name in clip_names:
    prefix, slug = clip_name.split("_", 1)
    if int(prefix) < 0 or slug not in clips:
        raise RuntimeError(f"missing Kimodo source-map row for {clip_name}")
    action, frame_start, frame_end = retarget(clip_name, slug, clips[slug])
    moved = set()
    for curve in action.fcurves:
        for bone in CHECK_BONES:
            if f'"{bone}"' in curve.data_path and len(curve.keyframe_points) > 1:
                moved.add(bone)
    if not moved:
        raise RuntimeError(f"clip {clip_name} has no arm/head channels after SOMA77 retarget")
    track = tgt.animation_data.nla_tracks.new()
    track.name = clip_name
    strip = track.strips.new(clip_name, 1, action)
    strip.name = clip_name
    track.mute = True
    tgt.animation_data.action = None
    print("KIMODO_RETARGET_CLIP_OK", clip_name, frame_start, frame_end)

keep = set(clip_names)
for action in list(bpy.data.actions):
    if action.name not in keep:
        bpy.data.actions.remove(action)
remaining = sorted(action.name for action in bpy.data.actions)
if remaining != sorted(clip_names):
    raise RuntimeError(f"expected exactly the 18 canonical Kimodo actions, got: {remaining}")

bpy.context.scene.frame_start = 1
bpy.context.scene.frame_end = max(int(action.frame_range[1]) for action in bpy.data.actions)
tgt["betterpptx_candidate_source"] = "nvidia-kimodo"
tgt["betterpptx_candidate_contract"] = "authoring-clipmap-v3"
bpy.ops.export_scene.gltf(
    filepath=out_glb,
    export_format="GLB",
    export_animations=True,
    export_animation_mode="ACTIONS",
    export_bake_animation=True,
    export_draco_mesh_compression_enable=False,
    export_skins=True,
    export_optimize_animation_size=False,
    export_extras=True,
    use_selection=False,
    export_yup=True,
)
print("KIMODO_RETARGET_BAKE_OK", out_glb, "clips=", len(clip_names))
