import test from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'

const here = path.dirname(fileURLToPath(import.meta.url))
const previewAssetGrantRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-preview-asset-grants-'))
process.env.BETTERPPTX_ASSET_GRANT_STORE = 'local'
process.env.BETTERPPTX_ASSET_GRANT_DIR = previewAssetGrantRoot
const engine = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')

test.after(async () => {
	await fs.rm(previewAssetGrantRoot, { recursive: true, force: true })
})

const STUB_PREVIEW_PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
const STUB_PREVIEW_SHA256 = crypto.createHash('sha256').update(STUB_PREVIEW_PNG).digest('hex')
const STUB_POWERPOINT_OPEN = Object.freeze({
	method: 'Presentations.Open2007',
	readOnly: true,
	withWindow: false,
	openAndRepair: false,
	repaired: false,
	evidence: 'successful-read-only-open-and-render-with-repair-disabled',
})

function installStubPowerPointPreviewExporter({ powerPointOpen = STUB_POWERPOINT_OPEN, renderSha256 = STUB_PREVIEW_SHA256 } = {}) {
	engine.setPowerPointPreviewExporterForTest(({ outDir, slideIndexes, width, height }) => {
		fsSync.mkdirSync(outDir, { recursive: true })
		return {
			ok: true,
			width,
			height,
			powerPointOpen,
			items: slideIndexes.map(slideIndex => {
				const filePath = path.join(outDir, `stub-preview-${slideIndex}.png`)
				fsSync.writeFileSync(filePath, STUB_PREVIEW_PNG)
				return { slideIndex, slideNumber: slideIndex + 1, filePath, bytes: STUB_PREVIEW_PNG.length, renderSha256 }
			}),
		}
	})
}

test('public preview batches are explicit, bounded, and cumulative', () => {
	const first = engine.normalizedPreviewBatch({}, 25, new Set())
	assert.deepEqual(first.renderSlideIndexes, Array.from({ length: 12 }, (_value, index) => index))
	assert.equal(first.requestedSlideIndexes.length, 25)

	const covered = new Set(first.renderSlideIndexes)
	const second = engine.normalizedPreviewBatch({}, 25, covered)
	assert.deepEqual(second.renderSlideIndexes, Array.from({ length: 12 }, (_value, index) => index + 12))

	const explicit = engine.normalizedPreviewBatch({ slides: [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12] }, 25, covered)
	assert.deepEqual(explicit.renderSlideIndexes, [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13])
	assert.deepEqual(explicit.requestedSlideIndexes, [24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12])
	assert.throws(() => engine.normalizedPreviewBatch({ slides: [25] }, 25, covered), error => error?.code === 'INVALID_PREVIEW_SLIDES')
})

test('public preview and save schemas expose the frozen-package contract without server paths', () => {
	const preview = TOOLS.find(tool => tool.name === 'betterpptx.deck.preview')
	const save = TOOLS.find(tool => tool.name === 'betterpptx.deck.save')
	assert.ok(preview)
	assert.ok(save)
	assert.deepEqual(save.inputSchema.required, ['deckId', 'idempotencyKey'])
	assert.ok(save.inputSchema.properties.idempotencyKey.pattern)
	assert.deepEqual(save.inputSchema.properties.outputFormat.enum, ['pptx'])
	assert.ok(save.inputSchema.properties.deckVersion)
	assert.equal(save.inputSchema.properties.outputDir, undefined)

	const previewOutput = preview.outputSchema.properties.data.properties
	for (const key of ['packageSha256', 'powerPointOpen', 'renderSetSha256', 'validationEvidenceSha256', 'validationVerification', 'renderedSlideIndexes', 'remainingSlideIndexes', 'complete', 'batchLimit']) assert.ok(previewOutput[key], key)
	const saveOutput = save.outputSchema.properties.data.properties
	for (const key of ['outputFormat', 'bytes', 'slideCount', 'packageSha256', 'previewVerification', 'selectionVerification', 'artifact', 'downloadUrl', 'idempotentReplay']) assert.ok(saveOutput[key], key)
	assert.equal(saveOutput.filePath, undefined)
})

test('authoritative PowerPoint exporter opens read-only with repair explicitly disabled', async () => {
	const source = await fs.readFile(path.join(here, '..', 'engine.mjs'), 'utf8')
	assert.match(source, /\$pres = \$ppt\.Presentations\.Open2007\(\$pptxPath, \$msoTrue, \$msoFalse, \$msoFalse, \$msoFalse\)/)
	assert.match(source, /\[System\.Security\.Cryptography\.SHA256\]::Create\(\)/)
	assert.match(source, /\[System\.IO\.File\]::ReadAllBytes\(\$file\)/)
	assert.doesNotMatch(source, /Get-FileHash -LiteralPath \$file/)
})

