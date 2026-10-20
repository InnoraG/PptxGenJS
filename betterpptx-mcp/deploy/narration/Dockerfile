# syntax=docker/dockerfile:1
# Private narration runtime (Piper) for Cloud Run. The build context is
# assembled by .github/workflows/betterpptx-mcp-cloudrun-free-beta.yml:
#   piper-http-runtime.py   (betterpptx-mcp/narration/piper-http-runtime.py)
#   voices/                 approved voices downloaded + checksum-verified
#                           against narration/voices/runtime-manifest.production.json
FROM python:3.11-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIPER_HOST=0.0.0.0 \
    PIPER_PORT=8080 \
    PIPER_VOICES_DIR=/voices \
    PIPER_VOICES_MANIFEST=/voices/runtime-manifest.json
RUN pip install --no-cache-dir piper-tts==1.8.0 \
    && useradd -u 10002 -m piper
WORKDIR /srv/piper
COPY --chown=piper piper-http-runtime.py /srv/piper/piper-http-runtime.py
COPY --chown=piper voices/ /voices/
RUN python -c "import json,pathlib;m=json.load(open('/voices/runtime-manifest.json'));missing=[v['id'] for v in m['voices'] if not pathlib.Path('/voices',v['id']+'.onnx').is_file()];assert m['voices'] and not missing, missing"
USER piper
EXPOSE 8080
CMD ["python", "/srv/piper/piper-http-runtime.py"]
