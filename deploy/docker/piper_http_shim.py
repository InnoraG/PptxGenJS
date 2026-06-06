#!/usr/bin/env python3
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

VOICES_DIR = Path(os.environ.get("PIPER_VOICES_DIR", "/voices"))
PORT = int(os.environ.get("PIPER_PORT", "5000"))
SYNTH_TIMEOUT_SECONDS = int(os.environ.get("PIPER_SYNTH_TIMEOUT_SECONDS", "180"))

def load_manifest():
    for name in ("runtime-manifest.json", "manifest.json"):
        p = VOICES_DIR / name
        if p.exists():
            with p.open("r", encoding="utf-8") as f:
                return json.load(f)
    return {"voices": []}

def voices():
    m = load_manifest()
    out = []
    for v in m.get("voices", []):
        out.append({
            "id": v.get("id"),
            "language": v.get("language"),
            "locale": v.get("locale"),
            "quality": v.get("quality"),
            "sampleRate": 22050,
            "channels": 1,
            "modelPath": v.get("modelPath") or f"/voices/{v.get('id')}.onnx",
            "configPath": v.get("configPath") or f"/voices/{v.get('id')}.onnx.json",
        })
    return out

class Handler(BaseHTTPRequestHandler):
    def _json(self, code, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.rstrip("/") == "/voices":
            return self._json(200, voices())
        if self.path == "/health":
            return self._json(200, {"ok": True})
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "":
            return self._json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("content-length") or "0")
            req = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            text = str(req.get("text") or "").strip()
            voice_id = req.get("voice")
            if not text:
                return self._json(400, {"error": "text is required"})
            voice = next((v for v in voices() if v.get("id") == voice_id), None) if voice_id else (voices()[0] if voices() else None)
            if not voice:
                return self._json(400, {"error": "voice not found", "voice": voice_id})
            model = voice.get("modelPath") or f"/voices/{voice['id']}.onnx"
            config = voice.get("configPath") or f"/voices/{voice['id']}.onnx.json"
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                out = tmp.name
            cmd = ["piper", "--model", model, "--config", config, "--output_file", out]
            proc = subprocess.run(cmd, input=text, text=True, capture_output=True, timeout=SYNTH_TIMEOUT_SECONDS)
            if proc.returncode != 0:
                return self._json(500, {"error": "piper failed", "detail": proc.stderr[-2000:]})
            data = Path(out).read_bytes()
            try:
                os.remove(out)
            except OSError:
                pass
            self.send_response(200)
            self.send_header("content-type", "audio/wav")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:
            return self._json(500, {"error": str(e)})

HTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
