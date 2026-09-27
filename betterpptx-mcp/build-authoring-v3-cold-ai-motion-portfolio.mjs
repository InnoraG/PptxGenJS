#!/usr/bin/env node
// Freeze a cold-AI Authoring-v3 portfolio through the public BetterPPTX MCP
// contract.  Creative selection is authored here by the AI from semantic
// catalog descriptions; the engine only validates IDs, packages the exact
// selections, and executes the resulting native PowerPoint scenes.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outputDir = path.join(repoRoot, 'outputs', 'authoring-v3-cold-ai-motion-portfolio', stamp)
await fs.mkdir(outputDir, { recursive: true })

Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '999',
	BETTERPPTX_LOCAL_MAINTAINER: '1',
	BETTERPPTX_PUBLIC_BASE: 'http://127.0.0.1:1',
	BETTERPPTX_DOWNLOAD_ROOT: outputDir,
})

function deterministicWav(seconds = 10) {
	const sampleRate = 22050
	const dataBytes = sampleRate * 2 * seconds
	const bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0)
	bytes.writeUInt32LE(36 + dataBytes, 4)
	bytes.write('WAVE', 8)
	bytes.write('fmt ', 12)
	bytes.writeUInt32LE(16, 16)
	bytes.writeUInt16LE(1, 20)
	bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(sampleRate, 24)
	bytes.writeUInt32LE(sampleRate * 2, 28)
	bytes.writeUInt16LE(2, 32)
	bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36)
	bytes.writeUInt32LE(dataBytes, 40)
	return bytes
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

function publicErrorCode(result) {
	return result?.error?.details?.code || result?.error?.details?.issues?.[0]?.code || result?.error?.code || result?.data?.error?.details?.code || null
}

