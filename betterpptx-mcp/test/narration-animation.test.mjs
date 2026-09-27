// Unit tests for the narration + animation logic that dry-run does NOT exercise — the class of
// bug that only shows up at commit/save (e.g. an invalid animation effect like "none").
// Run: node --test betterpptx-mcp/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeAnimation, drainAnimationCoercions, inferSlideLayoutIntent, _segmentsSignature, _applyRoleOverrides, _notesBodyTextFromXml, _retimeRawTransitionXml } from '../engine.mjs'
import { estimateNarrationMs, splitNarrationSentences, narrationLangFor, slideHasExplicitNarration, slideNarrationScript, autoSyncBuildCues, canonicalNarrationCue, NARRATION_CUE_ANCHOR_METHOD } from '../ir/spec-compiler.mjs'
import { artDirectionInfo, specIsDark, listArtDirections, artEmphasisForSpec, worldStylingForElevation } from '../ir/layout-engine.mjs'

// ── R-SEG — structural identity of a segment timeline (round-trip + renarrate) ─
test('_segmentsSignature is stable across field aliases and sensitive to real changes', () => {
	const a = [{ script: 'First the promise.', gapAfterMs: 900 }, { script: 'Then the proof.', gapBeforeMs: 400 }]
	// alias-insensitive: text/script, pauseAfterMs/gapAfterMs, voiceId/voice are the same timeline
	const aAliased = [{ text: ' First  the promise. ', pauseAfterMs: 900 }, { text: 'Then the proof.', pauseBeforeMs: 400 }]
	assert.equal(_segmentsSignature(a), _segmentsSignature(aAliased))
	// gap change, script change, voice change, and order change are REAL timeline changes
	assert.notEqual(_segmentsSignature(a), _segmentsSignature([{ script: 'First the promise.', gapAfterMs: 1600 }, a[1]]))
	assert.notEqual(_segmentsSignature(a), _segmentsSignature([{ script: 'First the payoff.', gapAfterMs: 900 }, a[1]]))
	assert.notEqual(_segmentsSignature(a), _segmentsSignature([{ ...a[0], voice: 'de_DE-thorsten-high' }, a[1]]))
	assert.notEqual(_segmentsSignature(a), _segmentsSignature([a[1], a[0]]))
})

