#!/usr/bin/env node
// Bounded, no-network contract matrix for the native 3D Meshy canary boundary.
// It exercises the production CLI's accepted image counts and fail-closed live
// preflight without ever submitting a provider request.
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { buildMeshyMultiImageRequest } from './assets/meshy-avatar-provider.mjs'
import { writeJsonReport } from './lib/atomic-report.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const canary = path.join(here, 'verify-meshy-presenter-live-canary.mjs')
const evidenceDir = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'release-gates', 'meshy-input-contract-matrix-20260718')
const reportPath = path.join(evidenceDir, 'meshy-input-contract-matrix-20260718.json')
const joe = path.join(repo, 'betterpptx-mcp', 'assets', 'default-presenter-joe.png')
const louise = path.join(repo, 'betterpptx-mcp', 'assets', 'default-presenter-louise.png')
const poster = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'meshy-poster', 'meshy-native-poster.png')
const slide = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'visual-artifacts', 'powerpoint-production-hybrid', 'Slide1.PNG')
const invalidGlb = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar', 'production-hybrid-proof.glb')
const missing = path.join(evidenceDir, 'does-not-exist.png')
const validPngDataUri = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X7o5WQAAAABJRU5ErkJggg=='

function runCase(name, inputs, expectedStatus, extraArgs = [], env = {}) {
	const outDir = path.join(evidenceDir, name)
	const args = [canary, '--out-dir', outDir, ...extraArgs]
	for (const input of inputs) args.push('--input', input)
	const result = spawnSync(process.execPath, args, {
		cwd: repo,
		encoding: 'utf8',
		timeout: 30000,
		env: { ...process.env, BETTERPPTX_PREMIUM: '1', ...env },
	})
	const reportFile = path.join(outDir, 'canary-report.json')
	let childReport = null
	if (fs.existsSync(reportFile)) childReport = JSON.parse(fs.readFileSync(reportFile, 'utf8').replace(/^\uFEFF/, ''))
	const pass = Boolean(
		result.status !== null &&
		childReport &&
		childReport.status === expectedStatus &&
		childReport.networkAttempted === false &&
		(result.error ? false : true)
	)
	return {
		name,
		expectedStatus,
		observedStatus: childReport?.status || null,
		exitCode: result.status,
		networkAttempted: childReport?.networkAttempted === true,
		inputCount: childReport?.inputCount ?? inputs.length,
		pass,
	}
}

const cases = [
	runCase('valid-1-image', [joe], 'DRY_RUN_PASS'),
	runCase('valid-2-images', [joe, louise], 'DRY_RUN_PASS'),
	runCase('valid-3-images', [joe, louise, poster], 'DRY_RUN_PASS'),
	runCase('valid-4-images', [joe, louise, poster, slide], 'DRY_RUN_PASS'),
	runCase('invalid-0-images', [], 'INPUT_COUNT_INVALID'),
	runCase('invalid-5-images', [joe, louise, poster, slide, joe], 'INPUT_COUNT_INVALID'),
	runCase('invalid-format', [invalidGlb], 'INVALID_INPUT_FORMAT'),
	runCase('missing-input', [missing], 'INPUT_NOT_FOUND'),
	// The live canary now fails closed on the owner worksheet before it evaluates
	// the later approval or provider-account guards. Keep the matrix aligned with
	// that stronger first boundary; the later guards remain covered by their own
	// approval/account fixtures and the owner preflight verifier.
	runCase('live-without-owner-approval', [joe], 'OPEN_OWNER_DECISION_WORKSHEET', ['--live']),
	runCase('live-without-meshy-account', [joe], 'OPEN_OWNER_DECISION_WORKSHEET', ['--live'], {
		BETTERPPTX_MESHY_LIVE_CANARY_APPROVED: '1',
		BETTERPPTX_MESHY_LIVE_CANARY_SCOPE: 'OWNER_APPROVED_MESHY_API',
		BETTERPPTX_MESHY_LIVE_CANARY_CONFIRM: 'GENERATE_ONE_PAID_REQUEST',
	}),
]

