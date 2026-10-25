import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { ASSET_INVENTORY_FILE, ASSET_INVENTORY_SCHEMA, buildAssetInventory, createAssetFs } from '../assets/asset-inventory.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-asset-inventory-'))
	const files = {
		'outputs/library/records/Emoji.json': '[{"title":"Thumbs Up Emoji"}]',
		'outputs/library/glb/thumbs-up.glb': 'glTF-binary-bytes',
		'demos/open/icons/lucide/heart.svg': '<svg/>',
		'demos/open/icons/lucide/nested/star.svg': '<svg></svg>',
		'demos/open/manifest.json': '{"assets":[]}',
	}
	for (const [rel, body] of Object.entries(files)) {
		fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
		fs.writeFileSync(path.join(root, rel), body)
	}
	return root
}

function inventoryFromDisk(root) {
	const entries = []
	const walk = dir => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			const full = path.join(dir, entry.name)
			if (entry.isDirectory()) walk(full)
			else entries.push({ rel: path.relative(root, full), bytes: fs.statSync(full).size, mtimeMs: fs.statSync(full).mtimeMs })
		}
	}
	walk(root)
	return buildAssetInventory(entries)
}

test('without an inventory file every call passes through to the real filesystem', () => {
	const root = fixture()
	const assetFs = createAssetFs({ root, fs })
	assert.equal(assetFs.active, false)
	const glb = path.join(root, 'outputs/library/glb/thumbs-up.glb')
	assert.equal(assetFs.existsSync(glb), true)
	assert.equal(assetFs.statSync(glb).size, fs.statSync(glb).size)
	assert.deepEqual(assetFs.readdirSync(path.join(root, 'demos/open/icons/lucide')).sort(), ['heart.svg', 'nested'])
})

test('with an inventory, exists/stat/readdir match the bundle without touching it', () => {
	const root = fixture()
	fs.writeFileSync(path.join(root, ASSET_INVENTORY_FILE), JSON.stringify(inventoryFromDisk(root)))
	// A counting fs proves only the inventory file itself is read under the root.
	const calls = []
	const countingFs = new Proxy(fs, { get(target, key) {
		const value = target[key]
		return typeof value === 'function' ? (...args) => { calls.push([key, String(args[0])]); return value.apply(target, args) } : value
	} })
	const assetFs = createAssetFs({ root, fs: countingFs })
	assert.equal(assetFs.active, true)
	const glb = path.join(root, 'outputs/library/glb/thumbs-up.glb')
	assert.equal(assetFs.existsSync(glb), true)
	assert.equal(assetFs.existsSync(path.join(root, 'outputs/library/glb')), true)
	assert.equal(assetFs.existsSync(path.join(root, 'outputs/library/glb/missing.glb')), false)
	const st = assetFs.statSync(glb)
	assert.equal(st.size, fs.statSync(glb).size)
	assert.equal(st.isFile(), true)
	assert.equal(Math.round(st.mtimeMs), Math.round(fs.statSync(glb).mtimeMs))
	assert.equal(typeof st.mtime.toISOString(), 'string')
	assert.equal(assetFs.statSync(path.join(root, 'outputs')).isDirectory(), true)
	assert.throws(() => assetFs.statSync(path.join(root, 'nope.glb')), { code: 'ENOENT' })
	assert.equal(assetFs.statSync(path.join(root, 'nope.glb'), { throwIfNoEntry: false }), undefined)
	assert.deepEqual(assetFs.readdirSync(path.join(root, 'demos/open/icons/lucide')), ['heart.svg', 'nested'])
	const dirents = assetFs.readdirSync(path.join(root, 'demos/open/icons/lucide'), { withFileTypes: true })
	assert.deepEqual(dirents.map(d => [d.name, d.isDirectory(), d.isFile()]), [['heart.svg', false, true], ['nested', true, false]])
	assert.throws(() => assetFs.readdirSync(path.join(root, 'demos/private')), { code: 'ENOENT' })
	assert.deepEqual(assetFs.readdirSync(root).sort(), ['demos', 'outputs'])
	assert.deepEqual(calls.map(([key, file]) => [key, path.basename(file)]), [['readFileSync', ASSET_INVENTORY_FILE]])
})