test('public preview capability is explicit and fail-closed when authoritative infrastructure is absent', () => {
	const previousMaintainer = process.env.BETTERPPTX_LOCAL_MAINTAINER
	const previousConfigured = process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW
	try {
		process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
		delete process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW
		const blocked = engine.authoritativePreviewInfrastructureStatus()
		assert.equal(blocked.available, false)
		assert.equal(blocked.status, 'external-infrastructure-required')
		assert.equal(blocked.certificationImpact, 'public-save-blocked')

		if (process.platform === 'win32') {
			process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW = '1'
			const configured = engine.authoritativePreviewInfrastructureStatus()
			assert.equal(configured.available, true)
			assert.equal(configured.status, 'available')
		}
	} finally {
		if (previousMaintainer === undefined) delete process.env.BETTERPPTX_LOCAL_MAINTAINER
		else process.env.BETTERPPTX_LOCAL_MAINTAINER = previousMaintainer
		if (previousConfigured === undefined) delete process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW
		else process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW = previousConfigured
	}
})

test('public save reports the stable idempotency contract before deck lookup', async () => {
	const dispatcher = engine.createMcpToolDispatcher({ sessionId: 'preview-freeze-missing-key-test' })
	const result = await dispatcher.call('betterpptx.deck.save', { deckId: 'missing-deck' })
	assert.equal(result.ok, false)
	assert.equal(result.error?.code, 'IDEMPOTENCY_KEY_REQUIRED')
	assert.equal(result.error?.artifact_state, 'not_saved')
	assert.ok(result.error?.next_actions?.some(action => action.type === 'supply_idempotency_key'))
})

