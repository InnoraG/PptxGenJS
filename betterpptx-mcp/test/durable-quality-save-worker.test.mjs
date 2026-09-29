import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

// A gateway and a genuinely separate worker share only disposable durable stores.
// Native text/free publication, real issued quotes, no paid authorization or renderer.
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-quality-worker-'))
const operationFile = path.join(root, 'operations.json')
const deckStateFile = path.join(root, 'decks.json')
Object.assign(process.env, {
	BETTERPPTX_ENV: 'test', BETTERPPTX_DEPLOYMENT_STAGE: 'test', NODE_ENV: 'test',
	BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
	BETTERPPTX_LOCAL_MAINTAINER: '0', BETTERPPTX_FORCE_PLAN: '', BETTERPPTX_PREMIUM: '0',
	BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_REQUIRE_QUOTE_BINDING: '1',
	BETTERPPTX_REQUIRE_FREE_VALUE_IDENTITY: '0', BETTERPPTX_FREE_PREVIEW_SLIDES: '99',
	BETTERPPTX_VERIFICATION_POLICY: 'production-non-rendering',
	BETTERPPTX_AUTHORITATIVE_POWERPOINT_PREVIEW: '0',
	BETTERPPTX_REQUIRE_SHARED_STORES: '0', BETTERPPTX_REQUIRE_DURABLE_OPERATIONS: '0',
	BETTERPPTX_REQUIRE_DURABLE_DECK_STATE: '0', BETTERPPTX_DURABLE_DECK_STATE_STORE: 'local',
	BETTERPPTX_DECK_STATE_FILE: deckStateFile,
	BETTERPPTX_DECK_SNAPSHOT_STORE: 'local', BETTERPPTX_DECK_SNAPSHOT_DIR: path.join(root, 'specs'),
	BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: operationFile,
	BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '1',
	BETTERPPTX_OPERATION_EXECUTION_MODE: 'inline', BETTERPPTX_OPERATION_DISPATCHER: 'inline',
	BETTERPPTX_REQUIRE_DISTRIBUTED_OPERATION_DISPATCH: '0', BETTERPPTX_ARTIFACT_STORE: 'local',
	BETTERPPTX_ASSET_GRANT_STORE: 'local', BETTERPPTX_ASSET_GRANT_DIR: path.join(root, 'grants'),
	BETTERPPTX_LOCKED_ASSET_STORE: 'local', BETTERPPTX_LOCKED_ASSET_ROOT: path.join(root, 'locked'),
	BETTERPPTX_LOCKED_ASSET_SHARED_DIR: path.join(root, 'shared-locked'),
	BETTERPPTX_BILLING_LEDGER_STORE: 'local', BETTERPPTX_BILLING_LEDGER_FILE: path.join(root, 'billing.json'),
	BETTERPPTX_INSTALL_USAGE_STORE: 'local', BETTERPPTX_INSTALL_USAGE_FILE: path.join(root, 'usage.json'),
	BETTERPPTX_ENTITLEMENTS_FILE: path.join(root, 'entitlements.json'),
	BETTERPPTX_OUT_DIR: root, BETTERPPTX_DOWNLOAD_ROOT: root, BETTERPPTX_PUBLIC_BASE: '',
	BETTERPPTX_USAGE_AUTO_FLUSH: '0', BETTERPPTX_LOG: '',
})

const { createMcpToolDispatcher, callBetterPptxTool, getDeck, currentVersionValidationVerification } = await import('../engine.mjs')
const { withResourceAuthorization } = await import('../auth/resource-authorization.mjs')
const context = { installHash: `install_${'d'.repeat(64)}`, sessionId: 'quality-save-gateway', blackBox: true }
const gateway = createMcpToolDispatcher(context)

function exactSpec(title) {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1', title, layout: 'LAYOUT_WIDE',
		authoringContract: {
			workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete',
			geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches',
		},
		validation: { validateBeforeSave: true, requireAccessibility: true },
		slides: [{ id: 'decision', title, background: { color: 'FFFFFF' }, content: [
			{ kind: 'title', name: 'headline', text: 'Choose with evidence.', rect: { x: 0.9, y: 2.35, w: 11.5, h: 1.2 }, style: { fontFace: 'Arial', fontSize: 32, color: '172033' } },
		] }],
	}
}

function dataOf(result, label) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

