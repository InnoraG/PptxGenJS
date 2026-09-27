"""Deterministic scoring and refinement helpers for the private Kimodo motion lab.

This module contains no Modal or filesystem code so the motion contract can be
tested independently. It intentionally never declares a clip shippable: it can
only report whether generated motion passed the model-space kinematic gates.
"""

from __future__ import annotations

import math
import re
from typing import Any

import numpy as np


CORE_JOINTS = (
    "Hips",
    "Spine1",
    "Spine2",
    "Chest",
    "Neck2",
    "Head",
    "LeftArm",
    "LeftForeArm",
    "LeftHand",
    "RightArm",
    "RightForeArm",
    "RightHand",
    "LeftLeg",
    "LeftShin",
    "LeftFoot",
    "RightLeg",
    "RightShin",
    "RightFoot",
)

# Kimodo's public SOMA output is normally the 77-joint rig.  The model itself
# predicts four contact channels and the SOMA77 adapter expands them to six by
# copying each toe contact to its toe-end joint.  Keep both layouts explicit so
# a future adapter cannot silently change which foot owns a channel.
CONTACT_CHANNEL_LAYOUTS = {
    4: ((0, 1), (2, 3), "SOMA30/[heel,toe]"),
    6: ((0, 1, 2), (3, 4, 5), "SOMA77/[heel,toe,toe-end]"),
}

SUPPORTED_QUALITY_GATES = {
    "heightBand",
    "preferredSide",
    "restReturn",
    "loopable",
    "inPlace",
    "travelBand",
    "feetPlanted",
    "minimumFootContactCoverage",
    "minimumHipHeightRatio",
    "maximumHipHeightRange",
    "minimumHandContactCount",
    "maximumHandContactDistance",
    "maximumAuthoredTargetError",
    "minimumPeakHandSpeed",
    "lowEnergy",
    "turnDegrees",
    "turnDirection",
    "headMotion",
}

MAX_CONSTRAINT_FRAMES_PER_SET = 12