const officialApiContract = {
	verifiedAt: '2026-07-19',
	multiImageTo3dDocs: 'https://docs.meshy.ai/en/api/multi-image-to-3d',
	pricingDocs: 'https://docs.meshy.ai/en/api/pricing',
	riggingDocs: 'https://docs.meshy.ai/en/api/rigging',
	imageCount: { min: 1, max: 4 },
	formats: ['jpg', 'jpeg', 'png'],
	transport: ['public-https-url', 'base64-data-uri'],
	sameSubjectDifferentAngles: true,
	aiModel: 'meshy-6',
	multiImageTexturedCredits: 30,
	autoRiggingCredits: 5,
	inputTaskRiggingFaceLimit: 300000,
}
const requestProbe = buildMeshyMultiImageRequest({ imageUrls: [validPngDataUri], targetPolycount: 220000, hdTexture: true })
const requestShape = {
	pass: [
		Object.keys(requestProbe).sort().join(',') === 'ai_model,alpha_thumbnail,auto_size,enable_pbr,hd_texture,image_enhancement,image_urls,moderation,multi_view_thumbnails,origin_at,pose_mode,remove_lighting,should_remesh,should_texture,target_formats,target_polycount,topology',
		requestProbe.ai_model === 'meshy-6',
		requestProbe.image_urls.length === 1,
		requestProbe.should_texture === true && requestProbe.hd_texture === true,
		requestProbe.should_remesh === true && requestProbe.topology === 'triangle',
		requestProbe.target_polycount === 220000,
		requestProbe.pose_mode === 'a-pose',
		requestProbe.target_formats.length === 1 && requestProbe.target_formats[0] === 'glb',
		requestProbe.auto_size === true && requestProbe.origin_at === 'bottom',
		requestProbe.alpha_thumbnail === true && requestProbe.multi_view_thumbnails === true,
	].every(Boolean),
	fields: Object.keys(requestProbe).sort(),
}

// Personalized mode accepts exactly one ordered plural image family. Exercise
// the front door directly so mixed source families cannot silently change the
// image ordering or route into a generic single-image path.
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
const { callBetterPptxTool } = await import('./engine.mjs')
const mixedFamiliesResult = await callBetterPptxTool('betterpptx.assets.generate_rigged3d', {
	imageBase64s: [validPngDataUri],
	imageUrls: ['https://example.com/not-fetched.png'],
})
const mixedFamiliesCase = {
	name: 'invalid-mixed-image-families',
	expectedStatus: 'TOOL_ERROR',
	observedStatus: mixedFamiliesResult?.ok === false ? 'TOOL_ERROR' : 'UNEXPECTED_SUCCESS',
	exitCode: mixedFamiliesResult?.ok === false ? 2 : 0,
	networkAttempted: false,
	inputCount: 2,
	pass: mixedFamiliesResult?.ok === false && /exactly one ordered personalized-avatar image array/i.test(String(mixedFamiliesResult?.error?.message || '')),
}
cases.push(mixedFamiliesCase)

const invalidDataUriResult = await callBetterPptxTool('betterpptx.assets.generate_rigged3d', {
	imageBase64s: ['data:image/png;base64,YQ=='],
})
const invalidDataUriCase = {
	name: 'invalid-data-uri-payload',
	expectedStatus: 'TOOL_ERROR',
	observedStatus: invalidDataUriResult?.ok === false ? 'TOOL_ERROR' : 'UNEXPECTED_SUCCESS',
	exitCode: invalidDataUriResult?.ok === false ? 2 : 0,
	networkAttempted: false,
	inputCount: 1,
	pass: invalidDataUriResult?.ok === false && /must be PNG or JPEG/i.test(String(invalidDataUriResult?.error?.message || '')),
}
cases.push(invalidDataUriCase)

const implementationMatchesOfficialContract =
	officialApiContract.imageCount.min === 1 &&
	officialApiContract.imageCount.max === 4 &&
	[1, 2, 3, 4].every(count => cases.find(item => item.name === `valid-${count}-image${count === 1 ? '' : 's'}`)?.pass === true) &&
	cases.find(item => item.name === 'invalid-0-images')?.pass === true &&
	cases.find(item => item.name === 'invalid-5-images')?.pass === true &&
	cases.find(item => item.name === 'invalid-mixed-image-families')?.pass === true &&
	cases.find(item => item.name === 'invalid-data-uri-payload')?.pass === true &&
	officialApiContract.formats.join(',') === 'jpg,jpeg,png' &&
	officialApiContract.transport.join(',') === 'public-https-url,base64-data-uri' &&
	officialApiContract.aiModel === 'meshy-6' &&
	officialApiContract.multiImageTexturedCredits + officialApiContract.autoRiggingCredits === 35

const report = {
	schemaVersion: 'betterpptx.native-3d-meshy-input-contract-matrix.v1',
	status: cases.every(item => item.pass) ? 'PASS' : 'FAIL',
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	networkAttempted: cases.some(item => item.networkAttempted),
	officialApiContract,
	implementationMatchesOfficialContract,
	requestShape,
	acceptedImageCounts: [1, 2, 3, 4],
	rejectedCases: ['0 images', '5 images', 'unsupported format', 'missing input', 'mixed plural image families', 'malformed data-URI payload'],
	livePreflightCases: ['owner decision worksheet open (approval/account guards intentionally not reached)', 'approval and Meshy-account guards remain covered by their dedicated fixtures'],
	cases,
	retryPolicy: 'No automatic retry. One bounded process per input-contract case; all cases are no-network or fail-closed before provider work.',
}
writeJsonReport(reportPath, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 2
