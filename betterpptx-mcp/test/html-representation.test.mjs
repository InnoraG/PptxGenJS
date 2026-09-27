import assert from 'node:assert/strict'
import test from 'node:test'
import {
	detectHtmlSourceModes,
	fontFamilyStackFromCss,
	htmlFontSubstitutionFindings,
	htmlMorphRequiredPairFindings,
	htmlUnsupportedRepresentationFindings,
	svgUnsupportedFilterReasons,
} from '../ir/html-representation.mjs'
import { buildHtmlFontReport, buildHtmlMotionReport, buildHtmlMorphContinuityReport } from '../ir/html-package.mjs'

test('font stacks are parsed from CSS without assuming a designed face', () => {
	assert.deepEqual(
		fontFamilyStackFromCss("'Example Display', 'Example Sans', 'Segoe UI', Arial, sans-serif"),
		['Example Display', 'Example Sans', 'Segoe UI', 'Arial'],
	)
})

test('source modes are read from this original, not a fixed runtime list', () => {
	assert.deepEqual(
		detectHtmlSourceModes('<html data-runtime="voice+captions" data-playback-mode="captions-only">'),
		['voice+captions', 'captions-only'],
	)
	assert.deepEqual(detectHtmlSourceModes('<section class="slide">'), [])
})

test('unsupported SVG filters are named, not counted as a showcase constant', () => {
	assert.ok(svgUnsupportedFilterReasons('<filter><feTurbulence/></filter>').includes('feTurbulence'))
})

test('required Morph pairs block only when declared', () => {
	const spec = {
		morphPolicy: { unmatched: 'warn', fallback: 'fade', requiredPairs: [{ from: 'system-core', to: 'system-core' }], requiredPairFailure: 'block' },
		slides: [
			{ id: 'a', transition: { type: 'morph' }, content: [{ name: 'left' }] },
			{ id: 'b', transition: { type: 'morph' }, content: [{ name: 'right' }] },
		],
	}
	const findings = htmlMorphRequiredPairFindings(spec)
	assert.equal(findings[0].code, 'HTML_MORPH_REQUIRED_PAIR_MISSING')
	assert.equal(findings[0].severity, 'error')
	const report = buildHtmlMorphContinuityReport(spec)
	assert.equal(report.blocksSave, true)
	assert.equal(report.unmatchedPolicy, 'warn')
	assert.deepEqual(report.missingRequiredPairs, [{ from: 'system-core', to: 'system-core' }])
})

test('unmatched Morph objects warn and fade by default', () => {
	const report = buildHtmlMorphContinuityReport({
		slides: [
			{ id: 'a', content: [{ name: 'only-here' }] },
			{ id: 'b', transition: { type: 'morph' }, content: [{ name: 'only-there' }] },
		],
	})
	assert.equal(report.blocksSave, false)
	assert.equal(report.fallback, 'fade')
	assert.ok(report.pairs[0].unmatchedSource.includes('only-here'))
})

test('whole-slide raster is a forbidden representation finding', () => {
	const findings = htmlUnsupportedRepresentationFindings({
		slides: [{
			id: 'slide-1',
			htmlFallbacks: [{ sourceObjectId: 'slide-1', wholeSlideRasterized: true, reason: 'flattened' }],
		}],
	})
	assert.equal(findings[0].code, 'HTML_WHOLE_SLIDE_RASTER_FORBIDDEN')
	assert.equal(findings[0].severity, 'error')
})

test('font strict-match is an error only when that policy is selected', () => {
	const spec = {
		fontPolicy: { mode: 'strict-match' },
		htmlFontStacks: [{ selector: ':root', stack: ['Example Display', 'Segoe UI'] }],
	}
	assert.equal(htmlFontSubstitutionFindings({ fontPolicy: { mode: 'substitute-and-warn' }, htmlFontStacks: spec.htmlFontStacks }).length, 0)
	assert.equal(htmlFontSubstitutionFindings(spec)[0].code, 'HTML_FONT_STRICT_MATCH_UNAVAILABLE')
	const report = buildHtmlFontReport(spec)
	assert.equal(report.fonts[0].requested, 'Example Display')
	assert.equal(report.fonts[0].fallback, 'Segoe UI')
	assert.equal(report.fonts[0].availableOnCompiler, false)
	assert.equal(report.blocksSave, true)
})

test('motion report treats unexplained loss as the gate, not a 1:1 source count', () => {
	const report = buildHtmlMotionReport({
		slides: [{
			id: 'slide-1',
			htmlSourceMotion: { animatedSourceNodes: 3 },
			htmlUnmappedCssMotion: [{ cssName: 'atmosphereBlur' }],
			content: [
				{ name: 'hero', animation: { effect: 'fade' } },
				{ name: 'glow', effectOwnerId: 'hero', inheritsAnimation: true },
			],
			transition: { advanceAfterTime: 4000 },
		}],
	})
	assert.equal(report.sourceMotion.animatedSourceNodes, 3)
	assert.equal(report.compiledMotion.semanticAnimatedObjects, 1)
	assert.equal(report.compiledMotion.supportLayersInheritingMotion, 1)
	assert.equal(report.compiledMotion.unmapped, 1)
	assert.equal(report.compiledMotion.silentlyLost, 0)
	assert.equal(report.nativeTiming.timingTreePersistedAfterReopen, null)
})
