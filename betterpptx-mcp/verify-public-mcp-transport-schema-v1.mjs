#!/usr/bin/env node
// Exercises the real MCP SDK schema validator instead of calling the dispatcher
// directly. This catches payload/output-schema drift at the public transport.

import crypto from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { Client } from "@modelcontextprotocol/client";

const here = path.dirname(fileURLToPath(import.meta.url))
const EXPECTED_TOOL_COUNT = 50
const EXPECTED_TOOL_SHA256 = '9138365991816ac4492cf0178c038377c6de1aa1e9fde76aa59098f8020ccdc6'
const DIRECT_AUTHORING = /\b(?:betterpptx\.)?(?:deck\.new|slide\.(?:add|update|revise|delete|reorder|animate|set_transition)[a-z0-9_.]*|custom_geometry\.(?:insert|insert_svg))\b/i
const PRIVATE_SERVICE = /\b(?:meshy|mixamo|svgpath|baker|self-hosted|poc\/flow-test|sketchfab|pexels|pixabay|openverse|freesound|elevenlabs|polly|iconscout)\b/i
const INTERNAL_PROVENANCE = /\b(?:_synergyPlan|clipTimelines|playScene|engineRoute|compiledAs|nativePackage|nativeTiming|TO_SOURCE|providerExecution|sourceXmlPath|packagePath)\b/i
const profiles = [
	{ id: 'public-default', maintainer: '0', classification: 'public-black-box' },
	{ id: 'local-preview-augmentation', maintainer: '1', classification: 'black-box-surface-local-oracle-not-public-deployment-proof' },
]

function envelope(result) {
	if (result?.isError) throw new Error(result.content?.find(item => item.type === 'text')?.text || 'MCP tool returned isError')
	return result?.structuredContent?.data || result?.structuredContent
}

