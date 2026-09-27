#!/usr/bin/env node
// C3 local property corpus: exercise the layout -> interaction target-box -> solver
// boundary across real slide sizes and failure/override cases. This is a bounded
// geometry oracle, not a perceptual acceptance claim.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { planDeckLayout } from './ir/layout-engine.mjs'
import { expandInteractions } from './ir/synergy-compiler.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')
const reportPath = path.join(here, 'outputs', 'c3-layout-interaction-property-corpus-report.json')
const reviewPacketPath = path.join(here, 'outputs', 'c3-perceptual-review-packet.json')
const schemaVersion = 'betterpptx.c3-layout-interaction-property-corpus.v1'
const sizes = [
	{ name: 'wide', w: 13.333, h: 7.5 },
	{ name: 'square', w: 10, h: 10 },
	{ name: 'vertical', w: 7.5, h: 13.333 },
]
const verbs = ['touch', 'point-at', 'press', 'push', 'knock-over', 'carry']
const actionableCodes = new Set(['INTERACTION_NO_TARGET', 'INTERACTION_TARGET_AUTHORED', 'INTERACTION_UNSUPPORTED_YAW'])

function canonical(value) {
	if (Array.isArray(value)) return value.map(canonical)
	if (!value || typeof value !== 'object') return value
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}

