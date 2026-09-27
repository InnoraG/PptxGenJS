#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

process.env.BETTERPPTX_PUBLIC_BLACK_BOX ??= '1'

function fail(message, detail = {}) {
	console.error('GENERATE FROM SPEC V1 VERIFY: FAIL')
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

function keepSectionsBoundToSlides(spec) {
	if (!Array.isArray(spec?.sections) || !Array.isArray(spec?.slides)) return spec
	const ids = new Set(spec.slides.map(slide => slide.id))
	spec.sections = spec.sections
		.map(section => ({ ...section, slideIds: (section.slideIds || []).filter(id => ids.has(id)) }))
		.filter(section => section.slideIds.length)
	return spec
}

function envelopeOf(label, response) {
	const envelope = response?.structuredContent || (() => {
		try { return JSON.parse(response?.content?.find(item => item.type === 'text')?.text || '{}') } catch { return null }
	})()
	if (!envelope || typeof envelope.ok !== 'boolean') fail(`${label} returned an invalid MCP envelope.`, response)
	return envelope
}

async function main() {
	const here = path.dirname(fileURLToPath(import.meta.url))
	const transport = new StdioClientTransport({
		command: process.execPath,
		args: ['server.mjs'],
		cwd: here,
		stderr: 'pipe',
		env: {
			...process.env,
			BETTERPPTX_PUBLIC_BLACK_BOX: '0',
			BETTERPPTX_LOCAL_MAINTAINER: '1',
			BETTERPPTX_ALLOW_PRIMITIVE_TOOLS: '1',
			BETTERPPTX_BILLING_ENFORCE: '0',
			BETTERPPTX_PREMIUM: '1',
		},
	})
	const client = new Client({ name: 'generate-from-spec-v1-verifier', version: '1' }, { capabilities: {} })
	await client.connect(transport)
	const call = async (name, args = {}) => envelopeOf(name, await client.callTool({ name, arguments: args }))
	try {
		const context = { sessionId: `verify-generate-from-spec-${Date.now()}` }
		const spec = JSON.parse(await fs.readFile(path.join(here, 'ir', 'examples', 'creation-executive.v1.json'), 'utf8'))

	const dry = okResult('dryRun', await call('betterpptx.deck.generate_from_spec', {
		spec,
		dryRun: true,
		detail: 'full',
	}, context))
	if (dry.dryRun !== true || dry.mutationFree !== true) fail('dryRun did not report mutation-free execution.', dry)
	if (dry.deckId) fail('dryRun unexpectedly created a deck.', dry)
	if (!dry.planDigest || dry.operationCount <= 0) fail('dryRun response is missing plan metadata.', dry)
	if (!dry.capabilityMatrix?.specNative?.some(item => /narration/.test(item.kind))) fail('dryRun response is missing the spec capability matrix.', dry.capabilityMatrix)

	const visualOnlySpec = cloneJson(spec)
	visualOnlySpec.title = 'Visual-only authored timing'
	visualOnlySpec.slides = [visualOnlySpec.slides[0]]
	// This test intentionally reduces the fixture to one slide. Keep its
	// optional section index valid so the timing assertion exercises the
	// compiler rather than an unrelated missing-slide reference.
	keepSectionsBoundToSlides(visualOnlySpec)
	visualOnlySpec.motionTime = {
		masterClock: 'authored slide timeline',
		timingSource: 'semantic transitions and builds',
		syncPolicy: 'No narration; authored native timing only.',
	}
	const visualOnlyDry = okResult('visual-only dryRun', await call('betterpptx.deck.generate_from_spec', {
		spec: visualOnlySpec,
		dryRun: true,
		detail: 'full',
	}, context))
	const visualOnlyTiming = visualOnlyDry.timingSpine?.slides?.[0]
	if (visualOnlyDry.appliedDefaults?.autoplay?.autoSync !== false || visualOnlyTiming?.governedBy !== 'authored slide timing' || visualOnlyTiming?.dwellMs !== null) {
		fail('Visual-only Motion/Time contract still activated fallback narration timing.', { appliedDefaults: visualOnlyDry.appliedDefaults?.autoplay, timing: visualOnlyTiming })
	}
	if ((visualOnlyDry.warnings || []).some(item => item.code === 'NARRATION_TOO_SHORT_FOR_CONTENT')) {
		fail('Visual-only Motion/Time contract emitted a narration-fit warning.', { warnings: visualOnlyDry.warnings })
	}

	const commit = okResult('commit', await call('betterpptx.deck.generate_from_spec', {
		spec,
		detail: 'summary',
		validateAfterCompile: true,
	}, context))
	if (!commit.deckId) fail('commit did not return deckId.', commit)
	if (commit.planDigest !== dry.planDigest) fail('Committed plan digest differs from dryRun plan digest.', { dry: dry.planDigest, commit: commit.planDigest })
	if (commit.generatedByPrimitiveHandlers !== true) fail('commit did not report primitive-handler generation.', commit)
	if (commit.slideCount !== 3) fail('commit produced unexpected slide count.', commit)
	if (!Number.isInteger(commit.deckVersion)) fail('commit did not return deckVersion.', commit)
	if (commit.capabilityMatrix?.detail !== 'summary' || !commit.capabilityMatrix?.counts || commit.capabilityMatrix.specNative) {
		fail('summary commit returned full capability matrix instead of compact counts.', commit.capabilityMatrix)
	}

	const summary = okResult('summary', await call('betterpptx.deck.summary', { deckId: commit.deckId }, context))
	if (summary.slideCount !== 3) fail('summary slide count does not match committed spec.', summary)
	okResult('quality validation', await call('betterpptx.deck.validate_quality', { deckId: commit.deckId }, context))

	const saved = okResult('save', await call('betterpptx.deck.save', {
		deckId: commit.deckId,
		deckVersion: commit.deckVersion,
		fileName: 'verify-generate-from-spec-v1.pptx',
	}, context))
	if (saved.slideCount !== 3 || !saved.bytes || saved.bytes < 1000) fail('save did not produce a plausible package.', saved)

	const tenSlideSpec = cloneJson(spec)
	while (tenSlideSpec.slides.length < 10) {
		const source = cloneJson(spec.slides[tenSlideSpec.slides.length % spec.slides.length])
		const i = tenSlideSpec.slides.length + 1
		source.id = `free-safe-${i}`
		source.title = `Free Safe Slide ${i}`
		for (const block of source.content || []) {
			block.name = `${block.name}-${i}`
			if (Array.isArray(block.items)) {
				for (const item of block.items) item.name = `${item.name}-${i}`
			}
		}
		tenSlideSpec.slides.push(source)
	}
	const freeCompile = okResult('free 10-slide commit', await call('betterpptx.deck.generate_from_spec', {
		spec: tenSlideSpec,
		detail: 'summary',
		plan: 'free',
		validateAfterCompile: false,
	}, context))
	if (freeCompile.slideCount !== 10) fail('free-tier compile did not keep all requested slides.', freeCompile)
	if (freeCompile.requiresUpgrade !== true) fail('free-tier compile did not mark premium boundary.', freeCompile)
	const upgradeWarnings = (freeCompile.warnings || []).filter(item => item.code === 'REQUIRES_UPGRADE')
	if (upgradeWarnings.length < 8) fail('free-tier compile did not mark slides beyond preview boundary.', freeCompile)
	if (freeCompile.next?.recommendedTool !== 'betterpptx.billing.portal') fail('free-tier compile did not return a consolidated upgrade next action.', freeCompile)

	const baseSpec = cloneJson(spec)
	baseSpec.title = 'Atomic target'
	baseSpec.slides = [baseSpec.slides[0]]
	keepSectionsBoundToSlides(baseSpec)
	const base = okResult('base deck', await call('betterpptx.deck.generate_from_spec', {
		spec: baseSpec,
		detail: 'summary',
		validateAfterCompile: false,
	}, context))
	const before = okResult('before summary', await call('betterpptx.deck.summary', { deckId: base.deckId }, context))
	const badSpec = cloneJson(spec)
	badSpec.slides[0].layoutIntent = 'unknown-layout-intent'
	const failed = await call('betterpptx.deck.generate_from_spec', {
		deckId: base.deckId,
		deckVersion: base.deckVersion,
		spec: badSpec,
	}, context)
	if (failed.ok) fail('invalid spec unexpectedly committed.', failed)
	if (failed.error?.code !== 'SPEC_COMPILE_FAILED') fail('invalid spec returned unexpected error code.', failed)
	const after = okResult('after summary', await call('betterpptx.deck.summary', { deckId: base.deckId }, context))
	if (after.slideCount !== before.slideCount) fail('failed compile changed target deck slide count.', { before, after })
	const badRegionPlan = cloneJson(spec)
	badRegionPlan.slides[0].regionPlan = { split: 'columns', names: ['left', 'right'], area: 'not-a-region' }
	const failedRegionPlan = await call('betterpptx.deck.generate_from_spec', {
		deckId: base.deckId,
		deckVersion: base.deckVersion,
		spec: badRegionPlan,
	}, context)
	if (failedRegionPlan.ok || failedRegionPlan.error?.code !== 'SPEC_COMPILE_FAILED') fail('invalid semantic regionPlan unexpectedly committed.', failedRegionPlan)
	if (!(failedRegionPlan.error?.details?.errors || []).some(item => item.code === 'REGION_PLAN_INVALID')) fail('invalid semantic regionPlan did not expose REGION_PLAN_INVALID at commit.', failedRegionPlan)

	const badShapeTextSpec = cloneJson(spec)
	badShapeTextSpec.slides[0].content.push({
		kind: 'shape',
		name: 'ambiguous-shape-label',
		shapeName: 'roundRect',
		text: 'This text belongs in textShape.',
		region: 'main',
	})
	const shapeTextFailed = await call('betterpptx.deck.generate_from_spec', {
		spec: badShapeTextSpec,
		dryRun: true,
	}, context)
	if (shapeTextFailed.ok) fail('shape text spec unexpectedly compiled.', shapeTextFailed)
	if (shapeTextFailed.error?.code !== 'SPEC_COMPILE_FAILED') fail('shape text spec returned unexpected error code.', shapeTextFailed)
	const shapeTextErrors = shapeTextFailed.error?.details?.errors || []
	if (!shapeTextErrors.some(item => item.code === 'SHAPE_TEXT_FORBIDDEN')) fail('shape text spec did not report SHAPE_TEXT_FORBIDDEN.', shapeTextFailed)

	const advancedSpec = cloneJson(spec)
	advancedSpec.title = 'Advanced deterministic spec dry-run'
	advancedSpec.layout = 'CUSTOM_WIDE'
	advancedSpec.costPolicy = { requiresAcceptance: true, maxCredits: 2 }
	advancedSpec.resolutionPolicy = { mode: 'resolve', allowedPhases: ['resolve', 'lockedDryRun', 'commit'] }
	advancedSpec.premiumPolicy = { avatar: 'premium-only' }
	advancedSpec.fallbackPolicy = { premiumBoundary: 'emit-explicit-warning' }
	advancedSpec.layouts = [{ name: 'CUSTOM_WIDE', width: 13.333, height: 7.5, activate: true }]
	advancedSpec.masters = [{
		title: 'Verifier Master',
		background: { color: 'FFFFFF' },
		objects: [{ rect: { x: 0, y: 7.18, w: 13.333, h: 0.02 }, options: { fill: { color: '2563EB' }, line: { color: '2563EB' } } }],
	}]
	advancedSpec.transitionPolicy = { transition: { type: 'fade', duration: 1 } }
	advancedSpec.autoplay = { enabled: true, secondsPerSlide: 5, loop: false, mode: 'present' }
	advancedSpec.showSettings = { useTimings: true, showAnimation: true, showNarration: true, loop: false, mode: 'present' }
	delete advancedSpec.sections
	advancedSpec.slides = [{
		id: 'advanced-s1',
		title: 'Advanced Compiler Surface',
		layoutIntent: 'title-body',
		notes: 'Verifier slide notes.',
		content: [
			{ kind: 'title', name: 'title', text: 'Advanced Compiler Surface' },
			{ kind: 'textShape', name: 'cue-target', text: 'Cue target', region: 'leftThird' },
			{ kind: 'media', name: 'media-window', mediaType: 'online', link: 'https://example.com/video', region: 'rightThird' },
			{ kind: 'ink', name: 'review-ink', inkType: 'marker', region: 'midThird', points: [{ x: 0.05, y: 0.8 }, { x: 0.45, y: 0.2 }, { x: 0.92, y: 0.58 }] },
			{ kind: 'laser', name: 'laser-cue', region: 'leftThird', points: [{ x: 0.05, y: 0.8 }, { x: 0.8, y: 0.18 }] },
			{ kind: 'customGeometry', name: 'svg-mark', pathData: 'M 0 0 L 100 0 L 50 100 Z', region: 'midThird' },
			{
				kind: 'avatarNarration',
				name: 'avatar-host',
				script: 'This avatar block verifies render policy propagation without rendering during dry run.',
				avatar: { source: 'default', consent: 'owned' },
				consent: { status: 'owned' },
				renderPolicy: { provider: 'test-static', quality: 'draft', renderMode: 'job', options: { crop: 'fit' } },
				resolutionPolicy: { mode: 'resolve', timingAuthority: 'media' },
				costPolicy: { requiresAcceptance: true, maxCredits: 1 },
			},
			{
				kind: 'narration',
				name: 'voiceover',
				script: 'This narration cue verifies late operation ordering.',
				resolutionPolicy: { mode: 'resolve', timingAuthority: 'media' },
				costPolicy: { requiresAcceptance: true, maxCredits: 0.25 },
				timeline: {
					startDelayMs: 150,
					paddingMs: 500,
					expectedDurationMs: 1600,
					timingToleranceMs: 120,
					cues: [{ target: 'advanced-s1.cue-target.text-shape', atMs: 250, duration: 400, effect: 'fade' }],
				},
				region: 'footer',
			},
		],
	}]
	const advancedDry = okResult('advanced dryRun', await call('betterpptx.deck.generate_from_spec', {
		spec: advancedSpec,
		dryRun: true,
		detail: 'full',
		includeCallPlan: true,
	}, context))
	const advancedTools = (advancedDry.operations || []).map(op => op.tool)
	for (const tool of [
		'betterpptx.deck.define_layout',
		'betterpptx.deck.define_master',
		'betterpptx.slide.add_media',
		'betterpptx.slide.add_ink',
		'betterpptx.slide.add_laser_pointer',
		'betterpptx.custom_geometry.insert_svg',
		'betterpptx.deck.set_transitions_all',
		'betterpptx.deck.autoplay',
		'betterpptx.deck.set_show_settings',
		'betterpptx.slide.add_narration',
		'betterpptx.slide.add_avatar_narration',
	]) {
		if (!advancedTools.includes(tool)) fail(`advanced dryRun did not compile ${tool}.`, { advancedTools })
	}
	if (advancedTools.indexOf('betterpptx.slide.add_narration') < advancedTools.indexOf('betterpptx.slide.add_text')) {
		fail('advanced dryRun did not schedule narration after visual objects.', { advancedTools })
	}
	const narrationOp = (advancedDry.operations || []).find(op => op.tool === 'betterpptx.slide.add_narration')
	if (!narrationOp?.args || narrationOp.args.startDelayMs !== 150 || narrationOp.args.paddingMs !== 500 || narrationOp.args.expectedDurationMs !== 1600 || narrationOp.args.timingToleranceMs !== 120) {
		fail('advanced dryRun did not preserve authored narration timing fields.', narrationOp)
	}
	if (narrationOp.args.cues?.[0]?.atMs !== 250 || Object.prototype.hasOwnProperty.call(narrationOp.args, 'captions')) {
		fail('advanced dryRun did not preserve authored narration cues without creating a caption surface.', narrationOp)
	}
	if (!narrationOp.args.resolutionPolicy && !narrationOp.args.costPolicy) {
		fail('advanced dryRun did not preserve narration policy fields.', narrationOp)
	}
	const avatarOp = (advancedDry.operations || []).find(op => op.tool === 'betterpptx.slide.add_avatar_narration')
	if (avatarOp?.args?.avatarProvider !== 'test-static' || avatarOp.args.avatarQuality !== 'draft' || avatarOp.args.renderMode !== 'job') {
		fail('advanced dryRun did not preserve avatar renderPolicy fields.', avatarOp)
	}
	if (['x', 'y', 'w', 'h', 'rect', 'bbox'].some(key => Object.prototype.hasOwnProperty.call(avatarOp?.args || {}, key))) {
		fail('advanced dryRun propagated hand-authored avatar geometry; presenter placement must remain engine-owned.', avatarOp)
	}
	if (avatarOp.args.avatarOptions?.crop !== 'fit' || avatarOp.args.resolutionPolicy?.mode !== 'resolve' || avatarOp.args.costPolicy?.maxCredits !== 1) {
		fail('advanced dryRun did not preserve avatar policy/options fields.', avatarOp)
	}
	const advisoryFields = new Set((advancedDry.warnings || []).filter(item => item.code === 'SPEC_FIELD_NOT_COMPILED').map(item => item.field))
	for (const field of ['costPolicy', 'resolutionPolicy', 'premiumPolicy', 'fallbackPolicy']) {
		if (!advisoryFields.has(field)) fail('advanced dryRun did not report global advisory policy as not compiled.', { field, warnings: advancedDry.warnings })
	}

	console.log('GENERATE FROM SPEC V1 VERIFY: PASS')
	console.log(JSON.stringify({
		dryRunDigest: dry.planDigest.slice(0, 12),
		committedDeckId: commit.deckId,
		committedSlides: commit.slideCount,
		savedBytes: saved.bytes,
		freeCompileSlides: freeCompile.slideCount,
		rollbackDeckId: base.deckId,
		advancedOps: advancedTools.length,
	}, null, 2))
	} finally {
		try { await client.close() } catch {}
	}
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