const audio = deterministicWav(10)
const server = http.createServer((request, response) => {
	if (request.method === 'POST') {
		response.writeHead(200, { 'content-type': 'audio/wav' })
		response.end(audio)
		return
	}
	response.writeHead(200, { 'content-type': 'application/json' })
	response.end('[]')
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
process.env.BETTERPPTX_TTS_PROVIDER = 'piper-http'
process.env.BETTERPPTX_TTS_URL = `http://127.0.0.1:${server.address().port}`

const [{ createMcpToolDispatcher }, { publicAuthoringMotionCatalog, authoringMotionCatalog }, { default: JSZip }, { validateTechStackVocabularyFromZip }] = await Promise.all([
	import('./engine.mjs'),
	import('./ir/authoring-motion-catalog.mjs'),
	import('jszip'),
	import('./blackbox-vocabulary.mjs'),
])

const catalog = publicAuthoringMotionCatalog({ includePlanned: true })
const catalogFingerprint = authoringMotionCatalog().catalogFingerprint
const bundleCeiling = catalog.principle.maximumMotionsPerPresenterBundle
const executable = catalog.motions.filter(motion => motion.selectable)
const executableIds = executable.map(motion => motion.id)
const byId = new Map(catalog.motions.map(motion => [motion.id, motion]))

const allScenarios = [
	{
		id: '01-executive-restraint',
		prompt: 'Explain a board decision calmly, then enumerate the two commitments without theatrical motion.',
		intent: 'executive explanation',
		initialMotionIds: ['motion.ordinary.talk', 'motion.ordinary.enumerate'],
		initialExpectedCode: 'MOTION_NOT_EXECUTABLE',
		selectedMotionIds: ['motion.ordinary.talk', 'motion.ordinary.contrast'],
		rationale: 'Talk sustains a calm explanatory tone. The requested Enumerate row is catalogued but withheld by native playback evidence, so the AI revises the second beat to Contrast and rewrites it as a comparison between the two commitments rather than claiming a counting gesture.',
		revision: 'Reframed the two commitments as a measured contrast after the playback-held Enumerate row was rejected before mutation.',
		story: ['Frame the decision', 'Contrast the two commitments'],
	},
	{
		id: '02-product-launch',
		prompt: 'Launch a new product with arrival, reveal, and a clear milestone celebration.',
		intent: 'product launch',
		selectedMotionIds: ['motion.kinetic.superhero-landing', 'motion.kinetic.magical-reveal', 'motion.kinetic.victory-jump'],
		rationale: 'Superhero Landing creates the opening impact, Magical Reveal matches feature assembly, and Victory Jump closes on the launch milestone. The energetic sequence is materially different from the executive case.',
		story: ['Arrive with conviction', 'Reveal the product system', 'Celebrate launch readiness'],
	},
	{
		id: '03-technical-process',
		prompt: 'Teach a technical process through reveal, travel across stages, and a final emphasis.',
		intent: 'technical process',
		selectedMotionIds: ['motion.kinetic.magical-reveal', 'motion.kinetic.sprint', 'motion.ordinary.emphasize'],
		rationale: 'Magical Reveal introduces the architecture, Sprint carries the audience across the workflow, and Emphasize marks the governing invariant without inventing physical contact.',
		story: ['Expose the architecture', 'Traverse the processing stages', 'Lock the invariant'],
	},
	{
		id: '04-risk-recovery',
		prompt: 'Tell a risk and recovery story with rejection, evasive response, and measured confirmation.',
		intent: 'risk and recovery',
		selectedMotionIds: ['motion.ordinary.disagree', 'motion.kinetic.side-dodge', 'motion.ordinary.agree'],
		rationale: 'Disagree marks the unacceptable risk, Side Dodge embodies an evasive recovery move, and Agree confirms the controlled state. The sequence conveys failure-to-recovery without claiming object contact.',
		story: ['Reject the unsafe state', 'Move around the failure mode', 'Confirm the recovered path'],
	},
	{
		id: '05-data-kpi',
		prompt: 'Explain a KPI by locating it, presenting the proof, and communicating its magnitude.',
		intent: 'data and KPI explanation',
		selectedMotionIds: ['motion.ordinary.point', 'motion.ordinary.present', 'motion.ordinary.magnitude'],
		rationale: 'Point directs attention without a touch claim, Present opens the proof visual, and Magnitude communicates scale. These semantic roles map directly to the data story.',
		story: ['Locate the leading signal', 'Present the supporting proof', 'Show the magnitude of change'],
	},
	{
		id: '06-contact-boundary',
		prompt: 'Tap a control, then explain the resulting state change.',
		intent: 'contact interaction boundary',
		initialMotionIds: ['motion.interaction.press-tap'],
		initialExpectedCode: 'MOTION_NOT_EXECUTABLE',
		selectedMotionIds: ['motion.ordinary.point', 'motion.kinetic.scanning-lookup'],
		rationale: 'The catalog has no executable contact-precise interaction row, so the AI must not fake a tap. It revises to a directional Point plus Scanning Lookup and rewrites the story as observation, not physical contact.',
		revision: 'Removed the tap/contact claim; the presenter now points toward the control and observes the resulting state.',
		story: ['Direct attention to the control', 'Observe the resulting state'],
	},
	{
		id: '07-budget-revision',
		prompt: 'Use nineteen distinct kinetic moves in one presenter bundle, then produce the strongest legal launch choreography.',
		intent: 'bundle-budget correction',
		initialMotionIds: executableIds.slice(0, 19),
		initialExpectedCode: 'MOTION_BUNDLE_LIMIT_EXCEEDED',
		selectedMotionIds: executableIds.slice(0, 18),
		rationale: 'The public contract rejects nineteen before mutation. The AI removes the least essential nineteenth beat and retains an exact eighteen-motion launch sequence; the engine does not clamp or substitute.',
		revision: 'Reduced the presenter bundle from 19 to 18 exact IDs after typed budget feedback.',
		story: executableIds.slice(0, 18).map((id, index) => `${String(index + 1).padStart(2, '0')} · ${byId.get(id)?.label || id} advances the launch narrative`),
	},
]
const scenarioFilter = String(process.env.BETTERPPTX_PORTFOLIO_CASE || '').trim()
const scenarios = scenarioFilter ? allScenarios.filter(scenario => scenario.id === scenarioFilter) : allScenarios
if (!scenarios.length) throw new Error(`Unknown portfolio case filter: ${scenarioFilter}`)

function buildSpec(scenario, selectedMotionIds) {
	const slides = selectedMotionIds.map((motionId, index) => {
		const motion = byId.get(motionId)
		const storyBeat = scenario.story[index] || `Advance the ${scenario.intent} story`
		const cue = 'move with this point now'
		return {
			id: `${scenario.id}-beat-${String(index + 1).padStart(2, '0')}`,
			title: storyBeat,
			role: index === 0 ? 'opener' : index === selectedMotionIds.length - 1 ? 'conclusion' : 'proof',
			message: `${storyBeat}. The presenter reinforces this exact narrative beat.`,
			layoutIntent: 'title-body',
			narration: {
				script: `First, establish why this step matters for ${scenario.intent}. Then ${cue}, while the audience connects the visible evidence to the decision and the complete presenter gesture plays.`,
				paddingMs: 700,
			},
			presenterMotion: { presenterId: 'host', motionId, narrationCue: cue },
			content: [{
				kind: 'body',
				name: `${scenario.id}-story-${index + 1}`,
				region: 'left',
				text: `${storyBeat}\n${motion?.description || 'Semantic presenter motion'}\nOne narration-led clock · editable native presenter`,
			}],
		}
	})
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: scenario.story[0] || scenario.intent,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		contentStory: {
			audience: scenario.id === '01-executive-restraint' ? 'board and executive leaders' : 'product and operating leaders',
			outcome: scenario.intent,
			remember: scenario.story.at(-1) || scenario.intent,
		},
		visualDesign: { world: scenario.id === '01-executive-restraint' ? 'editorial' : 'luxe', framing: 'premium user-facing story with native presenter proof' },
		presenter: { id: 'host', identity: 'joe', stage: 'right', choreography: 'subtle' },
		motionTime: {
			masterClock: 'narration-text',
			timingSource: 'authored narration',
			syncPolicy: 'one narration-led clock per story beat',
			kineticSelection: { presenters: [{ presenterId: 'host', selectedMotionIds }] },
		},
		styleIntent: { density: 'story-led', tone: scenario.intent, visualSystem: 'native presenter narrative', avoid: ['capability inventory', 'private animation slots', 'contact claims without evidence'] },
		validation: { validateBeforeSave: true, previewBeforeSave: true, minDesignScore: 75, requireAccessibility: true },
		slides,
	}
}

const portfolio = []
const globalChecks = []
function globalCheck(name, condition, evidence = null) {
	globalChecks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(evidence == null ? {} : { evidence }) })
	console.log(`${condition ? 'PASS' : 'FAIL'} ${name}`)
}

