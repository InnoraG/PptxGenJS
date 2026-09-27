"""Build the final POC deck from the validated BetterPPTX media shell.

The shell already contains the native PowerPoint p14 media, poster
relationship, autoplay timing node, and media relationships. We replace only
the media payload and matching poster frame for this owner-approved POC.
"""

from __future__ import annotations

import io
import os
import shutil
import subprocess
import tempfile
import zipfile


SHELL = os.path.join("betterpptx-mcp", "outputs", "private-avatar-mcp-canary.pptx")
VIDEO = os.path.join("betterpptx-mcp", "outputs", "commercial-poc", "final-commercial-avatar-3min.mp4")
OUTPUT = os.path.join("betterpptx-mcp", "outputs", "commercial-poc", "final-commercial-avatar-3min-narration-validated.pptx")


def main() -> None:
    ffmpeg = subprocess.check_output(
        ["py", "-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], text=True
    ).strip()
    with tempfile.TemporaryDirectory(prefix="commercial-avatar-poster-") as temp:
        poster = os.path.join(temp, "poster.png")
        subprocess.run([ffmpeg, "-y", "-i", VIDEO, "-frames:v", "1", poster], check=True, capture_output=True)
        with zipfile.ZipFile(SHELL, "r") as source:
            with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
                for info in source.infolist():
                    data = source.read(info.filename)
                    if info.filename == "ppt/media/media-1-1.mp4":
                        with open(VIDEO, "rb") as stream:
                            data = stream.read()
                    elif info.filename == "ppt/media/image-1-3.png":
                        with open(poster, "rb") as stream:
                            data = stream.read()
                    elif info.filename == "ppt/slides/slide1.xml":
                        # The validated shell uses a two-second transition;
                        # extend it to cover the full three-minute narration.
                        data = data.replace(b'advTm="2000"', b'advTm="180000"')
                    target.writestr(info, data)
    print(f"{OUTPUT}\t{os.path.getsize(OUTPUT)} bytes")


if __name__ == "__main__":
    main()
