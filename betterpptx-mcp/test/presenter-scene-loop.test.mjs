import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import { DOMParser } from '@xmldom/xmldom'
import { expandCastDirective } from '../ir/presenter-director.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { TOOLS } from '../tools.mjs'

// Compile the existing native timing builder in memory. No endpoint, model
// generation, saved package, Office instance, cache entry or asset is needed.
const require = createRequire(import.meta.url)
const ts = require('typescript')
const previousTs = require.extensions['.ts']
let buildPlaySceneAnimation
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
	fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText, filename)
try { ({ buildPlaySceneAnimation } = require('../../src/animations-builders/build3DModelAnimation.ts')) } finally {
	if (previousTs) require.extensions['.ts'] = previousTs
	else delete require.extensions['.ts']
}

const MOTIONS = [
	{ motionId: 'motion.ordinary.talk', slot: 1, duration: 10267 },
	{ motionId: 'motion.ordinary.enumerate', slot: 7, duration: 6633 },
]

function fixture(loop, actor = 'host', motion = MOTIONS[0]) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title: 'Single-pass presenter scene', layout: 'LAYOUT_WIDE',
		motion: { autoSync: false }, motionPolicy: 'full', showSettings: { useTimings: true, loop: false },
		// The bound model and its measured metadata are inert unit-test fixtures,
		// corresponding to the materialized public selection before cast expansion.
		presenters: { cast: [{ id: actor, model: 'asset://fixture/approved-actor', stageTreatment: 'none',
			clipMap: { [motion.motionId]: motion.slot }, clipDurations: { [motion.slot]: motion.duration },
		}] },
		slides: [{ id: 'scene-proof', title: 'One complete motion', role: 'proof', layoutIntent: 'title-only',
			content: [{ kind: 'title', name: 'scene-title', text: 'One complete motion' }],
			scene: [{ actor, motionId: motion.motionId, at: 800, ...(loop === undefined ? {} : { loop }) }],
			transition: { type: 'cut', advanceOnClick: false, advanceAfterTime: motion.duration + 1600 },
		}],
	}
}

function compiledModel(spec) {
	const before = structuredClone(spec)
	const plan = buildSpecOperationPlan(spec)
	assert.deepEqual(spec, before, 'compilation must not mutate the authored scene')
	const models = plan.operations.filter(operation => operation.tool === 'betterpptx.slide.add_model3d')
	assert.equal(models.length, 1, 'one cast beat remains exactly one native model')
	return models[0].args.options
}

function timingXml(animation) {
	return buildPlaySceneAnimation({ shapeId: 3, animation, type: 'emphasis',
		config: { defaultDuration: 2000 }, ids: { main: 5, set: 6, animX: 7, animY: 8, effect: 9 },
	})
}

function inspect(animation) {
	const xml = timingXml(animation), errors = []
	const doc = new DOMParser({ errorHandler: {
		warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message),
	} }).parseFromString(`<p:timing xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">${xml}</p:timing>`, 'application/xml')
	assert.deepEqual(errors, [])
	const nodes = name => Array.from(doc.getElementsByTagName(name))
	const effect = nodes('p:cTn').find(node => node.getAttribute('presetID') === '100')
	assert.ok(effect, 'native scene effect exists')
	return { xml, effect, nodes }
}

test('public inline and portable scene schemas teach the same optional boolean loop contract', () => {
	const inline = TOOLS.find(tool => tool.name === 'betterpptx.deck.generate_from_spec').inputSchema.properties.spec.properties.slides.items.properties.scene.items
	const portable = JSON.parse(readFileSync(new URL('../ir/deck-spec.v1.json', import.meta.url), 'utf8')).$defs.presenterSceneBeat
	assert.deepEqual(inline.properties.loop, portable.properties.loop)
	assert.equal(inline.properties.loop.type, 'boolean')
	assert.equal((inline.required || []).includes('loop'), false)
	assert.equal((portable.required || []).includes('loop'), false)
	assert.match(inline.properties.loop.description, /once and holds its final pose/)
	assert.match(inline.properties.loop.description, /True or omission repeats/)
})

test('six semantic play-once beats reach native single-pass hold XML with original clocks and no reverse', () => {
	for (const actor of ['joe', 'louise', 'pete']) for (const motion of MOTIONS) {
		const model = compiledModel(fixture(false, actor, motion))
		assert.equal(model.scene.loop, false)
		assert.equal(model.scene.animId, motion.slot)
		const animations = Array.isArray(model.animation) ? model.animation : [model.animation]
		assert.equal(animations.length, 1)
		const animation = animations[0]
		assert.equal(animation.loop, false)
		assert.equal(animation.duration, motion.duration)
		assert.equal(animation.delay, 800)
		assert.equal(animation.trigger, 'withPrevious')
		assert.equal(animation.autoReverse, undefined)
		assert.equal(animation.repeatCount, undefined)
		const { effect, nodes } = inspect(animation)
		assert.equal(effect.hasAttribute('repeatCount'), false, 'absent repeatCount is the native single-pass default')
		assert.equal(effect.getAttribute('fill'), 'hold')
		assert.equal(nodes('p:anim').length, 1)
		assert.deepEqual(nodes('p:attrName').map(node => node.textContent), [`embedded${motion.slot + 1}`])
		assert.deepEqual(nodes('p:cond').map(node => node.getAttribute('delay')), ['800'])
		assert.deepEqual(nodes('p:cTn').filter(node => node.hasAttribute('dur')).map(node => node.getAttribute('dur')), [String(motion.duration)])
		assert.deepEqual(nodes('p:tav').map(node => node.getAttribute('tm')), ['0', '100000'])
		assert.deepEqual(nodes('p:fltVal').map(node => node.getAttribute('val')), ['0', '1'])
		for (const node of nodes('p:cTn')) for (const field of ['autoRev', 'spd', 'accel', 'decel']) assert.equal(node.hasAttribute(field), false, field)
	}
})

test('explicit true and omission retain identical legacy expansion and indefinite native playback', () => {
	const omitted = compiledModel(fixture(undefined)), repeated = compiledModel(fixture(true)), once = compiledModel(fixture(false))
	assert.deepEqual(repeated, omitted)
	assert.equal(omitted.scene.loop, true)
	assert.equal(omitted.animation[0].loop, undefined)
	assert.equal(inspect(omitted.animation[0]).effect.getAttribute('repeatCount'), 'indefinite')
	assert.equal(timingXml(repeated.animation[0]), timingXml(omitted.animation[0]))
	// Undo only the two intended carriers: every model, camera, viewport,
	// placement, effect clock and media-binding option must otherwise be exact.
	once.scene.loop = true
	delete once.animation[0].loop
	assert.deepEqual(once, omitted)
})

test('scene loop refuses non-booleans instead of silently coercing strings, numbers or null', () => {
	for (const loop of ['false', 'true', 0, 1, null, {}, []]) {
		assert.throws(() => expandCastDirective(fixture(loop)), { code: 'PRESENTER_SCENE_LOOP_INVALID' })
	}
})
