#!/usr/bin/env node
// Native timing proof for the canonical 25-slide source. The expected motion
// inventory comes from the same deterministic dry-run used by the compiler;
// the package and Office SaveCopyAs/reopen artifacts are then inspected as
// independent proof layers.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'
import { createMcpToolDispatcher } from './engine.mjs'

process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_FORCE_PLAN = 'premium'

function arg(name, fallback) {
	const index = process.argv.indexOf(name)
	return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback
}
const sourcePath = path.resolve(arg('--source', 'tmp_autonomous_test/GPT56_BetterPPTX_Canonical_Full_Spec.json'))
const packagePath = path.resolve(arg('--package', 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-narration-transition/20260826T040917Z/canonical-25-slide-narration-transition-silent.pptx'))
const roundtripPath = path.resolve(arg('--roundtrip', 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-narration-transition/20260826T040917Z/office-com/canonical-25-office-com-savecopy.pptx'))
const evidenceDir = path.resolve(arg('--evidence-dir', `outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-motion-timing/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`))

const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const dataOf = result => { if (!result?.ok) throw new Error(JSON.stringify(result)); return result.data || result }
const countCues = spec => (spec.slides || []).reduce((sum, slide) => sum + (slide.narration?.cues?.length || 0), 0)
const countTransitions = spec => (spec.slides || []).filter(slide => slide.transition && typeof slide.transition === 'object').length

function childElements(node, name) {
	return Array.from(node?.childNodes || []).filter(child => child.nodeType === 1 && (!name || child.nodeName === name))
}
function firstElement(node, name) { return childElements(node, name)[0] || null }
function normalizedTarget(name) {
	const match = String(name || '').match(/^slide-\d+\.(.+)\.[^.]+$/)
	return match ? match[1] : String(name || '')
}
function parseSlideXml(xml) {
	const document = new DOMParser().parseFromString(xml, 'text/xml')
	const shapeNames = {}
	for (const node of Array.from(document.getElementsByTagName('p:cNvPr'))) shapeNames[node.getAttribute('id')] = node.getAttribute('name')
	const mainSeq = Array.from(document.getElementsByTagName('p:cTn')).find(node => node.getAttribute('nodeType') === 'mainSeq')
	const groups = []
	for (const paragraph of Array.from(mainSeq?.getElementsByTagName('p:par') || [])) {
		const ctn = childElements(paragraph, 'p:cTn')[0]
		if (ctn?.getAttribute('nodeType') !== 'withEffect') continue
		const spids = [...new Set(Array.from(ctn.getElementsByTagName('p:spTgt')).map(node => node.getAttribute('spid')).filter(Boolean))]
		const rawNames = [...new Set(spids.map(spid => shapeNames[spid]).filter(Boolean))]
		groups.push({ spids, rawNames, targets: rawNames.map(normalizedTarget) })
	}
	const transition = document.getElementsByTagName('p:transition')[0] || null
	const transitionChild = childElements(transition)[0]
	return {
		groups,
		transition: transition ? {
			advanceOnClick: transition.getAttribute('advClick') === '1',
			advanceAfterTime: Number(transition.getAttribute('advTm') || 0),
			type: transitionChild?.nodeName?.replace(/^p:/, '') || null,
			direction: transitionChild?.getAttribute('dir') || null,
		} : null,
	}
}

function expectedTransition(sourceTransition) {
	const map = {
		fade: { type: 'fade', direction: null },
		pushLeft: { type: 'push', direction: 'l' },
		pushRight: { type: 'push', direction: 'r' },
		wipeLeft: { type: 'wipe', direction: 'l' },
		wipeRight: { type: 'wipe', direction: 'r' },
	}
	return map[sourceTransition?.type] || { type: null, direction: null }
}

if (!fs.existsSync(sourcePath) || !fs.existsSync(packagePath) || !fs.existsSync(roundtripPath)) throw new Error('Source, generated package, or Office roundtrip artifact is missing.')
const sourceBytes = fs.readFileSync(sourcePath)
const source = JSON.parse(sourceBytes.toString('utf8'))
const executionSpec = {
	...source,
	outputVariant: 'silent-timed-notes',
	selectedOutputVariants: ['silent-timed-notes'],
	narrationPolicy: { ...(source.narrationPolicy || {}), synthesizeAudio: false, required: false, failurePolicy: 'notes-only' },
	slides: (source.slides || []).map(slide => ({ ...slide, narration: slide.narration && typeof slide.narration === 'object' ? { ...slide.narration, synthesizeAudio: false, useAsTimingAuthority: false } : slide.narration })),
}
const executionSha256 = sha256(Buffer.from(`${JSON.stringify(executionSpec)}\n`))
const mcp = createMcpToolDispatcher({ sessionId: `canonical-motion-timing-${Date.now()}` })
const dry = dataOf(await mcp.call('betterpptx.deck.generate_from_spec', {
	spec: executionSpec, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full',
	validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `canonical-motion-timing-dry-${executionSha256}`,
}))
const motion = dry.motionTimeline || {}
const expectedSlides = motion.slides || []
const packageZip = await JSZip.loadAsync(fs.readFileSync(packagePath))
const roundtripZip = await JSZip.loadAsync(fs.readFileSync(roundtripPath))

function inspectZip(zip) {
	const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]))
	const slides = slideNames.map(name => parseSlideXml(zip.files[name] ? null : ''))
	return { slideNames }
}
async function inspectPackage(zip) {
	const slideNames = Object.keys(zip.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]))
	const slides = []
	for (const name of slideNames) slides.push(parseSlideXml(await zip.files[name].async('string')))
	return slides
}
const generatedSlides = await inspectPackage(packageZip)
const roundtripSlides = await inspectPackage(roundtripZip)
const sourceMotion = expectedSlides.reduce((sum, slide) => sum + (slide.effectCount || slide.cues?.length || 0), 0)
const narrationCues = countCues(source)

