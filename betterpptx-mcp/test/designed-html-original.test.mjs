import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import {
	applyPowerpointNiceties,
	lowerHtmlAuthoringSurface,
	lowerHtmlSlides,
} from '../ir/html-slide-compiler.mjs'
import { planDeckLayout } from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(root, '..')
const fiveWorldsHtml = path.join(repoRoot, 'outputs', 'authoring-excellence', 'capability-freedom-20260818', 'five-worlds-pay-pill-civic-38-sae-rooms-lock.html')
const kilnHtml = path.join(repoRoot, 'outputs', 'authoring-excellence', 'capability-freedom-20260818', 'kiln-hold-cone-chamber.html')
const skillFile = path.join(root, 'skills', 'betterpptx', 'SKILL.md')
const designGuide = path.join(root, 'skills', 'betterpptx', 'references', 'html-slide-design.md')

const saeNicety = {
	htmlWorld: 'observatory',
	replaceSketch: 'plot',
	kind: 'chart-panel',
	name: 'plot',
	chartType: 'bar',
	chartPresetId: 'bar-clustered',
	altText: 'Serious events for mAb versus placebo',
	evidenceSource: 'illustrative closed-session values',
	chartOptions: { showTitle: false, showLegend: true, showValue: true, chartColors: ['7DD3FC', 'A3E635'] },
	data: [
		{ name: 'mAb', labels: ['Lower-respiratory', 'Wheeze', 'Infusion reaction'], values: [9, 7, 4] },
		{ name: 'Placebo', labels: ['Lower-respiratory', 'Wheeze', 'Infusion reaction'], values: [5, 4, 3] },
	],
}

test('skill forbids treating dialect-only HTML as a design original', () => {
	const skill = fs.readFileSync(skillFile, 'utf8')
	const guide = fs.readFileSync(designGuide, 'utf8')
	assert.match(skill, /Dialect-only HTML/)
	assert.match(skill, /is not a design original/)
	assert.match(skill, /Do not classify every HTML layer/)
	assert.match(guide, /data-kind/)
	assert.match(guide, /not from a closed list of class names/)
	assert.match(guide, /Do not classify every HTML layer/)
	assert.match(guide, /kind:"textShape"/)
	assert.match(guide, /kind:"chart-panel"/)
	assert.match(guide, /Visible HTML captions are \*\*not\*\* PowerPoint subtitles/)
	assert.match(skill, /Never use `presentation`, `slides`, or `result`/)
	assert.match(skill, /any designed 16:9 HTML/)
	assert.match(guide, /designed 16:9 HTML/)
})

test('five-worlds HTML original lowers Pay pill, 38, rooms, and lock SVG without data-kind', () => {
	const html = fs.readFileSync(fiveWorldsHtml, 'utf8')
	assert.equal((html.match(/data-kind/g) || []).length, 0)
	assert.match(html, /16 \/ 9/)
	const slides = lowerHtmlSlides(html)
	assert.equal(slides.length, 5)

	const mono = slides[0]
	assert.equal(mono.htmlWorld, 'mono')
	const headline = mono.content.find(block => /button was the product/.test(block.text || ''))
	assert.equal(headline.kind, 'textBox')
	assert.equal(headline.region, 'left')
	const pill = mono.content.find(block => block.name === 'pill')
	assert.equal(pill.kind, 'textShape')
	assert.equal(pill.text, 'Pay')
	assert.equal(pill.style.fill.color, '0071E3')
	assert.equal(pill.style.color, 'FFFFFF')
	assert.equal(pill.region, 'right')
	assert.ok(!Object.prototype.hasOwnProperty.call(pill, 'bbox'))
	const typePay = mono.content.find(block => block.name === 'type-pay')
	assert.equal(typePay.kind, 'textShape')
	assert.equal(typePay.text, 'Pay')
	assert.equal(typePay.style.color, '0071E3')
	assert.equal(typePay.style.fill?.transparency, 100)
	assert.equal(pill.stackGroup, 'now')
	assert.equal(typePay.stackGroup, 'next')
	assert.ok(mono.content.some(block => block.kind === 'textShape' && /NOW \$48\.00/.test(block.text || '') && block.stackGroup === 'now'))
	assert.ok(mono.content.some(block => block.kind === 'textShape' && /NEXT \$48\.00/.test(block.text || '')))

	const editorial = slides[1]
	assert.equal(editorial.htmlWorld, 'editorial')
	assert.ok(editorial.content.some(block => block.kind === 'title'))
	const stat = editorial.content.find(block => block.kind === 'stat')
	assert.equal(stat.value, '38')
	assert.equal(stat.name, 'n')

	const observatory = slides[2]
	assert.equal(observatory.htmlWorld, 'observatory')
	const plot = observatory.content.find(block => block.kind === 'htmlSketch')
	assert.equal(plot.sketch, 'plot')
	assert.equal(plot.name, 'plot')
	assert.ok(!observatory.content.some(block => block.kind === 'chart-panel'))

	const story = slides[3]
	assert.equal(story.htmlWorld, 'storybook')
	const rooms = story.content.filter(block => block.kind === 'textBox' && block.role === 'headline' && block.stackGroup)
	assert.equal(rooms.length, 3)
	assert.deepEqual(rooms.map(block => block.region), ['leftThird', 'midThird', 'rightThird'])
	assert.match(rooms[0].text, /Water/)
	assert.ok(story.content.some(block => block.kind === 'body' && /Pumps/.test(block.text || '')))
	assert.ok(story.content.some(block => block.clusterHost === true && block.decorative === true))

	const blueprint = slides[4]
	assert.equal(blueprint.htmlWorld, 'blueprint')
	const lock = blueprint.content.find(block => block.kind === 'customGeometry')
	assert.equal(lock.name, 'lock')
	assert.match(lock.svg, /viewBox="0 0 640 360"/)
	assert.match(lock.svg, /floor culverts|M118 252/)
	const equation = blueprint.content.find(block => block.kind === 'equation')
	assert.match(equation.unicodeMath, /P\s*=\s*ρ g h|P = ρ g h/)
})

