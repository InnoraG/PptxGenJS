import assert from 'node:assert/strict'
import test from 'node:test'
import JSZip from 'jszip'

process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_PREMIUM = '1'
process.env.BETTERPPTX_MAINTAINER_MODE = '1'
process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '1'

const {
	FOUNDATION_CAPABILITY_CONTRACTS,
	FOUNDATION_CAPABILITY_PARTITION,
	foundationCapabilityContractForEntry,
} = await import('../foundation-capability-contract.mjs')
const { publicBaselineCatalog } = await import('../public-baseline-catalog.mjs')
const { createMcpToolDispatcher, getDeck } = await import('../engine.mjs')

function unwrap(label, result) {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

function exactSpec(overrides = {}) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'R&D <Overview>',
		subject: 'A&B <Scope>',
		author: 'Jörg & Team',
		company: 'A&B <Co>',
		revision: 7,
		rtlMode: true,
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: { audience: 'reviewers', outcome: 'Verify portable document metadata.', remember: 'Metadata remains exact and package-safe.' },
		visualDesign: { world: 'editorial', framing: 'A compact proof slide', tone: 'clear' },
		motionTime: { masterClock: 'static', timingSource: 'authored slide transition', syncPolicy: 'single slide clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'proof', title: 'Portable metadata', role: 'proof', message: 'The package retains safe metadata.', layoutIntent: 'title-body',
			content: [{ kind: 'textBox', name: 'proof-copy', text: 'Portable metadata remains editable.' }],
		}],
		...overrides,
	}
}

test('foundation aggregate is a complete disjoint partition of only the 117 intended rows', () => {
	assert.deepEqual(FOUNDATION_CAPABILITY_PARTITION, {
		rows: 117,
		exactRows: 72,
		partialRows: 2,
		preserveRows: 4,
		notLiveRows: 27,
		notApplicableRows: 12,
	})
	const rowIds = Object.values(FOUNDATION_CAPABILITY_CONTRACTS).flatMap(contract => contract.rowIds)
	assert.equal(rowIds.length, 117)
	assert.equal(new Set(rowIds).size, 117)
	const promotedTextRows = [
		'cap_04c289f99bb1fc26716d', 'cap_1027890d81e90c60217c', 'cap_111ca5906406e8b708c7',
		'cap_14bde8bc2cf0bcf267fe', 'cap_20cd40de40986dee6195', 'cap_2e1dcb1c24be6e0e3c1a',
		'cap_2f51c6bf475248715239', 'cap_3c98ac90b03728ee4134', 'cap_46070c0141facf98a7b9',
		'cap_467b402dbb9b048264e9', 'cap_58efd3a179a8bad6821c', 'cap_7fedac9c2c15e8b012e2',
		'cap_8447cabb8c034846ef06', 'cap_b4dbbaefec9d67dbb15b', 'cap_bc55b4ec5510ad2efd6c',
		'cap_c7feeda9c2e1e1715a3f', 'cap_d0874657dba2bd79dd74', 'cap_d30c891080b2157a5fb3',
		'cap_daed5870b5a407642542', 'cap_eb812ec514ff5e5316cf', 'cap_ee8187d330d6ebb91d54',
		'cap_f3ce1c4fff45a491558e',
	]
	for (const rowId of promotedTextRows) {
		assert.equal(foundationCapabilityContractForEntry({ id: rowId, sourceKind: 'capability-row', family: 'foundation' })?.capabilityStatus, 'executable-exact-structured', rowId)
	}
	const promotedAccessibilityRows = [
		'cap_1e64c974b4c219c00c45', 'cap_398b22465851fc2680fc', 'cap_46b36f6476d662b201ef',
		'cap_59726c62407ac38d69df', 'cap_780fe48fe3bff8e5fa33', 'cap_8e691379b8b5964663b4',
		'cap_a67c11cc24fa67a6e7af', 'cap_bbb1e96f4e9046a0bf90', 'cap_ef7b3b1a537a10ac184a',
		'cap_f724e5d80366597563d8',
	]
	for (const rowId of promotedAccessibilityRows) {
		assert.equal(foundationCapabilityContractForEntry({ id: rowId, sourceKind: 'capability-row', family: 'foundation' })?.capabilityStatus, 'executable-exact-structured', rowId)
	}
	const promotedInteractiveActionRows = [
		'cap_5e4628e4208df0355326', 'cap_68d5d40f2215eae2ec27', 'cap_a06f420c739065b17b39',
		'cap_ae5619804717cfc5954c', 'cap_bf541879e51cde191618', 'cap_e44774790533e94f3b09',
		'cap_f3905ef2e0ad81995a06', 'cap_f9784c48bcfddf63c337',
	]
	for (const rowId of promotedInteractiveActionRows) {
		const contract = foundationCapabilityContractForEntry({ id: rowId, sourceKind: 'capability-row', family: 'foundation' })
		assert.equal(contract?.id, 'foundationInteractiveActions', rowId)
		assert.equal(contract?.capabilityStatus, 'executable-exact-structured', rowId)
		assert.equal(contract?.runtimeReady, true, rowId)
	}
})