test('paths outside the bundle root always pass through', () => {
	const root = fixture()
	fs.writeFileSync(path.join(root, ASSET_INVENTORY_FILE), JSON.stringify(buildAssetInventory([])))
	const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-asset-outside-'))
	fs.writeFileSync(path.join(outside, 'deck.pptx'), 'x')
	const assetFs = createAssetFs({ root, fs })
	assert.equal(assetFs.existsSync(path.join(outside, 'deck.pptx')), true)
	assert.equal(assetFs.statSync(path.join(outside, 'deck.pptx')).size, 1)
})

test('an unreadable or foreign inventory is ignored rather than hiding the bundle', () => {
	const root = fixture()
	fs.writeFileSync(path.join(root, ASSET_INVENTORY_FILE), JSON.stringify({ schema: 'something-else', files: {} }))
	const assetFs = createAssetFs({ root, fs })
	assert.equal(assetFs.active, false)
	assert.equal(assetFs.existsSync(path.join(root, 'demos/open/manifest.json')), true)
})

test('the builder script turns a bucket listing into the same inventory as the bundle on disk', () => {
	const root = fixture()
	const work = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-asset-listing-'))
	const listing = Object.entries(inventoryFromDisk(root).files).map(([name, [size, mtimeMs]]) => ({
		name,
		size,
		update_time: '2026-10-25T05:59:25+0000',
		custom_fields: { 'goog-reserved-file-mtime': String(Math.round(mtimeMs / 1000)) },
	}))
	const listingFile = path.join(work, 'listing.json')
	fs.writeFileSync(listingFile, JSON.stringify([...listing, { name: ASSET_INVENTORY_FILE, size: 10 }]))
	const out = path.join(work, 'out.json')
	execFileSync(process.execPath, [path.join(repoRoot, 'deploy/gcp/build-asset-inventory.mjs'), '--listing', listingFile, '--out', out])
	const built = JSON.parse(fs.readFileSync(out, 'utf8'))
	assert.equal(built.schema, ASSET_INVENTORY_SCHEMA)
	assert.equal(built.fileCount, 5)
	assert.deepEqual(Object.keys(built.files), Object.keys(inventoryFromDisk(root).files))
	assert.equal(built.files['outputs/library/glb/thumbs-up.glb'][0], 'glTF-binary-bytes'.length)
})

test('the release mounts the catalogue bucket read-only on the gateway and worker, with read-only IAM', () => {
	const workflow = fs.readFileSync(path.join(repoRoot, '.github/workflows/betterpptx-mcp-cloudrun-free-beta.yml'), 'utf8')
	const provision = fs.readFileSync(path.join(repoRoot, 'betterpptx-mcp/deploy/gcp/provision-cloud-run-free-beta.ps1'), 'utf8')
	assert.match(workflow, /BETTERPPTX_ASSETS_BUCKET: betterpptx-mcp-20260926-catalog/)
	assert.equal((workflow.match(/assets_volume=\(--clear-volumes "--add-volume=name=assets,type=cloud-storage,bucket=\$\{BETTERPPTX_ASSETS_BUCKET\},readonly=true,/g) || []).length, 2)
	for (const service of ['CLOUD_RUN_WORKER', 'CLOUD_RUN_GATEWAY']) {
		const deploy = workflow.split('\n').find(line => line.includes(`gcloud run deploy "$${service}"`))
		assert.ok(deploy?.includes('"${assets_volume[@]}"'), `${service} deploy mounts the catalogue`)
	}
	assert.equal((workflow.match(/BETTERPPTX_ASSETS_ROOT=\$\{BETTERPPTX_ASSETS_MOUNT\}/g) || []).length, 2)
	assert.match(workflow, /\$v\[0\]\.csi\.readOnly == true/)
	assert.match(provision, /"gs:\/\/\$CatalogBucket", "--member=serviceAccount:\$runtimeEmail", '--role=roles\/storage\.objectViewer'/)
	assert.doesNotMatch(provision, /\$CatalogBucket", "--member=serviceAccount:\$runtimeEmail", '--role=roles\/storage\.(objectAdmin|objectUser|admin|objectCreator)'/)
	assert.match(provision, /--public-access-prevention/)
})