test('kiln-hold-cone-chamber.html is a 16:9 original and lowers Hold without data-kind', () => {
	const html = fs.readFileSync(kilnHtml, 'utf8')
	assert.equal((html.match(/data-kind/g) || []).length, 0)
	assert.match(html, /16 \/ 9/)
	const slides = lowerHtmlSlides(html)
	assert.equal(slides.length, 3)
	assert.equal(slides[0].htmlWorld, 'botanical')
	assert.equal(slides[0].content.find(block => block.kind === 'stat')?.value, '12')
	const hold = slides[1].content.find(block => block.name === 'pill')
	assert.equal(hold.kind, 'textShape')
	assert.equal(hold.text, 'Hold')
	assert.equal(hold.style.fill.color, '3F6F4E')
	assert.equal(slides[2].content.find(block => block.kind === 'customGeometry')?.name, 'lock')
})

test('an unseen 16:9 HTML original still lowers a pill, a giant numeral, and a column headline', () => {
	const slides = lowerHtmlSlides(`<!DOCTYPE html>
<html><head><style>
.stage { width: min(100vw, calc(100vh * 16 / 9)); height: min(100vh, calc(100vw * 9 / 16)); }
.harbor { background: #eef2f6; color: #1a1a1a; }
.split { display: grid; grid-template-columns: 1.1fr .9fr; }
.cta { background: #0f766e; color: #fff; border-radius: 999px; }
.hero-num { color: #0f766e; font-size: 8vw; }
</style></head><body>
<section class="slide harbor">
  <div class="split">
    <h1>The night window is the product.</h1>
    <div>
      <div class="hero-num">11<span>staffed hours after dusk — illustrative</span></div>
      <button class="cta" type="button">Keep</button>
    </div>
  </div>
</section>
</body></html>`)
	assert.equal(slides.length, 1)
	assert.equal(slides[0].background, 'EEF2F6')
	const headline = slides[0].content.find(block => /night window/.test(block.text || ''))
	assert.equal(headline.kind, 'textBox')
	assert.equal(headline.region, 'left')
	const stat = slides[0].content.find(block => block.kind === 'stat')
	assert.equal(stat.value, '11')
	assert.equal(stat.name, 'hero-num')
	assert.equal(stat.style.fill?.transparency, 100)
	const keep = slides[0].content.find(block => block.name === 'cta')
	assert.equal(keep.kind, 'textShape')
	assert.equal(keep.text, 'Keep')
	assert.equal(keep.style.fill.color, '0F766E')
	assert.ok(!Object.prototype.hasOwnProperty.call(keep, 'bbox'))
})

test('five distinct 16:9 originals each show five slides and do not clone one template', () => {
	const decks = [
		{ name: 'broadsheet-city-arts-friday-hours.html', world: 'editorial', needle: /Vote the Friday hours/ },
		{ name: 'closed-session-sae-two-arms.html', world: 'observatory', needle: /harm, not lift/ },
		{ name: 'first-room-water-dark-make.html', world: 'storybook', needle: /Pick a first room/ },
		{ name: 'lock-chamber-head-not-boat.html', world: 'blueprint', needle: /floor culverts/ },
		{ name: 'checkout-now-pay-next-type.html', world: 'mono', needle: /The button was the product/ },
	]
	const fingerprints = new Set()
	for (const deck of decks) {
		const html = fs.readFileSync(path.join(repoRoot, 'outputs', 'authoring-excellence', 'capability-freedom-20260818', deck.name), 'utf8')
		assert.equal((html.match(/data-kind/g) || []).length, 0, deck.name)
		assert.match(html, /16 \/ 9/)
		assert.match(html, /all five slides are on this page/)
		assert.doesNotMatch(html, /\.slide\s*\{[^}]*display:\s*none/)
		assert.match(html, deck.needle)
		const slides = lowerHtmlSlides(html)
		assert.equal(slides.length, 5, deck.name)
		assert.ok(slides.every(slide => slide.htmlWorld === deck.world), deck.name)
		assert.ok(!slides.some(slide => slide.content.some(block => Object.prototype.hasOwnProperty.call(block, 'bbox'))), deck.name)
		fingerprints.add(slides.map(slide => `${slide.htmlWorld}:${slide.layoutIntent}:${slide.content.map(block => block.kind).join(',')}`).join('|'))
	}
	assert.equal(fingerprints.size, 5)
})

