# Build from the repository root:
#   docker build -f betterpptx-mcp/deploy/Dockerfile .
#
# This image runs the BetterPPTX MCP HTTP service with ffmpeg/ffprobe available
# for PowerPoint-safe audio/video normalization. Model-backed avatar rendering
# runs out-of-process through the configured avatar worker URL.

FROM node:22-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates ffmpeg tini \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY dist ./dist
# The production image intentionally does not bundle the multi-gigabyte demo
# corpus. The runtime asset catalog is optional and the live service already
# uses its external/locked asset stores; missing local demo roots fail closed
# to an empty catalog rather than blocking the MCP/PowerPoint/avatar runtime.
COPY betterpptx-mcp ./betterpptx-mcp

ENV NODE_ENV=production \
	BETTERPPTX_HOST=0.0.0.0 \
	BETTERPPTX_PORT=3344 \
	BETTERPPTX_PUBLIC_BLACK_BOX=1 \
	BETTERPPTX_FFMPEG_PATH=/usr/bin/ffmpeg \
	BETTERPPTX_FFPROBE_PATH=/usr/bin/ffprobe \
	BETTERPPTX_RUNTIME_DIR=/app/.betterpptx-runtime \
	BETTERPPTX_AVATAR_PROVIDER=disabled \
	BETTERPPTX_AVATAR_MAX_CONCURRENCY=1 \
	BETTERPPTX_AVATAR_MAX_SECONDS=120 \
	BETTERPPTX_AVATAR_CACHE_DIR=/var/lib/betterpptx/avatar

RUN mkdir -p /app/.betterpptx-runtime /var/lib/betterpptx/avatar /var/lib/betterpptx/outputs \
	&& chown -R node:node /app/.betterpptx-runtime /var/lib/betterpptx

USER node
WORKDIR /app/betterpptx-mcp
EXPOSE 3344

ENTRYPOINT ["tini", "--"]
CMD ["node", "http-fast-start.mjs"]
