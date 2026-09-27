#!/usr/bin/env node
// Bounded owner-authorized Meshy live canary for the native 3D presenter lane.
// Default behavior is a no-network dry run. A real request requires explicit
// owner approval, an external-processing scope acknowledgement, and a second
// paid-request confirmation. Evidence stores input hashes only; raw images and
// credentials are never written or printed.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { generatePersonalizedMeshyAvatar, meshyAvatarProviderStatus } from './assets/meshy-avatar-provider.mjs'
import { verifyMeshyMixamoHybrid } from './ir/meshy-mixamo-hybrid.mjs'
import { writeJsonReport } from './lib/atomic-report.mjs'

const root = path.resolve('.')
const defaultOutDir = path.join(root, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'live-meshy-canary')
const ownerDecisionWorksheetReportPath = path.join(root, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'release-gates', 'meshy-owner-decision-worksheet-20260718.json')
const argv = process.argv.slice(2)
const inputs = []
let outDir = defaultOutDir
let dryRun = true
for (let i = 0; i < argv.length; i++) {
	const arg = argv[i]
	if (arg === '--input') inputs.push(argv[++i] || '')
	else if (arg.startsWith('--input=')) inputs.push(arg.slice('--input='.length))
	else if (arg === '--out-dir') outDir = path.resolve(argv[++i] || defaultOutDir)
	else if (arg.startsWith('--out-dir=')) outDir = path.resolve(arg.slice('--out-dir='.length))
	else if (arg === '--live') dryRun = false
	else if (arg === '--dry-run') dryRun = true
}

const extToMime = new Map([['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg']])
const env = name => String(process.env[name] || '').trim()
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex').toUpperCase() }
function writeReport(report) {
	writeJsonReport(path.join(outDir, 'canary-report.json'), report)
	writeJsonReport(path.join(outDir, `canary-report-${String(report.status || 'unknown').toLowerCase()}.json`), report)
	console.log(JSON.stringify(report, null, 2))
}
function failReport(status, reason, details = {}) {
	writeReport({
		schemaVersion: 'betterpptx.native-3d-meshy-live-canary.v1',
		status,
		scope: 'native-3d-presenter-only',
		developmentMode: 'premium',
		networkAttempted: false,
		reason,
		provider: meshyAvatarProviderStatus(),
		inputCount: inputs.length,
		...details,
		retryPolicy: 'No automatic retry. One owner-authorized request per explicit input hash and confirmation token.',
	})
	process.exitCode = 2
}

const inputRecords = []
for (const raw of inputs) {
	const filePath = path.resolve(raw)
	const ext = path.extname(filePath).toLowerCase()
	const mime = extToMime.get(ext)
	if (!mime) { failReport('INVALID_INPUT_FORMAT', 'Only PNG, JPG, and JPEG inputs are accepted.', { inputPathCount: inputs.length }); process.exit() }
	if (!fs.existsSync(filePath)) { failReport('INPUT_NOT_FOUND', 'An explicitly supplied canary input does not exist.', { inputPathCount: inputs.length }); process.exit() }
	const bytes = fs.readFileSync(filePath)
	inputRecords.push({ sha256: sha256(bytes), bytes: bytes.length, mime })
}
if (inputs.length < 1 || inputs.length > 4) {
	failReport('INPUT_COUNT_INVALID', 'The canary requires 1 to 4 explicit full-body PNG/JPG/JPEG images.', { inputCount: inputs.length, inputRecords })
	process.exit()
}

if (dryRun) {
	writeReport({
		schemaVersion: 'betterpptx.native-3d-meshy-live-canary.v1',
		status: 'DRY_RUN_PASS',
		scope: 'native-3d-presenter-only',
		developmentMode: 'premium',
		networkAttempted: false,
		provider: meshyAvatarProviderStatus(),
		inputCount: inputs.length,
		inputRecords,
		contract: { minImages: 1, maxImages: 4, formats: ['image/png', 'image/jpeg'], fullBodyRequired: true },
		nextAction: 'Owner must configure the Meshy account and run --live with both explicit approval environment variables.',
		retryPolicy: 'No automatic retry. One owner-authorized request per explicit input hash and confirmation token.',
	})
	process.exit(0)
}