def _finite_float(value: Any, fallback: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return fallback
    return result if math.isfinite(result) else fallback


def _native(value: Any) -> Any:
    if isinstance(value, dict):
        return {str(key): _native(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_native(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.floating, np.integer, np.bool_)):
        return value.item()
    return value


def split_candidates(output: dict[str, Any]) -> list[dict[str, np.ndarray]]:
    """Normalize Kimodo's squeezed or batched output to one dict per candidate."""
    local = np.asarray(output["local_rot_mats"])
    batched = local.ndim == 5
    count = int(local.shape[0]) if batched else 1
    candidates: list[dict[str, np.ndarray]] = []
    for index in range(count):
        candidate: dict[str, np.ndarray] = {}
        for key, value in output.items():
            array = np.asarray(value)
            candidate[key] = array[index] if batched and array.shape[0] == count else array
        candidates.append(candidate)
    return candidates


def _candidate_validation_errors(
    candidate: dict[str, np.ndarray],
    skeleton,
    expected_frame_count: int | None = None,
) -> list[str]:
    """Validate the model-space arrays before any metric indexes them.

    This is deliberately independent of the score thresholds.  A malformed
    tensor must become a rejected candidate with evidence, not an exception or
    an accidental pass caused by a missing optional channel.
    """
    errors: list[str] = []
    if not isinstance(candidate, dict):
        return ["candidate is not a mapping"]

    required_shapes = {
        "posed_joints": 3,
        "local_rot_mats": 4,
        "global_rot_mats": 4,
        "root_positions": 2,
    }
    arrays: dict[str, np.ndarray] = {}
    frame_count: int | None = None
    joint_count: int | None = None
    for key, ndim in required_shapes.items():
        if key not in candidate:
            errors.append(f"missing candidate field: {key}")
            continue
        try:
            array = np.asarray(candidate[key], dtype=np.float64)
        except (TypeError, ValueError):
            errors.append(f"candidate field is not numeric: {key}")
            continue
        arrays[key] = array
        if array.ndim != ndim:
            errors.append(f"{key} must have rank {ndim}, got {array.ndim}")
            continue
        if not np.isfinite(array).all():
            errors.append(f"{key} contains non-finite values")
        if frame_count is None:
            frame_count = int(array.shape[0])
        elif int(array.shape[0]) != frame_count:
            errors.append(f"{key} frame count does not match posed_joints")
        if key in {"posed_joints", "local_rot_mats", "global_rot_mats"}:
            current_joint_count = int(array.shape[1])
            if joint_count is None:
                joint_count = current_joint_count
            elif current_joint_count != joint_count:
                errors.append(f"{key} joint count does not match posed_joints")

    if frame_count is not None:
        if frame_count < 2:
            errors.append("candidate must contain at least two frames")
        if expected_frame_count is not None and frame_count != int(expected_frame_count):
            errors.append(f"candidate frame count {frame_count} != expected {expected_frame_count}")
    if "posed_joints" in arrays and arrays["posed_joints"].shape[-1] != 3:
        errors.append("posed_joints last dimension must be xyz")
    if "root_positions" in arrays and arrays["root_positions"].shape[-1] != 3:
        errors.append("root_positions last dimension must be xyz")
    for key in ("local_rot_mats", "global_rot_mats"):
        if key in arrays and arrays[key].shape[-2:] != (3, 3):
            errors.append(f"{key} last dimensions must be 3x3")

    bone_index = getattr(skeleton, "bone_index", {})
    missing_joints = [name for name in CORE_JOINTS if name not in bone_index]
    if missing_joints:
        errors.append(f"skeleton is missing required joints: {','.join(missing_joints)}")
    if joint_count is not None and hasattr(skeleton, "nbjoints") and joint_count != int(skeleton.nbjoints):
        errors.append(f"candidate joint count {joint_count} != skeleton joint count {skeleton.nbjoints}")

    if "global_root_heading" in candidate:
        try:
            heading = np.asarray(candidate["global_root_heading"], dtype=np.float64)
            if heading.ndim != 2 or heading.shape != (frame_count, 2):
                errors.append("global_root_heading must have shape [frame_count,2]")
            elif not np.isfinite(heading).all() or np.any(np.linalg.norm(heading, axis=1) <= 1e-6):
                errors.append("global_root_heading contains invalid direction vectors")
        except (TypeError, ValueError):
            errors.append("global_root_heading is not numeric")

    if "foot_contacts" in candidate:
        try:
            contacts = np.asarray(candidate["foot_contacts"], dtype=np.float64)
            if contacts.ndim != 2 or contacts.shape[0] != frame_count or contacts.shape[1] not in CONTACT_CHANNEL_LAYOUTS:
                errors.append("foot_contacts must have shape [frame_count,4] or [frame_count,6]")
            elif not np.isfinite(contacts).all():
                errors.append("foot_contacts contains non-finite values")
        except (TypeError, ValueError):
            errors.append("foot_contacts is not numeric")

    return errors


def _rejected_assessment(errors: list[str], minimum_score: float) -> dict[str, Any]:
    return _native({
        "score": 0.0,
        "minimumScore": minimum_score,
        "kinematicGatesPassed": False,
        "gates": {"inputValid": False, "minimumScore": False},
        "metrics": {"inputValidationErrors": list(errors)},
    })


def _contact_masks(candidate: dict[str, np.ndarray], frame_count: int) -> tuple[np.ndarray | None, np.ndarray | None, dict[str, Any]]:
    """Return left/right contact masks and an auditable evidence descriptor."""
    if "foot_contacts" not in candidate:
        return None, None, {"status": "missing", "reason": "candidate has no foot_contacts field"}
    try:
        contacts = np.asarray(candidate["foot_contacts"], dtype=np.float64)
    except (TypeError, ValueError):
        return None, None, {"status": "invalid", "reason": "foot_contacts is not numeric"}
    layout = CONTACT_CHANNEL_LAYOUTS.get(int(contacts.shape[1])) if contacts.ndim == 2 else None
    if contacts.ndim != 2 or contacts.shape[0] != frame_count or layout is None:
        return None, None, {
            "status": "invalid",
            "reason": "expected [T,4] or [T,6] contact channels",
            "shape": list(contacts.shape),
        }
    if not np.isfinite(contacts).all():
        return None, None, {"status": "invalid", "reason": "non-finite contact values"}
    left_indices, right_indices, layout_name = layout
    active = contacts > 0.5
    left = np.any(active[:, left_indices], axis=1)
    right = np.any(active[:, right_indices], axis=1)
    evidence = {
        "status": "valid" if bool(np.any(active)) else "empty",
        "layout": layout_name,
        "channelCount": int(contacts.shape[1]),
        "leftActiveFrameCount": int(np.count_nonzero(left)),
        "rightActiveFrameCount": int(np.count_nonzero(right)),
        "bothActiveFrameCount": int(np.count_nonzero(left & right)),
        "leftCoverage": float(np.mean(left)),
        "rightCoverage": float(np.mean(right)),
    }
    return left, right, evidence


def _bounded_constraint_frames(frames: np.ndarray, maximum: int = MAX_CONSTRAINT_FRAMES_PER_SET) -> np.ndarray:
    """Keep conditioning sparse while retaining both ends of a contact hold."""
    frames = np.asarray(frames, dtype=np.int64)
    if len(frames) <= maximum:
        return frames
    return np.unique(np.linspace(int(frames[0]), int(frames[-1]), maximum, dtype=np.int64))


def validate_motion_profile(profile: dict[str, Any]) -> list[str]:
    """Validate generation inputs before they can reach a model invocation."""
    errors: list[str] = []
    if not isinstance(profile, dict):
        return ["profile is not a mapping"]
    defaults = profile.get("defaults")
    if not isinstance(defaults, dict):
        return ["profile.defaults is required"]
    positive_ints = ("candidateCount", "diffusionSteps", "canaryCandidateCount", "canaryDiffusionSteps")
    for key in positive_ints:
        value = defaults.get(key)
        if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) <= 0:
            errors.append(f"defaults.{key} must be a positive integer")
    for key in ("minimumPromotionScore", "maximumRestReturnError", "maximumLoopSeamError", "maximumPlateauDeviation", "maximumFootSkate", "minimumFootContactCoverage"):
        if key in defaults:
            value = _finite_float(defaults[key], math.nan)
            if not math.isfinite(value) or (key == "minimumPromotionScore" and not 0.0 <= value <= 1.0) or (key == "minimumFootContactCoverage" and not 0.0 <= value <= 1.0) or (key not in {"minimumPromotionScore", "minimumFootContactCoverage"} and value <= 0.0):
                errors.append(f"defaults.{key} has an invalid numeric value")
    for key in ("constraintGuidance", "textGuidance"):
        value = defaults.get(key)
        if value is not None and (not isinstance(value, list) or len(value) != 2 or any(not math.isfinite(_finite_float(item, math.nan)) or _finite_float(item) < 0.0 for item in value)):
            errors.append(f"defaults.{key} must contain two non-negative finite numbers")
    for key in ("firstHeadingAngle", "rootMargin"):
        if key in defaults and not math.isfinite(_finite_float(defaults[key], math.nan)):
            errors.append(f"defaults.{key} must be finite")
    if "cfgType" in defaults and defaults["cfgType"] not in {"separated", "regular", "nocfg"}:
        errors.append("defaults.cfgType is unsupported")

    slots = profile.get("slots")
    if not isinstance(slots, list) or not slots:
        return errors + ["profile.slots must be a non-empty list"]
    seen_slots: set[int] = set()
    seen_slugs: set[str] = set()
    allowed_joint_names = set(CORE_JOINTS) | {"Head", "LeftShoulder", "RightShoulder", "Neck2"}

    def is_supported_joint(name: str) -> bool:
        # SOMA77 finger/toe names are deliberately accepted here for the
        # precision hand layer; the runtime still requires the target rig to
        # contain the exact named joint before constructing a constraint.
        return name in allowed_joint_names or name.startswith(("LeftHand", "RightHand", "LeftToe", "RightToe"))
    for position, slot in enumerate(slots):
        prefix = f"slots[{position}]"
        if not isinstance(slot, dict):
            errors.append(f"{prefix} is not a mapping")
            continue
        slot_number = slot.get("slot")
        slug = str(slot.get("slug") or "")
        if isinstance(slot_number, bool) or not isinstance(slot_number, (int, float)) or int(slot_number) != slot_number or int(slot_number) in seen_slots:
            errors.append(f"{prefix}.slot must be a unique integer")
        else:
            seen_slots.add(int(slot_number))
        if not slug or not re.fullmatch(r"[a-z0-9][a-z0-9_-]{0,63}", slug) or slug in seen_slugs:
            errors.append(f"{prefix}.slug must be unique lowercase slug")
        else:
            seen_slugs.add(slug)
        duration = _finite_float(slot.get("durationSeconds"), math.nan)
        if not math.isfinite(duration) or duration <= 0.0 or duration > 10.0:
            errors.append(f"{prefix}.durationSeconds must be in (0,10]")
        prompts = slot.get("promptVariants")
        if not isinstance(prompts, list) or not prompts or any(not isinstance(prompt, str) or not prompt.strip() for prompt in prompts):
            errors.append(f"{prefix}.promptVariants must contain non-empty strings")
        quality = slot.get("qualityGates") or {}
        if not isinstance(quality, dict):
            errors.append(f"{prefix}.qualityGates must be a mapping")
            quality = {}
        unknown_quality = sorted(set(quality) - SUPPORTED_QUALITY_GATES)
        if unknown_quality:
            errors.append(f"{prefix}.qualityGates has unsupported keys: {','.join(unknown_quality)}")
        if quality.get("preferredSide") not in {None, "left", "right"}:
            errors.append(f"{prefix}.qualityGates.preferredSide is unsupported")
        if quality.get("travelBand") not in {None, "near", "far"}:
            errors.append(f"{prefix}.qualityGates.travelBand is unsupported")
        if quality.get("inPlace") and quality.get("travelBand"):
            errors.append(f"{prefix} cannot require both inPlace and travelBand")
        turn_range = quality.get("turnDegrees")
        if turn_range is not None and (not isinstance(turn_range, list) or len(turn_range) != 2 or _finite_float(turn_range[0], math.nan) > _finite_float(turn_range[1], math.nan)):
            errors.append(f"{prefix}.qualityGates.turnDegrees must be an ordered pair")
        for plateau_index, plateau in enumerate(slot.get("plateaus") or []):
            plateau_prefix = f"{prefix}.plateaus[{plateau_index}]"
            if not isinstance(plateau, dict):
                errors.append(f"{plateau_prefix} is not a mapping")
                continue
            start = _finite_float(plateau.get("startMs"), math.nan)
            end = _finite_float(plateau.get("endMs"), math.nan)
            joint = str(plateau.get("joint") or "")
            if not math.isfinite(start) or not math.isfinite(end) or start < 0.0 or end <= start or math.isfinite(duration) and end > duration * 1000.0:
                errors.append(f"{plateau_prefix} is outside the slot duration")
            if not is_supported_joint(joint):
                errors.append(f"{plateau_prefix}.joint is unsupported: {joint}")
        for target_index, authored in enumerate(slot.get("authoredTargets") or []):
            target_prefix = f"{prefix}.authoredTargets[{target_index}]"
            if not isinstance(authored, dict):
                errors.append(f"{target_prefix} is not a mapping")
                continue
            frame_ms = _finite_float(authored.get("frameMs"), math.nan)
            if not math.isfinite(frame_ms) or frame_ms < 0.0 or math.isfinite(duration) and frame_ms > duration * 1000.0:
                errors.append(f"{target_prefix}.frameMs is outside the slot duration")
            for joint_name, target in (authored.get("joints") or {}).items():
                if not is_supported_joint(str(joint_name)) or not isinstance(target, dict):
                    errors.append(f"{target_prefix} has unsupported joint target: {joint_name}")
                    continue
                offsets = target.get("offsetBodyHeights")
                if not isinstance(offsets, list) or len(offsets) != 3 or any(not math.isfinite(_finite_float(value, math.nan)) for value in offsets):
                    errors.append(f"{target_prefix}.{joint_name}.offsetBodyHeights must be three finite numbers")
                reference = str(target.get("referenceJoint") or "Hips")
                if not is_supported_joint(reference):
                    errors.append(f"{target_prefix}.{joint_name}.referenceJoint is unsupported: {reference}")
        if "minimumHandContactCount" in quality and "maximumHandContactDistance" not in quality:
            errors.append(f"{prefix} hand-contact count requires maximumHandContactDistance")
    return errors


def _indices(skeleton, names: tuple[str, ...]) -> list[int]:
    return [int(skeleton.bone_index[name]) for name in names if name in skeleton.bone_index]


def _joint(candidate: dict[str, np.ndarray], skeleton, name: str) -> np.ndarray:
    return np.asarray(candidate["posed_joints"])[:, int(skeleton.bone_index[name]), :]


def _frame_range(start_ms: float, end_ms: float, fps: float, frame_count: int) -> np.ndarray:
    start = max(0, min(frame_count - 1, int(round(start_ms * fps / 1000.0))))
    end = max(start + 1, min(frame_count, int(round(end_ms * fps / 1000.0))))
    return np.arange(start, end, dtype=np.int64)


def _count_threshold_excursions(values: np.ndarray, enter: float, release: float) -> int:
    """Count separated motion excursions with simple hysteresis."""
    active = False
    count = 0
    for value in values:
        if not active and value >= enter:
            active = True
            count += 1
        elif active and value <= release:
            active = False
    return count


def _unit(vector: np.ndarray, fallback: tuple[float, float, float]) -> np.ndarray:
    length = float(np.linalg.norm(vector))
    if not math.isfinite(length) or length <= 1e-8:
        return np.asarray(fallback, dtype=np.float64)
    return np.asarray(vector, dtype=np.float64) / length


def _body_axes(candidate: dict[str, np.ndarray], skeleton, frame: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Return right/up/forward axes for an authored presenter keyframe."""
    posed = np.asarray(candidate["posed_joints"], dtype=np.float64)
    hips = posed[frame, int(skeleton.bone_index["Hips"])]
    head = posed[frame, int(skeleton.bone_index["Head"])]
    left_shoulder = posed[frame, int(skeleton.bone_index["LeftArm"])]
    right_shoulder = posed[frame, int(skeleton.bone_index["RightArm"])]
    right = _unit(right_shoulder - left_shoulder, (1.0, 0.0, 0.0))
    up = _unit(head - hips, (0.0, 1.0, 0.0))
    heading = np.asarray(candidate.get("global_root_heading", []), dtype=np.float64)
    if heading.ndim == 2 and heading.shape[0] > frame and heading.shape[1] >= 2:
        # Kimodo stores [cos(theta), sin(theta)] while the ground plane is
        # [x, z] and theta=0 faces +Z.  Therefore the world vector is
        # [sin(theta), 0, cos(theta)], not [cos(theta), 0, sin(theta)].
        forward = _unit(np.asarray([heading[frame, 1], 0.0, heading[frame, 0]]), (0.0, 0.0, 1.0))
    else:
        forward = _unit(np.cross(right, up), (0.0, 0.0, 1.0))
    # Re-orthogonalize the lateral axis against the model-provided heading.
    right = _unit(np.cross(up, forward), (1.0, 0.0, 0.0))
    return right, up, forward


def _authored_target_position(
    candidate: dict[str, np.ndarray],
    skeleton,
    frame: int,
    target: dict[str, Any],
    body_height: float,
) -> np.ndarray:
    reference_name = str(target.get("referenceJoint") or "Hips")
    reference = _joint(candidate, skeleton, reference_name)[frame]
    right, up, forward = _body_axes(candidate, skeleton, frame)
    lateral, vertical, depth = [_finite_float(value) for value in target.get("offsetBodyHeights", [0.0, 0.0, 0.0])]
    return reference + body_height * (right * lateral + up * vertical + forward * depth)


def score_candidate(
    candidate: dict[str, np.ndarray],
    slot: dict[str, Any],
    defaults: dict[str, Any],
    skeleton,
    fps: float,
) -> dict[str, Any]:
    """Measure one candidate and apply the slot's fail-closed kinematic gates."""
    minimum_score = _finite_float(defaults.get("minimumPromotionScore"), 0.62)
    validation_errors = _candidate_validation_errors(candidate, skeleton)
    if validation_errors:
        return _rejected_assessment(validation_errors, minimum_score)
    posed = np.asarray(candidate["posed_joints"], dtype=np.float64)
    frame_count = int(posed.shape[0])
    root = _joint(candidate, skeleton, "Hips")
    head = _joint(candidate, skeleton, "Head")
    feet = np.stack([
        _joint(candidate, skeleton, "LeftFoot"),
        _joint(candidate, skeleton, "RightFoot"),
    ])
    body_height = max(0.25, float(np.median(head[:, 1] - np.min(feet[:, :, 1], axis=0))))
    core_indices = _indices(skeleton, CORE_JOINTS)
    core = posed[:, core_indices, :]
    core_root_relative = core - root[:, None, :]
    rest_error = float(np.mean(np.linalg.norm(core_root_relative[-1] - core_root_relative[0], axis=-1)) / body_height)
    loop_seam_error = float(np.mean(np.linalg.norm(core[-1] - core[0], axis=-1)) / body_height)
    root_displacement = float(np.linalg.norm((root[-1] - root[0])[[0, 2]]))
    root_displacement_normalized = root_displacement / body_height
    core_velocity = np.diff(core_root_relative, axis=0) * fps / body_height
    motion_energy = float(np.mean(np.linalg.norm(core_velocity, axis=-1))) if frame_count > 1 else 0.0

    metrics: dict[str, Any] = {
        "frameCount": frame_count,
        "durationMs": round(frame_count / fps * 1000.0, 3),
        "bodyHeight": body_height,
        "restReturnError": rest_error,
        "loopSeamError": loop_seam_error,
        "rootDisplacement": root_displacement,
        "rootDisplacementNormalized": root_displacement_normalized,
        "motionEnergy": motion_energy,
        "plateaus": [],
    }
    gates: dict[str, bool] = {"finiteMotion": bool(np.isfinite(posed).all())}
    quality = slot.get("qualityGates") or {}

    plateau_ok = True
    height_ok = True
    max_plateau_deviation = _finite_float(defaults.get("maximumPlateauDeviation"), 0.075)
    height_bands = defaults.get("heightBands") or {}
    preferred_excursion = 0.0
    opposite_excursion = 0.0
    preferred_hand_speed = 0.0
    for plateau in slot.get("plateaus") or []:
        joint_name = str(plateau["joint"])
        frames = _frame_range(plateau["startMs"], plateau["endMs"], fps, frame_count)
        track = _joint(candidate, skeleton, joint_name)[frames]
        anchor = np.median(track, axis=0)
        deviation = np.linalg.norm(track - anchor, axis=-1) / body_height
        maximum_deviation = float(np.max(deviation)) if len(deviation) else math.inf
        mean_deviation = float(np.mean(deviation)) if len(deviation) else math.inf
        plateau_pass = maximum_deviation <= max_plateau_deviation
        plateau_ok = plateau_ok and plateau_pass
        plateau_metric: dict[str, Any] = {
            "joint": joint_name,
            "startFrame": int(frames[0]),
            "endFrameExclusive": int(frames[-1] + 1),
            "maximumDeviation": maximum_deviation,
            "meanDeviation": mean_deviation,
            "passed": plateau_pass,
        }
        if joint_name in {"LeftHand", "RightHand"}:
            hand = _joint(candidate, skeleton, joint_name)
            hand_velocity = np.linalg.norm(np.diff(hand, axis=0), axis=-1) * fps / body_height
            preferred_hand_speed = max(preferred_hand_speed, float(np.max(hand_velocity)) if len(hand_velocity) else 0.0)
            height_ratio = float(np.mean((track[:, 1] - root[frames, 1]) / np.maximum(0.1, head[frames, 1] - root[frames, 1])))
            plateau_metric["heightRatio"] = height_ratio
            height_band_name = quality.get("heightBand")
            if height_band_name:
                band = height_bands.get(height_band_name) or []
                band_pass = len(band) == 2 and _finite_float(band[0]) <= height_ratio <= _finite_float(band[1])
                plateau_metric["heightBand"] = height_band_name
                plateau_metric["heightBandPassed"] = band_pass
                height_ok = height_ok and band_pass
            preferred_excursion = max(preferred_excursion, float(np.max(np.linalg.norm(hand - hand[0], axis=-1))) / body_height)
            opposite_name = "RightHand" if joint_name == "LeftHand" else "LeftHand"
            opposite = _joint(candidate, skeleton, opposite_name)
            opposite_excursion = max(opposite_excursion, float(np.max(np.linalg.norm(opposite - opposite[0], axis=-1))) / body_height)
        metrics["plateaus"].append(plateau_metric)

    if slot.get("plateaus"):
        gates["plateauStable"] = plateau_ok
    if quality.get("heightBand"):
        gates["heightBand"] = height_ok
    if quality.get("preferredSide"):
        side_dominant = preferred_excursion >= 0.08 and preferred_excursion >= opposite_excursion * 0.8
        gates["preferredSide"] = side_dominant
        metrics["preferredHandExcursion"] = preferred_excursion
        metrics["oppositeHandExcursion"] = opposite_excursion

    if quality.get("restReturn"):
        gates["restReturn"] = rest_error <= _finite_float(defaults.get("maximumRestReturnError"), 0.16)
    if quality.get("loopable"):
        gates["loopSeam"] = loop_seam_error <= _finite_float(defaults.get("maximumLoopSeamError"), 0.13)
    if quality.get("inPlace"):
        gates["inPlace"] = root_displacement_normalized <= 0.15
    if quality.get("travelBand") == "near":
        gates["nearTravel"] = root_displacement_normalized <= 0.55
    if quality.get("travelBand") == "far":
        gates["farTravel"] = root_displacement_normalized >= 0.28

    foot_skate = 0.0
    left_contact_mask, right_contact_mask, contact_evidence = _contact_masks(candidate, frame_count)
    if left_contact_mask is not None and right_contact_mask is not None and frame_count > 1:
        left_speed = np.linalg.norm(np.diff(feet[0], axis=0), axis=-1) * fps / body_height
        right_speed = np.linalg.norm(np.diff(feet[1], axis=0), axis=-1) * fps / body_height
        left_mask = left_contact_mask[1:]
        right_mask = right_contact_mask[1:]
        values = np.concatenate([left_speed[left_mask], right_speed[right_mask]])
        foot_skate = float(np.mean(values)) if len(values) else 0.0
    metrics["footSkate"] = foot_skate
    metrics["footContactEvidence"] = contact_evidence
    if quality.get("feetPlanted"):
        coverage_floor = _finite_float(
            quality.get("minimumFootContactCoverage"),
            _finite_float(defaults.get("minimumFootContactCoverage"), 0.10),
        )
        if left_contact_mask is None or right_contact_mask is None or contact_evidence.get("status") != "valid":
            # Missing, malformed, and all-false contact labels are not proof of
            # planted feet.  Keep the evidence visible but fail the gate.
            gates["feetPlanted"] = False
        else:
            left_coverage = float(np.mean(left_contact_mask))
            right_coverage = float(np.mean(right_contact_mask))
            metrics["minimumFootContactCoverage"] = min(left_coverage, right_coverage)
            gates["feetPlanted"] = (
                foot_skate <= _finite_float(defaults.get("maximumFootSkate"), 0.12)
                and left_coverage >= coverage_floor
                and right_coverage >= coverage_floor
            )

    # A planted-foot check alone does not distinguish an upright presenter
    # from a seated or deeply crouched motion. Measure the hips relative to the
    # floor/head span so every presenter profile can explicitly fail closed on
    # low-body poses without depending on actor size or source units.
    floor_y = np.min(feet[:, :, 1], axis=0)
    standing_span = np.maximum(0.1, head[:, 1] - floor_y)
    hip_height_ratio = (root[:, 1] - floor_y) / standing_span
    median_hip_height_ratio = float(np.median(hip_height_ratio))
    hip_height_range = float(np.ptp(hip_height_ratio))
    metrics["medianHipHeightRatio"] = median_hip_height_ratio
    metrics["hipHeightRatioRange"] = hip_height_range
    if "minimumHipHeightRatio" in quality:
        gates["uprightHipHeight"] = median_hip_height_ratio >= _finite_float(quality["minimumHipHeightRatio"], 0.42)
    if "maximumHipHeightRange" in quality:
        gates["stableHipHeight"] = hip_height_range <= _finite_float(quality["maximumHipHeightRange"], 0.16)

    if "minimumHandContactCount" in quality:
        left_hand = _joint(candidate, skeleton, "LeftHand")
        right_hand = _joint(candidate, skeleton, "RightHand")
        hand_distance = np.linalg.norm(left_hand - right_hand, axis=-1) / body_height
        contact_threshold = _finite_float(quality.get("maximumHandContactDistance"), 0.14)
        # Invert the distance so the existing hysteresis helper counts distinct
        # close-hand contacts and requires separation before the next clap.
        closeness = np.maximum(0.0, contact_threshold * 2.0 - hand_distance)
        contact_count = _count_threshold_excursions(
            closeness,
            contact_threshold,
            contact_threshold * 0.45,
        )
        metrics["minimumHandDistanceNormalized"] = float(np.min(hand_distance))
        metrics["handContactCount"] = contact_count
        gates["handContacts"] = contact_count >= int(quality["minimumHandContactCount"])

    authored_targets = slot.get("authoredTargets") or []
    if authored_targets:
        target_metrics = []
        maximum_error = 0.0
        for authored in authored_targets:
            frame = int(_frame_range(authored["frameMs"], authored["frameMs"] + 1.0, fps, frame_count)[0])
            for joint_name, target in (authored.get("joints") or {}).items():
                expected = _authored_target_position(candidate, skeleton, frame, target, body_height)
                actual = _joint(candidate, skeleton, str(joint_name))[frame]
                error = float(np.linalg.norm(actual - expected) / body_height)
                maximum_error = max(maximum_error, error)
                target_metrics.append({"frame": frame, "joint": str(joint_name), "error": error})
        metrics["authoredTargets"] = target_metrics
        metrics["maximumAuthoredTargetError"] = maximum_error
        if "maximumAuthoredTargetError" in quality:
            gates["authoredTargets"] = maximum_error <= _finite_float(quality["maximumAuthoredTargetError"], 0.11)

    if "minimumPeakHandSpeed" in quality:
        metrics["peakPreferredHandSpeed"] = preferred_hand_speed
        gates["peakHandSpeed"] = preferred_hand_speed >= _finite_float(quality["minimumPeakHandSpeed"])
    if quality.get("lowEnergy"):
        gates["lowEnergy"] = motion_energy <= 1.1

    heading = np.asarray(candidate.get("global_root_heading", []), dtype=np.float64)
    if heading.ndim == 2 and heading.shape[0] == frame_count and heading.shape[1] >= 2:
        angles = np.unwrap(np.arctan2(heading[:, 1], heading[:, 0]))
        signed_turn_degrees = float(np.degrees(angles[-1] - angles[0]))
    else:
        signed_turn_degrees = 0.0
    metrics["turnDegrees"] = signed_turn_degrees
    metrics["turnMagnitudeDegrees"] = abs(signed_turn_degrees)
    if quality.get("turnDegrees"):
        low, high = quality["turnDegrees"]
        # Positive-only legacy ranges mean magnitude; a range containing a
        # negative bound is explicitly signed and preserves turn direction.
        measured_turn = signed_turn_degrees if _finite_float(low) < 0.0 or _finite_float(high) < 0.0 else abs(signed_turn_degrees)
        gates["turnAngle"] = _finite_float(low) <= measured_turn <= _finite_float(high)
    if quality.get("turnDirection"):
        expected_direction = str(quality["turnDirection"])
        gates["turnDirection"] = (
            (expected_direction == "left" and signed_turn_degrees < -1.0)
            or (expected_direction == "right" and signed_turn_degrees > 1.0)
        )

    neck = _joint(candidate, skeleton, "Neck2")
    head_relative = (head - neck) / body_height
    head_vertical_range = float(np.ptp(head_relative[:, 1]))
    head_lateral_range = float(np.ptp(head_relative[:, 0]))
    metrics["headVerticalRange"] = head_vertical_range
    metrics["headLateralRange"] = head_lateral_range
    if quality.get("headMotion") == "nod":
        # A nod is primarily a rotation, so measuring Head translation relative
        # to Neck2 incorrectly rejects restrained but valid nods. Measure the
        # full neck/head chain relative to the chest and require two separated
        # pitch excursions for the authoring-v3 double-nod contract.
        global_rotations = np.asarray(candidate["global_rot_mats"], dtype=np.float64)
        chest_rotations = global_rotations[:, int(skeleton.bone_index["Chest"])]
        head_rotations = global_rotations[:, int(skeleton.bone_index["Head"])]
        chest_relative_head = np.einsum("tji,tjk->tik", chest_rotations, head_rotations)
        pitch_degrees = np.degrees(np.unwrap(np.arctan2(
            chest_relative_head[:, 2, 1], chest_relative_head[:, 2, 2]
        )))
        pitch_excursion = np.abs(pitch_degrees - pitch_degrees[0])
        if len(pitch_excursion) >= 5:
            pitch_excursion = np.convolve(pitch_excursion, np.ones(5) / 5.0, mode="same")
        pitch_range = float(np.ptp(pitch_degrees))
        pitch_excursion_count = _count_threshold_excursions(pitch_excursion, 7.0, 3.5)
        metrics["headPitchRangeDegrees"] = pitch_range
        metrics["headPitchExcursionCount"] = pitch_excursion_count
        gates["headNod"] = pitch_range >= 10.0 and pitch_excursion_count >= 2
    if quality.get("headMotion") == "shake":
        gates["headShake"] = head_lateral_range >= 0.012 and head_lateral_range >= head_vertical_range * 0.65

    passed_count = sum(1 for passed in gates.values() if passed)
    gate_score = passed_count / max(1, len(gates))
    plateau_penalty = min(0.25, sum(metric.get("maximumDeviation", 0.0) for metric in metrics["plateaus"]) * 0.35)
    rest_penalty = min(0.12, rest_error * 0.22) if quality.get("restReturn") else 0.0
    score = max(0.0, min(1.0, gate_score - plateau_penalty - rest_penalty))
    gates["minimumScore"] = score >= minimum_score
    passed = all(gates.values())
    return _native({
        "score": score,
        "minimumScore": minimum_score,
        "kinematicGatesPassed": passed,
        "gates": gates,
        "metrics": metrics,
    })


def build_refinement_constraints(
    candidate: dict[str, np.ndarray],
    slot: dict[str, Any],
    defaults: dict[str, Any],
    skeleton,
    fps: float,
    device: str,
    height_target_override: float | None = None,
    nod_pitch_degrees: float = 24.0,
) -> list[Any]:
    """Anchor generated poses and correct declared hand/head motion targets."""
    import torch
    from kimodo.constraints import EndEffectorConstraintSet, FullBodyConstraintSet

    positions = torch.as_tensor(candidate["posed_joints"], device=device)
    rotations = torch.as_tensor(candidate["global_rot_mats"], device=device)
    frame_count = int(positions.shape[0])
    constraints: list[Any] = []
    quality = slot.get("qualityGates") or {}
    height_band = (defaults.get("heightBands") or {}).get(quality.get("heightBand")) or []
    height_target = height_target_override
    if height_target is None and len(height_band) == 2:
        height_target = (_finite_float(height_band[0]) + _finite_float(height_band[1])) / 2.0
    for plateau in slot.get("plateaus") or []:
        frame_indices_np = _bounded_constraint_frames(
            _frame_range(plateau["startMs"], plateau["endMs"], fps, frame_count)[::3]
        )
        if len(frame_indices_np) == 0:
            continue
        anchor_frame = int(frame_indices_np[len(frame_indices_np) // 2])
        count = len(frame_indices_np)
        frame_indices = torch.as_tensor(frame_indices_np, dtype=torch.long, device=device)
        anchored_positions = positions[anchor_frame].unsqueeze(0).repeat(count, 1, 1)
        anchored_rotations = rotations[anchor_frame].unsqueeze(0).repeat(count, 1, 1, 1)
        joint_name = str(plateau["joint"])
        if height_target is not None and joint_name in {"LeftHand", "RightHand"}:
            root_y = positions[anchor_frame, int(skeleton.root_idx), 1]
            head_y = positions[anchor_frame, int(skeleton.bone_index["Head"]), 1]
            target_y = root_y + (head_y - root_y) * height_target
            anchored_positions[:, int(skeleton.bone_index[joint_name]), 1] = target_y
        if joint_name in {"LeftHand", "RightHand", "LeftFoot", "RightFoot"}:
            constraint = EndEffectorConstraintSet(
                skeleton,
                frame_indices,
                anchored_positions,
                anchored_rotations,
                None,
                joint_names=[joint_name],
            )
        else:
            # Kimodo's end-effector set supports hands and feet only. A declared
            # head plateau (the bow hold) is intentionally a whole-pose hold.
            constraint = FullBodyConstraintSet(
                skeleton,
                frame_indices,
                anchored_positions,
                anchored_rotations,
                None,
            )
        constraints.append(constraint.to(device=device))

    body_height = max(0.25, float(np.median(
        _joint(candidate, skeleton, "Head")[:, 1] -
        np.minimum(_joint(candidate, skeleton, "LeftFoot")[:, 1], _joint(candidate, skeleton, "RightFoot")[:, 1])
    )))
    for authored in slot.get("authoredTargets") or []:
        frame = int(_frame_range(authored["frameMs"], authored["frameMs"] + 1.0, fps, frame_count)[0])
        authored_joints = authored.get("joints") or {}
        if not authored_joints:
            continue
        frame_indices = torch.tensor([frame], dtype=torch.long, device=device)
        # Keep one constraint set per hand. Kimodo's end-effector set accepts a
        # joint-name list, but independent sets avoid one hand dominating the
        # optimizer when two targets share the same keyframe (notably clap).
        for joint_name, target in authored_joints.items():
            target_positions = positions[frame].unsqueeze(0).clone()
            target_rotations = rotations[frame].unsqueeze(0).clone()
            expected = _authored_target_position(candidate, skeleton, frame, target, body_height)
            target_positions[0, int(skeleton.bone_index[str(joint_name)])] = torch.as_tensor(
                expected,
                dtype=target_positions.dtype,
                device=device,
            )
            constraint = EndEffectorConstraintSet(
                skeleton,
                frame_indices,
                target_positions,
                target_rotations,
                None,
                joint_names=[str(joint_name)],
            )
            constraints.append(constraint.to(device=device))

    if quality.get("headMotion") == "nod":
        # Author two restrained nods as exact, kinematically consistent
        # full-body keyframes. The rest pose keeps the torso and hands calm;
        # rotating the neck chain makes the head motion explicit.
        local_rotations = torch.as_tensor(candidate["local_rot_mats"], device=device)
        root_positions = torch.as_tensor(candidate["root_positions"], device=device)
        keyframe_fractions = (0.20, 0.36, 0.54, 0.70)
        keyframe_degrees = (nod_pitch_degrees, 0.0, nod_pitch_degrees, 0.0)
        keyframe_indices = torch.as_tensor(
            [min(frame_count - 2, max(1, int(round((frame_count - 1) * fraction)))) for fraction in keyframe_fractions],
            dtype=torch.long,
            device=device,
        )
        authored_local = local_rotations[0].unsqueeze(0).repeat(len(keyframe_fractions), 1, 1, 1)
        neck_name = "Neck1" if "Neck1" in skeleton.bone_index else "Neck2"
        neck_index = int(skeleton.bone_index[neck_name])
        for keyframe_index, degrees in enumerate(keyframe_degrees):
            radians = math.radians(float(degrees))
            cosine = math.cos(radians)
            sine = math.sin(radians)
            pitch_rotation = torch.tensor(
                [[1.0, 0.0, 0.0], [0.0, cosine, -sine], [0.0, sine, cosine]],
                dtype=authored_local.dtype,
                device=device,
            )
            authored_local[keyframe_index, neck_index] = authored_local[keyframe_index, neck_index] @ pitch_rotation
        authored_roots = root_positions[0].unsqueeze(0).repeat(len(keyframe_fractions), 1)
        authored_global_rotations, authored_positions, _ = skeleton.fk(authored_local, authored_roots)
        constraint = FullBodyConstraintSet(
            skeleton,
            keyframe_indices,
            authored_positions,
            authored_global_rotations,
            None,
        )
        constraints.append(constraint.to(device=device))

    slug = str(slot.get("slug") or "")
    should_lock_seam = bool(quality.get("loopable"))
    should_return = bool(quality.get("restReturn")) and not slot.get("authoredTargets") and not slug.startswith("grab_carry") and slug != "walk_turn"
    if should_lock_seam or should_return:
        frame_indices = torch.tensor([0, frame_count - 1], dtype=torch.long, device=device)
        rest_positions = positions[0].unsqueeze(0).repeat(2, 1, 1)
        rest_rotations = rotations[0].unsqueeze(0).repeat(2, 1, 1, 1)
        constraint = FullBodyConstraintSet(
            skeleton,
            frame_indices,
            rest_positions,
            rest_rotations,
            None,
        )
        constraints.append(constraint.to(device=device))
    return constraints
