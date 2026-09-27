#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import Ajv from 'ajv'

const DEFAULT_ENDPOINT = 'https://betterpptx.tail070c3a.ts.net'
const protocolVersion = '2026-07-28'
const sourcePath = process.argv.find(value => !value.startsWith('--') && value.endsWith('.json'))
  || 'C:/Users/SafeUser/Downloads/symphony.corrected.betterpptx-spec.json'
const endpoint = process.argv.find(value => value.startsWith('--endpoint='))?.slice('--endpoint='.length).replace(/\/$/, '')
  || process.env.BETTERPPTX_PUBLIC_ENDPOINT
  || DEFAULT_ENDPOINT
const ajv = new Ajv({ allErrors: true, strict: false })

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function meta() {
  return {
    _meta: {
      'io.modelcontextprotocol/protocolVersion': protocolVersion,
      'io.modelcontextprotocol/clientInfo': { name: 'betterpptx-public-symphony-acceptance-v1', version: '1' },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  }
}

async function rpc(method, params, id) {
  let response
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(`${endpoint}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'mcp-protocol-version': protocolVersion,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
    })
    if (response.status !== 502 || attempt === 2) break
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
  }
  const bodyText = await response.text()
  let body
  try {
    body = JSON.parse(bodyText)
  } catch {
    const line = bodyText.split(/\r?\n/).find(value => value.startsWith('data: '))
    assert.ok(line, `${endpoint} returned a non-JSON MCP response (${response.status}).`)
    body = JSON.parse(line.slice(6))
  }
  assert.equal(response.status, 200, `${endpoint} ${method} returned HTTP ${response.status}.`)
  assert.equal(body?.jsonrpc, '2.0', `${endpoint} ${method} did not return JSON-RPC 2.0.`)
  assert.ok(!body.error, `${endpoint} ${method} returned an RPC error: ${JSON.stringify(body.error)}`)
  return body.result
}

function toolMap(list) {
  return new Map((list || []).map(tool => [tool.name, tool]))
}

function validateInput(tools, name, value) {
  const tool = tools.get(name)
  assert.ok(tool, `Public tools/list omitted ${name}.`)
  const validate = ajv.compile(tool.inputSchema)
  assert.equal(validate(value), true, `${name} request does not match tools/list: ${JSON.stringify(validate.errors)}`)
}

function assertPublicText(value) {
  const serialized = JSON.stringify(value)
  assert.doesNotMatch(serialized, /\b[A-Za-z]:\\\\|file:\/\/|\b(?:node_modules|PptxGenJS|engine\.mjs|server\.mjs|BETTERPPTX_[A-Z0-9_]+)\b/i, 'Public response exposed an implementation detail.')
}

async function run() {
  const sourceBytes = readFileSync(sourcePath)
  const spec = JSON.parse(sourceBytes.toString('utf8'))
  const stat = statSync(sourcePath)
  assert.equal(spec.schemaVersion, 'betterpptx.deck-spec.v1')
  assert.equal(spec.slides?.length, 20, 'Corrected SYMPHONY fixture must contain 20 slides.')
  assert.equal(spec.contentStory?.audience, 'Executive leaders, product builders, and design-conscious presentation audiences')

  const healthResponse = await fetch(`${endpoint}/health`, { headers: { accept: 'application/json' } })
  assert.equal(healthResponse.status, 200, `${endpoint} health returned HTTP ${healthResponse.status}.`)
  const health = await healthResponse.json()
  assert.equal(health.status, 'ok')
  const listed = await rpc('tools/list', meta(), 1)
  const tools = toolMap(listed.tools)
  const requiredTools = ['betterpptx.assets.upload', 'betterpptx.deck.generate_from_spec', 'betterpptx.spec.export_bundle']
  for (const name of requiredTools) assert.ok(tools.has(name), `Public route omitted ${name}.`)

  let id = 10
  async function call(name, args) {
    validateInput(tools, name, args)
    const result = await rpc('tools/call', { name, arguments: args, ...meta() }, id++)
    const envelope = result?.structuredContent
    assert.ok(envelope?.ok === true && envelope.data, `${name} did not return a successful BetterPPTX envelope.`)
    const tool = tools.get(name)
    if (tool.outputSchema) {
      const validate = ajv.compile(tool.outputSchema)
      assert.equal(validate(envelope), true, `${name} result does not match tools/list: ${JSON.stringify(validate.errors)}`)
    }
    assertPublicText(envelope.data)
    return envelope.data
  }

  const uploaded = await call('betterpptx.assets.upload', {
    kind: 'jsonSpec',
    data: `data:application/json;base64,${sourceBytes.toString('base64')}`,
    fileName: 'symphony-corrected-public-acceptance.json',
    idempotencyKey: `symphony-public-acceptance-${sha256(sourceBytes).slice(0, 16)}`,
  })
  const specHandle = uploaded.handle || uploaded.asset?.handle
  assert.ok(typeof specHandle === 'string' && specHandle.length > 0, 'JSON-spec upload did not return an opaque handle.')
  const dryRun = await call('betterpptx.deck.generate_from_spec', {
    specHandle,
    phase: 'dryRun',
    dryRun: true,
    detail: 'summary',
  })
  assert.equal(dryRun.phase, 'dryRun')
  assert.equal(dryRun.dryRun, true)
  assert.equal(dryRun.deckId, undefined, 'SYMPHONY public dry-run unexpectedly created a deck.')
  assert.equal(dryRun.slideCount, 20)
  assert.equal(dryRun.mutationFree, true)
  const decisionSummary = dryRun.appliedDefaults?.decisionSummary || dryRun.decisionSummary
  assert.equal(decisionSummary?.status, 'review')
  assert.equal(decisionSummary?.quality?.blockingFindingCount, 0)
  const domainContract = dryRun.semanticRoundtrip?.domainContract || {}
  assert.deepEqual(domainContract.contentStory, spec.contentStory)
  assert.equal(domainContract.visualDesign?.world, spec.visualDesign.world)
  assert.equal(domainContract.visualDesign?.mode, spec.styleIntent.mode)
  assert.equal(domainContract.visualDesign?.framing, spec.visualDesign.framing)
  assert.equal(domainContract.visualDesign?.worldRole, 'descriptive-intent')
  assert.equal(domainContract.visualDesign?.worldIntent, spec.visualDesign.world)
  assert.equal(domainContract.visualDesign?.selectedWorld, 'editorial')
  assert.equal(domainContract.visualDesign?.effectiveWorld, 'editorial')
  assert.equal(domainContract.visualDesign?.selectionSource, 'styleIntent.artDirection')
  const plannedRepresentationCounts = {}
  for (const object of (dryRun.slides || []).flatMap(slide => slide.objects || [])) {
    const representation = object.contentRepresentation?.plannedRepresentation
    if (representation) plannedRepresentationCounts[representation] = (plannedRepresentationCounts[representation] || 0) + 1
  }
  assert.equal(plannedRepresentationCounts['native-chart'], 3)
  assert.equal(plannedRepresentationCounts['native-table'], 1)
  assert.equal(plannedRepresentationCounts['native-smartart'], 1)
  const timingSlides = dryRun.timingSpine?.slides || []
  assert.equal(timingSlides.filter(slide => slide.explicitNarration).length, 20)
  assert.equal(timingSlides.filter(slide => slide.timingEvidence === 'measured-audio').length, 0)
  const unresolvedRequirements = dryRun.resolution?.requirements || []
  assert.ok(Array.isArray(unresolvedRequirements), 'Public readback must expose resolution requirements as an array.')

  const bundle = await call('betterpptx.spec.export_bundle', { specHandle, download: false })
  assert.ok(bundle.mode, 'Portable spec export did not return a mode.')

  return {
    schemaVersion: 'betterpptx.public-symphony-authoring.v1',
    status: 'PASS',
    endpoint,
    source: { path: sourcePath, bytes: stat.size, sha256: sha256(sourceBytes) },
    deployedIdentity: {
      semanticVersion: health.semanticVersion,
      toolSchemaVersion: health.toolSchemaVersion,
      capabilityContentDigest: health.capabilityContentDigest,
      advertisedToolSchemaDigest: health.advertisedToolSchemaDigest,
    },
    upload: { kind: uploaded.kind, slideCount: uploaded.slideCount, handlePrefix: specHandle.slice(0, 16) },
    dryRun: {
      phase: dryRun.phase,
      slideCount: dryRun.slideCount,
      mutationFree: dryRun.mutationFree,
      status: decisionSummary?.status,
      blockingFindingCount: decisionSummary?.quality?.blockingFindingCount,
      plannedRepresentationCounts,
      explicitNarrationSlides: timingSlides.filter(slide => slide.explicitNarration).length,
      measuredTimingSlides: timingSlides.filter(slide => slide.timingEvidence === 'measured-audio').length,
      unresolvedRequirementCount: unresolvedRequirements.length,
      semanticReadback: {
        contentStory: domainContract.contentStory,
        visualDesign: domainContract.visualDesign,
      },
    },
    export: { mode: bundle.mode },
  }
}

run().then(value => process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)).catch(error => {
  process.stderr.write(`${JSON.stringify({ schemaVersion: 'betterpptx.public-symphony-authoring.v1', status: 'FAIL', message: error.message }, null, 2)}\n`)
  process.exitCode = 1
})
