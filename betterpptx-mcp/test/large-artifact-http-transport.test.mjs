import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import express from 'express'
import { registerHooks } from 'node:module'
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { DEFAULT_CLIENT_SAFE_EMBED_BYTES } from '../delivery/embedded-presentation.mjs'

// Real HTTP/MCP serialization with a synthetic dispatcher payload. This tests
// the final attachment-offer boundary, not OAuth, compilation or cloud storage.
// No save executes, no artifact is created, and no publication is consumed.
for (const name of Object.keys(process.env)) {
  if (/^(BETTERPPTX_|GOOGLE_|GCLOUD_|FIRESTORE_)/.test(name)) delete process.env[name]
}
Object.assign(process.env, {
  NODE_ENV: 'test', BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test',
  BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
  BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_LOG: 'off',
})
const engineUrl = new URL('../engine.mjs', import.meta.url).href
const fixture = {
  downloadName: 'synthetic-wire.pptx',
  downloadUrl: 'https://presentations.example.test/files/opaque/synthetic-wire.pptx',
  packageSha256: 'a'.repeat(64),
  bytes: 17215008,
  artifact: { expiresAt: '2026-09-29T19:00:00.000Z', downloadLinkExpiresAt: '2026-09-29T19:00:00.000Z' },
}
const mockUrl = `data:text/javascript,${encodeURIComponent(`
  export const calls = []
  export function configureMotionPreparationRuntime() { throw new Error("Synthetic delivery must not configure motion preparation") }
  export function configureBuiltInPreparedMotionRuntime() { throw new Error("Synthetic delivery must not configure built-in assets") }
  export function createMcpToolDispatcher() {
    return { call: async (name, args) => {
      calls.push({ name, args: structuredClone(args) })
      const data = ${JSON.stringify(fixture)}
      if (args.operationId === 'op_' + 'b'.repeat(32)) data.bytes = ${DEFAULT_CLIENT_SAFE_EMBED_BYTES}
      if (args.operationId === 'op_' + 'c'.repeat(32)) delete data.bytes
      if (name === 'betterpptx.operation.status') return { ok: true, data: { state: 'succeeded', result: data } }
      if (name === 'betterpptx.operation.read_file') return { ok: true, data: {
        ...data, operationId: args.operationId, mode: 'link', totalBytes: data.bytes,
        deliveryReason: args.mode === 'resource' ? 'resource-exceeds-conservative-client-size' : 'requested-link',
      } }
      if (name === 'betterpptx.deck.save') return { ok: true, data }
      throw new Error('Only synthetic delivery responses are allowed')
    } }
  }
`)}`
const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  const resolved = nextResolve(specifier, context)
  return resolved.url === engineUrl ? { url: mockUrl, shortCircuit: true } : resolved
} })
const { createBetterPptxMcpServer } = await import('../server.mjs')
const { calls } = await import(mockUrl)
const nativeFetch = globalThis.fetch.bind(globalThis)
const wireResponses = []
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  assert.ok(url.startsWith('http://127.0.0.1:'), 'External network is forbidden')
  const response = await nativeFetch(input, init)
  if (init?.body?.includes('tools/call')) wireResponses.push(await response.clone().text())
  return response
}

test.after(() => { hooks.deregister(); globalThis.fetch = nativeFetch })

test('real HTTP MCP response keeps large/unknown files link-only and preserves small attachment offers', async () => {
  const app = express()
  app.use(express.json())
  app.post('/mcp', async (req, res) => {
    const transport = new NodeStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    const server = createBetterPptxMcpServer({ blackBox: true, sessionId: 'synthetic-delivery-wire' })
    res.once('close', () => { void server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res, req.body)
  })
  const listener = http.createServer(app)
  await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve))
  const client = new Client({ name: 'synthetic-delivery-wire-test', version: '1' }, { capabilities: {} })
  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${listener.address().port}/mcp`)))
    for (const [name, args] of [
      ['betterpptx.operation.read_file', { operationId: `op_${'a'.repeat(32)}`, mode: 'resource' }],
      ['betterpptx.operation.status', { operationId: `op_${'a'.repeat(32)}` }],
      ['betterpptx.deck.save', { deckId: 'deck_syntheticwire', fileName: fixture.downloadName, outputFormat: 'pptx', idempotencyKey: 'synthetic-wire-only' }],
      ['betterpptx.operation.read_file', { operationId: `op_${'c'.repeat(32)}`, mode: 'link' }],
    ]) {
      const result = await client.callTool({ name, arguments: args })
      assert.equal(result.isError, false)
      assert.ok(result.content.every(item => item.type === 'text'), `${name}: no materializer hint permitted`)
      const envelope = result.structuredContent
      assert.equal(envelope.ok, true)
      const data = envelope.data.result || envelope.data
      assert.equal(data.downloadUrl, fixture.downloadUrl)
      assert.equal(data.packageSha256, fixture.packageSha256)
      assert.deepEqual(data.artifact, fixture.artifact)
      const text = JSON.parse(result.content[0].text)
      assert.deepEqual(text, envelope)
      const wire = wireResponses.at(-1)
      assert.ok(wire?.includes(fixture.downloadUrl), 'Actual HTTP bytes retain the normal download URL')
      for (const forbidden of ['resource_link', 'dataBase64', '"blob"', '"type":"resource"']) assert.equal(wire.includes(forbidden), false)
      if (args.mode === 'resource') assert.equal(data.deliveryReason, 'resource-exceeds-conservative-client-size')
    }
    const small = await client.callTool({ name: 'betterpptx.operation.status', arguments: { operationId: `op_${'b'.repeat(32)}` } })
    assert.equal(small.content.filter(item => item.type === 'resource_link').length, 1)
    assert.equal(small.content.find(item => item.type === 'resource_link').size, DEFAULT_CLIENT_SAFE_EMBED_BYTES)
    assert.equal(calls.length, 5, 'Exactly the intended synthetic responses executed')
  } finally {
    await client.close()
    listener.closeAllConnections()
    await new Promise(resolve => listener.close(resolve))
  }
})