try {
	for (const scenario of scenarios) {
		console.log(`CASE ${scenario.id}`)
		const trace = {
			scenarioId: scenario.id,
			prompt: scenario.prompt,
			intent: scenario.intent,
			catalogFingerprint,
			availableMotionIds: executableIds,
			choiceAuthority: 'AI client',
			initialSelectedMotionIds: scenario.initialMotionIds || scenario.selectedMotionIds,
			rationale: scenario.rationale,
			semanticRevision: scenario.revision || null,
			finalSelectedMotionIds: scenario.selectedMotionIds,
			bundleBudget: { used: scenario.selectedMotionIds.length, maximum: bundleCeiling, remaining: bundleCeiling - scenario.selectedMotionIds.length },
			repairOpenResult: 'PENDING_POWERPOINT_ORACLE',
			actualPlaybackResult: 'PENDING_POWERPOINT_ORACLE',
			visualReviewResult: 'PENDING_POWERPOINT_ORACLE',
			checks: [],
		}
		const check = (name, condition, evidence = null) => {
			trace.checks.push({ name, status: condition ? 'PASS' : 'FAIL', ...(evidence == null ? {} : { evidence }) })
			console.log(`${condition ? 'PASS' : 'FAIL'} ${scenario.id} · ${name}`)
		}
		const mcp = createMcpToolDispatcher({
			sessionId: `cold-ai-${scenario.id}-${Date.now()}`,
			clientInfo: { name: `cold-ai-${scenario.id}`, version: '1' },
			blackBox: true,
		})
		let deckId
		let deckVersion
		try {
			if (scenario.initialMotionIds) {
				const rejected = await mcp.call('betterpptx.deck.generate_from_spec', { spec: buildSpec(scenario, scenario.initialMotionIds), phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
				trace.initialDryRun = { ok: rejected.ok === true, errorCode: publicErrorCode(rejected) }
				check('typed initial request is rejected before mutation', rejected.ok === false && publicErrorCode(rejected) === scenario.initialExpectedCode, trace.initialDryRun)
			}

			const spec = buildSpec(scenario, scenario.selectedMotionIds)
			const dryResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'dryRun', commitMode: 'createNew', detail: 'full' })
			const dry = dryResult?.data || dryResult
			const motionReadback = dry.authoringContracts?.motionSelection?.presenters?.[0]
			trace.dryRun = {
				ok: dryResult.ok === true,
				mutationFree: dry.mutationFree === true,
				findings: dry.findings || [],
				planDigest: dry.planDigest,
				opaqueBundleHandle: motionReadback?.bundleHandle || null,
				...(dryResult.ok === true ? {} : { error: dryResult.error || dry.error || null }),
			}
			if (dryResult.ok !== true) console.log(JSON.stringify({ scenario: scenario.id, dryRunError: trace.dryRun.error }, null, 2))
			check('revised/final dry-run is mutation-free', dryResult.ok === true && dry.dryRun === true && dry.mutationFree === true && !dry.deckId)
			check('engine preserves the exact ordered AI selection', JSON.stringify(motionReadback?.selectedMotionIds) === JSON.stringify(scenario.selectedMotionIds) && motionReadback?.noSilentSubstitution === true, motionReadback)

			const commitResult = await mcp.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', detail: 'full' })
			const committed = commitResult?.data || commitResult
			deckId = committed.deckId
			deckVersion = committed.deckVersion
			check('public MCP commit creates the independent story deck', commitResult.ok === true && typeof deckId === 'string' && Number.isInteger(deckVersion))
			const timeline = committed.narrationTimeline?.slides || []
			check('every selected motion is bound to a measured narration beat', timeline.length === scenario.selectedMotionIds.length && timeline.every((slide, index) => slide.voiceId === null && slide.beats?.some(beat => beat.presenterMotion === true && beat.motionId === scenario.selectedMotionIds[index] && beat.endMs <= slide.dwellMs)), timeline.map(slide => ({ slideId: slide.slideId, beats: slide.beats, dwellMs: slide.dwellMs })))

			trace.validations = {}
			for (const [tool, extra] of [
				['betterpptx.deck.validate', {}],
				['betterpptx.deck.validate_design', {}],
				['betterpptx.deck.validate_accessibility', {}],
				['betterpptx.deck.validate_narration', {}],
				['betterpptx.deck.validate_quality', { profile: 'narrated' }],
			]) {
				const result = await mcp.call(tool, { deckId, deckVersion, ...extra })
				trace.validations[tool] = result?.data || result
				check(`${tool} executes before save`, result.ok === true, result.error || null)
			}

			const beforeFiles = new Set((await listFiles(outputDir)).filter(file => file.toLowerCase().endsWith('.pptx')))
			const fileName = `${scenario.id}.pptx`
			const saveResult = await mcp.call('betterpptx.deck.save', { deckId, deckVersion, fileName })
			const saved = saveResult?.data || saveResult
			check('public save returns opaque artifact metadata', saveResult.ok === true && Number(saved.bytes) > 0 && !saved.path && !saved.outputDir, saved)
			const afterFiles = (await listFiles(outputDir)).filter(file => file.toLowerCase().endsWith('.pptx'))
			const newFiles = afterFiles.filter(file => !beforeFiles.has(file))
			const artifactPath = newFiles.find(file => path.basename(file).toLowerCase() === fileName.toLowerCase()) || newFiles[0]
			check('maintainer evidence harness locates one new story artifact', newFiles.length === 1 && !!artifactPath, newFiles)

			if (artifactPath) {
				const bytes = await fs.readFile(artifactPath)
				const zip = await JSZip.loadAsync(bytes)
				let editableSlides = 0
				let timedSlides = 0
				for (let index = 1; index <= scenario.selectedMotionIds.length; index += 1) {
					const slideXml = await zip.file(`ppt/slides/slide${index}.xml`)?.async('string') || ''
					const relsXml = await zip.file(`ppt/slides/_rels/slide${index}.xml.rels`)?.async('string') || ''
					if (/relationships\/model3d/i.test(relsXml)) editableSlides += 1
					if (/<p:timing\b/.test(slideXml) && /embedded\d+/i.test(slideXml)) timedSlides += 1
				}
				const blackBox = await validateTechStackVocabularyFromZip(zip)
				check('every committed selected motion has an editable native 3D slide', editableSlides === scenario.selectedMotionIds.length, { editableSlides, expected: scenario.selectedMotionIds.length })
				check('every committed selected motion has native play-scene timing', timedSlides === scenario.selectedMotionIds.length, { timedSlides, expected: scenario.selectedMotionIds.length })
				check('saved public package is black-box safe', blackBox.ok === true, blackBox.issues)
				trace.artifact = { fileName, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }
				trace.packagePlaybackReady = editableSlides === scenario.selectedMotionIds.length && timedSlides === scenario.selectedMotionIds.length
			}
		} finally {
			if (deckId) {
				try { await mcp.call('betterpptx.deck.dispose', { deckId, deckVersion }) } catch {}
			}
		}
		trace.status = trace.checks.every(item => item.status === 'PASS') ? 'PASS_PENDING_POWERPOINT_ORACLE' : 'FAIL'
		portfolio.push(trace)
		await fs.writeFile(path.join(outputDir, `${scenario.id}.choice-trace.json`), `${JSON.stringify(trace, null, 2)}\n`)
	}
} finally {
	await new Promise(resolve => server.close(resolve))
}

