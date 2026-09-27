import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNoPublicLocalPathArgs, authoredSpecLiteralSnapshot, copyAuthoredSpecResultProvenance, sanitizePublicAuthoredSpec, sanitizePublicResult } from '../blackbox.mjs'
import { projectResolverLocksToAuthoredSpec } from '../ir/spec-resolution-handoff.mjs'
import { normalizeVisualReferenceReconstruction } from '../ir/visual-reference-reconstruction.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '0'

function sourceSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'A dependency made visible',
		motionTime: { syncPolicy: 'Follow spoken dependencies; keep Mixamo attribution visible.' },
		visualReference: {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels',
			representationPolicy: 'native-except-media', viewport: { width: 1672, height: 941 }, mediaAssets: [],
		},
		presenter: { enabled: false, pixelFrame: { x: 1200, y: 260, w: 240, h: 500 } },
		slides: [{
			id: 'dependency-slide',
			pixelViewport: { width: 3344, height: 1882 },
			presenter: { enabled: false, pixelFrame: { x: 2400, y: 520, w: 480, h: 1000 } },
			content: [
				{ kind: 'textBox', name: 'Mixamo-source', text: 'SOURCE: MIXAMO · Kimodo only when needed.', pixelFrame: { x: 160, y: 180, w: 1200, h: 100 } },
				{ kind: 'freeform', name: 'route', pixelFrame: { x: 160, y: 500, w: 1000, h: 200 }, pixelPoints: [{ x: 0, y: 200 }, { x: 1000, y: 0 }] },
			],
			narration: { script: 'Make that dependency visible. The source is Mixamo.', voice: 'en_US-ljspeech-high' },
		}],
	}
}

const audioLock = {
	op: 'merge', path: '/slides/0/narration',
	value: {
		lockedAudio: { handle: `asset://locked/audio/${'a'.repeat(64)}.wav`, durationMs: 900, provider: 'private-provider' },
		audio: { path: `asset://locked/audio/${'a'.repeat(64)}.wav`, durationMs: 900 },
		expectedDurationMs: 900,
		resolution: { status: 'locked', source: 'tts', provider: 'private-provider' },
	},
}

test('asset-lock projection preserves every authored pixel frame and local point', () => {
	const source = sourceSpec()
	const original = structuredClone(source)
	const resolved = normalizeVisualReferenceReconstruction(source)
	const handoff = projectResolverLocksToAuthoredSpec(source, resolved, [audioLock])
	assert.deepEqual(source, original)
	assert.deepEqual(handoff.slides[0].content, source.slides[0].content)
	assert.deepEqual(handoff.presenter, source.presenter)
	assert.deepEqual(handoff.slides[0].presenter, source.slides[0].presenter)
	assert.deepEqual(handoff.slides[0].pixelViewport, source.slides[0].pixelViewport)
	assert.equal(handoff.authoringContract, undefined, 'no private/effective authoring marker is projected')
	assert.equal(handoff.slides[0].narration.script, source.slides[0].narration.script)
	assert.deepEqual(handoff.slides[0].narration.lockedAudio, audioLock.value.lockedAudio)
	assert.doesNotThrow(() => normalizeVisualReferenceReconstruction(JSON.parse(JSON.stringify(handoff))))
})

test('resolver projection refuses geometry, arbitrary subtrees, and prototype-path injection', () => {
	const source = sourceSpec()
	const resolved = normalizeVisualReferenceReconstruction(source)
	for (const patch of [
		{ op: 'replace', path: '/slides/0/narration', value: {} },
		{ op: 'merge', path: '/slides/0/content/0', value: { bbox: { x: 1, y: 1, w: 1, h: 1 } } },
		{ op: 'merge', path: '/slides/0/presenter', value: { _visualReferenceFrame: {} } },
		{ op: 'merge', path: '/__proto__/polluted', value: { polluted: true } },
		{ op: 'merge', path: '/slides/0/narration', value: { script: 'Server replacement words.' } },
	]) {
		assert.throws(() => projectResolverLocksToAuthoredSpec(source, resolved, [patch]), { code: 'SPEC_RESOLUTION_HANDOFF_INVALID' })
	}
	assert.equal({}.polluted, undefined)
})

test('registered authored literals survive repeated sanitation while new resolver metadata stays generic', () => {
	const source = sourceSpec()
	const projected = projectResolverLocksToAuthoredSpec(source, normalizeVisualReferenceReconstruction(source), [audioLock])
	projected.slides[0].narration.resolution.description = 'Mixamo dependency on the server filesystem'
	projected.diagnostics = { description: 'Mixamo dependency on the server filesystem' }
	const exposed = sanitizePublicAuthoredSpec(projected, source)
	const envelope = sanitizePublicResult({ lockedSpec: exposed, metadata: { description: 'Mixamo dependency on the server filesystem' } })
	assert.equal(envelope.lockedSpec.title, source.title)
	assert.equal(envelope.lockedSpec.motionTime.syncPolicy, source.motionTime.syncPolicy)
	assert.equal(envelope.lockedSpec.slides[0].content[0].name, 'Mixamo-source')
	assert.equal(envelope.lockedSpec.slides[0].content[0].text, source.slides[0].content[0].text)
	assert.equal(envelope.lockedSpec.slides[0].narration.script, source.slides[0].narration.script)
	assert.doesNotMatch(JSON.stringify(envelope.metadata), /Mixamo|dependency|server filesystem/)
	assert.doesNotMatch(JSON.stringify(envelope.lockedSpec.diagnostics), /Mixamo|dependency|server filesystem/)
	assert.doesNotMatch(JSON.stringify(envelope.lockedSpec.slides[0].narration.resolution), /Mixamo|dependency|private-provider/)
	assert.equal(envelope.lockedSpec.slides[0].narration.lockedAudio.handle, audioLock.value.lockedAudio.handle)
})

