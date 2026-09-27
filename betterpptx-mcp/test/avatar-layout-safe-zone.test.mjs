import test from 'node:test'
import assert from 'node:assert/strict'
import { planDeckLayout } from '../ir/layout-engine.mjs'

const presenterSafeBottom = 5.160 - 0.22
const presenterSafeRight = 10.993 - 0.22

function baseSpec(slide) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Avatar-safe layout proof',
		styleIntent: { artDirection: 'luxe', mode: 'dark' },
		slides: [{
			id: 'safe-zone',
			avatarNarration: { enabled: true, script: 'Presenter-safe layout.' },
			...slide,
		}],
	}
}

test('narrated hero content stays above the fixed Record Studio presenter', () => {
	const plan = planDeckLayout(baseSpec({
		layoutIntent: 'hero',
		content: [
			{ kind: 'title', name: 'hero-title', text: 'One story', region: 'body' },
			{ kind: 'quote', name: 'hero-thesis', text: 'One continuous explanation', region: 'body' },
		],
	}))
	for (const object of plan.slides[0].objects) {
		assert.ok(object.rect.y + object.rect.h <= presenterSafeBottom + 0.001, `${object.blockName} entered the presenter lane`)
	}
})

test('full-body proof and footer regions avoid the presenter ellipse', () => {
	const plan = planDeckLayout(baseSpec({
		layoutIntent: 'title-body-footer',
		content: [
			{ kind: 'title', name: 'title', text: 'Proof', region: 'title' },
			{ kind: 'table-panel', name: 'proof-table', header: ['A'], rows: [['B']], region: 'body', verified: true, evidenceSource: 'test' },
			{ kind: 'text', name: 'footer-copy', text: 'Footer', region: 'footer' },
		],
	}))
	const objects = plan.slides[0].objects
	const proof = objects.find(object => object.blockName === 'proof-table')
	const footer = objects.find(object => object.blockName === 'footer-copy')
	assert.ok(proof.rect.y + proof.rect.h <= presenterSafeBottom + 0.001)
	assert.ok(footer.rect.x + footer.rect.w <= presenterSafeRight + 0.001)
})

test('narrated footer content does not create a supporting caption lane by default', () => {
	const plan = planDeckLayout(baseSpec({
		layoutIntent: 'timeline',
		content: [
			{ kind: 'title', name: 'title', text: 'Pacing', region: 'title' },
			{ kind: 'callout', name: 'footer-callout', text: 'One source. One clock.', region: 'footer' },
			{ kind: 'textShape', name: 'footer-signal', text: 'INTRODUCE → PROVE → RESOLVE', shapeName: 'roundRect', region: 'footer' },
		],
	}))
	for (const name of ['footer-callout', 'footer-signal']) {
		const object = plan.slides[0].objects.find(item => item.blockName === name)
		assert.ok(object.rect.y >= 0, `${name} started above the canvas`)
		assert.ok(object.rect.y + object.rect.h <= 7.5 + 0.001, `${name} extended below the canvas`)
		assert.notEqual(object.role, 'caption-safe-footer-card', `${name} unexpectedly entered a caption-safe lane`)
		assert.ok(object.rect.x + object.rect.w <= presenterSafeRight + 0.001, `${name} entered the presenter lane`)
	}
})

test('legacy caption fields cannot reserve a visible subtitle lane', () => {
	const plan = planDeckLayout(baseSpec({
		layoutIntent: 'title-body',
		narration: { captions: { enabled: true, text: 'Explicit subtitle.' } },
		content: [
			{ kind: 'title', name: 'title', text: 'Narration stays native', region: 'title' },
			{ kind: 'table-panel', name: 'proof', header: ['A'], rows: [['B']], region: 'body', verified: true, evidenceSource: 'test' },
		],
	}))
	assert.equal(plan.slides[0].regions?.caption, undefined)
	assert.equal(plan.slides[0].objects.some(object => /caption/i.test(String(object.role || object.primitive || ''))), false)
})

test('timeline cards render the AI-authored item title and body', () => {
	const plan = planDeckLayout(baseSpec({
		layoutIntent: 'timeline',
		content: [{
			kind: 'timeline',
			name: 'meaning-timeline',
			region: 'body',
			items: [{ title: 'Introduce', text: 'Frame one idea.' }, { title: 'Prove', text: 'Reveal the evidence.' }],
		}],
	}))
	const steps = plan.slides[0].objects.filter(object => object.blockName === 'meaning-timeline')
	assert.equal(steps.length, 2)
	assert.equal(steps[0].text[0].text, 'Introduce')
	assert.equal(steps[0].text[1].text, 'Frame one idea.')
	assert.equal(steps[0].text[0].options.bold, true)
})

test('ordinary non-presenter layouts retain the normal body depth', () => {
	const plan = planDeckLayout({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Ordinary layout',
		slides: [{ id: 'ordinary', layoutIntent: 'title-body', content: [{ kind: 'table-panel', name: 'table', header: ['A'], rows: [['B']], region: 'body', verified: true, evidenceSource: 'test' }] }],
	})
	const table = plan.slides[0].objects.find(object => object.blockName === 'table')
	assert.ok(table.rect.y + table.rect.h > presenterSafeBottom)
})
