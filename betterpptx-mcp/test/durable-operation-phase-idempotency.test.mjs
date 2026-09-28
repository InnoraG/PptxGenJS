import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-phase-idempotency-'))
const operationFile = path.join(tempRoot, 'operations.json')
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test',
	BETTERPPTX_DEPLOYMENT_STAGE: 'test',
	NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_BILLING_ENFORCE: '0',
	BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0',
	BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local',
	BETTERPPTX_OPERATION_STORE_FILE: operationFile,
	BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1',
	BETTERPPTX_OPERATION_EXECUTION_MODE: 'inline',
	BETTERPPTX_OUT_DIR: tempRoot,
	BETTERPPTX_DOWNLOAD_ROOT: tempRoot,
	BETTERPPTX_INSTALL_USAGE_FILE: path.join(tempRoot, 'install-usage.json'),
	BETTERPPTX_USAGE_AUTO_FLUSH: '0',
	BETTERPPTX_LOG: '',
})

const { createMcpToolDispatcher } = await import('../engine.mjs')
const { TOOLS } = await import('../tools.mjs')
const mcp = createMcpToolDispatcher({
	sessionId: 'phase-aware-idempotency-test',
	installHash: `install_${'a'.repeat(64)}`,
	blackBox: true,
})

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Mutation-free dry-run idempotency test',
	authoringContract: {
		workflow: 'ai-sovereign-v1',
		creativeAuthority: 'ai',
		directorMode: 'off',
		verificationMode: 'complete',
		geometryAuthority: 'ai',
		placementPolicy: 'ai-authored-geometry-v1',
		coordinateSystem: 'inches',
	},
	slides: [{
		id: 'dry-run',
		title: 'Dry run',
		content: [{ kind: 'textBox', name: 'label', text: 'No durable write', rect: { x: 1, y: 1, w: 4, h: 1 } }],
	}],
}

async function operationCount() {
	try {
		const store = JSON.parse(await fs.readFile(operationFile, 'utf8'))
		return Object.keys(store.operations || {}).length
	} catch (error) {
		if (error.code === 'ENOENT') return 0
		throw error
	}
}

test.after(async () => {
	await fs.rm(tempRoot, { recursive: true, force: true })
})

test('public generation schema explains the phase-specific retry-key boundary', () => {
	const tool = TOOLS.find(item => item.name === 'betterpptx.deck.generate_from_spec')
	const description = tool?.inputSchema?.properties?.idempotencyKey?.description || ''
	assert.match(description, /resolve\/commit/)
	assert.match(description, /dryRun and lockedDryRun do not require/)
	assert.match(description, /does not authorize payment/)
})

test('hosted durable-idempotency policy permits mutation-free dryRun without a key and skips ledger writes', async () => {
	const withoutKey = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'summary',
	})
	assert.equal(withoutKey.ok, true, JSON.stringify(withoutKey.error || withoutKey))
	assert.equal(withoutKey.data?.phase, 'dryRun')
	assert.equal(withoutKey.data?.mutationFree, true)
	assert.equal(await operationCount(), 0, 'A mutation-free dry run must not create a durable operation record.')

	const withKey = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'dryRun',
		commitMode: 'createNew',
		detail: 'summary',
		idempotencyKey: 'dry-run-must-not-enter-ledger',
	})
	assert.equal(withKey.ok, true, JSON.stringify(withKey.error || withKey))
	assert.equal(withKey.data?.phase, 'dryRun')
	assert.equal(await operationCount(), 0, 'Supplying a key must not turn dryRun into a durable write.')
})

test('the same deployment policy still requires a key for commit', async () => {
	const result = await mcp.call('betterpptx.deck.generate_from_spec', {
		spec,
		phase: 'commit',
		commitMode: 'createNew',
	})
	assert.equal(result.ok, false)
	assert.equal(result.error?.code, 'IDEMPOTENCY_KEY_REQUIRED', JSON.stringify(result))
	assert.equal(await operationCount(), 0, 'A rejected commit must not create an operation or deck.')
})
