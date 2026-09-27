#!/usr/bin/env node
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { callBetterPptxTool } from './engine.mjs'

process.env.BETTERPPTX_FORCE_PLAN = 'premium'

function fail(message, detail = {}) {
	console.error('TIMING PRESERVE OR REPLACE VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function cloneJson(value) {
	return JSON.parse(JSON.stringify(value))
}

async function slideXmlFromPptx(filePath, slideNumber = 1) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	const file = zip.file(`ppt/slides/slide${slideNumber}.xml`)
	if (!file) fail(`ppt/slides/slide${slideNumber}.xml not found.`, { filePath })
	return file.async('string')
}

function timingXmlFromSlide(slideXml) {
	const match = String(slideXml || '').match(/<p:timing[\s\S]*?<\/p:timing>/)
	return match ? match[0] : ''
}

function assertHasTimingXml(label, slideXml) {
	const timingXml = timingXmlFromSlide(slideXml)
	if (!timingXml.trim()) fail(`${label} did not serialize p:timing.`, { slideXml: slideXml.slice(0, 2000) })
	return timingXml
}

function assertNoPrivateLeaks(value) {
	const text = JSON.stringify(value)
	const leaks = [
		/<(?:p|a|r|pkg):/i,
		/[A-Za-z]:[\\/][A-Za-z0-9_. -]/,
		/\/Users\//,
		/\/tmp\//,
		/\bnode_modules\b/i,
		/\bengine\.mjs\b/i,
	].filter(rx => rx.test(text)).map(String)
	if (leaks.length) fail('public exported spec leaked raw/private timing details.', { leaks })
}

function firstEditableObjectName(spec) {
	let fallback = null
	for (const slide of spec.slides || []) {
		for (const block of slide.content || []) {
			if (block.kind === 'opaqueNative') continue
			const name = block.objectName || block.name
			if (typeof name === 'string' && name.trim()) {
				const objectName = name.trim()
				const text = JSON.stringify(block)
				if (/timing-target|Timed source object/i.test(objectName) || /timing-target|Timed source object/i.test(text)) {
					return { slide, block, objectName }
				}
				fallback ||= { slide, block, objectName }
			}
		}
	}
	if (fallback) return fallback
	fail('exported spec did not contain an editable timing target.', { spec })
}

function editableObjectNameForSlide(spec, slideIndex) {
	const slide = spec?.slides?.[slideIndex]
	for (const block of slide?.content || []) {
		if (block.kind === 'opaqueNative') continue
		const name = block.objectName || block.name
		if (typeof name === 'string' && name.trim()) return name.trim()
	}
	fail(`exported spec slide ${slideIndex} did not contain an editable target.`, { slide })
}

function assertNativeTimingHandle(label, spec) {
	const slide = spec?.slides?.[0]
	const handle = slide?.nativeTimingPreservation?.handle || slide?.nativeTimingPreservation?.preservationHandle
	if (!handle || !/^asset:\/\/locked\/opaque-native\//i.test(String(handle))) {
		fail(`${label} did not expose a durable native timing preservation handle.`, slide || {})
	}
	return handle
}

function buildReplacementSpec(exportedSpec, objectName, title) {
	const spec = cloneJson(exportedSpec)
	spec.title = title
	const slide = spec.slides[0]
	slide.preserveNativeTiming = false
	slide.nativeTimingPreservation = false
	slide.timeline = [{
		objectName,
		type: 'entrance',
		effect: 'fade',
		trigger: 'onClick',
		delayMs: 125,
		durationMs: 650,
		replaceExistingTiming: true,
	}]
	return spec
}

function buildPatchTimingSpec(exportedSpec, objectName) {
	const slide = exportedSpec.slides[0] || {}
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Timing Patch Replacement',
		authoringContract: {
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			textPolicy: 'shape is geometry-only; use textBox or textShape for text',
		},
		slides: [{
			id: slide.id || 'slide-1',
			slideIndex: 0,
			layoutIntent: slide.layoutIntent || 'title-body',
			preserveNativeTiming: false,
			nativeTimingPreservation: false,
			timeline: [{
				objectName,
				type: 'emphasis',
				effect: 'pulse',
				trigger: 'onClick',
				delayMs: 75,
				durationMs: 500,
				replaceExistingTiming: true,
			}],
			content: [],
		}],
	}
}

