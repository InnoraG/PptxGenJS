#!/usr/bin/env node
// Maintainer-local generate_from_spec harness.
// It intentionally exercises the same MCP dispatcher as a public client; direct engine calls are not valid.
import fs from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import { createMcpToolDispatcher } from './engine.mjs'
import { buildSpecOperationPlan } from './ir/spec-compiler.mjs'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'

const OUT_DIR = path.resolve('outputs', 'direct-mcp-iceberg-history-20260607')

function fail(message, detail = {}) {
	console.error('DIRECT MCP ICEBERG GENERATE_FROM_SPEC VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

function hasGradientFill(fill) {
	return !!(fill && typeof fill === 'object' && (fill.type === 'gradient' || Array.isArray(fill.gradientStops) || fill.gradientPreset || fill.gradientDirection))
}

async function packageStats(filePath) {
	const buffer = await fs.readFile(filePath)
	const zip = await JSZip.loadAsync(buffer)
	const files = Object.keys(zip.files).filter(name => !zip.files[name].dir)
	return {
		bytes: buffer.length,
		fileCount: files.length,
		slideCount: files.filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name)).length,
		chartCount: files.filter(name => /^ppt\/charts\/chart\d+\.xml$/i.test(name)).length,
		hasContentTypes: files.includes('[Content_Types].xml'),
		hasPresentation: files.includes('ppt/presentation.xml'),
	}
}

