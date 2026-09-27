#!/usr/bin/env node
import JSZip from 'jszip'
import { validatePackageMetadataLeaksFromZip } from './quality/package-metadata.mjs'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'
const { createMcpToolDispatcher } = await import('./engine.mjs')

function fail(message, detail = {}) {
	console.error('QUALITY DETERMINISTIC VERIFY: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function okResult(label, result) {
	if (!result?.ok) fail(`${label} failed.`, result)
	return result.data
}

const mcp = createMcpToolDispatcher({
	sessionId: `verify-quality-deterministic-${Date.now()}`,
	clientInfo: { name: 'quality-deterministic-verifier', version: '1' },
	blackBox: true,
})
const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Deterministic Quality Gate Probe',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'quality reviewers', outcome: 'separate advisories from blockers', remember: 'semantic intent remains the authoring input' },
	visualDesign: { world: 'Editorial verification sheet', framing: 'One sparse proof statement.' },
	motionTime: { masterClock: 'narration-text', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'Single deck clock governs transitions and narration.' },
	slides: [{
		id: 'quality-probe',
		title: 'Sparse slide',
		message: 'Sparse slide.',
		layoutIntent: 'title-body',
		content: [{ kind: 'title', name: 'quality-probe-title', text: 'Sparse slide' }],
	}],
}
const committed = okResult('generate_from_spec commit', await mcp.call('betterpptx.deck.generate_from_spec', {
	spec,
	phase: 'commit',
	commitMode: 'createNew',
	plan: 'free',
	detail: 'full',
}))
const deckId = committed.deckId
const deckVersion = committed.deckVersion
if (!deckId || !Number.isInteger(deckVersion)) fail('JSON-spec commit did not return a governed deck handle.', committed)

const modern = okResult('validate_quality modern', await mcp.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'modern' }))
if (modern.ok !== true) fail('Design/accessibility advisories blocked normal quality validation.', modern)
if (!Array.isArray(modern.warnings) || modern.warnings.length < 1) fail('Expected advisory warnings for a sparse deck.', modern)
if (Array.isArray(modern.blockingIssues) && modern.blockingIssues.length) fail('Normal sparse deck produced deterministic blockers unexpectedly.', modern.blockingIssues)
const modernDirectorStatus = modern.directorValidation?.status
if (modernDirectorStatus?.readyForSave !== true || modernDirectorStatus?.stages?.find(stage => stage.key === 'verification')?.completed !== true || modernDirectorStatus?.verificationEvidence?.ok !== true) {
	fail('A green quality gate returned stale or incomplete Director verification readback.', modern.directorValidation)
}
const lowMotion = (modern.warnings || []).find(issue => issue.code === 'LOW_MOTION_COVERAGE')
if (!lowMotion || !/meaningful story objects/i.test(lowMotion.fix || '') || /discussed by narration/i.test(lowMotion.fix || '')) {
	fail('Non-narrated motion guidance is not semantic.', lowMotion || modern)
}

const narrated = okResult('validate_quality narrated', await mcp.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'narrated', requireNarration: true }))
if (narrated.ok !== false) fail('Required narration timing did not block narrated validation.', narrated)
const narrationBlockers = (narrated.blockingIssues || []).filter(issue => issue.gate === 'narration')
if (!narrationBlockers.length) fail('Narrated validation failed without a narration blocker.', narrated)

okResult('deck.dispose', await mcp.call('betterpptx.deck.dispose', { deckId, deckVersion }))

const zip = new JSZip()
zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="x" Target="C:\\\\private\\\\asset.png"/></Relationships>')
zip.file('docProps/core.xml', '<cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>PptxGenJS local maintainer</dc:creator></cp:coreProperties>')
zip.file('docProps/app.xml', '<Properties><Application>BetterPPTX</Application></Properties>')
const metadata = await validatePackageMetadataLeaksFromZip(zip)
if (metadata.ok !== false || metadata.issueCount < 2) fail('Metadata/relationship leak scanner did not catch deterministic leaks.', metadata)

console.log('QUALITY DETERMINISTIC VERIFY: PASS')
console.log(JSON.stringify({
	modernWarnings: modern.warnings.length,
	narrationBlockers: narrationBlockers.length,
	metadataLeakIssues: metadata.issueCount,
}, null, 2))