// ── R-LAYOUT — layoutIntent inference for raw decks (roles + geometry) ────────
const SIZE = { width: 13.333, height: 7.5 }
const txt = (text, o) => ({ _type: 'text', text, options: { objectName: o.objectName || text.slice(0, 8), ...o } })
const LONG = 'This body copy is deliberately long enough to classify as body text for the layout inference.'
test('inferSlideLayoutIntent recognises evidence-backed layouts', () => {
	// 2+ KPIs -> metric-grid (KPI numbers must NOT read as titles)
	const kpiSlide = { _slideObjects: [
		txt('Quarterly wins', { x: 0.8, y: 0.5, w: 8, h: 0.8, fontSize: 30, bold: true }),
		txt('42%', { x: 0.8, y: 2.5, w: 3.5, h: 1.6, fontSize: 48, bold: true }),
		txt('7x faster', { x: 4.9, y: 2.5, w: 3.5, h: 1.6, fontSize: 48, bold: true }),
		txt('99.9%', { x: 9.0, y: 2.5, w: 3.5, h: 1.6, fontSize: 48, bold: true }),
	] }
	assert.equal(inferSlideLayoutIntent(kpiSlide, 0, SIZE), 'metric-grid')
	// chart left + insights right (and mirrored)
	const chartLeft = { _slideObjects: [
		txt('Revenue', { x: 0.8, y: 0.5, w: 8, h: 0.8, fontSize: 30, bold: true }),
		{ _type: 'chart', options: { objectName: 'c1', x: 0.6, y: 1.6, w: 6.5, h: 5 } },
		txt(LONG, { x: 7.6, y: 1.8, w: 5.2, h: 4.4, fontSize: 16 }),
	] }
	assert.equal(inferSlideLayoutIntent(chartLeft, 0, SIZE), 'chart-left-insights-right')
	const chartRight = { _slideObjects: [
		txt('Revenue', { x: 0.8, y: 0.5, w: 8, h: 0.8, fontSize: 30, bold: true }),
		{ _type: 'chart', options: { objectName: 'c1', x: 6.9, y: 1.6, w: 6.0, h: 5 } },
		txt(LONG, { x: 0.6, y: 1.8, w: 5.2, h: 4.4, fontSize: 16 }),
	] }
	assert.equal(inferSlideLayoutIntent(chartRight, 0, SIZE), 'insights-left-chart-right')
	// three narrow copy columns on distinct starts -> three-column
	const cols = { _slideObjects: [
		txt('Pillars', { x: 0.8, y: 0.5, w: 8, h: 0.8, fontSize: 30, bold: true }),
		txt(LONG, { x: 0.6, y: 2.0, w: 3.8, h: 4, fontSize: 14 }),
		txt(LONG, { x: 4.8, y: 2.0, w: 3.8, h: 4, fontSize: 14 }),
		txt(LONG, { x: 9.0, y: 2.0, w: 3.8, h: 4, fontSize: 14 }),
	] }
	assert.equal(inferSlideLayoutIntent(cols, 0, SIZE), 'three-column')
	// a lone title (plus a subtitle) -> title-only cover
	const cover = { _slideObjects: [
		txt('The Annual Review', { x: 1, y: 2.4, w: 11, h: 1.2, fontSize: 44, bold: true }),
		txt('FY26 results', { x: 1, y: 3.8, w: 11, h: 0.6, fontSize: 18 }),
	] }
	assert.equal(inferSlideLayoutIntent(cover, 0, SIZE), 'title-only')
	// no clear evidence -> conservative default
	const plain = { _slideObjects: [
		txt('Agenda', { x: 0.8, y: 0.5, w: 8, h: 0.8, fontSize: 30, bold: true }),
		txt(LONG, { x: 0.8, y: 2.0, w: 11.6, h: 4, fontSize: 16 }),
	] }
	assert.equal(inferSlideLayoutIntent(plain, 0, SIZE), 'title-body')
})

// ── UPLOAD ROUND-TRIP — notes import + raw-transition re-timing ───────────────
test('_notesBodyTextFromXml reads the BODY placeholder only, decoding entities + paragraphs', () => {
	const notesXml = `<p:notes>
		<p:sp><p:nvSpPr><p:nvPr><p:ph type="sldNum"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>1</a:t></a:r></a:p></p:txBody></p:sp>
		<p:sp><p:nvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:txBody>
			<a:p><a:r><a:t>TODO: check &amp; confirm</a:t></a:r></a:p>
			<a:p><a:r><a:t></a:t></a:r></a:p>
			<a:p><a:r><a:t>[narration]</a:t></a:r></a:p>
			<a:p><a:r><a:t>The user&#8217;s </a:t></a:r><a:r><a:t>own words.</a:t></a:r></a:p>
		</p:txBody></p:sp>
	</p:notes>`
	const text = _notesBodyTextFromXml(notesXml)
	assert.ok(text.startsWith('TODO: check & confirm'), 'entity-decoded personal note first')
	assert.ok(/\[narration\]\nThe user’s own words\.$/.test(text), 'rubric block last, runs joined, paragraphs newline-split')
	assert.ok(!text.includes('1\n'), 'slide-number placeholder is chrome, not notes')
	assert.equal(_notesBodyTextFromXml('<p:notes></p:notes>'), '')
})
test('_retimeRawTransitionXml re-times (and strips) advTm INSIDE preserved raw transition XML', () => {
	// AlternateContent carries the transition TWICE (Choice + Fallback) — both must re-time.
	const slide = { _rawTransitionXml: '<mc:AlternateContent><mc:Choice><p:transition spd="slow" advClick="1" advTm="9999" p14:dur="700"><p:fade/></p:transition></mc:Choice><mc:Fallback><p:transition spd="slow" advTm="9999"><p:fade/></p:transition></mc:Fallback></mc:AlternateContent>' }
	_retimeRawTransitionXml(slide, 4321)
	assert.equal((slide._rawTransitionXml.match(/advTm="4321"/g) || []).length, 2, 'both variants re-timed')
	assert.ok(!/advTm="9999"/.test(slide._rawTransitionXml), 'old advance gone')
	assert.ok(/advClick="0"/.test(slide._rawTransitionXml), 'auto-advance only')
	assert.ok(/spd="slow"/.test(slide._rawTransitionXml) && /<p:fade\/>/.test(slide._rawTransitionXml), 'transition VISUAL preserved')
	_retimeRawTransitionXml(slide, null)
	assert.ok(!/advTm=/.test(slide._rawTransitionXml), 'null strips the advance (narration removed)')
	// no raw XML -> no-op
	const bare = {}
	_retimeRawTransitionXml(bare, 1000)
	assert.equal(bare._rawTransitionXml, undefined)
})

