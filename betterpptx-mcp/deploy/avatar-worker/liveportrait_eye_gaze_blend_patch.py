"""Apply the narrowly scoped production eye-gaze blend to pinned LivePortrait.

The production profile enables LivePortrait eye retargeting so eyelids can close
fully.  Upstream retargeting replaces the driving eye delta with an eyelid
retarget delta, which also removes the small left/right gaze signal.  This patch
keeps that eyelid path and blends back only 40% of the already region-limited
raw eye delta.  The worker passes ``--eye_gaze_blend 0.40`` only for the
closed-blink profile.

This is intentionally a literal, count-checked source patch: a changed
upstream revision must fail the image build instead of silently applying an
unsafe edit.
"""

from pathlib import Path


ROOT = Path("/opt/LivePortrait")


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"expected one patch anchor in {path}, found {count}")
    path.write_text(text.replace(old, new), encoding="utf-8")


def replace_all(path: Path, old: str, new: str, expected: int) -> None:
    text = path.read_text(encoding="utf-8")
    count = text.count(old)
    if count != expected:
        raise RuntimeError(f"expected {expected} patch anchors in {path}, found {count}")
    path.write_text(text.replace(old, new), encoding="utf-8")


replace_once(
    ROOT / "src/config/argument_config.py",
    '    driving_multiplier: float = 1.0 # be used only when driving_option is "expression-friendly"\n',
    '    driving_multiplier: float = 1.0 # be used only when driving_option is "expression-friendly"\n'
    '    eye_gaze_blend: float = 0.0 # blend a small raw gaze delta with eye retargeting\n',
)

replace_once(
    ROOT / "src/config/inference_config.py",
    '    driving_multiplier: float = 1.0\n',
    '    driving_multiplier: float = 1.0\n'
    '    eye_gaze_blend: float = 0.0\n',
)

replace_once(
    ROOT / "src/live_portrait_pipeline.py",
    "            else:\n                eyes_delta, lip_delta = None, None\n                if inf_cfg.flag_eye_retargeting and source_lmk is not None:\n",
    "            else:\n                eyes_delta, lip_delta = None, None\n                # Preserve the eye-region driving signal before retargeting\n                # replaces it with the eyelid-close delta.\n                raw_eye_delta = x_d_i_new - x_s\n                if inf_cfg.flag_eye_retargeting and source_lmk is not None:\n",
)

replace_once(
    ROOT / "src/live_portrait_pipeline.py",
    "                    lip_delta = self.live_portrait_wrapper.retarget_lip(x_s, combined_lip_ratio_tensor)\n\n                if inf_cfg.flag_relative_motion:  # use x_s\n",
    "                    lip_delta = self.live_portrait_wrapper.retarget_lip(x_s, combined_lip_ratio_tensor)\n\n                eye_gaze_blend = max(0.0, min(1.0, float(getattr(inf_cfg, \"eye_gaze_blend\", 0.0))))\n                blended_eyes = eyes_delta if eyes_delta is not None else 0\n                if eye_gaze_blend > 0.0:\n                    blended_eyes = blended_eyes + raw_eye_delta * eye_gaze_blend\n\n                if inf_cfg.flag_relative_motion:  # use x_s\n",
)

replace_all(
    ROOT / "src/live_portrait_pipeline.py",
    "                        (eyes_delta if eyes_delta is not None else 0)",
    "                        blended_eyes",
    2,
)

print("LivePortrait eye-gaze blend patch applied: 0.40 is supplied by the production worker profile")