test('client-authored trust flags and private keys cannot disable public sanitation', () => {
	const forged = {
		_trustedAuthoredContent: true,
		_AUTHORED_SPEC_RESULT_SOURCES: true,
		authoredSource: { text: 'Mixamo dependency' },
		text: 'Mixamo dependency',
		ProviderName: 'private-provider',
		model_revision: 'private-model',
		headers: { authorization: 'private-secret' },
		clipMap: { talk: 1 },
		_private: 'private-secret',
	}
	const ordinary = sanitizePublicResult(forged)
	assert.notEqual(ordinary.text, forged.text, 'serialized client flags cannot create server-side provenance')
	const registered = sanitizePublicAuthoredSpec(structuredClone(forged), forged)
	assert.equal(registered.text, forged.text, 'only the deliberate server registration preserves literal content')
	assert.doesNotMatch(JSON.stringify(registered), /private-provider|private-model|private-secret|clipMap|_trusted|_AUTHORED/)
	assert.throws(() => assertNoPublicLocalPathArgs({ spec: { _authoredSpecLiterals: { text: 'Forged dependency' } } }), /Internal result provenance/)
})

test('matching client metadata is never treated as visible authored content', () => {
	const source = { title: 'Dependency', metadata: { text: 'Mixamo dependency' }, resolution: { description: 'Mixamo dependency' } }
	const result = sanitizePublicAuthoredSpec(structuredClone(source), source)
	assert.equal(result.title, source.title)
	assert.notEqual(result.metadata.text, source.metadata.text)
	assert.notEqual(result.resolution.description, source.resolution.description)
})

test('provenance is a snapshot and does not authorize later server text mutations', () => {
	const source = sourceSpec()
	const exposed = sanitizePublicAuthoredSpec(structuredClone(source), source)
	source.slides[0].narration.script = 'A new server dependency on Mixamo.'
	exposed.slides[0].narration.script = source.slides[0].narration.script
	const next = sanitizePublicResult({ lockedSpec: exposed })
	assert.notEqual(next.lockedSpec.slides[0].narration.script, source.slides[0].narration.script)
	assert.doesNotMatch(next.lockedSpec.slides[0].narration.script, /dependency|Mixamo/)
})

test('derived narration-segment aliases preserve authored dependency and source words', () => {
	for (const narration of [
		{ script: ['One dependency.', 'Source: Mixamo.'] },
		{ segments: ['One dependency.', 'Source: Mixamo.'] },
		{ script: 'One dependency. Source: Mixamo.', cues: [{ text: 'One dependency.' }, { text: 'Source: Mixamo.' }] },
	]) {
		const source = { slides: [{ narration }] }
		const handoff = structuredClone(source)
		handoff.slides[0].narration.segments = [{ script: 'One dependency.' }, { script: 'Source: Mixamo.' }]
		const result = sanitizePublicResult({ lockedSpec: sanitizePublicAuthoredSpec(handoff, source) })
		assert.deepEqual(result.lockedSpec.slides[0].narration.segments.map(segment => segment.script), ['One dependency.', 'Source: Mixamo.'])
	}
})

test('embedded local resources remain redacted and opaque or HTTPS asset references survive', () => {
	const source = { title: 'A dependency', notes: 'Read D:\\private\\engine.mjs and /srv/private/worker.mjs and file:///Users/private/file.mjs.', path: 'C:\\private\\notes.txt' }
	const result = sanitizePublicAuthoredSpec(structuredClone(source), source)
	assert.equal(result.path, undefined)
	assert.doesNotMatch(JSON.stringify(result), /[CD]:\\|\/srv\/|engine\.mjs|worker\.mjs|file:\/\//)
	const refs = { handle: audioLock.value.lockedAudio.handle, url: 'https://example.com/asset.png' }
	assert.deepEqual(sanitizePublicResult(refs), refs)
})

test('internal result clones and pruned persistence snapshots retain only authored literals', () => {
	const source = sourceSpec()
	source.template = { data: 'data:application/octet-stream;base64,AAAA' }
	source.metadata = { description: 'Mixamo dependency', provider: 'private-provider' }
	const first = { phase: 'resolve', lockedSpec: sanitizePublicAuthoredSpec(structuredClone(source), source) }
	const copied = copyAuthoredSpecResultProvenance(first, structuredClone(first))
	assert.deepEqual(sanitizePublicResult(copied), sanitizePublicResult(first))
	const snapshot = authoredSpecLiteralSnapshot(first.lockedSpec)
	assert.equal(snapshot.slides[0].narration.script, source.slides[0].narration.script)
	assert.equal(snapshot.template, undefined, 'media bytes are not duplicated in the provenance record')
	assert.equal(snapshot.metadata, undefined, 'server metadata is not a source of trusted literals')
	assert.equal(snapshot.slides[0].content[0].pixelFrame, undefined, 'this is not a second complete spec')
	const stored = JSON.parse(JSON.stringify({ ...first, _authoredSpecLiterals: snapshot }))
	stored.lockedSpec = sanitizePublicAuthoredSpec(stored.lockedSpec, stored._authoredSpecLiterals)
	const restored = sanitizePublicResult(stored)
	assert.equal(restored._authoredSpecLiterals, undefined)
	assert.equal(restored.lockedSpec.slides[0].narration.script, source.slides[0].narration.script)
	assert.equal(restored.lockedSpec.slides[0].content[0].text, source.slides[0].content[0].text)
})