const rows = []
for (const profile of profiles) {
	const env = {
		...process.env,
		BETTERPPTX_PUBLIC_BLACK_BOX: '1',
		BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
		BETTERPPTX_LOCAL_MAINTAINER: profile.maintainer,
	}
	const transport = new StdioClientTransport({ command: process.execPath, args: ['server.mjs'], cwd: here, stderr: 'pipe', env })
	const client = new Client({ name: `betterpptx-transport-schema-${profile.id}`, version: '1' }, { capabilities: {} })
	try {
		await client.connect(transport)
		const listed = await client.listTools()
		const names = (listed.tools || []).map(tool => tool.name).sort()
		const toolSha256 = crypto.createHash('sha256').update(JSON.stringify(names)).digest('hex')
		if (names.length !== EXPECTED_TOOL_COUNT || toolSha256 !== EXPECTED_TOOL_SHA256) throw new Error(`public tool projection drifted: count=${names.length} sha256=${toolSha256}`)
		const toolSchemaText = JSON.stringify(listed.tools || [])
		// The governed spec route intentionally exposes pixel controls for the
		// explicit visual-reference mode, and model3d generation exposes semantic
		// width/height.  Neither is a primitive authoring surface.  Keep the
		// boundary assertion focused on the remaining public tool schemas.
		const inputSchemaText = JSON.stringify((listed.tools || [])
			.filter(tool => !['betterpptx.deck.generate_from_spec', 'betterpptx.assets.generate_model3d'].includes(tool.name))
			.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema || {} })))
		const boundaryLeak = toolSchemaText.match(DIRECT_AUTHORING)?.[0] || toolSchemaText.match(PRIVATE_SERVICE)?.[0] || toolSchemaText.match(INTERNAL_PROVENANCE)?.[0]
		if (boundaryLeak) throw new Error(`${profile.id} public schema leaked authoring-boundary vocabulary: ${boundaryLeak}`)
		if (/"(?:x|y|w|h|bbox|rect|points)":/i.test(inputSchemaText)) throw new Error(`${profile.id} public input schema exposed authored coordinates`)
		const status = envelope(await client.callTool({ name: 'betterpptx.status', arguments: {} }))
		const capabilities = envelope(await client.callTool({ name: 'betterpptx.help.capabilities', arguments: { intent: 'Create an excellent executive presentation', detail: 'full' } }))
		const workflow = envelope(await client.callTool({ name: 'betterpptx.help.workflow', arguments: { intent: 'Create an excellent executive presentation', detail: 'full' } }))
		const publicExample = capabilities?.examples?.find(example => example?.tool === 'betterpptx.deck.generate_from_spec')?.payload?.spec
		if (!publicExample) throw new Error(`${profile.id} capabilities lost the executable public spec example`)
		const generateTool = (listed.tools || []).find(tool => tool.name === 'betterpptx.deck.generate_from_spec')
		const uploadTool = (listed.tools || []).find(tool => tool.name === 'betterpptx.assets.upload')
		const exportTool = (listed.tools || []).find(tool => tool.name === 'betterpptx.deck.export_spec')
		if (!generateTool?.inputSchema?.properties?.specHandle || !generateTool.inputSchema?.anyOf?.some(branch => branch.required?.includes('specHandle'))) throw new Error(`${profile.id} generate_from_spec lost portable specHandle input`)
		if (!uploadTool?.inputSchema?.properties?.kind?.enum?.includes('jsonSpec')) throw new Error(`${profile.id} assets.upload lost jsonSpec input`)
		if (!exportTool?.inputSchema?.properties?.mode?.enum?.includes('effectivePrecompile')) throw new Error(`${profile.id} export_spec lost immutable authored/effective modes`)
		const portableBytes = Buffer.from(`${JSON.stringify(publicExample, null, 2)}\n`, 'utf8')
		const uploadedSpec = envelope(await client.callTool({
			name: 'betterpptx.assets.upload',
			arguments: { kind: 'jsonSpec', fileName: 'transport-example.betterpptx-spec.json', data: `data:application/json;base64,${portableBytes.toString('base64')}` },
		}))
		if (!/^asset:\/\/locked\/uploaded-jsonspec\//.test(String(uploadedSpec?.handle || '')) || !/^[a-f0-9]{64}$/.test(String(uploadedSpec?.canonicalSha256 || ''))) throw new Error(`${profile.id} jsonSpec upload did not return portable canonical identity`)
		const dryRun = envelope(await client.callTool({
			name: 'betterpptx.deck.generate_from_spec',
			arguments: { specHandle: uploadedSpec.handle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true },
		}))
		const serializedStatus = JSON.stringify(status)
		if (/(?:cwd|execPath|processId|repository|node_modules|[A-Z]:\\)/i.test(serializedStatus)) throw new Error(`${profile.id} status leaked local diagnostics`)
		if (capabilities?.authoringPrinciples?.firstTimeRight?.contractVersion !== 'authoring-excellence.first-time-right.v2') throw new Error(`${profile.id} capabilities lost the FTR v2 contract`)
		if (capabilities?.authoringApi?.contractVersion !== 'authoring-excellence.public-api.v2') throw new Error(`${profile.id} capabilities lost the compact public authoring API contract`)
		if (workflow?.authoritySummary?.designAuthority !== 'ai' || workflow?.capabilityDiscovery?.tool !== 'betterpptx.help.capabilities' || !workflow?.capabilityDiscovery?.read?.includes('authoringApi')) throw new Error(`${profile.id} workflow lost its compact capability-authority reference`)
		if (dryRun?.phase !== 'dryRun' || dryRun?.deckId) throw new Error(`${profile.id} dry-run was not mutation-free`)
		if (dryRun?.specProvenance?.submitted?.sha256 !== uploadedSpec.canonicalSha256 || dryRun?.specProvenance?.submitted?.rawSubmissionSha256 !== uploadedSpec.rawSha256) throw new Error(`${profile.id} portable spec identity was not preserved through dryRun`)
		if (dryRun?.authoringContract?.workflow !== 'authoring-excellence-director-v1') throw new Error(`${profile.id} dry-run lost the authoring contract`)
		if (dryRun?.handshake?.firstTimeRightContractVersion !== 'authoring-excellence.first-time-right.v2') throw new Error(`${profile.id} dry-run lost the FTR handshake contract`)
		rows.push({ id: profile.id, classification: profile.classification, status: 'PASS', publicToolCount: names.length, publicToolSha256: toolSha256, capabilitiesSchemaValidated: true, workflowSchemaValidated: true, dryRunSchemaValidated: true, dryRunMutationFree: true, statusSanitized: true })
	} finally {
		try { await client.close() } catch {}
		try { await transport.close() } catch {}
	}
}

process.stdout.write(`${JSON.stringify({ schemaVersion: 'betterpptx.public-mcp-transport-schema.v1', status: 'PASS', profiles: rows }, null, 2)}\n`)