test('public foundation rows retain category-specific truth and semantic kinds', () => {
	const entries = publicBaselineCatalog({ family: 'foundation', includePlanned: true, limit: 500 }).entries
	const ownedEntries = entries.filter(entry => foundationCapabilityContractForEntry(entry))
	const exactSectionSummaryZoomRows = new Set(['cap_5adc3514c23e1839a324', 'cap_8955ad9479da6e1f4185'])
	assert.equal(ownedEntries.length, 117)
	for (const entry of ownedEntries) {
		const contract = foundationCapabilityContractForEntry(entry)
		assert.ok(contract, `missing contract for ${entry.id} ${entry.label}`)
		assert.equal(entry.capabilityStatus, exactSectionSummaryZoomRows.has(entry.id) ? 'executable-exact-structured' : contract.capabilityStatus)
		assert.notDeepEqual(entry.componentOwnership, ['semanticCapability'])
	}
	const byId = new Map(entries.map(entry => [entry.id, entry]))
	assert.equal(byId.get('cap_5c94a4a3c8c6bee8dde5').capabilityStatus, 'executable-exact-structured')
	assert.equal(byId.get('cap_1e657788deb06eff98ce').selection.semanticKind, 'deck')
	assert.equal(byId.get('cap_22f099d408602f3ce2d3').capabilityStatus, 'preserve-imported-only')
	assert.equal(byId.get('cap_0a725c8173df6e3bdb1a').capabilityStatus, 'preserve-imported-only')
	assert.equal(byId.get('cap_013065fed622590b1958').selection.semanticKind, 'productOperation')
	assert.equal(byId.get('cap_013065fed622590b1958').capabilityStatus, 'not-live-in-saved-package')
	assert.equal(byId.get('cap_06ccee771029ae261118').selection.semanticKind, 'assetDiscovery')
	assert.equal(byId.get('cap_034d2839966d55a3d7fe').selection.semanticKind, 'validation')
	assert.equal(byId.get('cap_034d2839966d55a3d7fe').capabilityStatus, 'not-applicable')
	assert.equal(byId.get('cap_8955ad9479da6e1f4185').capabilityStatus, 'executable-exact-structured')
	assert.equal(byId.get('cap_5adc3514c23e1839a324').capabilityStatus, 'executable-exact-structured')
	assert.equal(byId.get('cap_ef7b3b1a537a10ac184a').selection.semanticKind, 'accessibility')
})

test('document metadata compiles, serializes safely, exports, and recompiles exactly', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `foundation-metadata-${Date.now()}`,
		clientInfo: { name: 'foundation-metadata-test', version: '1' },
		blackBox: false,
	})
	const createdDeckIds = []
	try {
		const commit = unwrap('commit', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exactSpec(), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		createdDeckIds.push(commit.deckId)
		const entry = getDeck(commit.deckId)
		assert.equal(entry.pptx.title, 'R&D <Overview>')
		assert.equal(entry.pptx.subject, 'A&B <Scope>')
		assert.equal(entry.pptx.author, 'Jörg & Team')
		assert.equal(entry.pptx.company, 'A&B <Co>')
		assert.equal(entry.pptx.revision, '7')
		assert.equal(entry.pptx.rtlMode, true)

		const zip = await JSZip.loadAsync(await entry.pptx.write({ outputType: 'nodebuffer', compression: false }), { checkCRC32: true })
		const core = await zip.file('docProps/core.xml').async('string')
		const app = await zip.file('docProps/app.xml').async('string')
		const presentation = await zip.file('ppt/presentation.xml').async('string')
		assert.match(core, /<dc:title>R&amp;D &lt;Overview&gt;<\/dc:title>/)
		assert.match(core, /<dc:subject>A&amp;B &lt;Scope&gt;<\/dc:subject>/)
		assert.match(core, /<dc:creator>Jörg &amp; Team<\/dc:creator>/)
		assert.match(core, /<cp:revision>7<\/cp:revision>/)
		assert.match(app, /<Company>A&amp;B &lt;Co&gt;<\/Company>/)
		assert.match(presentation, /<p:presentation\b[^>]*\brtl="1"/)

		const exported = unwrap('export', await mcp.call('betterpptx.deck.export_spec', { deckId: commit.deckId, detail: 'summary' }))
		assert.equal(exported.spec.subject, 'A&B <Scope>')
		assert.equal(exported.spec.author, 'Jörg & Team')
		assert.equal(exported.spec.company, 'A&B <Co>')
		assert.equal(exported.spec.revision, '7')
		assert.equal(exported.spec.rtlMode, true)

		const replay = unwrap('replay', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: exported.spec, phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
		}))
		createdDeckIds.push(replay.deckId)
		const replayPptx = getDeck(replay.deckId).pptx
		assert.equal(replayPptx.title, 'R&D <Overview>')
		assert.equal(replayPptx.subject, 'A&B <Scope>')
		assert.equal(replayPptx.author, 'Jörg & Team')
		assert.equal(replayPptx.company, 'A&B <Co>')
		assert.equal(replayPptx.revision, '7')
		assert.equal(replayPptx.rtlMode, true)
	} finally {
		for (const deckId of createdDeckIds) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
	}
})

test('invalid revision and forbidden XML metadata controls fail closed before package output', async () => {
	const mcp = createMcpToolDispatcher({
		sessionId: `foundation-invalid-metadata-${Date.now()}`,
		clientInfo: { name: 'foundation-invalid-metadata-test', version: '1' },
		blackBox: false,
	})
	const badRevision = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: exactSpec({ revision: '1.2' }), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	})
	assert.equal(badRevision.ok, false)
	assert.match(JSON.stringify(badRevision), /revision|whole number|SPEC_INVALID/i)

	const badControl = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec: exactSpec({ company: 'Unsafe\u0001Company' }), phase: 'commit', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
	})
	assert.equal(badControl.ok, false)
	assert.match(JSON.stringify(badControl), /XML 1\.0 metadata|company/i)
})
