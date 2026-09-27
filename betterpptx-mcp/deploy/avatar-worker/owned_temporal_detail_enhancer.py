"""Deterministic, model-free face detail enhancement for narration avatars.

The implementation uses only OpenCV operations and MediaPipe landmarks.  It
does not synthesize teeth, lips, eyes, or identity pixels; it reweights detail
already present in each frame and keeps the original audio during final muxing.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import tempfile
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np


FACE_OVAL = (10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109)
OUTER_LIP = (61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308)
LEFT_EYE = (263, 249, 390, 373, 374, 380, 381, 382, 362, 466, 388, 387, 386, 385, 384, 398)
RIGHT_EYE = (33, 7, 163, 144, 145, 153, 154, 155, 133, 246, 161, 160, 159, 158, 157, 173)


def _ffmpeg() -> str:
    executable = shutil.which("ffmpeg")
    if executable:
        return executable
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as error:
        raise RuntimeError("ffmpeg is required to preserve audio") from error


def _polygon_mask(shape, landmarks, indices, expansion=1.0, blur=17):
    height, width = shape[:2]
    points = np.asarray([(landmarks[index].x * width, landmarks[index].y * height) for index in indices], dtype=np.float32)
    center = points.mean(axis=0, keepdims=True)
    points = center + (points - center) * float(expansion)
    points[:, 0] = np.clip(points[:, 0], 0, width - 1)
    points[:, 1] = np.clip(points[:, 1], 0, height - 1)
    hull = cv2.convexHull(points.astype(np.int32))
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillConvexPoly(mask, hull, 255)
    if blur > 1:
        blur = blur if blur % 2 else blur + 1
        mask = cv2.GaussianBlur(mask, (blur, blur), 0)
    return mask.astype(np.float32) / 255.0


def _enhance(frame, landmarks):
    # Work at 2x resolution so the final Lanczos reduction acts as a stable
    # anti-aliasing pass rather than inventing high-frequency facial texture.
    high = cv2.resize(frame, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_LANCZOS4)
    base = cv2.GaussianBlur(high, (0, 0), 1.15)
    detail = high.astype(np.float32) - base.astype(np.float32)

    face = _polygon_mask(frame.shape, landmarks, FACE_OVAL, expansion=1.04, blur=25)
    mouth = _polygon_mask(frame.shape, landmarks, OUTER_LIP, expansion=1.58, blur=17)
    left_eye = _polygon_mask(frame.shape, landmarks, LEFT_EYE, expansion=1.42, blur=13)
    right_eye = _polygon_mask(frame.shape, landmarks, RIGHT_EYE, expansion=1.42, blur=13)
    eye = np.maximum(left_eye, right_eye)
    strength = np.clip(0.48 * face + 0.74 * mouth + 0.32 * eye, 0.0, 1.20)
    strength = cv2.resize(strength, (high.shape[1], high.shape[0]), interpolation=cv2.INTER_CUBIC)[..., None]

    enhanced = np.clip(high.astype(np.float32) + detail * strength, 0, 255).astype(np.uint8)
    return cv2.resize(enhanced, (frame.shape[1], frame.shape[0]), interpolation=cv2.INTER_LANCZOS4)


def run(input_path: Path, output_path: Path, model_path: Path):
    capture = cv2.VideoCapture(str(input_path))
    fps = float(capture.get(cv2.CAP_PROP_FPS) or 25.0)
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if width <= 0 or height <= 0:
        raise RuntimeError("input video could not be decoded")

    with tempfile.TemporaryDirectory(prefix="avatar_owned_enhance_") as tmp:
        visual = Path(tmp) / "visual.mp4"
        writer = cv2.VideoWriter(str(visual), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height))
        options = mp.tasks.vision.FaceLandmarkerOptions(
            base_options=mp.tasks.BaseOptions(model_asset_path=str(model_path)),
            running_mode=mp.tasks.vision.RunningMode.VIDEO,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_face_presence_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        frame_index = 0
        last_landmarks = None
        with mp.tasks.vision.FaceLandmarker.create_from_options(options) as detector:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                result = detector.detect_for_video(
                    mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb),
                    int(round(frame_index * 1000.0 / fps)),
                )
                if result.face_landmarks:
                    last_landmarks = result.face_landmarks[0]
                writer.write(_enhance(frame, last_landmarks) if last_landmarks is not None else frame)
                frame_index += 1
        capture.release()
        writer.release()
        if frame_index == 0:
            raise RuntimeError("input video contained no frames")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        command = [
            _ffmpeg(), "-y", "-i", str(visual), "-i", str(input_path),
            "-map", "0:v:0", "-map", "1:a?", "-c:v", "libx264", "-crf", "17",
            "-preset", "medium", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", str(output_path),
        ]
        result = subprocess.run(command, capture_output=True, text=True)
        if result.returncode != 0 or not output_path.is_file():
            raise RuntimeError("ffmpeg mux failed: " + result.stderr[-1200:])
    return {"frames": frame_index, "fps": fps, "width": width, "height": height, "output": str(output_path)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", required=True)
    args = parser.parse_args()
    print(run(Path(args.input).resolve(), Path(args.output).resolve(), Path(args.model).resolve()))


if __name__ == "__main__":
    main()