let ownerDecisionWorksheet = null
try { ownerDecisionWorksheet = JSON.parse(fs.readFileSync(ownerDecisionWorksheetReportPath, 'utf8')) } catch {}
if (ownerDecisionWorksheet?.status !== 'OWNER_DECISIONS_CLEARED' || ownerDecisionWorksheet?.checks?.noSensitiveFields !== true || ownerDecisionWorksheet?.openDecisionIds?.length !== 0) {
	failReport('OPEN_OWNER_DECISION_WORKSHEET', 'Run the worksheet verifier after the owner explicitly clears all seven native-3D decisions; no live Meshy request was attempted.', { inputRecords, ownerDecisionWorksheetStatus: ownerDecisionWorksheet?.status || 'MISSING', ownerDecisionOpenCount: Array.isArray(ownerDecisionWorksheet?.openDecisionIds) ? ownerDecisionWorksheet.openDecisionIds.length : null })
	process.exit()
}

if (env('BETTERPPTX_MESHY_LIVE_CANARY_APPROVED') !== '1') {
	failReport('OPEN_OWNER_APPROVAL', 'Set BETTERPPTX_MESHY_LIVE_CANARY_APPROVED=1 after reviewing the account, consent, and license ledger.', { inputRecords })
	process.exit()
}
if (env('BETTERPPTX_MESHY_LIVE_CANARY_SCOPE') !== 'OWNER_APPROVED_MESHY_API') {
	failReport('OPEN_EXTERNAL_PROCESSING_SCOPE', 'Set BETTERPPTX_MESHY_LIVE_CANARY_SCOPE=OWNER_APPROVED_MESHY_API only when the supplied images are approved for Meshy processing.', { inputRecords })
	process.exit()
}
if (env('BETTERPPTX_MESHY_LIVE_CANARY_CONFIRM') !== 'GENERATE_ONE_PAID_REQUEST') {
	failReport('OPEN_PAID_REQUEST_CONFIRMATION', 'Set BETTERPPTX_MESHY_LIVE_CANARY_CONFIRM=GENERATE_ONE_PAID_REQUEST for exactly one bounded paid request.', { inputRecords })
	process.exit()
}
const provider = meshyAvatarProviderStatus()
if (!provider.configured) {
	failReport('OPEN_MESHY_ACCOUNT', 'No owner-configured Meshy account is available in the credential store.', { inputRecords })
	process.exit()
}

try {
	const images = inputs.map((raw, index) => {
		const filePath = path.resolve(raw)
		const ext = path.extname(filePath).toLowerCase()
		const mime = extToMime.get(ext)
		return `data:${mime};base64,${fs.readFileSync(filePath).toString('base64')}`
	})
	const result = await generatePersonalizedMeshyAvatar({
		images,
		deadlineMs: 20 * 60 * 1000,
		pollMs: 5000,
	})
	const glb = Buffer.from(result.glbBase64, 'base64')
	const verified = await verifyMeshyMixamoHybrid(glb)
	const glbPath = path.join(outDir, 'hybrid.glb')
	fs.mkdirSync(outDir, { recursive: true })
	fs.writeFileSync(glbPath, glb)
	let poster = null
	if (result.previewBase64) {
		const posterPath = path.join(outDir, 'meshy-poster.png')
		const posterBytes = Buffer.from(result.previewBase64, 'base64')
		fs.writeFileSync(posterPath, posterBytes)
		poster = { path: posterPath, bytes: posterBytes.length, sha256: sha256(posterBytes) }
	}
	const manifestPath = path.join(outDir, 'manifest.json')
	fs.writeFileSync(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`)
	writeReport({
		schemaVersion: 'betterpptx.native-3d-meshy-live-canary.v1',
		status: poster ? 'PASS' : 'BLOCKED_POSTER_MISSING',
		scope: 'native-3d-presenter-only',
		developmentMode: 'premium',
		networkAttempted: true,
		provider: { configured: true, model: provider.model },
		inputCount: inputs.length,
		inputRecords,
		output: { glbBytes: glb.length, glbSha256: sha256(glb), poster, verified: { meshes: verified.meshes, materials: verified.materials, textures: verified.textures, joints: verified.joints, animations: verified.animations } },
		providerCredits: Number(result.providerCredits) || 0,
		manifestPath,
		retryPolicy: 'No automatic retry. One owner-authorized request per explicit input hash and confirmation token.',
	})
	if (!poster) process.exitCode = 2
} catch (error) {
	failReport('LIVE_CANARY_FAILED', error?.code || 'MESHY_CANARY_ERROR', { inputRecords, message: error?.message || String(error) })
}
