"""Build the square-avatar (Cameo-style) three-minute narration proof.

PowerPoint's literal native Cameo is a live camera placeholder.  The reusable
recorded-avatar path is a native PowerPoint video media object rendered in a
square frame; this script validates that product behavior without pretending
the prerecorded MP4 is a live Cameo feed.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import zipfile


SOURCE_VIDEO = os.path.join("betterpptx-mcp", "outputs", "commercial-poc", "final-commercial-avatar-3min.mp4")
SQUARE_VIDEO = os.path.join("betterpptx-mcp", "outputs", "commercial-poc", "final-commercial-avatar-3min-square.mp4")
SHELL = os.path.join("betterpptx-mcp", "outputs", "private-avatar-mcp-canary.pptx")
OUTPUT = os.path.join(
    "betterpptx-mcp", "outputs", "commercial-poc", "final-commercial-avatar-3min-square-recording-validated.pptx"
)


def main() -> None:
    ffmpeg = subprocess.check_output(
        ["py", "-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], text=True
    ).strip()
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            SOURCE_VIDEO,
            "-vf",
            "crop=iw:iw:0:(ih-iw)/2",
            "-r",
            "25",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-movflags",
            "+faststart",
            SQUARE_VIDEO,
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    with tempfile.TemporaryDirectory(prefix="commercial-avatar-square-poster-") as temp:
        poster = os.path.join(temp, "poster.png")
        subprocess.run([ffmpeg, "-y", "-i", SQUARE_VIDEO, "-frames:v", "1", poster], check=True, capture_output=True)
        with zipfile.ZipFile(SHELL, "r") as source:
            with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as target:
                for info in source.infolist():
                    data = source.read(info.filename)
                    if info.filename == "ppt/media/media-1-1.mp4":
                        data = open(SQUARE_VIDEO, "rb").read()
                    elif info.filename == "ppt/media/image-1-3.png":
                        data = open(poster, "rb").read()
                    elif info.filename == "ppt/slides/slide1.xml":
                        data = data.replace(
                            b'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"',
                            b'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"',
                            1,
                        )
                        data = data.replace(b'advTm="2000"', b'advTm="180000"')
                        media_marker = b'<p14:media r:embed="rId2"/>   </p:ext>  </p:extLst> </p:nvPr>'
                        narration_marker = (
                            b'<p14:media r:embed="rId2"/>   </p:ext>'
                            b'<p:ext uri="{42D2F446-02D8-4167-A562-619A0277C38B}">'
                            b'<p15:isNarration xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main" val="1"/>'
                            b'</p:ext></p:extLst></p:nvPr>'
                        )
                        if media_marker not in data:
                            raise RuntimeError("video media marker was not found in the validated shell")
                        data = data.replace(media_marker, narration_marker, 1)
                        old = b'<a:off x="8366760" y="3474720"/><a:ext cx="2423160" cy="2743200"/>'
                        new = b'<a:off x="8046720" y="3474720"/><a:ext cx="2743200" cy="2743200"/>'
                        if old not in data:
                            raise RuntimeError("square avatar geometry was not found in the validated shell")
                        data = data.replace(old, new)
                    target.writestr(info, data)
    print(f"{SQUARE_VIDEO}\t{os.path.getsize(SQUARE_VIDEO)} bytes")
    print(f"{OUTPUT}\t{os.path.getsize(OUTPUT)} bytes")


if __name__ == "__main__":
    main()
