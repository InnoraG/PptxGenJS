import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('skill and public help refuse an empty title as a finished slide', () => {
	const skill = fs.readFileSync(path.join(root, 'skills', 'betterpptx', 'SKILL.md'), 'utf8')
	assert.match(skill, /title on empty canvas is not a slide/i)
	assert.match(skill, /textShape/)
	assert.match(skill, /title band/i)
	assert.match(skill, /kind:"title"/)
	const story = fs.readFileSync(path.join(root, 'skills', 'betterpptx', 'references', 'story-and-medium.md'), 'utf8')
	assert.match(story, /Do not ship a title on empty white/)
})

test('a checkout Pay pill compiles as filled native textShape, not as body copy', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Pay pill',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: 'mono', mode: 'light' },
		slides: [{
			id: 'checkout',
			title: 'The button was the product',
			layoutIntent: 'comparison',
			content: [
				{ kind: 'title', name: 'checkout-title', text: 'The button was the product' },
				{
					kind: 'textShape',
					name: 'now-pay',
					region: 'left',
					text: 'Pay',
					altText: 'Filled blue Pay capsule on the current checkout.',
					style: { fill: { color: '0071E3' }, color: 'FFFFFF', fontFace: 'Segoe UI', bold: true, rectRadius: 0.45 },
				},
				{
					kind: 'textShape',
					name: 'next-pay',
					region: 'right',
					text: 'Pay',
					altText: 'Typographic Pay action with no filled capsule.',
					style: { fill: { color: 'FFFFFF' }, color: '0071E3', fontFace: 'Segoe UI', bold: true, rectRadius: 0.08 },
				},
			],
		}],
	}, { dryRun: true })
	const pay = (plan.operations || []).find(item => String(item.args?.options?.objectName || '').includes('now-pay'))
	assert.ok(pay, 'Pay pill operation missing')
	assert.equal(pay.tool, 'betterpptx.slide.add_text')
	const fill = pay.args?.options?.fill
	const fillColor = typeof fill === 'string' ? fill : fill?.color
	assert.equal(String(fillColor || '').replace('#', '').toUpperCase(), '0071E3')
	const payload = pay.args?.text ?? pay.args?.options?.text
	const asText = typeof payload === 'string' ? payload : JSON.stringify(payload || '')
	assert.match(asText, /Pay/)
})