// ── TEAMWORK — effect coercions are response-visible, aggregated, and drain-once ─
test('drainAnimationCoercions surfaces coercions as aggregated warnings, then clears', () => {
	drainAnimationCoercions()   // clear anything earlier tests coerced
	normalizeAnimation({ type: 'entrance', effect: 'whooosh' })
	normalizeAnimation({ type: 'entrance', effect: 'whooosh' })
	normalizeAnimation({ type: 'emphasis', effect: 'sparkle' })
	normalizeAnimation({ type: 'entrance', effect: 'fade' })    // valid: no coercion
	const w = drainAnimationCoercions()
	assert.equal(w.length, 2)
	const whoosh = w.find(x => x.requestedEffect === 'whooosh')
	assert.equal(whoosh.code, 'ANIMATION_EFFECT_COERCED')
	assert.equal(whoosh.coercedTo, 'fade')
	assert.equal(whoosh.count, 2)                               // aggregated, not spammed
	assert.equal(w.find(x => x.requestedEffect === 'sparkle').coercedTo, 'pulse')
	assert.ok(/not a valid effect/.test(whoosh.message))
	assert.deepEqual(drainAnimationCoercions(), [])             // drain-once semantics
})

// ── TEAMWORK — classification is a proposal; the AI confirms/corrects it ──────
test('_applyRoleOverrides applies AI confirmations and rejects nonsense safely', () => {
	const mkRoles = () => [{ slideId: 'slide-1', slideIndex: 0, objects: [
		{ objectName: 'TextBox 1', role: 'title', confidence: 'high' },
		{ objectName: 'TextBox 2', role: 'subtitle', confidence: 'medium' },
	] }]
	// correction changes the role and marks it ai-confirmed (the highest confidence)
	const corrected = _applyRoleOverrides(mkRoles(), { 'slide-1': { 'TextBox 2': 'kpi' } })
	assert.equal(corrected.corrected, 1)
	assert.equal(corrected.roles[0].objects[1].role, 'kpi')
	assert.equal(corrected.roles[0].objects[1].confidence, 'ai-confirmed')
	// confirmation (same role) upgrades confidence without counting as a correction
	const confirmed = _applyRoleOverrides(mkRoles(), { 'slide-1': { 'TextBox 1': 'title' } })
	assert.equal(confirmed.corrected, 0)
	assert.equal(confirmed.confirmed, 1)
	assert.equal(confirmed.roles[0].objects[0].confidence, 'ai-confirmed')
	// slideIndex keys work too; unknown roles / objects warn instead of corrupting the plan
	assert.equal(_applyRoleOverrides(mkRoles(), { 0: { 'TextBox 2': 'body' } }).corrected, 1)
	const bad = _applyRoleOverrides(mkRoles(), { 'slide-1': { 'TextBox 2': 'hero-thing', 'Nope': 'body' } })
	assert.equal(bad.corrected, 0)
	assert.equal(bad.warnings.length, 2)
	assert.equal(bad.roles[0].objects[1].role, 'subtitle')
	// no overrides -> untouched passthrough
	assert.equal(_applyRoleOverrides(mkRoles(), undefined).confirmed, 0)
})