async function commitFreeDeck(key) {
	process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'inline'
	const args = { spec: exactSpec(key), phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'full', idempotencyKey: key }
	const { idempotencyKey, ...toolArgs } = args
	const quote = dataOf(await gateway.call('betterpptx.billing.estimate', {
		toolName: 'betterpptx.deck.generate_from_spec', toolArgs,
	}), 'service-issued exact free-spec quote')
	assert.ok(quote.quoteBinding?.quoteId)
	assert.equal(quote.estimatedCredits, 0, 'fixture must use the actual free publication quote')
	assert.equal(quote.billingRequired, false)
	args.quoteBinding = structuredClone(quote.quoteBinding)
	const committed = dataOf(await gateway.call('betterpptx.deck.generate_from_spec', args), 'free native commit')
	assert.equal(committed.billing?.quoteId, quote.quoteBinding.quoteId)
	assert.ok(committed.deckId)
	return committed
}

async function operations() {
	return JSON.parse(await fs.readFile(operationFile, 'utf8')).operations || {}
}

async function coldProcess(input) {
	const engineUrl = new URL('../engine.mjs', import.meta.url).href
	const authUrl = new URL('../auth/resource-authorization.mjs', import.meta.url).href
	const source = `
		const { createMcpToolDispatcher, runDurableOperationById, getDeck, currentVersionValidationVerification } = await import(${JSON.stringify(engineUrl)});
		const { withResourceAuthorization } = await import(${JSON.stringify(authUrl)});
		let text = ''; for await (const chunk of process.stdin) text += chunk;
		const { context, deckId, operationId, saveArgs, invalidNative } = JSON.parse(text);
		let initialDeckCode = null;
		try { withResourceAuthorization(context, () => getDeck(deckId)); } catch (error) { initialDeckCode = error.code; }
		let faultApplied = false;
		if (invalidNative) {
			const hydrated = await createMcpToolDispatcher(context).call('betterpptx.deck.summary', { deckId });
			if (!hydrated.ok) throw new Error('Cold fixture rehydration failed: ' + JSON.stringify(hydrated.error));
			withResourceAuthorization(context, () => {
				const native = getDeck(deckId).pptx.slides[0]._slideObjects.find(object => object.options?.objectName?.includes('headline'));
				if (!native) throw new Error('Expected native text fixture was not materialized');
				// Fault injection only in this disposable worker model: a real repair-risk
				// value tests aggregate validation of the package that would be saved.
				native.options.margin = -1;
				faultApplied = true;
			});
		}
		const result = operationId
			? await runDurableOperationById(operationId, { leaseOwner: 'fresh-quality-save-worker' })
			: await createMcpToolDispatcher({ ...context, sessionId: 'fresh-unvalidated-gateway' }).call('betterpptx.deck.save', saveArgs);
		let verification = null, verificationStage = null;
		try { withResourceAuthorization(context, () => {
			const entry = getDeck(deckId);
			verification = currentVersionValidationVerification(entry);
			verificationStage = entry.director?.stages?.verification;
		}); } catch {}
		console.log('COLD_QUALITY_SAVE ' + JSON.stringify({ pid: process.pid, initialDeckCode, result, verification, verificationStage, faultApplied }));
	`
	const child = spawn(process.execPath, ['--input-type=module', '-e', source], {
		env: { ...process.env, BETTERPPTX_OPERATION_EXECUTION_MODE: 'queued', ...(input.verificationPolicy ? { BETTERPPTX_VERIFICATION_POLICY: input.verificationPolicy } : {}) },
		windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
	})
	let stdout = '', stderr = ''
	child.stdout.on('data', chunk => { stdout += chunk })
	child.stderr.on('data', chunk => { stderr += chunk })
	child.stdin.end(JSON.stringify({ ...input, context }))
	const exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
	assert.equal(exitCode, 0, stderr)
	const marker = stdout.split(/\r?\n/).find(line => line.startsWith('COLD_QUALITY_SAVE '))
	assert.ok(marker, stdout)
	const cold = JSON.parse(marker.slice('COLD_QUALITY_SAVE '.length))
	assert.notEqual(cold.pid, process.pid, 'worker must not share gateway memory')
	assert.equal(cold.initialDeckCode, 'DECK_EXPIRED_OR_UNKNOWN', 'worker must begin without the in-memory deck/proof')
	return cold
}