function buildDeckSequencePatchSpec(exportedSpec, objectName, slideIndex) {
	const slide = exportedSpec.slides[slideIndex] || {}
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Deck Sequence Timing Patch',
		authoringContract: {
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			textPolicy: 'shape is geometry-only; use textBox or textShape for text',
		},
		motion: {
			sequences: [{
				slideIndex,
				steps: [{
					objectName,
					type: 'entrance',
					effect: 'fade',
					trigger: 'onClick',
					durationMs: 450,
					replaceExistingTiming: true,
				}],
			}],
		},
		slides: [{
			id: slide.id || `slide-${slideIndex + 1}`,
			slideIndex,
			layoutIntent: slide.layoutIntent || 'title-body',
			content: [],
		}],
	}
}

function buildDeleteNativeTimingPatchSpec(exportedSpec) {
	const slide = exportedSpec.slides[0] || {}
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Delete Native Timing Patch',
		authoringContract: {
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			textPolicy: 'shape is geometry-only; use textBox or textShape for text',
		},
		slides: [{
			id: slide.id || 'slide-1',
			slideIndex: 0,
			layoutIntent: slide.layoutIntent || 'title-body',
			preserveNativeTiming: false,
			nativeTimingPreservation: false,
			deleteNativeTiming: true,
			content: [],
		}],
	}
}

