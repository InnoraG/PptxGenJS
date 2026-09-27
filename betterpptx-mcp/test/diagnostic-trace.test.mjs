import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { diagnosticRequestId, traceArtifactDelivery, traceAuthDecision, traceInternalOperation, traceMcpHttp, traceToolCall, traceToolList, withDiagnosticRequest } from '../diagnostic-trace.mjs'

test('private development trace records discovery and call decisions without customer data', () => {
	const previousEnabled = process.env.BETTERPPTX_DIAGNOSTIC_TRACE
	const previousDir = process.env.BETTERPPTX_DIAGNOSTIC_TRACE_DIR
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpptx-diagnostic-test-'))
	try {
		process.env.BETTERPPTX_DIAGNOSTIC_TRACE = '1'
		process.env.BETTERPPTX_DIAGNOSTIC_TRACE_DIR = dir
		assert.equal(withDiagnosticRequest('req_1', () => diagnosticRequestId('fallback')), 'req_1')
		assert.equal(diagnosticRequestId('fallback'), 'fallback')
		traceToolList({ requestId: 'req_1', transport: 'mcp-v2', profile: 'canonical', manifest: { toolSchemaVersion: 'test-1', buildIdentity: 'build_1', advertisedToolSchemaDigest: 'abc123' }, tools: [
			{ name: 'betterpptx.deck.generate_from_spec', annotations: { readOnlyHint: false }, inputSchema: { type: 'object', properties: { secret: { const: 'should-not-leak' } } } },
			{ name: 'betterpptx.deck.save', annotations: { readOnlyHint: false }, inputSchema: { type: 'object' } },
		] })
		traceAuthDecision({ requestId: 'req_1', outcome: 'accepted', code: 'should-not-leak/unsafe' })
		traceToolCall({ requestId: 'req_1', transport: 'mcp-v2', name: 'betterpptx.deck.save', outcome: 'rejected', errorCode: 'APPROVAL_REQUIRED', durationMs: 4 })
		traceInternalOperation({ requestId: 'req_1', callId: 'tool_1', name: 'betterpptx.deck.save', phase: 'end', errorCode: 'APPROVAL_REQUIRED', durationMs: 3 })
		traceMcpHttp({ requestId: 'req_1', method: 'POST', statusCode: 200, responseBytes: 400, durationMs: 7, authOutcome: 'accepted' })
		traceArtifactDelivery({ phase: 'offered', routePath: '/files/abcdefghijklmnopqrstuvwx/private.pptx', bytes: 17000000 })
		traceArtifactDelivery({ phase: 'finished', routePath: '/files/abcdefghijklmnopqrstuvwx/private.pptx', statusCode: 200, bytes: 17000000, completed: true })
		const file = path.join(dir, `trace-${process.pid}.ndjson`)
		const content = fs.readFileSync(file, 'utf8')
		const rows = content.trim().split('\n').map(JSON.parse)
		assert.deepEqual(rows.map(row => row.type), ['tools.list', 'auth.decision', 'tools.call', 'engine.operation', 'mcp.http', 'artifact.delivery', 'artifact.delivery'])
		assert.equal(rows[0].toolCount, 2)
		assert.equal(rows[0].writeCapableCount, 2)
		assert.equal(rows[0].tools[0].name, 'betterpptx.deck.generate_from_spec')
		assert.equal(rows[0].tools[0].inputSha256.length, 64)
		assert.equal(rows[2].errorCode, 'APPROVAL_REQUIRED')
		assert.equal(content.includes('should-not-leak'), false)
		assert.equal(rows[5].artifactKey, rows[6].artifactKey)
		assert.equal(rows[6].completed, true)
		assert.equal(content.includes('private.pptx'), false)
		assert.equal(content.includes('abcdefghijklmnopqrstuvwx'), false)
	} finally {
		if (previousEnabled === undefined) delete process.env.BETTERPPTX_DIAGNOSTIC_TRACE
		else process.env.BETTERPPTX_DIAGNOSTIC_TRACE = previousEnabled
		if (previousDir === undefined) delete process.env.BETTERPPTX_DIAGNOSTIC_TRACE_DIR
		else process.env.BETTERPPTX_DIAGNOSTIC_TRACE_DIR = previousDir
		fs.rmSync(dir, { recursive: true, force: true })
	}
})