const slideChecks = expectedSlides.map((expected, index) => {
	const actual = generatedSlides[index]
	const cues = expected.cues || []
	const expectedTargets = cues.map(cue => cue.target)
	const actualTargets = (actual?.groups || []).map(group => group.targets[0] || null)
	const prefixTargets = actualTargets.slice(0, expectedTargets.length)
	const prefixTargetMatch = expectedTargets.length === prefixTargets.length && expectedTargets.every((target, cueIndex) => target === prefixTargets[cueIndex])
	const narrationTailCount = Math.max(0, actualTargets.length - expectedTargets.length)
	const targetResolution = (actual?.groups || []).every(group => group.targets.length === 1)
	const sourceTransition = source.slides[index]?.transition || {}
	const expectedTrans = expectedTransition(sourceTransition)
	const actualTrans = actual?.transition || {}
	const transitionMatch = actualTrans.type === expectedTrans.type && actualTrans.direction === expectedTrans.direction && actualTrans.advanceAfterTime === Number(source.slides[index]?.authoredDurationMs || 0) && actualTrans.advanceOnClick === false
	return {
		slide: index + 1,
		sourceMotionItems: expectedTargets.length,
		nativeTimingGroups: actual?.groups?.length || 0,
		narrationCueCount: source.slides[index]?.narration?.cues?.length || 0,
		narrationTailCount,
		prefixTargetMatch,
		targetResolution,
		transitionMatch,
		sourceTransition: { type: sourceTransition.type, durationMs: sourceTransition.durationMs, authoredDurationMs: source.slides[index]?.authoredDurationMs },
		nativeTransition: actualTrans,
	}
})
const roundtripCounts = roundtripSlides.map(slide => ({ timingGroups: slide.groups.length, transition: slide.transition }))
const checks = {
	sourceIs25Slides: source.slides?.length === 25,
	sourceHas746MotionItems: sourceMotion === 746,
	dryRunMutationFree: dry.mutationFree === true,
	dryRunMotion746: motion.effectCount === 746 && motion.sourceMotion?.animatedSourceNodes === 746 && motion.compiledMotion?.semanticAnimatedObjects === 746,
	dryRunNoMotionLoss: motion.compiledMotion?.unmapped === 0 && motion.compiledMotion?.silentlyLost === 0 && motion.missingTargetCount === 0,
	generatedPackage25Slides: generatedSlides.length === 25,
	generatedNativeTimingGroups902: generatedSlides.reduce((sum, slide) => sum + slide.groups.length, 0) === 902,
	generated746MotionPrefix: slideChecks.every(item => item.prefixTargetMatch) && slideChecks.reduce((sum, item) => sum + item.sourceMotionItems, 0) === 746,
	generated156NarrationTail: slideChecks.reduce((sum, item) => sum + item.narrationTailCount, 0) === narrationCues && narrationCues === 156,
	allGeneratedTargetsResolve: slideChecks.every(item => item.targetResolution),
	all25TransitionSemantics: slideChecks.every(item => item.transitionMatch),
	officeRoundtrip25Slides: roundtripSlides.length === 25,
	officeRoundtripTimingPersisted: roundtripSlides.reduce((sum, slide) => sum + slide.groups.length, 0) === 902,
	officeRoundtripTransitionsPersisted: roundtripSlides.every(slide => slide.transition !== null),
}
const evidence = {
	schemaVersion: 'betterpptx.canonical-25-motion-timing-native-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	generatedAt: new Date().toISOString(),
	source: { file: path.relative(process.cwd(), sourcePath).replaceAll('\\', '/'), sha256: sha256(sourceBytes), slides: source.slides.length, motionItems: sourceMotion, narrationCues, transitions: countTransitions(source) },
	execution: { variant: executionSpec.outputVariant, sha256: executionSha256, dryRunPlanDigest: dry.planDigest, mutationFree: dry.mutationFree, motionTimeline: { effectCount: motion.effectCount, sourceAnimatedNodes: motion.sourceMotion?.animatedSourceNodes, semanticAnimatedObjects: motion.compiledMotion?.semanticAnimatedObjects, unmapped: motion.compiledMotion?.unmapped, silentlyLost: motion.compiledMotion?.silentlyLost, missingTargets: motion.missingTargetCount } },
	package: { file: path.relative(process.cwd(), packagePath).replaceAll('\\', '/'), bytes: fs.statSync(packagePath).size, sha256: sha256(fs.readFileSync(packagePath)), nativeTimingGroups: generatedSlides.reduce((sum, slide) => sum + slide.groups.length, 0), transitions: generatedSlides.filter(slide => slide.transition).length },
	officeRoundtrip: { file: path.relative(process.cwd(), roundtripPath).replaceAll('\\', '/'), bytes: fs.statSync(roundtripPath).size, sha256: sha256(fs.readFileSync(roundtripPath)), nativeTimingGroups: roundtripSlides.reduce((sum, slide) => sum + slide.groups.length, 0), transitions: roundtripSlides.filter(slide => slide.transition).length },
	slideChecks,
	checks,
	interpretation: 'The dry-run motion ledger supplies 746 mapped HTML/CSS animation items. The generated native package contains those 746 groups in the same target order plus 156 explicit narration-cue emphasis groups; all 902 groups resolve to native shape targets. Every transition type/direction and authored slide advance is present in XML, and the Office SaveCopyAs/reopen package retains all 902 timing groups and 25 transitions. This is motion/timing proof, not visual slideshow playback proof or universal 2,258-row closure.',
}
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'canonical-25-motion-timing-native-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ status: evidence.status, evidencePath, evidenceSha256, checks, source: evidence.source, package: evidence.package, officeRoundtrip: evidence.officeRoundtrip }, null, 2))
if (evidence.status !== 'PASS') process.exitCode = 1