// ── EDITION E2/E3 — world styling resolved for elevating an existing deck ─────
test('worldStylingForElevation gives a complete, mode-aware world styling', () => {
	const luxe = worldStylingForElevation('luxe')
	assert.equal(luxe.palette.bg, '141008')
	assert.equal(luxe.headFontFace, 'Georgia')
	assert.equal(luxe.titleAlign, 'center')                       // luxe is centered (E3)
	assert.ok(luxe.background && luxe.emphasis?.effect)
	assert.equal(worldStylingForElevation('brutalist').titleAlign, 'left')
	// mode override retunes the palette + canvas (both-mode)
	assert.equal(worldStylingForElevation('luxe', 'light').palette.bg, 'FBF6EA')
	assert.equal(worldStylingForElevation('luxe', 'light').mode, 'light')
	assert.equal(worldStylingForElevation('nope'), null)
})

// ── Emphasis is first-class: a real per-world default, restrained, from the OPEN palette ──
test('artEmphasisForSpec gives each world a restrained, VALID emphasis default', () => {
	assert.equal(artEmphasisForSpec({ styleIntent: { artDirection: 'luxe' } }).effect, 'pulse')
	assert.equal(artEmphasisForSpec({ styleIntent: { artDirection: 'brutalist' } }).effect, 'boldFlash')
	assert.ok(artEmphasisForSpec({ styleIntent: { artDirection: 'mist' } }).durationMs > 0)
	// the world emphasis default must be a VALID effect (survives the animation guard uncoerced)
	for (const w of ['luxe', 'aurora', 'blueprint', 'editorial', 'brutalist', 'mist']) {
		const eff = artEmphasisForSpec({ styleIntent: { artDirection: w } }).effect
		assert.equal(normalizeAnimation({ type: 'emphasis', effect: eff }).effect.toLowerCase(), eff.toLowerCase(), `${w} emphasis default valid`)
	}
})

// ── Both-mode worlds ("world = starting point, available in both modes") ──────
test('artDirectionFor resolves the tuned opposite-mode variant on an override', () => {
	assert.equal(artDirectionInfo({ styleIntent: { artDirection: 'luxe', mode: 'light' } }).mode, 'light')
	assert.equal(artDirectionInfo({ styleIntent: { artDirection: 'luxe' } }).mode, 'dark')          // default unchanged
	assert.equal(artDirectionInfo({ styleIntent: { artDirection: 'editorial', mode: 'dark' } }).mode, 'dark')
	assert.equal(artDirectionInfo({ styleIntent: { artDirection: 'editorial' } }).mode, 'light')     // default unchanged
})
test('specIsDark tracks the requested mode override', () => {
	assert.equal(specIsDark({ styleIntent: { artDirection: 'luxe', mode: 'light' } }), false)
	assert.equal(specIsDark({ styleIntent: { artDirection: 'luxe' } }), true)
	assert.equal(specIsDark({ styleIntent: { artDirection: 'mist', mode: 'dark' } }), true)
})
test('every named world advertises BOTH modes', () => {
	const worlds = listArtDirections()
	// The catalog is an owner decision (waves 1-3, 2026-07-03): 18 worlds x 2 modes.
	assert.equal(worlds.length, 18)
	for (const w of worlds) assert.deepEqual([...w.availableModes].sort(), ['dark', 'light'], `${w.key} both modes`)
})

