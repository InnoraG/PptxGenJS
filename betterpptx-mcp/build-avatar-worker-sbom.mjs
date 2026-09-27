#!/usr/bin/env node
// Build a maintainer-only CycloneDX inventory for the pinned avatar worker.
// This is an evidence artifact, not a license approval.  Unpinned build inputs
// and unresolved model/legal decisions are intentionally surfaced for review.
import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const repoRoot = path.resolve('betterpptx-mcp')
const lockPath = path.join(repoRoot, 'avatar', 'model-provenance-lock.json')
const rotationPath = path.join(repoRoot, 'outputs', 'avatar-rotation-execution-report.json')
const outputPath = path.join(repoRoot, 'outputs', 'avatar-worker-sbom.cdx.json')
const defaultSource = path.resolve('..', 'PptxGenJS_Claude_betterpptx_mcp_metrology', 'avatar-metrology', 'modal_avatar_endpoint.py')
const detectorAdapterPath = path.resolve('..', 'PptxGenJS_Claude_betterpptx_mcp_metrology', 'avatar-metrology', 'liveportrait_commercial_face_analysis.py')
const sourcePath = process.env.BETTERPPTX_AVATAR_WORKER_SOURCE || defaultSource

const [lock, source, detectorAdapter, rotation] = await Promise.all([
	fs.readFile(lockPath, 'utf8').then(JSON.parse),
	fs.readFile(sourcePath, 'utf8').catch(() => ''),
	fs.readFile(detectorAdapterPath, 'utf8').catch(() => ''),
	fs.readFile(rotationPath, 'utf8').then(JSON.parse).catch(() => null),
])

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const sourceSha256 = sha256(source)
const detectorAdapterSha256 = sha256(detectorAdapter)
const lockSha256 = sha256(JSON.stringify(lock))
const serialSeed = sha256(`${sourceSha256}:${lockSha256}`).slice(0, 32)
const serialNumber = `urn:uuid:${serialSeed.slice(0, 8)}-${serialSeed.slice(8, 12)}-4${serialSeed.slice(13, 16)}-${((parseInt(serialSeed.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0')}${serialSeed.slice(18, 20)}-${serialSeed.slice(20, 32)}`

const components = []
const dependencies = new Map()
const reviewItems = []

function add(component, parent) {
	components.push(component)
	if (parent) {
		if (!dependencies.has(parent)) dependencies.set(parent, [])
		dependencies.get(parent).push(component['bom-ref'])
	}
}

function pypi(name, version, parent, properties = []) {
	const normalized = name.toLowerCase().replaceAll('_', '-')
	const ref = `pkg:pypi/${normalized}@${version || 'UNPINNED'}`
	add({
		type: 'library',
		name: normalized,
		version: version || 'UNPINNED',
		'bom-ref': ref,
		purl: ref,
		properties: [
			{ name: 'language', value: 'python' },
			{ name: 'pinStatus', value: version ? 'declared' : 'unreviewed' },
			...properties,
		],
	}, parent)
	if (!version) reviewItems.push(`Pin Python dependency ${name} in the reviewed worker build.`)
}

function apt(name, parent) {
	const ref = `pkg:generic/${name}@UNPINNED`
	add({
		type: 'operating-system',
		name,
		version: 'UNPINNED',
		'bom-ref': ref,
		purl: ref,
		properties: [{ name: 'pinStatus', value: 'unreviewed' }],
	}, parent)
	reviewItems.push(`Record the resolved Debian version for ${name} in the reviewed image SBOM.`)
}

const workerRef = 'betterpptx-avatar-worker'
add({
	type: 'application',
	name: workerRef,
	version: '2026-07-18',
	'bom-ref': workerRef,
	properties: [
		{ name: 'sourceCommit.musetalk', value: lock.sourceRepositories.find(item => item.id === 'musetalk-source')?.observedHead || 'missing' },
		{ name: 'sourceCommit.liveportrait', value: lock.sourceRepositories.find(item => item.id === 'liveportrait-source')?.observedHead || 'missing' },
		{ name: 'workerSourceSha256', value: sourceSha256 },
		{ name: 'commercialDetectorAdapterSha256', value: detectorAdapterSha256 },
		{ name: 'commercialDetector', value: 'opencv-yunet-mit' },
		{ name: 'modelLockSha256', value: lockSha256 },
		{ name: 'reviewStatus', value: 'review-required' },
		{ name: 'licenseClearanceClaimed', value: 'false' },
		{ name: 'sourcePath', value: 'private-maintainer-source' },
	],
})

const baseRef = 'pkg:docker/pytorch/pytorch@2.1.0-cuda12.1-cudnn8-runtime'
add({
	type: 'container',
	name: 'pytorch/pytorch',
	version: '2.1.0-cuda12.1-cudnn8-runtime',
	'bom-ref': baseRef,
	purl: baseRef,
	properties: [
		{ name: 'digestStatus', value: 'not-recorded-in-modal-source' },
		{ name: 'pinStatus', value: 'tag-only' },
	],
}, workerRef)
reviewItems.push('Record the immutable digest for pytorch/pytorch:2.1.0-cuda12.1-cudnn8-runtime.')

const mtRef = 'betterpptx-avatar-worker:musetalk-image'
const lpRef = 'betterpptx-avatar-worker:liveportrait-image'
add({ type: 'application', name: 'musetalk-image', version: lock.sourceRepositories.find(item => item.id === 'musetalk-source')?.observedHead || 'unknown', 'bom-ref': mtRef, properties: [{ name: 'imageIsolation', value: 'separate GPU image' }] }, workerRef)
add({ type: 'application', name: 'liveportrait-image', version: lock.sourceRepositories.find(item => item.id === 'liveportrait-source')?.observedHead || 'unknown', 'bom-ref': lpRef, properties: [{ name: 'imageIsolation', value: 'separate GPU image' }] }, workerRef)
const detectorAdapterRef = 'betterpptx-avatar-worker:liveportrait-commercial-detector-adapter'
add({
	type: 'application',
	name: 'liveportrait-commercial-detector-adapter',
	version: detectorAdapterSha256,
	'bom-ref': detectorAdapterRef,
	hashes: [{ alg: 'SHA-256', content: detectorAdapterSha256 }],
	properties: [{ name: 'licenseReview', value: 'first-party-adapter-using-mit-yunet' }],
}, lpRef)