function digest(value) {
	return crypto.createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function clone(value) {
	return JSON.parse(JSON.stringify(value))
}

function actorAssets(glbBuf, clipTimelines, clipDurations, faceRotationY = 0) {
	return {
		joe: { id: 'joe', model: 'gen://private-c3-fixture/joe', glbBuf, clipTimelines, clipDurations, faceRotationY },
		second: { id: 'second', model: 'gen://private-c3-fixture/second', glbBuf, clipTimelines, clipDurations, faceRotationY },
	}
}

function safeBox(size, seed, side = 0) {
	const narrow = size.w < 8
	// The vertical profile has a tighter horizontal reach envelope; 1.5in keeps
	// the carry and impulse fixtures inside that measured envelope while still
	// exercising a non-default slide size.
	const baseX = narrow ? 1.5 : size.w * 0.35
	const x = baseX + ((seed % 5) - 2) * 0.055 + side * (narrow ? 0.16 : 0.24)
	const y = (size.h < 9 ? 2.55 : 2.8) + ((seed % 3) - 1) * 0.045
	return { x, y, w: Math.min(1.8, size.w * 0.2), h: 1, role: 'interactive-target' }
}

function frameInside(frame, size, margin = 0.001) {
	return frame && Number.isFinite(frame.x) && Number.isFinite(frame.y) &&
		Number.isFinite(frame.w) && Number.isFinite(frame.h) &&
		frame.x >= -margin && frame.y >= -margin &&
		frame.x + frame.w <= size.w + margin && frame.y + frame.h <= size.h + margin
}

function contentBoxesInside(spec, size) {
	for (const slide of spec.slides || []) for (const item of slide.content || []) {
		if (!item?.bbox) continue
		if (!frameInside(item.bbox, size)) return false
	}
	return true
}

function solvedWithoutBlockingVerdict(record) {
	const codes = (record?.verdicts || []).map(item => item.code)
	return record?.clip != null && record?.framePos &&
		!codes.includes('UNREACHABLE') && !codes.includes('FRAME_CLAMPED') &&
		(!Number.isFinite(record.clampedIn) || record.clampedIn <= 0.15)
}

function actionable(record, expectedCode) {
	const verdict = (record?.verdicts || []).find(item => item.code === expectedCode)
	return !!verdict && actionableCodes.has(verdict.code) &&
		['severity', 'reason', 'fix', 'evidence'].every(key => Object.prototype.hasOwnProperty.call(verdict, key))
}

function runCase(input, assets) {
	const first = expandInteractions(clone(input.spec), {
		slideSize: input.size,
		targetBoxes: input.targetBoxes,
		castAssets: assets,
	})
	const second = expandInteractions(clone(input.spec), {
		slideSize: input.size,
		targetBoxes: input.targetBoxes,
		castAssets: assets,
	})
	return { first, second, digest1: digest(first), digest2: digest(second) }
}

async function main() {
	const glbBuf = await fs.readFile(path.join(repoRoot, 'research-demos', '2026-07-13-synergy-calibration', 'joe-probe3.glb'))
	const clipTimelines = JSON.parse(await fs.readFile(path.join(repoRoot, 'research-demos', '2026-07-13-synergy-calibration', 'joe-clip-timelines.json'), 'utf8'))
	const clipDurations = Object.fromEntries(Object.entries(clipTimelines.timelines).map(([id, points]) => [id, points.at(-1)?.[0] || 4500]))
	const assets = actorAssets(glbBuf, clipTimelines, clipDurations)
	const cases = []

	// 200 feasible cases: 6 verbs × 3 actual slide sizes, with small deterministic
	// geometry perturbations. The oracle is independent of the solver: it checks the
	// declared safe target envelope, solved frame bounds, and no blocking verdict.
	for (let index = 0; index < 200; index++) {
		const size = sizes[index % sizes.length]
		const verb = verbs[index % verbs.length]
		const box = safeBox(size, index)
		cases.push({
			id: `feasible-${index}`,
			class: 'feasible-authored',
			oracle: 'safe-authored-bbox',
			size,
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1',
				slides: [{ id: `s-${index}`, role: 'body', content: [{ kind: 'body', name: 'target', text: 'Target', bbox: box }], interactions: [{ actor: index % 2 ? 'second' : 'joe', verb, target: 'target' }] }],
			},
		})
	}

	// 40 multi-actor cases: two independent target boxes and two actors on one slide.
	for (let index = 0; index < 40; index++) {
		const size = sizes[index % sizes.length]
		const a = safeBox(size, index, 0)
		const b = safeBox(size, index + 1, 1)
		cases.push({
			id: `multi-actor-${index}`,
			class: 'feasible-multi-actor',
			oracle: 'safe-authored-bbox',
			size,
			spec: {
				schemaVersion: 'betterpptx.deck-spec.v1',
				slides: [{ id: `m-${index}`, role: 'body', content: [
					{ kind: 'body', name: 'target-a', text: 'Target A', bbox: a },
					{ kind: 'body', name: 'target-b', text: 'Target B', bbox: b },
				], interactions: [
					{ actor: 'joe', verb: 'point-at', target: 'target-a' },
					{ actor: 'second', verb: 'touch', target: 'target-b' },
				] }],
			},
		})
	}

	// 10 layout-derived cases: no authored bbox; preliminary layout supplies the target.
	for (let index = 0; index < 10; index++) {
		const size = sizes[index % sizes.length]
		const slideId = `layout-${index}`
		const spec = { schemaVersion: 'betterpptx.deck-spec.v1', layout: 'LAYOUT_WIDE', slides: [{ id: slideId, role: 'body', layoutIntent: 'metric-grid', content: [{ kind: 'metric-grid', name: 'target', items: [{ name: 'metric', label: 'Metric', value: String(index + 1) }] }], interactions: [{ actor: 'joe', verb: 'point-at', target: 'target' }] }] }
		const layout = planDeckLayout(spec, { slideSize: size })
		const rect = layout.slides[0]?.objects.find(item => item.blockName === 'target')?.rect
		if (!rect) throw new Error(`layout-derived target missing for ${slideId}`)
		cases.push({ id: `layout-${index}`, class: 'layout-derived', oracle: 'layout-box-actionable', size, targetBoxes: { [slideId]: { target: rect } }, spec })
	}

	// Refusal/override cases must remain deterministic and actionable.
	for (let index = 0; index < 10; index++) {
		const size = sizes[index % sizes.length]
		cases.push({
			id: `missing-target-${index}`,
			class: 'actionable-refusal',
			oracle: 'missing-target',
			expectedCode: 'INTERACTION_NO_TARGET',
			size,
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', slides: [{ id: `missing-${index}`, content: [{ kind: 'body', name: 'other', text: 'Other' }], interactions: [{ actor: 'joe', verb: 'point-at', target: 'missing' }] }] },
		})
	}
	for (let index = 0; index < 10; index++) {
		const size = sizes[index % sizes.length]
		cases.push({
			id: `authored-animation-${index}`,
			class: 'authored-override',
			oracle: 'authored-animation-override',
			expectedCode: 'INTERACTION_TARGET_AUTHORED',
			size,
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', slides: [{ id: `authored-${index}`, content: [{ kind: 'body', name: 'target', text: 'Target', bbox: safeBox(size, index), animation: [{ type: 'emphasis', effect: 'pulse' }] }], interactions: [{ actor: 'joe', verb: 'touch', target: 'target' }] }] },
		})
	}
	for (let index = 0; index < 10; index++) {
		const size = sizes[index % sizes.length]
		cases.push({
			id: `unsupported-yaw-${index}`,
			class: 'actionable-refusal',
			oracle: 'unsupported-yaw',
			expectedCode: 'INTERACTION_UNSUPPORTED_YAW',
			size,
			spec: { schemaVersion: 'betterpptx.deck-spec.v1', slides: [{ id: `yaw-${index}`, content: [{ kind: 'body', name: 'target', text: 'Target', bbox: safeBox(size, index) }], interactions: [{ actor: 'joe', verb: 'point-at', target: 'target' }] }] },
			assetsOverride: actorAssets(glbBuf, clipTimelines, clipDurations, 180),
		})
	}

	const failures = []
	const caseResults = new Map()
	const classCounts = {}
	let feasiblePassed = 0
	let actionablePassed = 0
	for (const item of cases) {
		classCounts[item.class] = (classCounts[item.class] || 0) + 1
		let run
		try { run = runCase(item, item.assetsOverride || assets) } catch (error) {
			failures.push({ id: item.id, reason: 'THREW', detail: error.message })
			caseResults.set(item.id, { status: 'FAIL', reason: 'THREW', detail: error.message })
			continue
		}
		if (run.digest1 !== run.digest2) {
			failures.push({ id: item.id, reason: 'NONDETERMINISTIC', digest1: run.digest1, digest2: run.digest2 })
			caseResults.set(item.id, { status: 'FAIL', reason: 'NONDETERMINISTIC', digest1: run.digest1, digest2: run.digest2 })
		}
		const record = run.first._synergyPlan?.[0]
		caseResults.set(item.id, { status: 'ORACLE_CHECKED', digest: run.digest1, record })
		if (item.oracle === 'safe-authored-bbox') {
			const ok = solvedWithoutBlockingVerdict(record) && frameInside(record.framePos && { ...record.framePos, w: 5, h: 5 }, item.size) && contentBoxesInside(run.first, item.size)
			if (ok) feasiblePassed++
			else failures.push({ id: item.id, reason: 'FEASIBILITY_ORACLE_FAILED', record })
		} else if (item.oracle === 'layout-box-actionable') {
			const hasAction = Array.isArray(record?.verdicts) && record.verdicts.length > 0 && record.bboxFrom === 'layout'
			if (hasAction) actionablePassed++
			else failures.push({ id: item.id, reason: 'LAYOUT_DERIVED_CASE_NOT_ACTIONABLE', record })
		} else if (actionable(record, item.expectedCode)) {
			actionablePassed++
		} else failures.push({ id: item.id, reason: 'ACTIONABLE_VERDICT_MISSING', expectedCode: item.expectedCode, record })
	}
	const reviewCases = cases.map(item => {
		const result = caseResults.get(item.id) || { status: 'MISSING_RESULT' }
		const targets = (item.spec.slides || []).map(slide => ({
			slideId: slide.id,
			size: item.size,
			targets: (slide.content || []).filter(content => content?.bbox).map(content => ({ name: content.name || content.objectName, kind: content.kind, bbox: content.bbox })),
			layoutTargetBoxes: item.targetBoxes?.[slide.id] || null,
		}))
		return {
			id: item.id, class: item.class, oracle: item.oracle, expectedCode: item.expectedCode || null,
			size: item.size, targets, oracleResult: { status: result.status, digest: result.digest || null },
			humanAnnotation: { status: 'UNREVIEWED', semantic: null, composition: null, motion: null, reviewerId: null, reviewedAt: null, notes: null },
		}
	})
	const reviewPacket = {
		schemaVersion: 'betterpptx.c3-perceptual-review-packet.v1',
		status: 'OPEN_HUMAN_ANNOTATION',
		independentFixture: true,
		ownerApprovalNotInferred: true,
		publicEnablementAllowed: false,
		annotationContract: {
			requiredFields: ['semantic', 'composition', 'motion', 'reviewerId', 'reviewedAt', 'notes'],
			allowedVerdicts: ['PASS', 'FAIL', 'UNCLEAR'],
			noAutoAccept: true,
		},
		requiredCases: reviewCases.length,
		annotatedCases: 0,
		cases: reviewCases,
	}
	await fs.writeFile(reviewPacketPath, JSON.stringify(reviewPacket, null, 2) + '\n')

	const report = {
		schemaVersion,
		status: failures.length ? 'FAIL' : 'PASS_C3_LOCAL_PROPERTY_CORPUS_PERCEPTUAL_OPEN',
		cases: cases.length,
		classCounts,
		feasibleCases: (classCounts['feasible-authored'] || 0) + (classCounts['feasible-multi-actor'] || 0),
		feasiblePassed,
		actionableCases: cases.length - ((classCounts['feasible-authored'] || 0) + (classCounts['feasible-multi-actor'] || 0)),
		actionablePassed,
		oracle: { name: 'bounded-geometry-feasibility-v1', independentFromSolver: true, thresholdIn: 0.15, perceptualReviewRequired: true },
		perceptualReview: {
			status: 'OPEN_HUMAN_ANNOTATION', packet: 'outputs/c3-perceptual-review-packet.json', requiredCases: reviewCases.length,
			annotatedCases: 0, independentFixture: true, noAutoAccept: true,
		},
		failures,
		publicEnablementAllowed: false,
		ownerApprovalNotInferred: true,
	}
	await fs.mkdir(path.dirname(reportPath), { recursive: true })
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
	console.log(`C3 LAYOUT/INTERACTION PROPERTY CORPUS: ${report.status} cases=${report.cases} feasible=${feasiblePassed}/${report.feasibleCases} actionable=${actionablePassed}/${report.actionableCases}`)
	if (failures.length) console.log(JSON.stringify(failures.slice(0, 10), null, 2))
	process.exit(failures.length ? 1 : 0)
}

main().catch(error => { console.error(`C3 LAYOUT/INTERACTION PROPERTY CORPUS: FAIL ${error.message}`); process.exit(1) })
