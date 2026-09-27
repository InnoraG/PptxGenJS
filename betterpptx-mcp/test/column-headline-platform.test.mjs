import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { lowerHtmlAuthoringSurface, promoteColumnHeadlines } from '../ir/html-slide-compiler.mjs'
import { planDeckLayout } from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contract = { workflow: 'authoring-excellence-director-v1' }

function jsonPosterSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Harbour desk',
		authoringContract: contract,
		styleIntent: { artDirection: 'chalkline', mode: 'light' },
		slides: [{
			id: 'last-crossing',
			title: 'The last crossing is the product.',
			layoutIntent: 'comparison',
			content: [
				{ kind: 'title', name: 'headline', region: 'left', text: 'The last crossing is the product.' },
				{
					kind: 'textShape',
					name: 'now-sail',
					region: 'right',
					text: 'NOW 21:40',
					style: { fill: { color: '1F2933' }, color: 'F5F1E8' },
				},
				{
					kind: 'textShape',
					name: 'next-sail',
					region: 'right',
					text: 'NEXT 21:40',
					style: { fill: { color: 'F5F1E8' }, color: '1F2933' },
				},
			],
		}],
	}
}

test('JSON title with a column region is promoted for every World, not only HTML decks', () => {
	const promoted = promoteColumnHeadlines(jsonPosterSpec())
	const headline = promoted.slides[0].content.find(block => block.name === 'headline')
	assert.equal(headline.kind, 'textBox')
	assert.equal(headline.region, 'left')
	assert.ok(headline.style.fontSize >= 24)
	assert.ok(!promoted.slides[0].content.some(block => block.kind === 'title'))
})

test('JSON column headline compiles into the left lane and collapses the title band', () => {
	const spec = jsonPosterSpec()
	const layout = planDeckLayout(spec)
	assert.ok(layout.slides[0].regions.body.y < 1.0, `body.y=${layout.slides[0].regions.body.y}`)
	const headline = layout.slides[0].objects.find(object => String(object.objectName || '').includes('headline'))
	assert.ok(headline)
	assert.ok(headline.rect.x < 4, `headline should sit in the left column, x=${headline.rect.x}`)
	const plan = buildSpecOperationPlan(spec, { dryRun: true })
	assert.ok((plan.operations || []).some(item => String(item.args?.options?.objectName || '').includes('now-sail')))
})

test('region-less JSON titles still occupy the title band', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Rooms',
		authoringContract: contract,
		styleIntent: { artDirection: 'storybook', mode: 'light' },
		slides: [{
			id: 'rooms',
			title: 'Pick a first room.',
			layoutIntent: 'three-column',
			content: [
				{ kind: 'title', name: 'headline', text: 'Pick a first room.' },
				{ kind: 'textShape', name: 'water', region: 'leftThird', text: 'Water' },
			],
		}],
	}
	const layout = planDeckLayout(spec)
	assert.ok(layout.slides[0].regions.body.y > 1.2, `title band should remain, body.y=${layout.slides[0].regions.body.y}`)
	assert.equal(spec.slides[0].content[0].kind, 'title')
})

test('a second HTML brief, not the five-worlds copy, gets the same column lowering', () => {
	const spec = {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Kiln',
		authoringContract: contract,
		styleIntent: { artDirection: 'botanical', mode: 'light' },
		html: `<html><body>
<section class="slide" data-world="botanical" data-layout="two-column" data-mode="light" style="background:#f4efe4">
  <div class="grid2">
    <h1 data-kind="title" style="font-family:Georgia;color:#1f3324">The kiln holds the heat.</h1>
    <p data-kind="stat" data-name="soak" data-value="12" data-label="hours of soak — illustrative firing" data-evidence="illustrative studio soak">12</p>
  </div>
</section>
</body></html>`,
	}
	const lowered = lowerHtmlAuthoringSurface(spec)
	const headline = lowered.slides[0].content.find(block => /kiln holds the heat/.test(block.text || ''))
	assert.equal(headline.kind, 'textBox')
	assert.equal(headline.region, 'left')
	const layout = planDeckLayout(lowered)
	assert.ok(layout.slides[0].regions.body.y < 1.0, `body.y=${layout.slides[0].regions.body.y}`)
	const plan = buildSpecOperationPlan(spec, { dryRun: true })
	assert.ok((plan.operations || []).some(item => String(item.args?.options?.objectName || '').includes('soak')))
})

test('skill and new-authoring teach the JSON column-title rule', () => {
	const skill = fs.readFileSync(path.join(root, 'skills', 'betterpptx', 'SKILL.md'), 'utf8')
	const authoring = fs.readFileSync(path.join(root, 'skills', 'betterpptx', 'references', 'new-authoring.md'), 'utf8')
	const catalog = fs.readFileSync(path.join(root, 'skills', 'betterpptx', 'references', 'catalog-choice.md'), 'utf8')
	assert.match(skill, /region:"left"/)
	assert.match(authoring, /empty PowerPoint title band/)
	assert.match(catalog, /customGeometry/)
})
