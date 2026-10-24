#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import Ajv from 'ajv'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { PUBLIC_SEMANTIC_VERSION, TOOL_SCHEMA_VERSION } from './public-manifest.mjs'

const value = flag => {
	const index = process.argv.indexOf(flag)
	return index < 0 ? undefined : process.argv[index + 1]
}
const endpoint = new URL(value('--mcp-url') || 'https://betterpptx.tail070c3a.ts.net/mcp')
const bearerToken = value('--bearer-token') || process.env.BETTERPPTX_TEST_HTTP_TOKEN
const outputDir = path.resolve(value('--outdir') || '.codex-tmp/live-quote-contract-v1')
await mkdir(outputDir, { recursive: true })
const report = {
	schemaVersion: 'betterpptx.live-quote-contract.v1',
	startedAt: new Date().toISOString(),
	endpointOrigin: endpoint.origin,
	status: 'RUNNING',
	checks: [],
}
const pass = (id, evidence = {}) => report.checks.push({ id, status: 'PASS', ...evidence })
const client = new Client({ name: 'betterpptx-live-quote-contract', version: '1' }, { capabilities: {} })
const transport = new StreamableHTTPClientTransport(endpoint, {
	requestInit: { headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {} },
})

function parseResult(result) {
	if (result?.structuredContent) return result.structuredContent
	const text = result?.content?.find(item => item.type === 'text')?.text || ''
	if (/sign in to betterpptx/i.test(text)) {
		const error = new Error('Protected live quote execution requires an authenticated supported-client session or --bearer-token.')
		error.code = 'AUTH_REQUIRED'
		throw error
	}
	try { return JSON.parse(text || '{}') } catch {
		return { ok: false, error: { code: 'NON_JSON_TOOL_RESULT', message: text || 'Tool returned no structured result.' } }
	}
}

function envelope(result, label) {
	const parsed = parseResult(result)
	assert.equal(parsed?.ok, true, `${label}: ${JSON.stringify(parsed?.error || parsed)}`)
	return parsed.data || parsed
}

function rawEnvelope(result) {
	return parseResult(result)
}

async function call(name, args = {}) {
	return envelope(await client.callTool({ name, arguments: args }, undefined, { timeout: 300_000 }), name)
}

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Public quote contract fixture',
	authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
	slides: [{ id: 'one', title: 'One contract', content: [{ kind: 'textBox', name: 'headline', text: 'Issuer equals consumer', rect: { x: 0.8, y: 0.8, w: 9.5, h: 0.8 } }] }],
}