test('zero-save freeze retains exact package bytes and a version change invalidates approval', async () => {
	const spec = JSON.parse(await fs.readFile(path.join(here, '..', 'ir', 'examples', 'creation-executive.v1.json'), 'utf8'))
	spec.title = 'Pilot GCP before migrating the estate'
	spec.objective = 'Pilot GCP before migrating the estate'
	const dispatcher = engine.createMcpToolDispatcher({ sessionId: 'preview-freeze-zero-save-test' })
	const committed = await dispatcher.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'commit',
		commitMode: 'createNew',
		plan: 'premium',
		detail: 'summary',
		idempotencyKey: 'preview-freeze-zero-save-commit-v1',
	})
	assert.equal(committed.ok, true, JSON.stringify(committed.error || {}))
	const data = committed.data || committed
	const entry = engine.getDeck(data.deckId)
	await assert.rejects(
		() => engine.ensurePublicPreviewFreeze(entry),
		error => error?.code === 'CURRENT_VERSION_VALIDATION_REQUIRED',
	)
	const quality = await dispatcher.call('betterpptx.deck.validate_quality', { deckId: data.deckId, profile: 'modern' })
	assert.equal(quality.ok, true, JSON.stringify(quality.error || {}))
	const qualityData = quality.data || quality
	assert.equal(qualityData.ok, true, JSON.stringify(qualityData.blockingIssues || []))
	assert.equal(qualityData.next?.recommendedTool, 'betterpptx.deck.preview')
	const validation = engine.currentVersionValidationVerification(entry)
	assert.equal(validation.complete, true)
	assert.equal(validation.verifiedDeckVersion, entry.deckVersion)
	const initialValidationHash = validation.validationEvidenceSha256
	const initialValidationResultHash = entry.director.verificationEvidence?.validationResultSha256
	const freeze = await engine.ensurePublicPreviewFreeze(entry)
	assert.equal(freeze.packageSafety.metadataLeak?.ok, true, JSON.stringify(freeze.packageSafety.metadataLeak?.issues || []))
	const expectedHash = crypto.createHash('sha256').update(freeze.packageBytes).digest('hex')
	assert.equal(freeze.packageSha256, expectedHash)
	assert.ok(freeze.packageBytes.length > 1000)
	const frozenZip = await JSZip.loadAsync(freeze.packageBytes)
	assert.ok(frozenZip.file('ppt/betterpptx-edition.xml'), 'final sidecar projection must be frozen before preview')
	assert.equal((entry.pptx._rawPackageParts || []).some(part => part?.path === 'ppt/betterpptx-edition.xml'), false, 'preview freeze must not mutate the live semantic deck graph')

	const sameFreeze = await engine.ensurePublicPreviewFreeze(entry)
	assert.equal(sameFreeze, freeze)
	assert.equal(sameFreeze.packageSha256, expectedHash)

	const previousDownloadConfig = engine.getDownloadConfig()
	const previousMaintainer = process.env.BETTERPPTX_LOCAL_MAINTAINER
	const previousAuthoritativePreview = process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW
	const previewArtifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-preview-runtime-proof-'))
	process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'
	process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW = '1'
	try {
		engine.setDownloadConfig({ base: 'https://preview.invalid', root: previewArtifactRoot })
		installStubPowerPointPreviewExporter({
			powerPointOpen: { ...STUB_POWERPOINT_OPEN, openAndRepair: true, repaired: true },
		})
		const repairUnproven = await dispatcher.call('betterpptx.deck.preview', {
			deckId: data.deckId,
			slides: [0],
		})
		assert.equal(repairUnproven.ok, false)
		assert.equal(repairUnproven.error?.code, 'POWERPOINT_PREVIEW_REPAIR_PROOF_REQUIRED')
		assert.equal(repairUnproven.error?.artifact_state, 'not_saved')
		assert.deepEqual(engine.publicPreviewVerification(entry, freeze).previewedSlideIndexes, [])
		assert.doesNotMatch(JSON.stringify(repairUnproven), /filePath|localPath|outputDir|preview-runtime-proof/i)

		installStubPowerPointPreviewExporter({ renderSha256: '0'.repeat(64) })
		const hashMismatch = await dispatcher.call('betterpptx.deck.preview', {
			deckId: data.deckId,
			slides: [0],
		})
		assert.equal(hashMismatch.ok, false)
		assert.equal(hashMismatch.error?.code, 'POWERPOINT_PREVIEW_HASH_MISMATCH')
		assert.equal(hashMismatch.error?.artifact_state, 'not_saved')
		assert.deepEqual(engine.publicPreviewVerification(entry, freeze).previewedSlideIndexes, [])
		assert.doesNotMatch(JSON.stringify(hashMismatch), /filePath|localPath|outputDir|preview-runtime-proof/i)

		installStubPowerPointPreviewExporter()
		engine.setDownloadConfig({ base: '', root: previewArtifactRoot })
		const inaccessible = await dispatcher.call('betterpptx.deck.preview', {
			deckId: data.deckId,
			slides: [0],
		})
		assert.equal(inaccessible.ok, false)
		assert.equal(inaccessible.error?.code, 'PUBLIC_PREVIEW_ARTIFACT_UNAVAILABLE')
		assert.equal(inaccessible.error?.artifact_state, 'not_saved')
		assert.deepEqual(engine.publicPreviewVerification(entry, freeze).previewedSlideIndexes, [])
		const inaccessibleResultText = JSON.stringify(inaccessible)
		assert.doesNotMatch(inaccessibleResultText, /filePath|localPath|outputDir|preview-runtime-proof/i)

		engine.setDownloadConfig({ base: 'https://preview.invalid', root: previewArtifactRoot })
		const allSlideIndexes = Array.from({ length: freeze.slideCount }, (_value, index) => index)
		const previewResult = await dispatcher.call('betterpptx.deck.preview', {
			deckId: data.deckId,
			slides: allSlideIndexes,
		})
		assert.equal(previewResult.ok, true, JSON.stringify(previewResult.error || {}))
		const previewData = previewResult.data || previewResult
		assert.equal(previewData.packageSha256, freeze.packageSha256)
		assert.equal(previewData.validationEvidenceSha256, validation.validationEvidenceSha256)
		assert.equal(previewData.validationVerification?.complete, true)
		assert.equal(previewData.validationVerification?.verifiedDeckVersion, entry.deckVersion)
		assert.deepEqual(previewData.renderedSlideIndexes, allSlideIndexes)
		assert.equal(previewData.complete, true)
		assert.deepEqual(previewData.remainingSlideIndexes, [])
		assert.equal(previewData.previews?.[0]?.downloadUrl?.startsWith('https://preview.invalid/files/'), true)
		assert.equal(previewData.powerPointOpen?.method, 'powerpoint-read-only-open')
		assert.equal(previewData.powerPointOpen?.readOnly, true)
		assert.equal(previewData.powerPointOpen?.openAndRepair, false)
		assert.equal(previewData.powerPointOpen?.repaired, false)
		assert.equal(previewData.powerPointOpen?.verifiedSlideCount, freeze.slideCount)
		assert.ok(previewData.previews.every(preview => preview.renderSha256 === STUB_PREVIEW_SHA256))
		assert.ok(previewData.previews.every(preview => preview.powerPointOpen?.repaired === false))
		const expectedRenderSetSha256 = crypto.createHash('sha256').update(JSON.stringify({
			packageSha256: freeze.packageSha256,
			renders: allSlideIndexes.map(slideIndex => ({ slideIndex, renderSha256: STUB_PREVIEW_SHA256 })),
		})).digest('hex')
		assert.equal(previewData.renderSetSha256, expectedRenderSetSha256)

		const revalidated = await dispatcher.call('betterpptx.deck.validate_quality', { deckId: data.deckId, profile: 'modern' })
		assert.equal(revalidated.ok, true, JSON.stringify(revalidated.error || {}))
		const revalidatedData = revalidated.data || revalidated
		assert.equal(revalidatedData.ok, true, JSON.stringify(revalidatedData.blockingIssues || []))
		const revalidatedProof = engine.currentVersionValidationVerification(entry)
		assert.equal(entry.director.verificationEvidence?.validationResultSha256, initialValidationResultHash, JSON.stringify({
			initialValidationResultHash,
			currentValidationResultHash: entry.director.verificationEvidence?.validationResultSha256,
			next: revalidatedData.next,
		}))
		assert.equal(revalidatedProof.validationEvidenceSha256, initialValidationHash, 'unchanged current-version validation must retain its evidence hash')
		assert.equal(engine.currentPublicPreviewFreeze(entry), freeze, 'unchanged revalidation must retain complete preview coverage')
		assert.equal(revalidatedData.next?.recommendedTool, 'betterpptx.deck.save')
	} finally {
		engine.setPowerPointPreviewExporterForTest()
		engine.setDownloadConfig({ base: previousDownloadConfig.base, root: previousDownloadConfig.root })
		if (previousMaintainer === undefined) delete process.env.BETTERPPTX_LOCAL_MAINTAINER
		else process.env.BETTERPPTX_LOCAL_MAINTAINER = previousMaintainer
		if (previousAuthoritativePreview === undefined) delete process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW
		else process.env.BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW = previousAuthoritativePreview
		await fs.rm(previewArtifactRoot, { recursive: true, force: true })
	}

	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-freeze-byte-proof-'))
	try {
		const copiedPath = path.join(tempDir, 'published-copy.pptx')
		await fs.writeFile(copiedPath, freeze.packageBytes)
		const copied = await fs.readFile(copiedPath)
		assert.deepEqual(copied, freeze.packageBytes)
		assert.equal(crypto.createHash('sha256').update(copied).digest('hex'), freeze.packageSha256)
	} finally {
		await fs.rm(tempDir, { recursive: true, force: true })
	}

	const complete = engine.publicPreviewVerification(entry, freeze)
	assert.equal(complete.complete, true)
	assert.deepEqual(complete.remainingSlideIndexes, [])

	const failedRevalidation = await dispatcher.call('betterpptx.deck.validate_quality', {
		deckId: data.deckId,
		profile: 'narrated',
		requireNarration: true,
	})
	assert.equal(failedRevalidation.ok, true, JSON.stringify(failedRevalidation.error || {}))
	const failedRevalidationData = failedRevalidation.data || failedRevalidation
	assert.equal(failedRevalidationData.ok, false)
	assert.notEqual(failedRevalidationData.next?.recommendedTool, 'betterpptx.deck.save')
	assert.equal(engine.currentVersionValidationVerification(entry).complete, false)
	assert.equal(engine.currentPublicPreviewFreeze(entry), null, 'a failed aggregate rerun must revoke previously complete preview approval')

	// Model a save whose response was lost without invoking deck.save in this
	// development test. Its completed same-key record must remain replayable even
	// though the later, same-version validation rerun above revoked current release
	// approval. A different/new save still reaches the current-state gates.
	const replayKey = 'preview-freeze-completed-save-replay-v1'
	const replayArgsHash = crypto.createHash('sha256').update(JSON.stringify({
		deckId: data.deckId,
	})).digest('hex')
	const replayDeckVersion = entry.deckVersion
	const replayPackageSha256 = 'a'.repeat(64)
	const lastArtifactBeforeReplay = entry.lastArtifact
	entry.idempotencyRecords ||= new Map()
	entry.idempotencyRecords.set(`betterpptx.deck.save:${replayKey}`, {
		hash: replayArgsHash,
		status: 'done',
		result: {
			ok: true,
			deckVersion: replayDeckVersion,
			outputFormat: 'pptx',
			bytes: 4096,
			slideCount: entry.pptx.slides.length,
			packageSha256: replayPackageSha256,
			previewVerification: { complete: true, packageSha256: replayPackageSha256 },
			selectionVerification: { status: 'verified', selectionCount: 0, verifiedCount: 0, failedCount: 0 },
			artifact: { state: 'download_ready' },
			downloadUrl: 'https://artifact.invalid/files/completed-save-replay.pptx',
		},
	})
	const completedReplay = await dispatcher.call('betterpptx.deck.save', {
		deckId: data.deckId,
		idempotencyKey: replayKey,
	})
	assert.equal(completedReplay.ok, true, JSON.stringify(completedReplay.error || {}))
	assert.equal(completedReplay.data?.idempotentReplay, true)
	assert.equal(completedReplay.data?.deckVersion, replayDeckVersion)
	assert.equal(completedReplay.data?.packageSha256, replayPackageSha256)
	assert.equal(completedReplay.data?.downloadUrl, 'https://artifact.invalid/files/completed-save-replay.pptx')
	assert.equal(entry.lastArtifact, lastArtifactBeforeReplay, 'completed replay must not execute a new save')
	assert.doesNotMatch(JSON.stringify(completedReplay), /filePath|localPath|outputDir/i)
	const newSaveAttempt = await dispatcher.call('betterpptx.deck.save', {
		deckId: data.deckId,
		idempotencyKey: 'preview-freeze-new-save-still-gated-v1',
	})
	assert.equal(newSaveAttempt.ok, false)
	assert.equal(newSaveAttempt.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED')

	const recoveredValidation = await dispatcher.call('betterpptx.deck.validate_quality', { deckId: data.deckId, profile: 'modern' })
	assert.equal(recoveredValidation.ok, true, JSON.stringify(recoveredValidation.error || {}))
	const recoveredValidationData = recoveredValidation.data || recoveredValidation
	assert.equal(recoveredValidationData.ok, true, JSON.stringify(recoveredValidationData.blockingIssues || []))
	assert.equal(recoveredValidationData.next?.recommendedTool, 'betterpptx.deck.preview')
	const recoveredFreeze = await engine.ensurePublicPreviewFreeze(entry)
	for (let index = 0; index < recoveredFreeze.slideCount; index += 1) {
		recoveredFreeze.previewedSlideIndexes.add(index)
		recoveredFreeze.renderEvidenceBySlide.set(index, {
			renderSha256: STUB_PREVIEW_SHA256,
			powerPointOpen: {
				method: 'powerpoint-read-only-open',
				readOnly: true,
				withWindow: false,
				openAndRepair: false,
				repaired: false,
			},
		})
	}
	assert.equal(engine.publicPreviewVerification(entry, recoveredFreeze).complete, true)

	const previousVersion = entry.deckVersion
	const appendSpec = structuredClone(spec)
	delete appendSpec.sections
	const appended = await dispatcher.call('betterpptx.deck.generate_from_spec', {
		deckId: data.deckId,
		spec: appendSpec,
		phase: 'commit',
		commitMode: 'append',
		plan: 'premium',
		detail: 'summary',
		idempotencyKey: 'preview-freeze-zero-save-append-v1',
	})
	assert.equal(appended.ok, true, JSON.stringify(appended.error || {}))
	assert.equal(entry.deckVersion, previousVersion + 1)
	assert.equal(entry.director.verificationEvidence, null)
	const staleValidation = engine.currentVersionValidationVerification(entry)
	assert.equal(staleValidation.complete, false)
	assert.equal(staleValidation.verifiedDeckVersion, null)
	assert.equal(engine.currentPublicPreviewFreeze(entry), null)
	const invalidated = engine.publicPreviewVerification(entry)
	assert.equal(invalidated.complete, false)
	assert.equal(invalidated.status, 'required')
	assert.deepEqual(invalidated.previewedSlideIndexes, [])
	const completedReplayAfterMutation = await dispatcher.call('betterpptx.deck.save', {
		deckId: data.deckId,
		idempotencyKey: replayKey,
	})
	assert.equal(completedReplayAfterMutation.ok, true, JSON.stringify(completedReplayAfterMutation.error || {}))
	assert.equal(completedReplayAfterMutation.data?.idempotentReplay, true)
	assert.equal(completedReplayAfterMutation.data?.deckVersion, replayDeckVersion, 'replay must retain the originally published deck version')
	assert.equal(completedReplayAfterMutation.data?.packageSha256, replayPackageSha256)
	assert.equal(completedReplayAfterMutation.data?.downloadUrl, 'https://artifact.invalid/files/completed-save-replay.pptx')
})
