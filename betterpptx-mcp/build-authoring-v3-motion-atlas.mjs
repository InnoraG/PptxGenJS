#!/usr/bin/env node
// Build the Authoring-v3 executable-motion atlas through BetterPPTX MCP.
// The file contains real editable native 3D presenter objects: one concise
// index plus one automatically playing slide per public motion ID.  The
// catalog is sharded into legal <=18-animation presenter bundles.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outputDir = path.join(repoRoot, 'outputs', 'authoring-v3-motion-atlas', stamp)
await fs.mkdir(outputDir, { recursive: true })

Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '0',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '0',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '999',
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_DOWNLOAD_ROOT: outputDir,
})

const [{ createMcpToolDispatcher }, { publicAuthoringMotionCatalog, authoringMotionCatalog }, { default: JSZip }] = await Promise.all([
	import('./engine.mjs'),
	import('./ir/authoring-motion-catalog.mjs'),
	import('jszip'),
])

function chunk(items, size) {
	const chunks = []
	for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size))
	return chunks
}

async function listFiles(root) {
	const files = []
	for (const entry of await fs.readdir(root, { withFileTypes: true })) {
		const full = path.join(root, entry.name)
		if (entry.isDirectory()) files.push(...await listFiles(full))
		else files.push(full)
	}
	return files
}

function glbJson(bytes) {
	if (!Buffer.isBuffer(bytes) || bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') return null
	const jsonLength = bytes.readUInt32LE(12)
	const jsonType = bytes.toString('ascii', 16, 20)
	if (jsonType !== 'JSON') return null
	return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').replace(/\u0000+$/g, '').trim())
}

const catalog = publicAuthoringMotionCatalog({ includePlanned: false })
const catalogFingerprint = authoringMotionCatalog().catalogFingerprint
const bundleCeiling = catalog.principle.maximumMotionsPerPresenterBundle
const motions = catalog.motions.filter(motion => motion.selectable)
const shards = chunk(motions, 18).map((items, index) => ({
	id: `motionShard${String(index + 1).padStart(2, '0')}`,
	identity: 'joe',
	items,
}))

if (motions.length !== catalog.catalog.inventory.selectable || motions.length < 1 || shards.length !== Math.ceil(motions.length / 18) || shards.some(shard => shard.items.length > 18)) {
	throw new Error(`Unexpected executable catalog/shard accounting: ${motions.length} motions, ${shards.map(item => item.items.length).join('/')}.`)
}

const ownerByMotion = new Map(shards.flatMap(shard => shard.items.map(item => [item.id, shard])))
const indexMotion = motions.find(item => item.id === 'motion.ordinary.greet') || motions[0]
const indexShard = ownerByMotion.get(indexMotion.id)
const atlasSlides = motions.map((motion, index) => {
	const shard = ownerByMotion.get(motion.id)
	const use = motion.narrativeUses?.[0] || motion.description
	const behavior = [motion.behavior?.energy, motion.behavior?.tempo, motion.behavior?.rootMotion].filter(Boolean).join(' · ')
	return {
		id: `motion-${String(index + 1).padStart(2, '0')}`,
		title: `${motion.label} — editable native 3D motion`,
		role: 'proof',
		message: `${motion.id} plays automatically as a real PowerPoint scene.`,
		layoutIntent: 'title-body',
		scene: [{ actor: shard.id, motionId: motion.id, at: 'withPrevious' }],
		content: [{
			kind: 'body',
			name: `motion-proof-${index + 1}`,
			text: `${motion.id}\n${motion.family} · ${behavior}\nNarrative use: ${use}\nBundle shard ${shards.indexOf(shard) + 1} of ${shards.length} · ${shard.items.length}/18 selected`,
		}],
	}
})

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Authoring-v3 Native Motion Atlas',
	authoringContract: { workflow: 'authoring-excellence-director-v1' },
	contentStory: {
		audience: 'presentation authors and product owners',
		outcome: 'inspect every currently executable motion as an editable PowerPoint presenter scene',
		remember: 'the catalog is larger than one presenter bundle; each presenter remains capped at 18 selected motions',
	},
	visualDesign: {
		world: 'luxe',
		framing: 'premium native 3D specimen stage with concise semantic labels',
	},
	presenters: { cast: shards.map(shard => ({ id: shard.id, identity: shard.identity })) },
	motionTime: {
		masterClock: 'authored slide timeline',
		timingSource: 'native presenter scene duration',
		syncPolicy: 'one exact AI-selected motion plays automatically on each specimen slide',
		kineticSelection: {
			presenters: shards.map(shard => ({ presenterId: shard.id, selectedMotionIds: shard.items.map(item => item.id) })),
		},
	},
	styleIntent: {
		density: 'focused specimen',
		tone: 'premium technical proof',
		visualSystem: 'native motion atlas',
		avoid: ['screenshots', 'narration about capability', 'private animation indices', 'hand-authored geometry'],
	},
	validation: { validateBeforeSave: true, previewBeforeSave: true, minDesignScore: 75, requireAccessibility: true },
	slides: [
		{
			id: 'index',
			title: `${motions.length} executable motions · ${shards.length} legal presenter bundles`,
			role: 'opener',
			message: 'Every following slide contains one editable native 3D object and automatically plays the exact public motion ID shown.',
			layoutIntent: 'title-body',
			scene: [{ actor: indexShard.id, motionId: indexMotion.id, at: 'withPrevious' }],
			content: [{
				kind: 'body',
				name: 'atlas-legend',
				text: `Catalog version ${catalog.catalog.catalogVersion}\n31 kinetic + ${motions.filter(motion => motion.family === 'ordinary-gesture').length} playback-proven ordinary gestures = ${motions.length} executable rows\nBundle shards: ${shards.map((shard, index) => `${index + 1}: ${shard.items.length}/${bundleCeiling}`).join(' · ')}\nAI selects semantic IDs; the engine executes exactly, without ranking or substitution.`,
			}],
		},
		...atlasSlides,
	],
}

