import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import JSZip from 'jszip'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'

const { createMcpToolDispatcher } = await import('../engine.mjs')

function radialSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native SmartArt topology mutation proof',
		authoringContract: {
			workflow: 'authoring-excellence-director-v1',
			level: 'deterministic',
			coordinateSystem: 'inches',
			layerModel: 'flat-object-array',
			objectIdentity: 'stable-names-required',
		},
		contentStory: {
			audience: 'presentation quality reviewers',
			outcome: 'Keep every authored Radial Cluster concept visible through updates.',
			remember: 'One central node owns the visible surrounding nodes as children.',
		},
		handshake: {
			audience: 'presentation quality reviewers',
			promise: 'Reject SmartArt updates that would silently hide authored concepts.',
			proof: ['The package remains byte-equivalent across a rejected update.'],
			bar: 'Every semantic node remains visible and the failed mutation changes nothing.',
		},
		visualDesign: { world: 'Dark relationship proof', framing: 'One radial concept map', tone: 'clear' },
		styleIntent: { artDirection: 'blueprint', mode: 'dark' },
		motionTime: { masterClock: 'authored slide timeline', timingSource: 'semantic slide plan', syncPolicy: 'single deck clock' },
		layout: 'LAYOUT_WIDE',
		slides: [{
			id: 'radial-topology',
			title: 'One center with four visible influences',
			message: 'A valid native Radial Cluster has one Level 1 root and direct Level 2 children.',
			role: 'relationship',
			layoutIntent: 'process-flow',
			content: [
				{ kind: 'title', name: 'radial-title', text: 'One center with four visible influences' },
				{
					kind: 'smartart', name: 'radial', mode: 'native', layout: 'relationship',
					layoutId: 'urn:microsoft.com/office/officeart/2008/layout/RadialCluster',
					style: { textColorRole: 'onDark' },
					nodes: [{ text: 'Center', children: [{ text: 'One' }, { text: 'Two' }, { text: 'Three' }, { text: 'Four' }] }],
					verified: true, evidenceSource: 'deterministic mutation-safety fixture',
					altText: 'One central concept related to four surrounding influences.',
				},
			],
		}],
		validation: { validateBeforeSave: true, requireAccessibility: true },
	}
}

async function relevantPackageSnapshot(pptxPath) {
	const zip = await JSZip.loadAsync(await fs.readFile(pptxPath))
	const names = Object.keys(zip.files).filter(name => !zip.files[name].dir && (
		/^ppt\/slides\/slide1\.xml$/i.test(name)
		|| /^ppt\/slides\/_rels\/slide1\.xml\.rels$/i.test(name)
		|| /^ppt\/diagrams\//i.test(name)
	)
	).sort()
	return Object.fromEntries(await Promise.all(names.map(async name => [name, await zip.files[name].async('base64')])))
}

test('rejected Radial Cluster update preserves objects, relationships, and diagram parts', async () => {
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-smartart-topology-'))
	const mcp = createMcpToolDispatcher({
		sessionId: `smartart-topology-update-${Date.now()}`,
		clientInfo: { name: 'smartart-topology-verifier', version: '1' },
		blackBox: false,
	})
	let deckId = null
	try {
		const committed = await mcp.call('betterpptx.deck.generate_from_spec', { spec: radialSpec(), phase: 'commit', commitMode: 'createNew', detail: 'full' })
		assert.equal(committed?.ok, true, JSON.stringify(committed))
		const data = committed.data || committed
		deckId = data.deckId
		assert.ok(deckId)
		for (const name of ['betterpptx.deck.validate', 'betterpptx.deck.validate_design', 'betterpptx.deck.validate_accessibility', 'betterpptx.deck.validate_quality']) {
			const result = await mcp.call(name, { deckId, mode: 'strict' })
			assert.equal(result?.ok, true, `${name}: ${JSON.stringify(result)}`)
		}
		const beforeSave = await mcp.call('betterpptx.deck.save', { deckId, outputDir: tempDir, fileName: 'before.pptx' })
		assert.equal(beforeSave?.ok, true, JSON.stringify(beforeSave))
		const beforePath = (beforeSave.data || beforeSave).filePath || (beforeSave.data || beforeSave).path
		const before = await relevantPackageSnapshot(beforePath)

		const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
			deckId,
			commitMode: 'patch',
			phase: 'commit',
			includePatchPlan: true,
			spec: {
				...radialSpec(),
				title: 'Rejected native SmartArt topology patch',
				slides: [{
					id: 'radial-topology',
					slideIndex: 0,
					layoutIntent: 'process-flow',
					content: [{
						kind: 'smartart',
						name: 'radial-patch',
						objectName: 'radial-topology.radial.smartart',
						nodeIndex: 1,
						text: 'This flat update must not erase the satellites',
					}],
				}],
			},
		})
		assert.equal(rejected?.ok, false, JSON.stringify(rejected))
		assert.equal(rejected?.error?.code, 'SMARTART_NODE_TOPOLOGY_INVALID', JSON.stringify(rejected))
		assert.equal(rejected?.error?.details?.failure, 'top-level-node-count')

		const afterSave = await mcp.call('betterpptx.deck.save', { deckId, outputDir: tempDir, fileName: 'after.pptx' })
		assert.equal(afterSave?.ok, true, JSON.stringify(afterSave))
		const afterPath = (afterSave.data || afterSave).filePath || (afterSave.data || afterSave).path
		const after = await relevantPackageSnapshot(afterPath)
		assert.deepEqual(after, before)
	} finally {
		if (deckId) await mcp.call('betterpptx.deck.dispose', { deckId }).catch(() => {})
		await fs.rm(tempDir, { recursive: true, force: true })
	}
})
