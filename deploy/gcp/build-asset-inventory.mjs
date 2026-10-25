#!/usr/bin/env node
// Writes the precomputed inventory (betterpptx-mcp/assets/asset-inventory.mjs) for a
// published asset bundle, so the catalogue loader never walks the mounted bucket.
//
// From the bucket itself (the inventory then matches exactly what is published):
//   gcloud storage objects list "gs://BUCKET/**" --format=json > listing.json
//   node deploy/gcp/build-asset-inventory.mjs --listing listing.json --out .betterpptx-asset-inventory.json
//   gcloud storage cp .betterpptx-asset-inventory.json gs://BUCKET/.betterpptx-asset-inventory.json
//
// From a local copy of the bundle:
//   node deploy/gcp/build-asset-inventory.mjs --dir path/to/bundle --out path/to/bundle/.betterpptx-asset-inventory.json

import fs from 'node:fs'
import path from 'node:path'
import { buildAssetInventory } from '../../betterpptx-mcp/assets/asset-inventory.mjs'

function arg(name) {
	const i = process.argv.indexOf(name)
	return i > 0 ? process.argv[i + 1] : ''
}

function fromListing(file) {
	const rows = JSON.parse(fs.readFileSync(file, 'utf8'))
	if (!Array.isArray(rows)) throw new Error('listing must be the JSON array printed by gcloud storage objects list --format=json')
	return rows.map(row => {
		// gcloud storage rsync records the source mtime (seconds) in custom metadata.
		const custom = row.custom_fields || row.metadata || {}
		const mtimeSeconds = Number(custom['goog-reserved-file-mtime'])
		const mtimeMs = Number.isFinite(mtimeSeconds) && mtimeSeconds > 0 ? mtimeSeconds * 1000 : Date.parse(row.update_time || row.creation_time || 0)
		return { rel: String(row.name || ''), bytes: Number(row.size), mtimeMs }
	})
}

function fromDir(root) {
	const entries = []
	const walk = dir => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else if (entry.isFile()) {
				const st = fs.statSync(full)
				entries.push({ rel: path.relative(root, full), bytes: st.size, mtimeMs: st.mtimeMs })
			}
		}
	}
	walk(root)
	return entries
}

const listing = arg('--listing')
const dir = arg('--dir')
const out = arg('--out')
if (!out || (!listing && !dir)) {
	console.error('usage: build-asset-inventory.mjs (--listing listing.json | --dir bundleDir) --out inventory.json')
	process.exit(2)
}
const inventory = buildAssetInventory(listing ? fromListing(listing) : fromDir(path.resolve(dir)))
fs.writeFileSync(out, JSON.stringify(inventory))
const bytes = Object.values(inventory.files).reduce((sum, [size]) => sum + size, 0)
console.log(JSON.stringify({ out, fileCount: inventory.fileCount, bytes }))