const mcp = createMcpToolDispatcher({
	sessionId: `authoring-v3-motion-atlas-${Date.now()}`,
	clientInfo: { name: 'authoring-v3-motion-atlas-mcp-builder', version: '1' },
	blackBox: false,
})

const checks = []
function check(name, condition, evidence = null) {
	checks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(evidence == null ? {} : { evidence }) })
	console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`)
}

let deckId
let deckVersion
let artifactPath
try {
	const dryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
	const dry = dryResult?.data || dryResult
	check('MCP dry-run is mutation-free', dryResult.ok === true && dry.dryRun === true && dry.mutationFree === true && !dry.deckId)
	const selected = dry.authoringContracts?.motionSelection?.presenters || []
	check('dry-run preserves all three exact AI-selected shards', selected.length === 3 && selected.every((item, index) => JSON.stringify(item.selectedMotionIds) === JSON.stringify(shards[index].items.map(motion => motion.id))), selected)
	check('every presenter bundle respects the 18-motion ceiling', selected.every(item => item.bundleBudget?.used <= 18 && item.noSilentSubstitution === true), selected.map(item => item.bundleBudget))

	const commitResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', detail: 'full' })
	const committed = commitResult?.data || commitResult
	deckId = committed.deckId
	deckVersion = committed.deckVersion
	check(`MCP commit creates the ${spec.slides.length}-slide native atlas`, commitResult.ok === true && typeof deckId === 'string' && Number.isInteger(deckVersion), { deckId: !!deckId, deckVersion })

	const validationCalls = [
		['betterpptx.deck.validate', {}],
		['betterpptx.deck.validate_design', {}],
		['betterpptx.deck.validate_accessibility', {}],
		['betterpptx.deck.validate_quality', { profile: 'default' }],
	]
	const validations = {}
	for (const [tool, extra] of validationCalls) {
		const result = await mcp.call(tool, { deckId, deckVersion, ...extra })
		validations[tool] = result?.data || result
		check(`${tool} executes before save`, result.ok === true, result.error || validations[tool])
	}

	const saveResult = await mcp.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'authoring-v3-native-motion-atlas.pptx', outputDir })
	const saved = saveResult?.data || saveResult
	check('MCP save emits the atlas artifact', saveResult.ok === true && Number(saved.bytes) > 0, saved)
	const artifacts = (await listFiles(outputDir)).filter(file => file.toLowerCase().endsWith('.pptx'))
	artifactPath = artifacts.find(file => path.basename(file).toLowerCase() === 'authoring-v3-native-motion-atlas.pptx') || artifacts[0]
	check('evidence harness locates exactly one atlas PPTX', artifacts.length === 1 && !!artifactPath, artifacts)

	if (artifactPath) {
		const bytes = await fs.readFile(artifactPath)
		const zip = await JSZip.loadAsync(bytes)
		const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
		const relNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i.test(name))
		// Native 3D model payloads are packaged as GLB media parts; the slide
		// relationship type, not a dedicated folder name, identifies them as
		// editable model3D objects.
		const modelNames = Object.keys(zip.files).filter(name => /^ppt\/media\/model[^/]*\.glb$/i.test(name))
		const slidesWithModel = []
		const slidesWithTiming = []
		for (let index = 1; index <= spec.slides.length; index += 1) {
			const slideXml = await zip.file(`ppt/slides/slide${index}.xml`)?.async('string') || ''
			const relsXml = await zip.file(`ppt/slides/_rels/slide${index}.xml.rels`)?.async('string') || ''
			if (/relationships\/model3d/i.test(relsXml)) slidesWithModel.push(index)
			if (/<p:timing\b/.test(slideXml) && /embedded\d+/i.test(slideXml)) slidesWithTiming.push(index)
		}
		const modelAnimationCounts = []
		for (const name of modelNames) {
			const modelBytes = await zip.file(name)?.async('nodebuffer')
			const json = glbJson(modelBytes)
			modelAnimationCounts.push({ part: name, animations: Array.isArray(json?.animations) ? json.animations.length : null })
		}
		check(`package contains exactly ${spec.slides.length} native atlas slides`, slideNames.length === spec.slides.length && relNames.length === spec.slides.length, { slides: slideNames.length, rels: relNames.length })
		check('every atlas slide contains an editable native 3D relationship', slidesWithModel.length === spec.slides.length, { count: slidesWithModel.length, missing: spec.slides.map((_, index) => index + 1).filter(index => !slidesWithModel.includes(index)) })
		check('every atlas slide contains native automatic play-scene timing', slidesWithTiming.length === spec.slides.length, { count: slidesWithTiming.length, missing: spec.slides.map((_, index) => index + 1).filter(index => !slidesWithTiming.includes(index)) })
		check('every embedded presenter asset obeys the 18-animation ceiling', modelAnimationCounts.length >= 3 && modelAnimationCounts.every(item => Number.isInteger(item.animations) && item.animations <= 18), modelAnimationCounts)
		const report = {
			schemaVersion: 'betterpptx.authoring-v3-native-motion-atlas-proof.v1',
			status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'FAIL',
			catalogFingerprint,
			executableMotionCount: motions.length,
			bundleCeiling,
			shards: shards.map((shard, index) => ({ shard: index + 1, presenterId: shard.id, count: shard.items.length, selectedMotionIds: shard.items.map(item => item.id) })),
			slides: spec.slides.map((slide, index) => ({ slideIndex: index + 1, slideId: slide.id, motionId: slide.scene[0].motionId, presenterId: slide.scene[0].actor })),
			artifact: { fileName: path.basename(artifactPath), bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') },
			package: { slideCount: slideNames.length, modelPartCount: modelNames.length, modelAnimationCounts },
			validations,
			checks,
		}
		await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
	}
} finally {
	if (deckId) {
		try { await mcp.call('betterpptx.deck.dispose', { deckId, deckVersion }) } catch {}
	}
}

const failed = checks.filter(item => item.status !== 'PASS')
console.log(`AUTHORING-V3 NATIVE MOTION ATLAS: ${checks.length - failed.length} passed, ${failed.length} failed`)
console.log(`OUTPUT ${outputDir}`)
if (failed.length) process.exitCode = 1
