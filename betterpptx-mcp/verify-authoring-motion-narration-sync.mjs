#!/usr/bin/env node
// Public-MCP Authoring-v3 narration/motion proof. A deterministic local audio
// responder removes network/provider availability from the gate while the real
// resolve, locked dry-run, commit, animation binding, and validation paths remain
// unchanged. Package publication is reserved for an intentional release run.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const developmentNoSave = process.argv.includes('--development-no-save')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outputDir = path.join(repoRoot, 'outputs', 'authoring-v3-motion-proof', `narration-sync-${stamp}`)
await fs.mkdir(outputDir, { recursive: true })

Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_PUBLIC_BASE: 'http://127.0.0.1:1',
	BETTERPPTX_DOWNLOAD_ROOT: outputDir,
})

function deterministicWav(seconds = 10) {
	const sampleRate = 22050
	const dataBytes = sampleRate * 2 * seconds
	const bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0)
	bytes.writeUInt32LE(36 + dataBytes, 4)
	bytes.write('WAVE', 8)
	bytes.write('fmt ', 12)
	bytes.writeUInt32LE(16, 16)
	bytes.writeUInt16LE(1, 20)
	bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(sampleRate, 24)
	bytes.writeUInt32LE(sampleRate * 2, 28)
	bytes.writeUInt16LE(2, 32)
	bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36)
	bytes.writeUInt32LE(dataBytes, 40)
	return bytes
}

async function listFiles(root) {
	const files = []
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name)
		if (entry.isDirectory()) files.push(...await listFiles(full))
		else files.push(full)
	}
	return files
}