// ── The animation-effect guard (root cause of the "none" class) ───────────────
test('normalizeAnimation coerces an invalid entrance effect to fade', () => {
	assert.equal(normalizeAnimation({ type: 'entrance', effect: 'none' }).effect, 'fade')
	assert.equal(normalizeAnimation({ type: 'entrance', effect: 'totally-made-up' }).effect, 'fade')
	assert.equal(normalizeAnimation({ type: 'entrance', effect: '' }).effect, '')  // empty stays empty (no anim)
})
test('normalizeAnimation coerces an invalid emphasis effect to pulse', () => {
	// world emphasis temperaments (gentle/hard/precise/clean/none) are NOT valid effects
	for (const e of ['gentle', 'hard', 'precise', 'clean', 'none']) {
		assert.equal(normalizeAnimation({ type: 'emphasis', effect: e }).effect, 'pulse', `emphasis:${e}`)
	}
})
test('normalizeAnimation PRESERVES valid registry + 3D effects (no false coercion)', () => {
	assert.equal(normalizeAnimation({ type: 'entrance', effect: 'fly' }).effect, 'fly')
	assert.equal(normalizeAnimation({ type: 'entrance', effect: 'blinds' }).effect, 'blinds')
	assert.equal(normalizeAnimation({ type: 'emphasis', effect: 'pulse' }).effect, 'pulse')
	assert.equal(normalizeAnimation({ type: 'entrance', effect: 'wipe' }).effect, 'wipe')
	// native 3D animations must survive (they are valid via the runtime's separate 3D builder)
	for (const e of ['turntable', 'arrive', 'swing', 'jumpAndTurn', 'leave']) {
		assert.equal(normalizeAnimation({ type: 'emphasis', effect: e }).effect.toLowerCase(), e.toLowerCase(), `3d:${e}`)
	}
})
test('normalizeAnimation still applies aliases + leaves media/motion alone', () => {
	assert.equal(normalizeAnimation({ type: 'entrance', effect: 'fadeIn' }).effect, 'fade')
	assert.equal(normalizeAnimation({ type: 'media', effect: 'mediaplay' }).effect, 'mediaplay')
	// a motion path carries its path in motionPath, effect may be a path name — not coerced
	assert.equal(normalizeAnimation({ type: 'motion', effect: 'arcdown' }).effect, 'arcdown')
})

// ── Multilingual narration estimate ───────────────────────────────────────────
test('estimateNarrationMs is language-aware (de slower than en for the same words)', () => {
	const s = 'one two three four five six seven eight nine ten eleven twelve'
	const en = estimateNarrationMs(s, { lengthScale: 1, paddingMs: 0 }, { lang: 'en' })
	const de = estimateNarrationMs(s, { lengthScale: 1, paddingMs: 0 }, { lang: 'de' })
	assert.ok(de > en, `expected de(${de}) > en(${en})`)
	assert.ok(en >= 2500, 'floored at 2500')
})
test('estimateNarrationMs counts characters for no-space scripts (does not collapse to 1 word)', () => {
	const cjk = '这是一个非常长的中文句子用来测试字符计数逻辑是否正确运行需要足够多的字'  // ~30 CJK chars, no spaces
	const ms = estimateNarrationMs(cjk, { lengthScale: 1, paddingMs: 0 }, { lang: 'zh' })
	assert.ok(ms > 3000, `char-based estimate should exceed the 2500 floor, got ${ms}`)
})

// ── Unicode sentence splitting (drives the synced build in every language) ─────
test('splitNarrationSentences handles Latin, CJK, Arabic punctuation', () => {
	assert.equal(splitNarrationSentences('Alpha here. Beta here! Gamma here?').length, 3)
	assert.equal(splitNarrationSentences('甲乙丙。丁戊己。').length, 2)
	assert.equal(splitNarrationSentences('سؤال؟ جواب.').length, 2)
	assert.equal(splitNarrationSentences('one continuous clause').length, 1)
})

// ── Language resolution from the voice id / explicit lang ─────────────────────
test('narrationLangFor reads voice-id locale and explicit lang', () => {
	assert.equal(narrationLangFor({ narration: { voice: 'de_DE-thorsten-high' } }), 'de')
	assert.equal(narrationLangFor({ narration: { voice: 'en_US-ljspeech-high' } }), 'en')
	assert.equal(narrationLangFor({ narration: { lang: 'FR', voice: 'en_US-x' } }), 'fr')
	assert.equal(narrationLangFor({}), 'en')
})

