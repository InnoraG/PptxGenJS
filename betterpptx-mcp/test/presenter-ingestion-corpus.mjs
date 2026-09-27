import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assessPresenterSubmission, inspectImageFile } from '../avatar/presenter-ingestion.mjs'

const sourcePath = path.resolve('betterpptx-mcp/outputs/presenter-identity-continuity-fixture.png')
const source = await inspectImageFile(sourcePath)
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-presenter-corpus-'))
const bodyPath = path.join(temp, 'body-reference.png')
const facePath = path.join(temp, 'face-reference.png')
await fs.copyFile(sourcePath, bodyPath)
await fs.copyFile(sourcePath, facePath)
const bodyImage = await inspectImageFile(bodyPath)
const faceImage = await inspectImageFile(facePath)

const goodBody = (overrides = {}) => ({ image: bodyImage, analysis: {
	subjectCount: 1, fullBodyVisible: true, bodyCoverage: 0.74, pose: 'a-pose', facePixels: 420,
	exposureClippingRatio: 0.01, blurScore: 130, segmentationConfidence: 0.94, ...overrides,
} })
const goodFace = (overrides = {}) => ({ image: faceImage, analysis: {
	subjectCount: 1, facePixels: 1200, exposureClippingRatio: 0.01, blurScore: 150, ...overrides,
} })

const cases = [
	{
		id: 'clean-preferred-pack',
		bodyViews: [goodBody(), goodBody(), goodBody(), goodBody()],
		faceImage: goodFace(),
		expect: 'ready',
	},
	{
		id: 'imperfect-but-accepted',
		bodyViews: [goodBody({ pose: 'neutral', exposureClippingRatio: 0.11, segmentationConfidence: 0.53, blurScore: 19 })],
		faceImage: null,
		expect: 'ready-with-warnings',
	},
	{
		id: 'partial-body-face-branch-survives',
		bodyViews: [goodBody({ fullBodyVisible: false, bodyCoverage: 0.31 })],
		faceImage: goodFace(),
		expect: 'ready-with-warnings',
	},
	{
		id: 'cross-view-consistency-review-warning',
		bodyViews: [goodBody(), goodBody({ subjectConsistency: false })],
		faceImage: goodFace(),
		expect: 'ready-with-warnings',
	},
	{
		id: 'lighting-and-segmentation-review-warning',
		bodyViews: [goodBody({ exposureClippingRatio: 0.14, segmentationConfidence: 0.48 })],
		faceImage: goodFace(),
		expect: 'ready-with-warnings',
	},
	{
		id: 'cross-view-lighting-and-framing-warning',
		bodyViews: [goodBody(), goodBody({ lightingConsistency: false, framingConsistency: false })],
		faceImage: goodFace(),
		expect: 'ready-with-warnings',
	},
	{
		id: 'extra-views-preserved-but-limited',
		bodyViews: [goodBody(), goodBody(), goodBody(), goodBody(), goodBody(), goodBody()],
		faceImage: goodFace(),
		expect: 'ready-with-warnings',
	},
	{
		id: 'ambiguous-multiple-subjects',
		bodyViews: [goodBody({ subjectCount: 2 })],
		faceImage: goodFace(),
		expect: 'blocked',
	},
	{
		id: 'unusable-face-detail',
		bodyViews: [goodBody({ facePixels: 120 })],
		faceImage: goodFace({ facePixels: 120 }),
		expect: 'blocked',
	},
	{
		id: 'unreadable-upload',
		bodyViews: [{ image: null, analysis: {} }],
		faceImage: null,
		expect: 'blocked',
	},
]

const results = cases.map(testCase => {
	const decision = assessPresenterSubmission({ bodyViews: testCase.bodyViews, faceImage: testCase.faceImage })
	assert.equal(decision.status, testCase.expect, testCase.id)
	return {
		id: testCase.id,
		status: decision.status,
		canProceed: decision.canProceed,
		selectedBodyViewCount: decision.selectedBodyViewCount,
		faceSource: decision.faceSource,
		blockers: decision.blockers.map(item => item.code),
		warnings: decision.warnings.map(item => item.code),
	}
})

const report = {
	schemaVersion: 'betterpptx.presenter-ingestion-corpus-report.v1',
	status: 'PASS',
	corpusType: 'synthetic-identity-fixture-derived',
	userUploadsIncluded: false,
	source: { path: 'betterpptx-mcp/outputs/presenter-identity-continuity-fixture.png', ...source },
	caseCount: results.length,
	statusCounts: results.reduce((counts, result) => {
		counts[result.status] = (counts[result.status] || 0) + 1
		return counts
	}, {}),
	results,
	interpretation: {
		softQualitySignalsDoNotBlock: true,
		partialBodyDoesNotBlockFaceBranch: true,
		unresolvedIdentityOrUnreadableInputBlocks: true,
		realConsentedCorpusStillRequired: true,
	},
}
const outputPath = path.resolve('betterpptx-mcp/outputs/presenter-ingestion-corpus-report.json')
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
