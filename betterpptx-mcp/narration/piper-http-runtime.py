#!/usr/bin/env python3
"""Small private Piper HTTP sidecar used by the BetterPPTX narration adapter.

This is an implementation/deployment helper, not part of the public MCP
surface.  It deliberately returns only public voice metadata and PCM WAV
bytes; the MCP service remains responsible for eligibility, authorization,
retention, measurement, and opaque asset handles.
"""

from __future__ import annotations

import io
import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from collections import OrderedDict
import threading
import wave

from piper import PiperVoice
from piper.config import SynthesisConfig


HOST = os.environ.get("PIPER_HOST", "127.0.0.1")
PORT = int(os.environ.get("PIPER_PORT", "5000"))
VOICE_DIR = Path(os.environ.get("PIPER_VOICES_DIR", "./voices")).resolve()
MANIFEST_PATH = Path(os.environ.get("PIPER_VOICES_MANIFEST", str(VOICE_DIR / "runtime-manifest.json"))).resolve()
MAX_TEXT_CHARS = int(os.environ.get("PIPER_MAX_TEXT_CHARS", "4000"))
# Loaded voices stay resident; cap them so a large catalogue cannot exhaust instance memory.
MAX_LOADED_VOICES = max(1, int(os.environ.get("PIPER_MAX_LOADED_VOICES", "6")))


def load_voice_rows():
    try:
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        rows = manifest.get("voices", []) if isinstance(manifest, dict) else []
    except Exception:
        rows = []
    if not rows:
        rows = [{"id": path.stem, "modelPath": str(path), "configPath": str(path) + ".json"}
                for path in sorted(VOICE_DIR.glob("*.onnx"))]
    normalized = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("id"):
            continue
        model = Path(str(row.get("modelPath") or (VOICE_DIR / f"{row['id']}.onnx")))
        config = Path(str(row.get("configPath") or (VOICE_DIR / f"{row['id']}.onnx.json")))
        if not model.is_absolute():
            model = VOICE_DIR / model.name
        if not config.is_absolute():
            config = VOICE_DIR / config.name
        if model.exists() and config.exists():
            normalized[str(row["id"])] = {**row, "modelPath": model, "configPath": config}
    return normalized


VOICE_ROWS = load_voice_rows()
VOICE_CACHE: "OrderedDict[str, PiperVoice]" = OrderedDict()
VOICE_LOCK = threading.Lock()


def public_voice_rows():
    rows = []
    for row in VOICE_ROWS.values():
        rows.append({key: value for key, value in row.items() if key not in {"modelPath", "configPath"}})
    return rows


def voice_for(voice_id):
    requested = str(voice_id or "").strip()
    if requested and requested in VOICE_ROWS:
        return VOICE_ROWS[requested]
    if "en_US-ljspeech-high" in VOICE_ROWS:
        return VOICE_ROWS["en_US-ljspeech-high"]
    if VOICE_ROWS:
        return next(iter(VOICE_ROWS.values()))
    raise RuntimeError("No usable Piper voice model is configured.")


def loaded_voice(row):
    voice_id = str(row["id"])
    with VOICE_LOCK:
        voice = VOICE_CACHE.get(voice_id)
        if voice is None:
            voice = PiperVoice.load(row["modelPath"], config_path=row["configPath"])
            VOICE_CACHE[voice_id] = voice
            while len(VOICE_CACHE) > MAX_LOADED_VOICES:
                VOICE_CACHE.popitem(last=False)
        else:
            VOICE_CACHE.move_to_end(voice_id)
        return voice


def synthesize(body):
    text = " ".join(str(body.get("text") or "").split()).strip()
    if not text:
        raise ValueError("text is required")
    if len(text) > MAX_TEXT_CHARS:
        raise ValueError(f"text exceeds the {MAX_TEXT_CHARS}-character limit")
    row = voice_for(body.get("voice"))
    config = SynthesisConfig(
        speaker_id=int(body["speaker"]) if body.get("speaker") is not None else None,
        length_scale=float(body["length_scale"]) if body.get("length_scale") is not None else None,
        noise_scale=float(body["noise_scale"]) if body.get("noise_scale") is not None else None,
        noise_w_scale=float(body["noise_w_scale"]) if body.get("noise_w_scale") is not None else None,
    )
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        loaded_voice(row).synthesize_wav(text, wav_file, syn_config=config)
    return output.getvalue(), row


class Handler(BaseHTTPRequestHandler):
    server_version = "BetterPPTX-Piper-Runtime"

    def log_message(self, _format, *_args):
        return

    def send_json(self, status, payload):
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/health":
            self.send_json(HTTPStatus.OK, {"status": "ok", "voiceCount": len(VOICE_ROWS)})
            return
        if self.path == "/voices":
            self.send_json(HTTPStatus.OK, public_voice_rows())
            return
        self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self):
        if self.path not in {"/", "/synthesize"}:
            self.send_json(HTTPStatus.NOT_FOUND, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length).decode("utf-8"))
            audio, row = synthesize(body)
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("X-Piper-Voice", str(row["id"]))
            self.send_header("Content-Length", str(len(audio)))
            self.end_headers()
            self.wfile.write(audio)
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"error": str(error)})
        except Exception as error:
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {"error": "synthesis runtime unavailable", "detail": str(error)})


if __name__ == "__main__":
    if not VOICE_ROWS:
        raise SystemExit(f"No usable Piper voices found in {VOICE_DIR}")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