test('a PowerPoint nicety replaces the CSS plot sketch with a native clustered bar', () => {
	const html = fs.readFileSync(fiveWorldsHtml, 'utf8')
	const spec = applyPowerpointNiceties(lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Five Worlds',
		html,
		niceties: [saeNicety],
		selectionManifest: { schemaVersion: 'betterpptx.ai-selection-manifest.v1', enforcement: 'required', selections: [] },
	}))
	assert.ok(!spec.html)
	assert.ok(!spec.niceties)
	const observatory = spec.slides.find(slide => slide.htmlWorld === 'observatory')
	assert.ok(!observatory.content.some(block => block.kind === 'htmlSketch'))
	const chart = observatory.content.find(block => block.kind === 'chart-panel')
	assert.equal(chart.name, 'plot')
	assert.equal(chart.chartType, 'bar')
	assert.equal(chart.region, 'left')
	assert.deepEqual(chart.data[0].values, [9, 7, 4])
	assert.equal(spec.selectionManifest.selections[0].selectors.chartPresetId, 'bar-clustered')
	assert.equal(spec.selectionManifest.selections[0].target, 'plot')

	const plan = buildSpecOperationPlan({
		...spec,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: 'observatory', mode: 'dark' },
	}, { dryRun: true })
	assert.ok((plan.operations || []).some(item => item.tool === 'betterpptx.slide.add_chart'))
})

test('designed HTML keeps cluster members packed, cards chromed, and type compact', () => {
	const html = fs.readFileSync(path.join(repoRoot, 'outputs', 'authoring-excellence', 'capability-freedom-20260818', 'night-ferry-last-crossing-slack-board.html'), 'utf8')
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'The last crossing is the product',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: 'chalkline', mode: 'light' },
		html,
		niceties: [{
			htmlWorld: 'observatory',
			replaceSketch: 'plot',
			kind: 'chart-panel',
			name: 'plot',
			chartType: 'bar',
			chartPresetId: 'bar-clustered',
			altText: 'Illustrative cancellations',
			evidenceSource: 'illustrative harbour log',
			chartOptions: { showTitle: false, showLegend: true, showValue: true, chartColors: ['E8E0D0', 'C2410C'] },
			data: [
				{ name: 'Wind', labels: ['Mon', 'Thu', 'Sat'], values: [2, 4, 3] },
				{ name: 'Slack', labels: ['Mon', 'Thu', 'Sat'], values: [1, 2, 1] },
			],
		}],
	})
	const rooms = spec.slides.find(slide => slide.content.some(block => block.kind === 'shape' && /^ill/.test(block.name || '')))
	assert.ok(rooms)
	assert.ok(rooms.content.some(block => block.clusterHost === true && block.decorative === true))
	const headline = spec.slides[0].content.find(block => /last crossing is the product/.test(block.text || ''))
	assert.equal(headline.style.fontFace, 'Georgia')
	const layout = planDeckLayout(spec)
	const overlap = (a, b) => {
		const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
		const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y))
		return x * y
	}
	const roomSlide = layout.slides.find(slide => slide.objects.some(object => String(object.objectName || '').includes('.ill.')))
	assert.ok(roomSlide)
	const ills = roomSlide.objects.filter(object => /(^|\.)ill(-|\.|$)/.test(String(object.objectName || '')) && object.bleed !== true)
	const copies = roomSlide.objects.filter(object => /room-copy/.test(String(object.objectName || '')) && object.primitive !== 'shape')
	assert.equal(ills.length, 3)
	assert.ok(copies.length >= 3)
	for (const copy of copies) {
		assert.ok(copy.rect.h >= 0.85, `room copy too short h=${copy.rect.h}`)
		for (const ill of ills) {
			if (Math.abs(ill.rect.x - copy.rect.x) > 0.4) continue
			assert.ok(overlap(ill.rect, copy.rect) < 0.08, `ill overlaps room copy by ${overlap(ill.rect, copy.rect)}`)
		}
	}
	const statSlide = layout.slides.find(slide => slide.objects.some(object => object.role === 'stat'))
	const stat = statSlide.objects.find(object => object.role === 'stat')
	assert.ok(stat.rect.h <= 2.6, `stat should stay compact type, h=${stat.rect.h}`)
	const checkout = layout.slides[0]
	const amt = checkout.objects.find(object => /21:40/.test(JSON.stringify(object.text || '')))
	const pill = checkout.objects.find(object => String(object.objectName || '').includes('.pill'))
	assert.ok(amt && pill)
	assert.ok(overlap(amt.rect, pill.rect) < 0.05, `amount overlaps pill by ${overlap(amt.rect, pill.rect)}`)
})
