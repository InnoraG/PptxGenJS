import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'
import { parseGlb } from '../ir/kinetic-transplant.mjs'
import { assertPowerPointSafeStaticPose } from '../assets/glb-static-pose-profile.mjs'
import { chooseDefaultPresenter, ensureDefaultPresenterRegistered } from '../assets/default-presenter-roster.mjs'
import { getCachedGeneratedRigged3d } from '../assets/model3d-gen-providers.mjs'

const glbPath = fileURLToPath(new URL('../assets/default-presenter-mena.glb', import.meta.url))
const posterPath = fileURLToPath(new URL('../assets/default-presenter-mena.png', import.meta.url))
const glb = readFileSync(glbPath)

test('Mena is an explicit fourth presenter backed by the frozen Mena hybrid asset', () => {
	const parsed = parseGlb(glb)
	assert.equal(parsed.json.skins?.length, 1)
	assert.equal(parsed.json.skins[0].joints.length, 65)
	assert.equal(parsed.json.extensionsUsed?.length ?? 0, 0)
	assert.equal(parsed.json.extensionsRequired?.length ?? 0, 0)
	assert.equal(parsed.json.nodes.filter(node => /^mixamorig\d+:/i.test(node.name ?? '')).length, 0)
	assert.deepEqual(parsed.json.animations.map(animation => animation.name), [
		'00_idle', '01_talk', '02_greet', '03_point', '04_emphasize', '05_magnitude',
		'06_contrast', '07_enumerate', '08_ask', '09_present', '10_agree', '11_bow',
		'12_think', '13_disagree', '14_happy', '15_surprise', '16_walk', '17_clap',
	])
	assert.equal(parsed.json.animations[1].channels.filter(channel => channel.target.path === 'translation').length, 1)
	assert.equal(parsed.json.animations[7].channels.filter(channel => channel.target.path === 'translation').length, 1)
	assert.ok(parsed.json.meshes.length >= 1)
	const primitives = parsed.json.meshes.flatMap(mesh => mesh.primitives ?? [])
	assert.ok(primitives.length >= 1)
	assert.ok(primitives.every(primitive => primitive.mode === undefined || primitive.mode === 4))
	assert.ok(primitives.every(primitive => primitive.indices === undefined || parsed.json.accessors[primitive.indices].componentType === 5123))
	const totalVertices = primitives.reduce((sum, primitive) => sum + parsed.json.accessors[primitive.attributes.POSITION].count, 0)
	const totalTriangles = primitives.reduce((sum, primitive) => sum + Math.floor(parsed.json.accessors[primitive.indices].count / 3), 0)
	assert.ok(totalVertices <= 60000)
	assert.ok(totalTriangles <= 70000)
	assert.equal(parsed.json.images.length, 1)
	assert.ok(readFileSync(posterPath).length > 0)
	assert.ok(assertPowerPointSafeStaticPose(glb, { label: 'Mena fourth presenter' }).armDropRatio.left > 0.35)

	const selected = chooseDefaultPresenter({ presenter: { identity: 'mena' } })
	assert.deepEqual(selected, {
		identity: 'mena',
		mode: 'explicit',
		reason: 'explicit author choice',
		scores: { joe: 0, louise: 0, pete: 0, mena: 1 },
	})
	const registered = ensureDefaultPresenterRegistered('mena')
	const cached = getCachedGeneratedRigged3d(registered.hash)
	assert.equal(Buffer.from(cached.glbBase64, 'base64').equals(glb), true)
	assert.equal(registered.manifest.personaKind, 'mena-supplied-meshy-hybrid-research')
	assert.equal(registered.manifest.audienceFocus, 'youth-and-young-adult-topics')
	assert.equal(registered.manifest.releaseStatus, 'research-only-owner-gated')
	assert.equal(createHash('sha256').update(glb).digest('hex'), '2253cfc9b2b0811c13fd73e05da1dc91cee98e17a8151441030cf2c88e278c8a')
})

test('Mena fourth presenter materializes from an explicit semantic deck identity', () => {
	const plan = buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Mena presenter proof',
		audience: 'verification',
		objective: 'Show the fourth presenter identity',
		styleIntent: { preset: 'slate-pro' },
		theme: { name: 'Verify', palette: ['0B1220', '2563EB', '14B8A6', 'F59E0B', 'F8FAFC'], fontFace: 'Aptos' },
		presenter: { identity: 'mena' },
		sections: [{ id: 'main', title: 'Main', slideIds: ['s1'] }],
		slides: [{ id: 's1', title: 'Mena', role: 'opener', message: 'Mena', layoutIntent: 'title-body', content: [{ kind: 'title', name: 'title', text: 'Mena' }] }],
	}, { plan: 'premium' })
	assert.equal(plan.appliedDefaults.presenter.identity, 'mena')
	assert.equal(plan.appliedDefaults.presenter.selection.mode, 'explicit')
	assert.ok(plan.operations.some(operation => JSON.stringify(operation).includes('gen://rigged3d/')))
})
