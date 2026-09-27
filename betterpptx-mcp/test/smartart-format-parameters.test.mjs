import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { listOptionCatalog, SMARTART_FORMAT_PARAMETERS } from '../option-registry.mjs'

const baseSpec = smartArt => ({
	 schemaVersion: 'betterpptx.deck-spec.v1', title: 'SmartArt format parameter contract',
	 authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	 contentStory: { audience: 'presentation authors', outcome: 'prove typed native SmartArt controls', remember: 'diagram choices remain editable' },
	 visualDesign: { world: 'blueprint', framing: 'one native SmartArt proof object' },
	 motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' },
	 slides: [{ id: 's', title: 'SmartArt formatting', message: 'Native SmartArt controls remain editable.', layoutIntent: 'title-only', content: [{ kind: 'smartart', name: 'diagram', ...smartArt }] }],
})

test('smartArtLayout catalog exposes native selectors and typed structured parameters', () => {
	const surface = listOptionCatalog({ surface: 'smartArtLayout', format: 'full' }).surfaces[0]
	assert.equal(surface.capabilityMode, 'preset-plus-parameters')
	assert.equal(surface.capabilityStatus, 'executable-exact-structured')
	assert.equal(surface.parameters.length, SMARTART_FORMAT_PARAMETERS.length)
	assert.ok(surface.parameters.some(item => item.id === 'rightToLeft'))
	assert.ok(surface.parameters.some(item => item.id === 'nodes'))
	assert.match(surface.resetBehavior.full, /layoutId/)
})

test('SmartArt selectors, topology and text controls reach the native operation', () => {
	const plan = buildSpecOperationPlan(baseSpec({
		mode: 'native', layoutId: 'urn:microsoft.com/office/officeart/2005/8/layout/process1',
		quickStyleId: 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1',
		colorStyleId: 'urn:microsoft.com/office/officeart/2005/8/colors/accent1_2', rightToLeft: true,
		style: { fontSize: 18, color: 'F8FAFC' }, textColors: ['F8FAFC', 'FFFFFF'], nodes: [{ text: 'Root', role: 'root', children: ['Child'] }],
	}))
	const operation = plan.operations.find(item => item.tool === 'betterpptx.slide.add_smartart')
	assert.equal(operation.args.rightToLeft, true)
	assert.equal(operation.args.fontSize, 18)
	assert.equal(operation.args.nodes[0].children[0], 'Child')
	assert.equal(operation.args.quickStyleId, 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1')
})

test('SmartArt format bounds reject unsafe values before mutation', () => {
	assert.throws(() => buildSpecOperationPlan(baseSpec({ style: { fontSize: 400.1 } }), { dryRun: true }), /fontSize/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ rightToLeft: 'yes' }), { dryRun: true }), /rightToLeft/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ nodes: [{ text: 'x', role: 'unsupported' }] }), { dryRun: true }), /role/)
	assert.throws(() => buildSpecOperationPlan(baseSpec({ nodes: new Array(1001).fill('x') }), { dryRun: true }), /nodes/)
})