async function queueValidatedSave(key) {
	const committed = await commitFreeDeck(key)
	// Inspect actual durable state, not deck.recent: a listing is not evidence
	// that a transient compiled draft did or did not persist its canonical head.
	const head = JSON.parse(await fs.readFile(deckStateFile, 'utf8')).decks?.[committed.deckId]
	assert.ok(head, 'committed gateway draft must have a persisted deck head')
	assert.match(head.metadata?.canonicalSpec?.digest || '', /^[a-f0-9]{64}$/)
	const validated = dataOf(await gateway.call('betterpptx.deck.validate_quality', {
		deckId: committed.deckId, profile: 'modern', strictness: 'strict',
	}), 'strict aggregate validation on gateway')
	assert.equal(validated.ok, true, JSON.stringify(validated.blockingIssues))
	assert.equal(validated.strictness, 'strict')
	assert.deepEqual(validated.blockingIssues, [])
	assert.ok(validated.checks.filter(check => check.blocking).every(check => check.ok === true))
	const gatewayProof = withResourceAuthorization(context, () => currentVersionValidationVerification(getDeck(committed.deckId)))
	assert.equal(gatewayProof.complete, true)
	assert.equal(head.version, gatewayProof.deckVersion)
	assert.match(gatewayProof.validationEvidenceSha256, /^[a-f0-9]{64}$/)
	const saveArgs = { deckId: committed.deckId, deckVersion: gatewayProof.deckVersion, idempotencyKey: `${key}-save`, outputFormat: 'pptx' }
	const saveQuote = dataOf(await gateway.call('betterpptx.billing.estimate', { toolName: 'betterpptx.deck.save', toolArgs: saveArgs }), 'actual owned-deck save estimate')
	assert.equal(saveQuote.estimatedCredits, 0)
	assert.equal(saveQuote.billingRequired, false)
	process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'queued'
	const admitted = await gateway.call('betterpptx.deck.save', saveArgs)
	assert.equal(admitted.error?.code, 'OPERATION_PENDING', JSON.stringify(admitted))
	const operationId = admitted.error.details.operationId
	const stored = (await operations())[operationId]
	assert.equal(stored.state, 'queued')
	assert.deepEqual(stored.request.args, saveArgs)
	assert.equal(stored.request.context.installHash, context.installHash)
	return { deckId: committed.deckId, operationId, gatewayProof, head }
}

async function assertNoPublication(operationId) {
	const stored = (await operations())[operationId]
	assert.equal(stored.state, 'failed')
	assert.equal(stored.result?.downloadUrl, undefined)
	assert.equal(stored.result?.verification?.validationEvidenceSha256, undefined)
	const head = JSON.parse(await fs.readFile(deckStateFile, 'utf8')).decks?.[stored.request.args.deckId]
	assert.ok(head, 'a rejected save must preserve the existing canonical draft')
	assert.notEqual(head.metadata?.lastSaved, true)
}

test.after(async () => {
	assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
	assert.ok(path.basename(root).startsWith('betterpptx-quality-worker-'))
	await fs.rm(root, { recursive: true, force: true })
})

