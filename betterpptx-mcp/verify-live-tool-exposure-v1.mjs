#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'

const value = flag => {
	const index = process.argv.indexOf(flag)
	return index < 0 ? undefined : process.argv[index + 1]
}
const endpoint = new URL(value('--mcp-url') || 'https://betterpptx.xmcpx.com/mcp')
const outputDir = path.resolve(value('--outdir') || 'evidence/live-tool-exposure-current')
await mkdir(outputDir, { recursive: true })
const client = new Client({ name: 'betterpptx-live-tool-exposure', version: '1' }, { capabilities: {} })
const transport = new StreamableHTTPClientTransport(endpoint)
const canonical = value => {
	if (value === undefined) return null
	if (value === null || typeof value !== 'object') return value
	if (Array.isArray(value)) return value.map(canonical)
	return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
}
const sha256 = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const requiredWorkflow = [
	'betterpptx.assets.upload',
	'betterpptx.billing.estimate',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.validate_native_visuals',
	'betterpptx.deck.export_spec',
	'betterpptx.deck.save',
]
const expectedReadOnly = [
	'betterpptx.status',
	'betterpptx.billing.estimate',
	'betterpptx.deck.validate',
	'betterpptx.deck.validate_quality',
	'betterpptx.deck.validate_native_visuals',
	'betterpptx.deck.export_spec',
]
const expectedWriteCapable = [
	'betterpptx.assets.upload',
	'betterpptx.deck.generate_from_spec',
	'betterpptx.deck.save',
]

try {
	await client.connect(transport)
	const listed = await client.listTools()
	const tools = listed.tools || []
	const names = tools.map(tool => tool.name)
	const readOnly = tools.filter(tool => tool.annotations?.readOnlyHint === true).map(tool => tool.name)
	const writeCapable = tools.filter(tool => tool.annotations?.readOnlyHint !== true).map(tool => tool.name)
	const missingRequired = requiredWorkflow.filter(name => !names.includes(name))
	const annotationMismatches = [
		...expectedReadOnly.filter(name => names.includes(name) && !readOnly.includes(name)).map(name => ({ name, expected: 'readOnlyHint:true' })),
		...expectedWriteCapable.filter(name => names.includes(name) && !writeCapable.includes(name)).map(name => ({ name, expected: 'write-capable' })),
	]
	const report = {
		schemaVersion: 'betterpptx.live-tool-exposure.v1',
		observedAt: new Date().toISOString(),
		endpointOrigin: endpoint.origin,
		observedBoundary: 'public-mcp-tools-list',
		serverAdvertisedToolCount: tools.length,
		readOnlyAnnotatedCount: readOnly.length,
		writeCapableCount: writeCapable.length,
		requiredWorkflow,
		missingRequired,
		annotationMismatches,
		names,
		readOnly,
		writeCapable,
		toolSchemaDigest: sha256(tools.map(tool => ({ name: tool.name, inputSchema: tool.inputSchema, outputSchema: tool.outputSchema, annotations: tool.annotations }))),
		status: missingRequired.length || annotationMismatches.length ? 'FAIL' : 'SERVER_ADVERTISED_ONLY',
		clientExposure: {
			status: 'NOT_MEASURED',
			note: 'A public tools/list result cannot establish which actions a particular ChatGPT client projects or can invoke. Verify those separately in the supported client.',
		},
	}
	await writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n')
	console.log(JSON.stringify({ status: report.status, serverAdvertisedToolCount: tools.length, readOnlyAnnotatedCount: readOnly.length, writeCapableCount: writeCapable.length, missingRequired, annotationMismatches, toolSchemaDigest: report.toolSchemaDigest, report: path.join(outputDir, 'report.json') }, null, 2))
	if (missingRequired.length || annotationMismatches.length) process.exitCode = 1
} finally {
	await client.close().catch(() => {})
}