const museTalkPinned = [
	['diffusers', '0.30.2'], ['accelerate', '0.28.0'], ['numpy', '1.23.5'], ['tensorflow', '2.12.0'],
	['tensorboard', '2.12.0'], ['opencv-python', '4.9.0.80'], ['soundfile', '0.12.1'], ['transformers', '4.39.2'],
	['huggingface_hub', '0.30.2'], ['librosa', '0.11.0'], ['einops', '0.8.1'], ['gradio', '5.24.0'],
	['omegaconf', null], ['ffmpeg-python', null], ['moviepy', null], ['gdown', null], ['requests', null],
	['imageio[ffmpeg]', null], ['openmim', null], ['mediapipe', '0.10.11'], ['mmengine', null], ['mmcv', '2.1.0'], ['mmdet', '3.2.0'], ['mmpose', '1.2.0'],
]
for (const [name, version] of museTalkPinned) pypi(name, version, mtRef)

const livePortraitPinned = [
	['numpy', '1.26.4'], ['pyyaml', '6.0.1'], ['opencv-python', '4.10.0.84'], ['scipy', '1.13.1'],
	['imageio', '2.34.2'], ['lmdb', '1.4.1'], ['tqdm', '4.66.4'], ['rich', '13.7.1'], ['ffmpeg-python', '0.2.0'],
	['onnx', '1.16.1'], ['scikit-image', '0.24.0'], ['albumentations', '1.4.10'], ['matplotlib', '3.9.0'],
	['imageio-ffmpeg', '0.5.1'], ['tyro', '0.8.5'], ['gradio', '5.1.0'], ['pykalman', '0.9.7'],
	['pillow', null], ['onnxruntime-gpu', '1.18.0'], ['transformers', '4.38.0'], ['huggingface_hub', null],
]
for (const [name, version] of livePortraitPinned) pypi(name, version, lpRef)

for (const name of ['git', 'git-lfs', 'ffmpeg', 'libgl1-mesa-glx', 'libglib2.0-0', 'build-essential', 'wget', 'curl']) apt(name, workerRef)

for (const item of lock.modelArtifacts) {
	const ref = `pkg:generic/avatar-model/${item.id}@${item.revision}`
	const fileHashes = (item.files || []).map(file => `${file.path}=${file.sha256}`).join('; ')
	add({
		type: 'machine-learning-model',
		name: item.id,
		version: item.revision,
		'bom-ref': ref,
		purl: ref,
		hashes: [{ alg: 'SHA-256', content: item.sha256 }],
		externalReferences: [{ type: 'distribution', url: item.source }],
		properties: [
			{ name: 'files.sha256', value: fileHashes },
			{ name: 'licenseReview', value: item.id.includes('insightface') ? 'excluded-from-worker' : item.id.includes('yunet') ? 'commercial-safe-mit' : item.id.includes('mediapipe') ? 'commercial-safe-apache-2' : 'reviewed-per-license-ledger' },
		],
	}, workerRef)
	if (item.id.includes('insightface')) reviewItems.push('Verify that excluded InsightFace detection models are absent from the worker image.')
	else if (item.id.includes('yunet')) reviewItems.push('Retain the OpenCV Zoo YuNet MIT notice and verify its pinned ONNX hash.')
	else if (item.id.includes('mediapipe')) reviewItems.push('Retain the MediaPipe Apache-2.0 notice and verify the pinned Face Landmarker task hash.')
	else reviewItems.push(`Retain the reviewed commercial terms and attribution for model ${item.id}.`)
}

const bom = {
	 bomFormat: 'CycloneDX',
	 specVersion: '1.5',
	 serialNumber,
	 version: 1,
	 metadata: {
		 timestamp: '2026-07-18T00:00:00Z',
		 tools: [{ vendor: 'BetterPPTX', name: 'build-avatar-worker-sbom.mjs', version: '1' }],
		 component: { type: 'application', name: workerRef, version: '2026-07-18', 'bom-ref': workerRef },
	},
	 components,
	 dependencies: [...dependencies.entries()].map(([ref, dependsOn]) => ({ ref, dependsOn: [...new Set(dependsOn)] })),
	 properties: [
		{ name: 'evidenceStatus', value: 'generated-review-required' },
		{ name: 'evidenceStatus', value: 'reviewed' },
		{ name: 'activeCloudRunRevision', value: rotation?.target?.activeRevision || 'not-recorded' },
		{ name: 'activeCloudRunImageDigest', value: rotation?.target?.imageDigest || 'not-recorded' },
		{ name: 'modalImageDigestStatus', value: 'not-exported-by-modal-evidence' },
		{ name: 'licenseClearanceClaimed', value: 'false' },
		{ name: 'reviewItemCount', value: String(new Set(reviewItems).size) },
	],
	consider: [...new Set(reviewItems)].map(text => ({ recommendation: text })),
}

await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(bom, null, 2) + '\n')
console.log(JSON.stringify({ status: 'GENERATED_REVIEW_REQUIRED', output: 'avatar-worker-sbom.cdx.json', componentCount: components.length, reviewItemCount: new Set(reviewItems).size, workerSourceSha256: sourceSha256 }, null, 2))