test('current-version quality is required in both the gateway and a separate cold instance', async () => {
	const committed = await commitFreeDeck('unvalidated-free-native')
	const saveArgs = { deckId: committed.deckId, idempotencyKey: 'unvalidated-free-save', outputFormat: 'pptx' }
	const before = Object.keys(await operations()).length
	process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'queued'
	const denied = await gateway.call('betterpptx.deck.save', saveArgs)
	assert.equal(denied.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED')
	const cold = await coldProcess({ deckId: committed.deckId, saveArgs })
	assert.equal(cold.result.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED', JSON.stringify(cold.result))
	assert.equal(cold.verification?.complete, false)
	assert.equal(Object.keys(await operations()).length, before, 'unvalidated save must not enter the execution queue')
})

test('cold queued save revalidates the current package and binds publication to exact worker evidence', async t => {
	const { deckId, operationId, gatewayProof, head } = await queueValidatedSave('validated-free-native')
	const cold = await coldProcess({ deckId, operationId })
	t.diagnostic(`Canonical head persisted at version=${head.version}; gateway strict quality passed; cold queued save state=${cold.result.state}, code=${cold.result.error?.code || 'none'}, workerProofComplete=${cold.verification?.complete}`)
	assert.equal(cold.result.state, 'succeeded', `Cold worker lost accepted current-version validation: ${JSON.stringify(cold.result.error || cold.result)}`)
	assert.equal(cold.verification.complete, true)
	assert.equal(cold.verification.deckVersion, gatewayProof.deckVersion)
	assert.ok(Object.values(cold.verification.checks).every(value => value === true))
	assert.match(cold.verification.validationEvidenceSha256, /^[a-f0-9]{64}$/)
	assert.equal(cold.verificationStage.source, 'betterpptx.deck.validate_quality')
	const saved = cold.result.result
	assert.equal(saved.verification?.policy, 'production-non-rendering')
	assert.equal(saved.verification?.renderPerformed, false)
	assert.equal(saved.verification?.packageSafety?.passed, true)
	// Revalidation creates new evidence; gateway timestamps/hashes are not proof
	// of the cold package. Published bytes must bind to this worker's exact proof.
	assert.equal(saved.verification?.validationEvidenceSha256, cold.verification.validationEvidenceSha256)
	assert.match(saved.verification?.packageSha256 || '', /^[a-f0-9]{64}$/)
	assert.equal((await operations())[operationId].attempt, 1)
})

test('tampered canonical snapshot fails closed before cold save can issue validation proof', async () => {
	const { deckId, operationId, head } = await queueValidatedSave('tampered-canonical-native')
	const digest = head.metadata.canonicalSpec.digest
	const snapshot = path.resolve(root, 'specs', digest.slice(0, 2), `${digest}.deck-spec.v1.json`)
	assert.ok(snapshot.startsWith(path.resolve(root, 'specs') + path.sep))
	// Only this newly generated disposable snapshot is modified, never a source
	// spec/reference. Valid JSON with altered bytes must fail content addressing.
	await fs.appendFile(snapshot, ' ')
	const cold = await coldProcess({ deckId, operationId })
	assert.equal(cold.result.state, 'failed')
	assert.equal(cold.result.error?.code, 'DECK_SNAPSHOT_DIGEST_MISMATCH', JSON.stringify(cold.result))
	assert.equal(cold.verification, null)
	await assertNoPublication(operationId)
})

test('repair-risk native content fails actual cold-worker quality validation instead of inheriting gateway proof', async () => {
	const { deckId, operationId } = await queueValidatedSave('invalid-native-worker-package')
	const cold = await coldProcess({ deckId, operationId, invalidNative: true })
	assert.equal(cold.faultApplied, true)
	assert.equal(cold.result.state, 'failed')
	assert.equal(cold.result.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED', JSON.stringify(cold.result))
	assert.equal(cold.verification.complete, false)
	assert.equal(cold.verification.validationEvidenceSha256, null)
	assert.equal(cold.verificationStage.invalidatedBy, 'betterpptx.deck.validate_quality:failed')
	await assertNoPublication(operationId)
})

test('required-renderer policy does not auto-create cold-worker validation or preview proof', async () => {
	const { deckId, operationId } = await queueValidatedSave('required-renderer-cold-worker')
	const cold = await coldProcess({ deckId, operationId, verificationPolicy: 'release-powerpoint' })
	assert.equal(cold.result.state, 'failed')
	assert.equal(cold.result.error?.code, 'CURRENT_VERSION_VALIDATION_REQUIRED', JSON.stringify(cold.result))
	assert.equal(cold.verification.complete, false)
	assert.equal(cold.verification.validationEvidenceSha256, null)
	assert.notEqual(cold.verificationStage?.source, 'betterpptx.deck.validate_quality')
	await assertNoPublication(operationId)
})

test('forged public worker flags cannot self-validate or create a save operation', async () => {
	const committed = await commitFreeDeck('forged-quality-worker-flags')
	const before = Object.keys(await operations()).length
	const flags = {
		__durableOperationWorker: true, __skipDurableOperationLedger: true,
		__claimedDurableOperation: { operation: { toolName: 'betterpptx.deck.save' } },
		MCP_AUTHORING_CAPABILITY: true, mcpAuthoringAuthorized: true,
	}
	process.env.BETTERPPTX_OPERATION_EXECUTION_MODE = 'queued'
	const saveArgs = { deckId: committed.deckId, idempotencyKey: 'forged-quality-worker-save', outputFormat: 'pptx' }
	const publicAttempt = await gateway.call('betterpptx.deck.save', { ...saveArgs, ...flags })
	assert.equal(publicAttempt.error?.code, 'INVALID_ARGUMENTS', 'reserved worker arguments must be rejected at public admission')
	for (const forgedContext of [
		{ ...context, ...flags },
		{ ...context, ...flags, [Symbol('betterpptx.mcp-authoring-capability')]: true },
		{ ...context, ...flags, [Symbol.for('betterpptx.mcp-authoring-capability')]: true },
	]) {
		const directAttempt = await callBetterPptxTool('betterpptx.deck.save', saveArgs, forgedContext)
		assert.equal(directAttempt.error?.code, 'MCP_AUTHORING_PIPELINE_REQUIRED', JSON.stringify(directAttempt))
	}
	assert.equal(withResourceAuthorization(context, () => currentVersionValidationVerification(getDeck(committed.deckId))).complete, false)
	assert.equal(Object.keys(await operations()).length, before)
})