// ── Explicit-narration detection must recognise segments ──────────────────────
test('slideHasExplicitNarration recognises script AND segments', () => {
	assert.equal(slideHasExplicitNarration({ narration: { script: 'hi there' } }), true)
	assert.equal(slideHasExplicitNarration({ narration: { segments: [{ script: 'a' }, { script: 'b' }] } }), true)
	assert.equal(slideHasExplicitNarration({ avatarNarration: { script: 'native presenter text' } }), true)
	assert.equal(slideHasExplicitNarration({ avatarNarration: { lockedVideo: { handle: 'asset://video' } } }), true)
	assert.equal(slideHasExplicitNarration({ avatarNarration: { enabled: false, script: 'disabled presenter text' } }), false)
	assert.equal(slideHasExplicitNarration({ narration: { enabled: false, script: 'x' } }), false)
	assert.equal(slideHasExplicitNarration({ narration: {} }), false)
	assert.equal(slideHasExplicitNarration({}), false)
})

test('avatarNarration script is the narration and notes clock when voice-only narration is absent', () => {
	assert.equal(slideNarrationScript({
		message: 'Fallback slide message.',
		avatarNarration: { script: 'The AI-authored native presenter script.' },
	}), 'The AI-authored native presenter script.')
	assert.equal(slideNarrationScript({
		message: 'Fallback slide message.',
		avatarNarration: { enabled: false, script: 'Disabled presenter script.' },
	}), 'Fallback slide message.')
	assert.equal(slideNarrationScript({
		narration: { script: 'Voice-only narration remains explicit.' },
		avatarNarration: { script: 'Presenter script.' },
	}), 'Voice-only narration remains explicit.')
})

// ── Auto-synced build cue generation (Capability B) ───────────────────────────
test('autoSyncBuildCues coerces a none/empty build effect to fade', () => {
	const cues = autoSyncBuildCues(['a', 'b', 'c'], 'One here. Two here. Three here.', 'none', 600)
	assert.equal(cues.length, 3)
	assert.ok(cues.every(c => c.effect === 'fade'), 'none build effect should become fade')
	assert.ok(cues.every(c => c.duration === 600 && c.autoSyncedBuild === true && c.atPhrase))
})
test('autoSyncBuildCues needs 2+ objects and 2+ sentences, else no build', () => {
	assert.deepEqual(autoSyncBuildCues(['only'], 'One. Two.', 'fade'), [])
	assert.deepEqual(autoSyncBuildCues(['a', 'b'], 'Just one sentence here', 'fade'), [])
	assert.equal(autoSyncBuildCues(['a', 'b'], 'One here. Two here.', 'wipe')[0].effect, 'wipe')
})

test('canonicalNarrationCue normalizes public compatibility aliases without hiding the anchor method', () => {
	assert.deepEqual(canonicalNarrationCue({ phrase: 'proof lands', objectName: 'proof-card', effect: 'pulse' }, {
		script: 'The proof lands here.',
	}), {
		atPhrase: 'proof lands',
		target: 'proof-card',
		effect: 'pulse',
		anchorMethod: NARRATION_CUE_ANCHOR_METHOD,
	})
	assert.deepEqual(canonicalNarrationCue({ word: 'Second', target: 'second-card' }, {
		script: 'Second comes next.',
	}), {
		atWord: 'Second',
		target: 'second-card',
		anchorMethod: NARRATION_CUE_ANCHOR_METHOD,
	})
	assert.deepEqual(canonicalNarrationCue({ atMs: 0, objectName: 'opening-card' }, { script: '' }), {
		atMs: 0,
		target: 'opening-card',
	})
})

test('canonicalNarrationCue fails closed for absent, empty, or missing anchors', () => {
	for (const cue of [{ phrase: 'not in script', target: 'proof' }, { phrase: '  ', target: 'proof' }, { target: 'proof' }]) {
		assert.throws(
			() => canonicalNarrationCue(cue, { script: 'The authored proof is here.' }),
			error => error?.code === 'NARRATION_CUE_ANCHOR_UNRESOLVED',
		)
	}
})