async function main() {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-timing-preserve-replace-'))
	const sourcePath = path.join(tempDir, 'source-animated.pptx')
	const preserveReplayPath = path.join(tempDir, 'preserve-replay.pptx')
	const replaceReplayPath = path.join(tempDir, 'replace-replay.pptx')
	const patchReplayPath = path.join(tempDir, 'patch-replay.pptx')
	const context = { sessionId: `verify-timing-preserve-replace-${Date.now()}` }

	const sourceSpec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Timing Preserve Replace Source',
		layout: 'LAYOUT_WIDE',
		authoringContract: {
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			textPolicy: 'shape is geometry-only; use textBox or textShape for text',
		},
		slides: [{
			id: 'timing-source-slide',
			title: 'Timing Source',
			layoutIntent: 'title-body',
			background: { color: 'FFFFFF' },
			content: [
				{
					kind: 'textBox',
					name: 'timing-target',
					objectName: 'timing-target',
					text: 'Timed source object',
					bbox: { x: 0.8, y: 0.8, w: 4.2, h: 0.7 },
					style: { fontSize: 24, color: '111827', bold: true },
				},
			],
			timeline: [{
				objectName: 'timing-target',
				type: 'entrance',
				effect: 'flyIn',
				direction: 'left',
				trigger: 'onClick',
				delayMs: 0,
				durationMs: 900,
			}],
		}, {
			id: 'timing-source-slide-2',
			title: 'Second Timing Target',
			layoutIntent: 'title-body',
			background: { color: 'F8FAFC' },
			content: [{
				kind: 'textBox',
				name: 'timing-target-2',
				objectName: 'timing-target-2',
				text: 'Second slide timing target',
				bbox: { x: 0.8, y: 0.8, w: 4.2, h: 0.7 },
				style: { fontSize: 24, color: '111827', bold: true },
			}],
		}],
	}

	const source = okResult('source generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: sourceSpec,
		phase: 'commit',
		validateAfterCompile: true,
		detail: 'summary',
	}, context))
	okResult('source validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId: source.deckId }, context))
	okResult('source save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: source.deckId,
		fileName: sourcePath,
	}, context))
	const sourceTimingXml = assertHasTimingXml('source generated deck', await slideXmlFromPptx(sourcePath))

	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
	const bytes = await fs.readFile(sourcePath)
	const opened = okResult('open_uploaded', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: 'source-animated.pptx',
		preserveTiming: true,
	}, context))
	const exported = okResult('export_spec imported timing', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: opened.deckId,
		detail: 'full',
	}, context))
	assertNoPrivateLeaks(exported.spec)
	const nativeHandle = assertNativeTimingHandle('imported export_spec', exported.spec)
	const { objectName } = firstEditableObjectName(exported.spec)
	const secondObjectName = editableObjectNameForSlide(exported.spec, 1)

	const preserved = okResult('preserve replay generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: exported.spec,
		phase: 'commit',
		validateAfterCompile: true,
		detail: 'summary',
	}, context))
	okResult('preserve replay save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: preserved.deckId,
		fileName: preserveReplayPath,
	}, context))
	const preservedTimingXml = assertHasTimingXml('preserved replay deck', await slideXmlFromPptx(preserveReplayPath))
	if (preservedTimingXml.length < Math.max(50, sourceTimingXml.length * 0.25)) {
		fail('preserved replay timing XML looked unexpectedly small.', { sourceLength: sourceTimingXml.length, preservedLength: preservedTimingXml.length })
	}

	const replacementSpec = buildReplacementSpec(exported.spec, objectName, 'Timing Replacement Replay')
	const replacement = okResult('replace replay generate_from_spec', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		spec: replacementSpec,
		phase: 'commit',
		validateAfterCompile: true,
		detail: 'summary',
		includeCallPlan: true,
	}, context))
	const replacementAnimation = (replacement.committedObjects || []).find(item => item.tool === 'betterpptx.slide.animate_shapes')
	if (!replacementAnimation || Number(replacementAnimation.animationsApplied || 0) < 1) {
		fail('replacement spec did not apply generated timing animation.', replacement)
	}
	const replacementExport = okResult('replace replay export_spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: replacement.deckId,
		detail: 'full',
	}, context))
	if (replacementExport.spec?.slides?.[0]?.nativeTimingPreservation) {
		fail('replacement deck still has raw native timing preservation in memory.', replacementExport.spec.slides[0].nativeTimingPreservation)
	}
	okResult('replace replay save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: replacement.deckId,
		fileName: replaceReplayPath,
	}, context))
	const replacementTimingXml = assertHasTimingXml('replacement replay deck', await slideXmlFromPptx(replaceReplayPath))
	if (replacementTimingXml === sourceTimingXml) {
		fail('replacement timing XML is byte-identical to the preserved source timing.', { length: replacementTimingXml.length })
	}

	const openedSummary = okResult('opened deck summary', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: opened.deckId,
	}, context))
	const patchSpec = buildPatchTimingSpec(exported.spec, objectName)
	const patchDryRun = okResult('patch timing dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: opened.deckId,
		deckVersion: openedSummary.deckVersion,
		commitMode: 'patch',
		phase: 'dryRun',
		spec: patchSpec,
		includePatchPlan: true,
	}, context))
	if (!Array.isArray(patchDryRun.patchOperations) || !patchDryRun.patchOperations.some(op => op.tool === 'betterpptx.slide.animate_shapes')) {
		fail('patch dry-run did not expose a timing replacement operation.', patchDryRun)
	}
	if ((patchDryRun.warnings || []).some(warning => warning?.code === 'MOTION_TARGET_NOT_FOUND')) {
		fail('lean timing patch returned a false MOTION_TARGET_NOT_FOUND warning.', patchDryRun.warnings)
	}
	if (!patchDryRun.billing?.patchEstimate || Number(patchDryRun.billing.patchEstimate.operationCount || 0) < 1) {
		fail('patch dry-run did not estimate the timing replacement operation.', patchDryRun.billing || {})
	}

	const missingSpec = buildPatchTimingSpec(exported.spec, 'missing-timing-target')
	const missingDryRun = okResult('missing target timing dryRun', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: opened.deckId,
		commitMode: 'patch',
		phase: 'dryRun',
		spec: missingSpec,
		includePatchPlan: true,
	}, context))
	if (Number(missingDryRun.billing?.patchEstimate?.operationCount || 0) !== 0) {
		fail('missing timing target was included in the billing estimate.', missingDryRun.billing || {})
	}
	if (!(missingDryRun.patchUnsupportedFindings || []).some(item => item?.code === 'TIMING_TARGET_MISSING')) {
		fail('missing timing target dry-run did not report TIMING_TARGET_MISSING.', missingDryRun)
	}

	const missingBytes = await fs.readFile(sourcePath)
	const missingOpened = okResult('open_uploaded missing-target deck', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${missingBytes.toString('base64')}`,
		fileName: 'source-animated-missing-target.pptx',
		preserveTiming: true,
	}, context))
	const missingSummary = okResult('missing-target deck summary', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: missingOpened.deckId,
	}, context))
	const missingCommit = okResult('missing target timing commit', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: missingOpened.deckId,
		deckVersion: missingSummary.deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: missingSpec,
		billingConfirmed: true,
	}, context))
	if ((missingCommit.patchResults || []).length !== 0) {
		fail('missing timing target commit executed a patch operation.', missingCommit)
	}
	if (!(missingCommit.unsupportedFindings || []).some(item => item?.code === 'TIMING_TARGET_MISSING')) {
		fail('missing timing target commit did not report TIMING_TARGET_MISSING.', missingCommit)
	}

	const sequenceOpened = okResult('open_uploaded deck-sequence deck', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: 'source-animated-deck-sequence.pptx',
		preserveTiming: true,
	}, context))
	const sequenceSummary = okResult('deck-sequence deck summary', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: sequenceOpened.deckId,
	}, context))
	const sequenceSpec = buildDeckSequencePatchSpec(exported.spec, secondObjectName, 1)
	const sequenceCommit = okResult('deck sequence timing commit', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: sequenceOpened.deckId,
		deckVersion: sequenceSummary.deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: sequenceSpec,
		billingConfirmed: true,
	}, context))
	const sequenceAnimation = (sequenceCommit.patchResults || []).find(item => item?.slideIndex === 1 && Number(item.animationsApplied || 0) > 0)
	if (!sequenceAnimation) fail('deck-level timing sequence did not target live slide index 1.', sequenceCommit)

	const deleteOpened = okResult('open_uploaded delete-timing deck', await callBetterPptxTool('betterpptx.deck.open_uploaded', {
		data: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${bytes.toString('base64')}`,
		fileName: 'source-animated-delete-timing.pptx',
		preserveTiming: true,
	}, context))
	const deleteSummary = okResult('delete-timing deck summary', await callBetterPptxTool('betterpptx.deck.summary', {
		deckId: deleteOpened.deckId,
	}, context))
	const deleteCommit = okResult('delete native timing commit', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: deleteOpened.deckId,
		deckVersion: deleteSummary.deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: buildDeleteNativeTimingPatchSpec(exported.spec),
		billingConfirmed: true,
	}, context))
	if (!(deleteCommit.patchResults || []).some(item => item?.action === 'deleted' && item?.slideIndex === 0)) {
		fail('deleteNativeTiming-only patch did not execute the deletion branch.', deleteCommit)
	}
	const deleteExport = okResult('delete native timing export_spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: deleteOpened.deckId,
		detail: 'full',
	}, context))
	if (deleteExport.spec?.slides?.[0]?.nativeTimingPreservation) {
		fail('deleteNativeTiming-only patch still exports native timing preservation.', deleteExport.spec.slides[0].nativeTimingPreservation)
	}

	const patched = okResult('patch timing commit', await callBetterPptxTool('betterpptx.deck.generate_from_spec', {
		deckId: opened.deckId,
		deckVersion: openedSummary.deckVersion,
		commitMode: 'patch',
		phase: 'commit',
		spec: patchSpec,
		billingConfirmed: true,
	}, context))
	const patchAnimation = (patched.patchResults || []).find(item => Array.isArray(item.targets) && Number(item.animationsApplied || 0) > 0)
	if (!patchAnimation) fail('patch commit did not apply the generated timing animation.', patched)
	if (patchAnimation.replacedRawTiming !== true) fail('patch timing replacement did not report raw timing replacement.', patchAnimation)
	if (patched.unsupportedFindings?.length) fail('patch timing replacement returned unsupported findings.', patched.unsupportedFindings)
	const patchedExport = okResult('patched export_spec', await callBetterPptxTool('betterpptx.deck.export_spec', {
		deckId: opened.deckId,
		detail: 'full',
	}, context))
	if (patchedExport.spec?.slides?.[0]?.nativeTimingPreservation) {
		fail('patched deck still exports native timing preservation after replacement.', patchedExport.spec.slides[0].nativeTimingPreservation)
	}
	okResult('patch validate', await callBetterPptxTool('betterpptx.deck.validate', { deckId: opened.deckId }, context))
	okResult('patch save', await callBetterPptxTool('betterpptx.deck.save', {
		deckId: opened.deckId,
		fileName: patchReplayPath,
	}, context))
	const patchTimingXml = assertHasTimingXml('patched deck', await slideXmlFromPptx(patchReplayPath))
	if (patchTimingXml === sourceTimingXml) {
		fail('patched timing XML is byte-identical to the imported source timing.', { length: patchTimingXml.length })
	}

	console.log('TIMING PRESERVE OR REPLACE VERIFY: PASS')
	console.log(JSON.stringify({
		nativeHandle,
		objectName,
		secondObjectName,
		sourceTimingBytes: sourceTimingXml.length,
		preservedTimingBytes: preservedTimingXml.length,
		replacementTimingBytes: replacementTimingXml.length,
		patchTimingBytes: patchTimingXml.length,
		patchEstimateCredits: patchDryRun.billing?.patchEstimate?.estimatedCredits,
		outputs: {
			sourcePath,
			preserveReplayPath,
			replaceReplayPath,
			patchReplayPath,
		},
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