const audio = deterministicWav(10)
const server = http.createServer((request, response) => {
	if (request.method === 'POST') {
		response.writeHead(200, { 'content-type': 'audio/wav' })
		response.end(audio)
		return
	}
	response.writeHead(200, { 'content-type': 'application/json' })
	response.end('[]')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
process.env.BETTERPPTX_TTS_PROVIDER = 'piper-http'
process.env.BETTERPPTX_TTS_URL = `http://127.0.0.1:${server.address().port}`

const { createMcpToolDispatcher } = await import('./engine.mjs')
const { authoringMotionCatalog } = await import('./ir/authoring-motion-catalog.mjs')
const { default: JSZip } = await import('jszip')
const { validateTechStackVocabularyFromZip } = await import('./blackbox-vocabulary.mjs')

const publicDispatcher = createMcpToolDispatcher({
	sessionId: `authoring-v3-narration-sync-${Date.now()}`,
	clientInfo: { name: 'cold-ai-authoring-v3-narration-sync', version: '1' },
	blackBox: true,
})
let saveCalls = 0
const mcp = {
	async call(name, args) {
		if (name === 'betterpptx.deck.save') saveCalls += 1
		return publicDispatcher.call(name, args)
	},
}

const motionId = 'motion.kinetic.magical-reveal'
const catalogFingerprint = authoringMotionCatalog().catalogFingerprint
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Native motion follows the spoken beat',
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	contentStory: {
		audience: 'product leaders',
		outcome: 'see exact semantic presenter motion synchronized to narration',
		remember: 'the AI chooses the public motion ID and the engine executes it exactly',
	},
	visualDesign: { world: 'luxe', framing: 'native presenter and concise proof statement' },
	presenter: { id: 'host', identity: 'joe' },
	motionTime: {
		masterClock: 'narration-text',
		timingSource: 'authored narration',
		syncPolicy: 'one narration-led clock',
		kineticSelection: {
			presenters: [{ presenterId: 'host', selectedMotionIds: ['motion.ordinary.talk', motionId] }],
		},
	},
	slides: [{
		id: 'proof',
		title: 'The spoken beat starts the exact motion',
		role: 'proof',
		message: 'One public semantic ID becomes one native PowerPoint scene.',
		layoutIntent: 'title-body',
		narration: {
			script: 'First establish the context. Then reveal the exact motion now, and continue speaking while the complete native gesture plays inside the narration window.',
			voiceId: 'en_US-ljspeech-high',
			paddingMs: 700,
		},
		presenterMotion: { presenterId: 'host', motionId, narrationCue: 'reveal the exact motion' },
		content: [{ kind: 'body', name: 'proof-copy', text: 'AI-selected semantic motion. Native editable presenter. Narration-led timing.' }],
	}],
}

const checks = []
function check(name, condition, evidence = null) {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(evidence == null ? {} : { evidence }) })
	console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`)
	if (!condition && evidence != null) console.log(JSON.stringify(evidence, null, 2))
}

let deckId
let deckVersion
let artifactPath
let dry
let resolved
let lockedDryRun
let timeline
let motionBeat
try {
	const dryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	dry = dryResult?.data || dryResult
	check('public dry-run is mutation-free', dryResult.ok === true && dry.dryRun === true && dry.mutationFree === true && !dry.deckId)
	check('AI exact semantic selection survives dry-run', dry.authoringContracts?.motionSelection?.selectionAuthority === 'AI' && dry.authoringContracts.motionSelection.presenters?.[0]?.selectedMotionIds?.[1] === motionId && dry.authoringContracts.motionSelection.presenters[0].noSilentSubstitution === true)

	const resolveResult = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'resolve',
		commitMode: 'createNew',
		plan: 'premium',
		billingConfirmed: true,
		detail: 'full',
	})
	resolved = resolveResult?.data || resolveResult
	check('public resolve is mutation-free and locks measured narration', resolveResult.ok === true && resolved.phase === 'resolve' && resolved.mutationFree === true && resolved.lockedSpec && resolved.narrationTimeline?.source === 'resolved-audio' && resolved.timingSpine?.slides?.[0]?.timingSource === 'locked-audio', resolved?.error)

	const lockedDryRunResult = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: resolved.lockedSpec,
		phase: 'lockedDryRun',
		commitMode: 'createNew',
		plan: 'premium',
		detail: 'full',
	})
	lockedDryRun = lockedDryRunResult?.data || lockedDryRunResult
	check('locked dry-run reproduces the resolved timing plan without mutation', lockedDryRunResult.ok === true && lockedDryRun.phase === 'lockedDryRun' && lockedDryRun.mutationFree === true && lockedDryRun.resolution?.required === false && lockedDryRun.lockedSpecDigest === resolved.lockedSpecDigest && lockedDryRun.lockedPlanDigest === resolved.lockedPlanDigest && JSON.stringify(lockedDryRun.narrationTimeline?.slides) === JSON.stringify(resolved.narrationTimeline?.slides), lockedDryRun?.error)

	const commitResult = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: resolved.lockedSpec,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'premium',
		detail: 'full',
	})
	const committed = commitResult?.data || commitResult
	deckId = committed.deckId
	deckVersion = committed.deckVersion
	check('public MCP commit creates the governed deck', commitResult.ok === true && typeof deckId === 'string' && Number.isInteger(deckVersion))
	timeline = committed.narrationTimeline?.slides?.[0]
	motionBeat = timeline?.beats?.find(beat => beat.presenterMotion === true && beat.motionId === motionId)
	check('public narration clock hides the private voice identifier', timeline?.voiceId === null, timeline)
	check('resolved narration timeline identifies the semantic presenter-motion beat', timeline?.realDurationMs === 10000 && motionBeat?.target === 'presenter' && motionBeat.atMs > 0, { timeline, motionBeat })
	check('selected native motion completes within the narration-led dwell', motionBeat?.endMs <= timeline?.dwellMs && timeline?.dwellMs === 10700, { motionBeat, dwellMs: timeline?.dwellMs })

	const validationCalls = [
		['betterpptx.deck.validate', {}],
		['betterpptx.deck.validate_design', {}],
		['betterpptx.deck.validate_accessibility', {}],
		['betterpptx.deck.validate_narration', {}],
		['betterpptx.deck.validate_quality', { profile: 'narrated' }],
	]
	const validations = {}
	for (const [tool, extra] of validationCalls) {
		const result = await mcp.call(tool, { deckId, deckVersion, ...extra })
		validations[tool] = result?.data || result
		check(`${tool} executes through the public MCP route`, result.ok === true, result.error || validations[tool])
	}

	if (developmentNoSave) {
		check('development mode completes with zero save calls', saveCalls === 0)
		const report = {
			schemaVersion: 'betterpptx.authoring-v3-motion-narration-sync-proof.v1',
			status: checks.every(item => item.status === 'PASS') ? 'PASS_NON_CERTIFYING_PRE_SAVE' : 'FAIL',
			certificationEligible: false,
			certificationReason: 'Development proof stops after current-version validation. No deck.save or saved-package inspection was performed.',
			saveCalls,
			catalogFingerprint,
			motionId,
			planDigest: dry.planDigest,
			lockedSpecDigest: resolved.lockedSpecDigest,
			lockedPlanDigest: resolved.lockedPlanDigest,
			artifact: null,
			narrationClock: { realDurationMs: timeline?.realDurationMs, dwellMs: timeline?.dwellMs, motionBeat },
			checks,
		}
		await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
	} else {
		const slideCount = Number(committed.slideCount || spec.slides.length)
		let remainingSlideIndexes = Array.from({ length: slideCount }, (_value, index) => index)
		let previewPackageSha256 = null
		let previewValidationEvidenceSha256 = null
		let finalPreview = null
		while (remainingSlideIndexes.length > 0) {
			const requestedSlideIndexes = remainingSlideIndexes.slice(0, 12)
			const previewResult = await mcp.call('betterpptx.deck.preview', { deckId, deckVersion, slides: requestedSlideIndexes })
			const preview = previewResult?.data || previewResult
			if (!previewPackageSha256) previewPackageSha256 = preview.packageSha256
			if (!previewValidationEvidenceSha256) previewValidationEvidenceSha256 = preview.validationEvidenceSha256
			check('release preview batch stays bound to one validated frozen package', previewResult.ok === true && preview.packageSha256 === previewPackageSha256 && preview.validationEvidenceSha256 === previewValidationEvidenceSha256 && preview.validationVerification?.complete === true && preview.validationVerification?.verifiedDeckVersion === deckVersion && preview.batchLimit === 12 && (preview.renderedSlideIndexes || []).length <= 12 && JSON.stringify(preview.renderedSlideIndexes || []) === JSON.stringify(requestedSlideIndexes), preview)
			const nextRemaining = preview.remainingSlideIndexes || []
			if (nextRemaining.length >= remainingSlideIndexes.length && nextRemaining.length > 0) throw new Error('Release preview made no cumulative progress.')
			remainingSlideIndexes = nextRemaining
			finalPreview = preview
		}
		check('release preview covers every current-version slide', finalPreview?.complete === true && (finalPreview?.remainingSlideIndexes || []).length === 0 && (finalPreview?.previewedSlideIndexes || []).length === slideCount, finalPreview)

		const releaseIdempotencyKey = 'authoring-v3-motion-narration-sync-release-v1'
		const saveResult = await mcp.call('betterpptx.deck.save', {
			deckId,
			deckVersion,
			fileName: 'authoring-v3-native-motion-cue-proof.pptx',
			outputFormat: 'pptx',
			idempotencyKey: releaseIdempotencyKey,
		})
		const saved = saveResult?.data || saveResult
		check('public save returns the exact completely previewed package once as opaque metadata', saveCalls === 1 && saveResult.ok === true && Number(saved.bytes) > 0 && saved.packageSha256 === previewPackageSha256 && saved.previewVerification?.packageSha256 === previewPackageSha256 && saved.previewVerification?.validationEvidenceSha256 === previewValidationEvidenceSha256 && saved.previewVerification?.complete === true && (saved.previewVerification?.remainingSlideIndexes || []).length === 0 && !saved.path && !saved.outputDir, saved)
		const artifacts = (await listFiles(outputDir)).filter(file => file.toLowerCase().endsWith('.pptx'))
		artifactPath = artifacts[0]
		check('maintainer evidence harness locates the saved artifact outside public readback', artifacts.length === 1, artifacts)

		if (artifactPath) {
			const bytes = await fs.readFile(artifactPath)
			const zip = await JSZip.loadAsync(bytes)
			const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string')
			const relsXml = await zip.file('ppt/slides/_rels/slide1.xml.rels')?.async('string')
			check('saved package contains one editable native 3D model relationship', /relationships\/model3d/i.test(relsXml || '') && /model3d/i.test(relsXml || ''), relsXml?.match(/Target="[^"]+"/g))
			check('saved package contains native PowerPoint timing and play-scene channel', /<p:timing\b/.test(slideXml || '') && /embedded\d+/i.test(slideXml || ''), null)
			const techStack = await validateTechStackVocabularyFromZip(zip)
			check('decoded public package metadata contains no private technology or voice identifiers', techStack.ok === true, techStack.issues)
			const report = {
				schemaVersion: 'betterpptx.authoring-v3-motion-narration-sync-proof.v1',
				status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
				certificationEligible: true,
				saveCalls,
				catalogFingerprint,
				motionId,
				planDigest: dry.planDigest,
				lockedSpecDigest: resolved.lockedSpecDigest,
				lockedPlanDigest: resolved.lockedPlanDigest,
				artifact: {
					fileName: path.basename(artifactPath),
					bytes: bytes.length,
					sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
				},
				narrationClock: { realDurationMs: timeline?.realDurationMs, dwellMs: timeline?.dwellMs, motionBeat },
				checks,
			}
			await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
		}
	}
} finally {
	if (deckId) {
		try { await mcp.call('betterpptx.deck.dispose', { deckId, deckVersion }) } catch {}
	}
	await new Promise(resolve => server.close(resolve))
}

const failed = checks.filter(item => item.status !== 'PASS')
console.log(`AUTHORING MOTION NARRATION SYNC GATE: ${checks.length - failed.length} passed, ${failed.length} failed`)
console.log(`MODE ${developmentNoSave ? 'development-no-save (non-certifying)' : 'release-save'}`)
console.log(`SAVE_CALLS ${saveCalls}`)
console.log(`OUTPUT ${outputDir}`)
if (failed.length) process.exitCode = 1