async function main() {
	await fs.mkdir(OUT_DIR, { recursive: true })
	const context = { sessionId: `verify-direct-mcp-iceberg-${Date.now()}`, clientInfo: { name: 'direct-mcp-iceberg-verifier', version: '1' } }
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	const publicMcp = createMcpToolDispatcher({ ...context, blackBox: true })
	const maintainerMcp = createMcpToolDispatcher({ ...context, blackBox: false })
	const call = async (name, args = {}) => okResult(name, await (process.env.BETTERPPTX_PUBLIC_BLACK_BOX === '1' ? publicMcp : maintainerMcp).call(name, args))
	const capabilities = await call('betterpptx.help.capabilities', {
		intent: 'generate an iceberg history presentation',
		detail: 'full',
	})
	if (capabilities.recommendedMode !== 'mcp-authoring-excellence-json-spec' || capabilities.authoringSurface !== 'mcp-generate-from-spec-only') fail('capabilities did not route iceberg prompt to the governed semantic authoring surface.', capabilities)
	if (!capabilities.requiredTools?.includes('betterpptx.deck.generate_from_spec')) fail('capabilities did not require generate_from_spec.', capabilities)
	if (!capabilities.requiredTools?.includes('betterpptx.deck.validate_design')) fail('capabilities did not advertise design validation in the direct route.', capabilities)
	if (!capabilities.requiredTools?.includes('betterpptx.deck.validate_accessibility')) fail('capabilities did not advertise accessibility validation in the direct route.', capabilities)
	const example = (capabilities.examples || []).find(item => item.tool === 'betterpptx.deck.generate_from_spec')
	if (!example?.payload?.spec) fail('capabilities did not return a generate_from_spec payload.', capabilities)
	const spec = example.payload.spec
	if (!/iceberg/i.test(spec.title || '') || !/history/i.test(spec.title || '')) fail('capabilities example is not iceberg-history specific.', spec)
	if ((spec.slides || []).length < 4) fail('iceberg example should include a multi-slide layered deck.', spec)

	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
	const dry = await call('betterpptx.deck.generate_from_spec', {
		spec,
		dryRun: true,
		detail: 'full',
		plan: 'premium',
		accountPlan: 'premium',
	})
	if (dry.dryRun !== true || dry.mutationFree !== true || !dry.planDigest) fail('dryRun did not return a mutation-free plan.', dry)
	const actionableDryWarnings = Array.isArray(dry.warnings) ? dry.warnings.filter(item => ['warning', 'error'].includes(String(item?.severity || '').toLowerCase())) : []
	if (actionableDryWarnings.length) fail('canonical iceberg dryRun contains actionable warnings.', { warnings: actionableDryWarnings })
	const compilerPlan = buildSpecOperationPlan(spec, { plan: 'free', accountPlan: 'free' })
	for (const slide of compilerPlan.plan.slides || []) {
		if (slide.slideIndex >= 2) {
			if (hasGradientFill(slide.background)) fail('free-mode slide background after preview boundary still uses gradient.', slide)
			for (const object of slide.objects || []) {
				if (hasGradientFill(object.style?.fill)) fail('free-mode object after preview boundary still uses gradient fill.', object)
			}
		}
	}

	const generated = await call('betterpptx.deck.generate_from_spec', {
		spec,
		detail: 'full',
		plan: 'premium',
		accountPlan: 'premium',
		validateAfterCompile: true,
	})
	if (!generated.deckId || generated.slideCount !== spec.slides.length) fail('generate_from_spec did not create the expected deck.', generated)

	const validation = await call('betterpptx.deck.validate', { deckId: generated.deckId, mode: 'normal' })
	const validationIssues = Number(validation.issueCount ?? (validation.issues || []).length)
	if (validationIssues !== 0) fail('generated iceberg deck has package/layout validation issues.', validation)
	// This example is an editorial semantic-authoring route, not a full motion-showcase
	// benchmark. Keep the quality gate meaningful without requiring every editorial slide
	// to carry a premium motion/visual-proof layer; the example still includes its authored
	// motion and the separate black-box adversarial suite covers those premium paths.
	const design = await call('betterpptx.deck.validate_design', { deckId: generated.deckId, profile: 'static', minScore: 60, requireVisualProof: false, requireMotion: false })
	if (design.ok !== true || Number(design.score) < 60) fail('generated iceberg deck did not pass design threshold.', design)
	const accessibility = await call('betterpptx.deck.validate_accessibility', { deckId: generated.deckId })
	if (accessibility.passed !== true) fail('generated iceberg deck did not pass accessibility.', accessibility)
	const quality = await call('betterpptx.deck.validate_quality', { deckId: generated.deckId })
	if (quality.ok !== true || (quality.blockingIssues || []).length !== 0) fail('generated iceberg deck did not pass the aggregate quality gate.', quality)
	const previewRenderer = String(process.env.BETTERPPTX_PREVIEW_RENDERER || '').trim().toLowerCase()
	const preview = await call('betterpptx.deck.preview', {
		deckId: generated.deckId,
		slides: [0, 1, 2, 3],
		format: 'png',
		width: 1280,
		...(previewRenderer ? { renderer: previewRenderer } : {}),
		outputDir: OUT_DIR,
	})
	if ((preview.previews || []).length < 4) fail('preview did not render all iceberg slides.', preview)
	const save = await call('betterpptx.deck.save', {
		deckId: generated.deckId,
		deckVersion: generated.deckVersion,
		fileName: 'direct-mcp-iceberg-history-generate-from-spec-20260607.pptx',
		outputDir: OUT_DIR,
	})
	if (!save.filePath || !save.bytes) fail('save did not return a local artifact in maintainer mode.', save)
	const pkg = await packageStats(save.filePath)
	if (!pkg.hasContentTypes || !pkg.hasPresentation || pkg.slideCount !== spec.slides.length) fail('saved PPTX package sanity check failed.', pkg)

	const report = {
		capabilities: {
			recommendedMode: capabilities.recommendedMode,
			requiredTools: capabilities.requiredTools,
			exampleTitle: spec.title,
		},
		dryRun: {
			planDigest: dry.planDigest,
			slideCount: dry.slideCount,
			operationCount: dry.operationCount,
			warningCount: Array.isArray(dry.warnings) ? dry.warnings.length : 0,
			actionableWarningCount: actionableDryWarnings.length,
		},
		generated: {
			deckId: generated.deckId,
			deckVersion: save.deckVersion,
			slideCount: generated.slideCount,
			objectCount: generated.objectCount,
		},
		validation: { issueCount: validationIssues },
		design: { ok: design.ok, score: design.score },
		accessibility: { passed: accessibility.passed, score: accessibility.score },
		quality: { ok: quality.ok, blockingIssues: (quality.blockingIssues || []).length },
		preview: { count: (preview.previews || []).length, renderer: preview.renderer?.name },
		save,
		package: pkg,
	}
	await fs.writeFile(path.join(OUT_DIR, 'direct-mcp-iceberg-history-result.json'), `${JSON.stringify(report, null, 2)}\n`)
	console.log('DIRECT MCP ICEBERG GENERATE_FROM_SPEC VERIFY: PASS')
	console.log(JSON.stringify({
		outputDir: OUT_DIR,
		slideCount: pkg.slideCount,
		chartCount: pkg.chartCount,
		designScore: design.score,
		accessibilityScore: accessibility.score,
		bytes: pkg.bytes,
	}, null, 2))
}

main().catch(error => fail(error?.message || String(error), { stack: error?.stack }))
