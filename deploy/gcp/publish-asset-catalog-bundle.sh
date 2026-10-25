#!/usr/bin/env bash
# Publishes the read-only asset catalogue bundle to its private bucket, keeping the
# same relative layout the engine resolves against BETTERPPTX_ASSETS_ROOT, then writes
# the precomputed inventory (built from the bucket listing itself) at the bundle root.
#
# Only the owner-cleared roots are published, and within them only what the catalogue
# loader reads: Microsoft Stock 3D records + GLBs, and the open library's manifest,
# models (with previews), icon sets and Natural Earth maps. Logs, progress files, run
# leftovers, textures, remote indexes and the private IconScout cache are never sent.
#
# usage: deploy/gcp/publish-asset-catalog-bundle.sh <assets-root> [bucket]
set -euo pipefail

src="${1:?usage: publish-asset-catalog-bundle.sh <assets-root> [bucket]}"
bucket="gs://${2:-betterpptx-mcp-20260926-catalog}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ms=outputs/microsoft_stock3d_library
ol=demos/betterpptx-online-assets
cd "$src"
test -d "$ms/records" && test -d "$ms/glb" && test -f "$ol/manifest.json"

sync() { gcloud storage rsync -r "$1" "$bucket/$1" "${@:2}"; }
gcloud storage cp "$ms/README.txt" "$bucket/$ms/README.txt"
gcloud storage cp "$ol/manifest.json" "$bucket/$ol/manifest.json"
gcloud storage cp "$ol/README.md" "$bucket/$ol/README.md"
sync "$ms/records"
sync "$ms/glb"
for set in lucide tabler iconoir phosphor; do sync "$ol/icons/$set" --exclude='package\.json$'; done
sync "$ol/maps/natural-earth"
sync "$ol/models/khronos" --exclude='\.gif$'
sync "$ol/models/open-source-3d-quality" --exclude='\.glb\.bin$|baseColor_[0-9]+\.png$'
sync "$ol/models/open-source-3d"

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
gcloud storage objects list "$bucket" --format=json > "$work/listing.json"
node "$here/build-asset-inventory.mjs" --listing "$work/listing.json" --out "$work/.betterpptx-asset-inventory.json"
gcloud storage cp "$work/.betterpptx-asset-inventory.json" "$bucket/.betterpptx-asset-inventory.json"