if (scenarioFilter) {
	globalCheck('filtered cold-AI story case passes MCP/package gates', portfolio.length === 1 && portfolio[0].status === 'PASS_PENDING_POWERPOINT_ORACLE')
} else {
	globalCheck('all seven independently generated story cases pass MCP/package gates', portfolio.length === 7 && portfolio.every(item => item.status === 'PASS_PENDING_POWERPOINT_ORACLE'))
	globalCheck('story intent produces materially different exact bundles', new Set(portfolio.slice(0, 6).map(item => item.finalSelectedMotionIds.join('|'))).size === 6)
	globalCheck('same Joe identity supports materially different executive and launch bundles', portfolio[0]?.finalSelectedMotionIds.join('|') !== portfolio[1]?.finalSelectedMotionIds.join('|'))
	globalCheck('interaction request is revised without a false contact claim', portfolio.find(item => item.scenarioId === '06-contact-boundary')?.initialDryRun?.errorCode === 'MOTION_NOT_EXECUTABLE')
	globalCheck('nineteen-motion request is revised to the exact legal eighteen', portfolio.find(item => item.scenarioId === '07-budget-revision')?.initialDryRun?.errorCode === 'MOTION_BUNDLE_LIMIT_EXCEEDED' && portfolio.find(item => item.scenarioId === '07-budget-revision')?.finalSelectedMotionIds.length === 18)
}

const report = {
	schemaVersion: 'betterpptx.authoring-v3-cold-ai-motion-portfolio.v1',
	status: globalChecks.every(item => item.status === 'PASS') ? 'PASS_PENDING_POWERPOINT_ORACLE' : 'FAIL',
	catalogFingerprint,
	executableMotionCount: executableIds.length,
	bundleCeiling,
	choiceAuthority: 'AI client',
	engineRole: 'exact executor only',
	scenarios: portfolio,
	globalChecks,
}
await fs.writeFile(path.join(outputDir, 'portfolio-report.json'), `${JSON.stringify(report, null, 2)}\n`)

const failed = [...globalChecks.filter(item => item.status !== 'PASS'), ...portfolio.flatMap(item => item.checks.filter(check => check.status !== 'PASS').map(check => ({ scenarioId: item.scenarioId, ...check })))]
console.log(`AUTHORING-V3 COLD-AI MOTION PORTFOLIO: ${failed.length ? 'FAIL' : 'PASS_PENDING_POWERPOINT_ORACLE'} · ${portfolio.length} cases · ${failed.length} failed checks`)
console.log(`OUTPUT ${outputDir}`)
if (failed.length) process.exitCode = 1
