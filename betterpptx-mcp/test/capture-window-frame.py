#!/usr/bin/env python3
"""Capture one exact Windows HWND to PNG for PowerPoint playback evidence."""

from __future__ import annotations

import ctypes
import pathlib
import sys
import time

from PIL import ImageGrab


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", ctypes.c_long),
        ("top", ctypes.c_long),
        ("right", ctypes.c_long),
        ("bottom", ctypes.c_long),
    ]


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: capture-window-frame.py HWND OUTPUT.png")
    hwnd = int(sys.argv[1])
    output = pathlib.Path(sys.argv[2])
    # PowerPoint can create the slideshow window behind the current desktop
    # application when COM was launched without a document window. Bring only
    # the exact owned HWND forward before capture; the host-side oracle binds
    # the handle to its own PowerPoint process first.
    user32 = ctypes.windll.user32
    handle = ctypes.c_void_p(hwnd)
    swp_nomove = 0x0002
    swp_nosize = 0x0001
    swp_showwindow = 0x0040
    flags = swp_nomove | swp_nosize | swp_showwindow
    user32.ShowWindow(handle, 9)
    # A COM-started slideshow can begin behind the calling app and Windows may
    # reject a single SetForegroundWindow request. A brief topmost round-trip
    # makes the exact owned slideshow drawable without relying on focus luck.
    user32.SetWindowPos(handle, ctypes.c_void_p(-1), 0, 0, 0, 0, flags)
    user32.BringWindowToTop(handle)
    user32.SetForegroundWindow(handle)
    user32.UpdateWindow(handle)
    time.sleep(0.35)
    rect = RECT()
    if not ctypes.windll.user32.GetWindowRect(ctypes.c_void_p(hwnd), ctypes.byref(rect)):
        raise OSError(f"GetWindowRect failed for HWND {hwnd}")
    bbox = (rect.left, rect.top, rect.right, rect.bottom)
    if bbox[2] <= bbox[0] or bbox[3] <= bbox[1]:
        raise ValueError(f"empty window rectangle: {bbox}")
    output.parent.mkdir(parents=True, exist_ok=True)
    ImageGrab.grab(bbox=bbox, all_screens=True).save(output)
    user32.SetWindowPos(handle, ctypes.c_void_p(-2), 0, 0, 0, 0, flags)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
