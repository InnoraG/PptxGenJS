"""Build a deterministic three-minute narration WAV from approved local TTS clips."""

from __future__ import annotations

import glob
import os
import wave


SOURCE_DIR = os.path.join("betterpptx-mcp", "outputs", "narration")
OUTPUT = os.path.join("betterpptx-mcp", "outputs", "commercial-poc", "final-three-minute-narration.wav")
TARGET_FRAMES = 180 * 22050


def main() -> None:
    paths = sorted(glob.glob(os.path.join(SOURCE_DIR, "*.wav")))
    if not paths:
        raise SystemExit("No local narration WAV clips found")
    selected: list[bytes] = []
    params = None
    frames = 0
    for path in paths:
        with wave.open(path, "rb") as source:
            current = source.getparams()
            if params is None:
                params = current
            if (current.nchannels, current.sampwidth, current.framerate, current.comptype) != (
                params.nchannels,
                params.sampwidth,
                params.framerate,
                params.comptype,
            ):
                continue
            remaining = TARGET_FRAMES - frames
            if remaining <= 0:
                break
            payload = source.readframes(remaining)
            selected.append(payload)
            frames += len(payload) // params.sampwidth // params.nchannels
    if params is None or frames < TARGET_FRAMES:
        raise SystemExit(f"Only {frames / 22050:.2f}s of compatible narration clips available")
    os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
    output_params = params._replace(nframes=TARGET_FRAMES)
    with wave.open(OUTPUT, "wb") as target:
        target.setparams(output_params)
        target.writeframes(b"".join(selected))
    print(f"{OUTPUT}\t{frames / params.framerate:.3f}s\t{len(paths)} source clips scanned")


if __name__ == "__main__":
    main()