try {
	await client.connect(transport)
	const listed = await client.listTools()
	const byName = new Map(listed.tools.map(tool => [tool.name, tool]))
	const estimateTool = byName.get('betterpptx.billing.estimate')
	const generateTool = byName.get('betterpptx.deck.generate_from_spec')
	assert.ok(estimateTool && generateTool)
	// tools/list advertises bounded schemas; compare the exact contracts on demand.
	const schemaNode = async (schemaFor, schemaKind, schemaPath) => (await call('betterpptx.help.tool_recipe', { schemaFor, schemaKind, schemaPath })).toolSchema.schema
	const issuedSchema = await schemaNode('betterpptx.billing.estimate', 'output', 'data.quoteBinding')
	const consumedSchema = await schemaNode('betterpptx.deck.generate_from_spec', 'input', 'quoteBinding')
	assert.deepEqual(issuedSchema, consumedSchema)
	assert.equal(consumedSchema.properties.quoteSchemaVersion.const, 'betterpptx.premium-quote.v1')
	pass('one-issuer-consumer-schema')

	const allowanceBefore = await call('betterpptx.auth.status', {})
	const inline = await call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.generate_from_spec', toolArgs: { spec, plan: 'premium' } })
	assert.equal(inline.freeAllowance?.category, 'deck-publication')
	assert.equal(inline.freeAllowance?.route?.accountingTool, 'betterpptx.deck.save')
	if (inline.freeAllowance?.eligible) {
		assert.equal(inline.estimatedCredits, 0)
		assert.equal(inline.quoteCapCredits, 0)
		assert.equal(inline.priceUsdc, 0)
		assert.equal(inline.amountAtomic, '0')
		assert.equal(inline.finalSaveEstimatedCredits, 0)
		assert.equal(inline.estimate?.estimatedCredits, 0)
		assert.equal(inline.estimate?.quoteCapCredits, 0)
		assert.equal(inline.estimate?.priceUsdc, 0)
		assert.equal(inline.estimate?.amountAtomic, '0')
		assert.equal(inline.billingRequired, false)
		assert.ok(Number(inline.unsubsidizedEstimate?.estimatedCredits) > 0)
		assert.ok(Number(inline.unsubsidizedEstimate?.priceUsdc) > 0)
		assert.equal(allowanceBefore.identityAssurance?.secured, true)
		pass('publication-estimate-is-sponsored-without-hiding-operational-cost', {
			customerEstimatedCredits: inline.estimatedCredits,
			unsubsidizedEstimatedCredits: inline.unsubsidizedEstimate.estimatedCredits,
			remaining: inline.freeAllowance.remaining,
		})
	} else {
		assert.equal(inline.freeAllowance?.reason, 'secured-identity-required')
		assert.ok(Number(inline.estimatedCredits) > 0)
		pass('identityless-raw-client-is-not-granted-sponsored-publication', {
			reason: inline.freeAllowance.reason,
			customerEstimatedCredits: inline.estimatedCredits,
		})
	}
	const validate = new Ajv({ allErrors: true, strict: false }).compile(consumedSchema)
	assert.equal(validate(inline.quoteBinding), true, JSON.stringify(validate.errors))
	pass('issued-binding-validates-unchanged', { quoteId: inline.quoteId })

	const issuedBinding = structuredClone(inline.quoteBinding)
	const verifiedDryRun = await call('betterpptx.deck.generate_from_spec', {
		spec,
		plan: 'premium',
		phase: 'dryRun',
		quoteBinding: issuedBinding,
	})
	assert.deepEqual(inline.quoteBinding, issuedBinding, 'client/server round trip mutated the issued quote binding')
	assert.equal(verifiedDryRun.phase, 'dryRun')
	assert.equal(verifiedDryRun.deckId ?? null, null)
	assert.equal(verifiedDryRun.quoteVerification?.status, 'accepted-unchanged')
	assert.equal(verifiedDryRun.quoteVerification?.mutationPerformed, false)
	assert.equal(verifiedDryRun.quoteVerification?.quoteBindingDigest, inline.quoteBindingDigest)
	pass('unchanged-binding-accepted-by-server-mutation-free', {
		quoteId: inline.quoteId,
		quoteBindingDigest: inline.quoteBindingDigest,
		phase: verifiedDryRun.phase,
	})

	const invalidBinding = structuredClone(inline.quoteBinding)
	invalidBinding.planDigest = `${invalidBinding.planDigest}-tampered`
	const rejected = rawEnvelope(await client.callTool({
		name: 'betterpptx.deck.generate_from_spec',
		arguments: { spec, plan: 'premium', phase: 'dryRun', quoteBinding: invalidBinding },
	}, undefined, { timeout: 300_000 }))
	assert.equal(rejected?.ok, false, JSON.stringify(rejected))
	assert.equal(rejected?.error?.code, 'QUOTE_BINDING_MISMATCH', JSON.stringify(rejected?.error || rejected))
	assert.equal(rejected?.data?.deckId ?? rejected?.error?.details?.deckId ?? null, null)
	pass('tampered-binding-rejected-without-artifact', {
		code: rejected.error.code,
		mismatchedFields: rejected.error.details?.mismatchedFields || [],
	})

	const uploaded = await call('betterpptx.assets.upload', {
		kind: 'jsonSpec',
		data: `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`,
	})
	const handled = await call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.generate_from_spec', toolArgs: { specHandle: uploaded.handle, plan: 'premium' } })
	for (const field of ['specDigest', 'estimatedPlanDigest', 'planDigest', 'pricingInputDigest', 'quoteId', 'quoteBindingDigest']) {
		assert.equal(handled[field], inline[field], field)
	}
	assert.equal(handled.readyForExecution, true)
	assert.ok(handled.quoteBinding)
	pass('inline-uploaded-estimate-parity', { specDigest: inline.specDigest, quoteBindingDigest: inline.quoteBindingDigest })

	const allowanceAfter = await call('betterpptx.auth.status', {})
	const beforePublication = allowanceBefore.freeAllowances.deckPublications
	const afterPublication = allowanceAfter.freeAllowances.deckPublications
	assert.equal(afterPublication.used, beforePublication.used)
	assert.equal(afterPublication.reserved, beforePublication.reserved)
	assert.equal(afterPublication.remaining, beforePublication.remaining)
	pass(beforePublication.eligible ? 'estimate-dry-run-and-upload-do-not-consume-publication' : 'identityless-read-workflow-creates-no-publication-accounting', {
		used: afterPublication.used,
		reserved: afterPublication.reserved,
		remaining: afterPublication.remaining,
		reason: afterPublication.reason,
	})

	const help = await call('betterpptx.help.capabilities', { detail: 'summary' })
	assert.equal(help.capabilityDiscovery.semanticVersion, PUBLIC_SEMANTIC_VERSION)
	assert.equal(help.capabilityDiscovery.toolSchemaVersion, TOOL_SCHEMA_VERSION)
	pass('schema-version-invalidates-old-cache', {
		semanticVersion: help.capabilityDiscovery.semanticVersion,
		toolSchemaVersion: help.capabilityDiscovery.toolSchemaVersion,
		advertisedToolSchemaDigest: help.capabilityDiscovery.advertisedToolSchemaDigest,
	})
	report.status = 'PASS'
} catch (error) {
	if (error.code === 'AUTH_REQUIRED' && !bearerToken) {
		report.status = 'AUTH_REQUIRED'
		report.blocker = { code: error.code, message: error.message }
		pass('protected-quote-boundary', { authenticatedExecutionPerformed: false })
	} else {
		report.status = 'FAIL'
		report.error = { name: error.name, message: error.message, stack: error.stack }
		throw error
	}
} finally {
	report.completedAt = new Date().toISOString()
	const bytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
	report.reportSha256 = createHash('sha256').update(bytes).digest('hex')
	await writeFile(path.join(outputDir, 'report.json'), bytes)
	await client.close().catch(() => {})
	console.log(JSON.stringify({ status: report.status, report: path.join(outputDir, 'report.json'), checks: report.checks.length }, null, 2))
}
