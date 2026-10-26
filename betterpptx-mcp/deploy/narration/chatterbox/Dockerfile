# syntax=docker/dockerfile:1
# Small application context; immutable model/reference objects are mounted read-only.
FROM python:3.11.14-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 \
    CHATTERBOX_DEVICE=cpu CHATTERBOX_HOST=0.0.0.0 CHATTERBOX_PORT=8080 \
    CHATTERBOX_MODEL_VARIANT=multilingual CHATTERBOX_MULTILINGUAL_VERSION=v3 CHATTERBOX_CPU_THREADS=2 \
    CHATTERBOX_MODEL_DIR=/speech-bundle/models \
    CHATTERBOX_VOICES_MANIFEST=/app/runtime-manifest.json \
    CHATTERBOX_REFERENCE_ROOT=/speech-bundle/references \
    CHATTERBOX_CUSTOM_REFERENCE_ROOT=/tmp/private-reference-cache
COPY install-source.py source-identity.json /tmp/pinned-speech-source/
RUN apt-get update && apt-get install -y --no-install-recommends libsndfile1 \
    && rm -rf /var/lib/apt/lists/* \
    && python -m pip install --no-cache-dir torch==2.6.0 torchaudio==2.6.0 --index-url https://download.pytorch.org/whl/cpu \
    && python -m pip install --no-cache-dir chatterbox-tts==0.1.7 resemble-perth==1.0.1 \
    && python -m pip install --no-cache-dir transformers==5.2.0 gradio==6.8.0 \
    && python /tmp/pinned-speech-source/install-source.py --identity /tmp/pinned-speech-source/source-identity.json \
    && python -m pip check \
    && useradd --uid 10001 --create-home speech
WORKDIR /app
ENV CHATTERBOX_MODEL_DIR=/app/model-links PKUSEG_HOME=/opt/tokenizer-assets/pkuseg
COPY --chown=speech runtime.py verify-bundle.py model-source.json runtime-manifest.json source-identity.json provision-tokenizers.py /app/
RUN python /app/provision-tokenizers.py
RUN --network=none python -c "from chatterbox.models.tokenizers.tokenizer import ChineseCangjieConverter; c=ChineseCangjieConverter('/app/model-links'); assert c.word2cj and c.segmenter is not None"
USER speech
EXPOSE 8080
CMD ["python", "/app/verify-bundle.py", "--start"]
