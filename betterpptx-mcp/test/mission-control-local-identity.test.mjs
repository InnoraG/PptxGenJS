import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import {
	getMissionControlSecretsSnapshot, revealMissionControlSecret,
	updateMissionControlSecret, rotateMissionControlSecret, testMissionControlSecret,
} from '../mission-control-secrets.mjs'

const names = {
	install_hmac_secret: 'install-hmac-secret',
	identity_postgres_password: 'postgres-password',
	identity_bootstrap_admin_password: 'bootstrap-admin-password',
}
const hash = value => createHash('sha256').update(value).digest('hex').slice(0, 16)
const noNetwork = async () => { throw new Error('No network calls are permitted in these tests.') }

function fixture(t) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'betterpptx-mc-identity-'))
	fs.chmodSync(root, 0o700)
	fs.mkdirSync(path.join(root, 'secrets'), { mode: 0o700 })
	const values = Object.fromEntries(Object.entries(names).map(([id], index) => [id, String.fromCharCode(65 + index).repeat(64)]))
	const manifest = Object.entries(names).map(([id, name], index) => {
		fs.writeFileSync(path.join(root, 'secrets', name), values[id] + '\n', { mode: 0o600 })
		return { name, status: 'staged-not-activated', fingerprint: hash(values[id]), source: 'synthetic provisioner fixture', version: String(index + 1).repeat(16), createdAt: '2026-09-20T00:00:00.000Z', activatedAt: null, lastRotatedAt: null, dependentServices: [] }
	})
	fs.writeFileSync(path.join(root, 'credential-status.json'), JSON.stringify(manifest), { mode: 0o600 })
	const settings = {
		BETTERPPTX_MC_SECRET_BACKEND: 'local-identity',
		BETTERPPTX_MC_LOCAL_IDENTITY_ROOT: root,
		BETTERPPTX_SELF_HOSTED_IDENTITY: '1',
		BETTERPPTX_INSTALL_HMAC_SECRET: values.install_hmac_secret,
		BETTERPPTX_LOG: 'off', BETTERPPTX_TRACE: '0',
	}
	const previous = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]))
	Object.assign(process.env, settings)
	t.after(() => {
		for (const [key, value] of Object.entries(previous)) {
			if (value === undefined) delete process.env[key]
			else process.env[key] = value
		}
		assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
		assert.ok(path.basename(root).startsWith('betterpptx-mc-identity-'))
		fs.rmSync(root, { recursive: true, force: true })
	})
	return { root, values }
}

function checkRedacted(secret, id) {
	assert.equal(secret.id, id)
	assert.equal(secret.status, 'staged-not-activated')
	assert.equal(secret.configured, true)
	assert.match(secret.fingerprint, /^sha256:[a-f0-9]{16}$/)
	assert.equal(secret.source.type, 'local-identity-file')
	assert.equal(secret.source.secretName, names[id])
	assert.equal(secret.activeVersion, null)
	assert.equal(secret.activeVersionState, 'UNVERIFIED')
	assert.equal(secret.lastRotationTime, null)
	assert.ok(secret.dependentServices.length)
	assert.deepEqual(secret.actions, { reveal: true, update: true, rotate: true, test: true, activate: false })
	assert.equal(secret.activation.activated, false)
	assert.equal(secret.activation.runtimeVerified, false)
	assert.equal(secret.activation.status, 'blocked')
	assert.ok(secret.activation.blockers.length)
	assert.equal(secret.value, undefined)
}

test('private identity snapshot schema is redacted and does not infer activation from file presence or env equality', async t => {
	const { root, values } = fixture(t)
	const snapshot = await getMissionControlSecretsSnapshot({ fetchImpl: noNetwork })
	for (const id of Object.keys(names)) {
		const secret = snapshot.secrets.find(item => item.id === id)
		checkRedacted(secret, id)
		assert.equal(secret.valueState, 'configured-file-unverified')
		assert.equal(secret.stagedVersions.length, 0)
		assert.equal(secret.configuredFile.fingerprint, `sha256:${hash(values[id])}`)
		assert.equal(JSON.stringify(snapshot).includes(values[id]), false)
	}
	assert.equal(JSON.stringify(snapshot).includes(root), false)
	assert.equal(snapshot.secrets.find(item => item.id === 'install_hmac_secret').activation.blockers[0].code, 'IDENTITY_DATA_MIGRATION_REQUIRED')
	assert.equal(snapshot.secrets.find(item => item.id === 'identity_postgres_password').activation.blockers[0].code, 'DATABASE_ROLE_PASSWORD_CHANGE_REQUIRED')
	assert.equal(snapshot.secrets.find(item => item.id === 'identity_bootstrap_admin_password').activation.blockers[0].code, 'BOOTSTRAP_IS_NOT_ADMIN_ROTATION')
})

test('update and rotate write provisioner-compatible staged versions only; reveal/test follow the displayed candidate', async t => {
	const { root, values } = fixture(t)
	const originalManifest = fs.readFileSync(path.join(root, 'credential-status.json'), 'utf8')
	for (const id of Object.keys(names)) {
		const replacement = 'owner_supplied_synthetic_candidate_'.repeat(2)
		const updated = await updateMissionControlSecret(id, { value: replacement, confirm: `UPDATE ${id}`, fetchImpl: noNetwork })
		checkRedacted(updated.secret, id)
		assert.equal(updated.secret.valueState, 'staged-rotation')
		assert.equal(JSON.stringify(updated).includes(replacement), false)
		const metadataPath = path.join(root, 'rotations', `${names[id]}-${updated.secret.valueVersion}.json`)
		const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'))
		assert.equal(metadata.status, 'staged-not-activated')
		assert.equal(metadata.activatedAt, null)
		assert.equal(metadata.lastRotatedAt, null)
		assert.equal(metadata.fingerprint, hash(replacement))
		const revealed = await revealMissionControlSecret(id, { confirm: `REVEAL ${id}` })
		assert.equal(revealed.value, replacement)
		assert.equal(revealed.activeVersion, null)
		assert.equal(revealed.valueState, 'staged-rotation')
		const rotated = await rotateMissionControlSecret(id, { confirm: `ROTATE ${id}` })
		checkRedacted(rotated.secret, id)
		assert.equal(rotated.secret.stagedVersions.length, 2)
		assert.notEqual(rotated.secret.valueVersion, updated.secret.valueVersion)
		const checked = await testMissionControlSecret(id, { fetchImpl: noNetwork })
		assert.equal(checked.ok, true)
		assert.equal(checked.activeVersion, null)
		assert.equal(checked.test.configurationOnly, true)
		assert.equal(checked.test.runtimeVerified, false)
		assert.equal(checked.test.activation.activated, false)
		assert.equal(fs.readFileSync(path.join(root, 'secrets', names[id]), 'utf8').trim(), values[id])
	}
	assert.equal(process.env.BETTERPPTX_INSTALL_HMAC_SECRET, values.install_hmac_secret)
	assert.equal(fs.readFileSync(path.join(root, 'credential-status.json'), 'utf8'), originalManifest)
	const audit = fs.readFileSync(path.join(root, 'mission-control-audit.ndjson'), 'utf8')
	const events = audit.trim().split('\n').map(JSON.parse)
	assert.equal(events.length, 12)
	assert.deepEqual([...new Set(events.map(item => item.action))].sort(), ['reveal', 'rotate', 'test', 'update'])
	for (const value of [...Object.values(values), 'owner_supplied_synthetic_candidate_'.repeat(2)]) assert.equal(audit.includes(value), false)
})

test('staged versions survive cold reload without cloud access or process-memory state', async t => {
	fixture(t)
	const rotated = await rotateMissionControlSecret('install_hmac_secret', { confirm: 'ROTATE install_hmac_secret' })
	const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
		import { getMissionControlSecretsSnapshot } from ${JSON.stringify(new URL('../mission-control-secrets.mjs', import.meta.url).href)};
		const result = await getMissionControlSecretsSnapshot({fetchImpl: async () => {throw new Error('Network forbidden')}});
		const record = result.secrets.find(item => item.id === 'install_hmac_secret');
		process.stdout.write(JSON.stringify({version: record.valueVersion, active: record.activeVersion, status: record.status}));
	`], { encoding: 'utf8', timeout: 15000 })
	assert.equal(child.status, 0, child.stderr || child.error?.message)
	assert.deepEqual(JSON.parse(child.stdout), { version: rotated.secret.valueVersion, active: null, status: 'staged-not-activated' })
})

test('allowlist, confirmations, value validation and unsafe storage fail closed', async t => {
	const { root } = fixture(t)
	for (const id of Object.keys(names)) {
		await assert.rejects(revealMissionControlSecret(id), { code: 'MC_SECRET_CONFIRMATION_REQUIRED' })
		await assert.rejects(rotateMissionControlSecret(id, { confirm: 'wrong' }), { code: 'MC_SECRET_CONFIRMATION_REQUIRED' })
		await assert.rejects(updateMissionControlSecret(id, { value: 'x'.repeat(40) + '\n', confirm: `UPDATE ${id}` }), { code: 'MC_LOCAL_IDENTITY_VALUE_INVALID' })
	}
	await assert.rejects(revealMissionControlSecret('../secrets/postgres-password', { confirm: 'REVEAL ../secrets/postgres-password' }), { code: 'MC_SECRET_NOT_ALLOWED' })
	assert.equal(fs.existsSync(path.join(root, 'rotations')), false)
	fs.writeFileSync(path.join(root, 'secrets', 'postgres-password'), 'changed_without_matching_metadata'.repeat(2))
	await assert.rejects(rotateMissionControlSecret('identity_postgres_password', { confirm: 'ROTATE identity_postgres_password' }), { code: 'MC_LOCAL_IDENTITY_STORAGE_INVALID' })
	const snapshot = await getMissionControlSecretsSnapshot({ fetchImpl: noNetwork })
	assert.equal(snapshot.secrets.find(item => item.id === 'identity_postgres_password').status, 'error')
})

test('symlinked rotation storage and audit sinks cannot redirect writes or release revealed values', async t => {
	const { root } = fixture(t)
	const target = path.join(root, 'elsewhere')
	fs.mkdirSync(target)
	fs.symlinkSync(target, path.join(root, 'rotations'), process.platform === 'win32' ? 'junction' : 'dir')
	await assert.rejects(rotateMissionControlSecret('install_hmac_secret', { confirm: 'ROTATE install_hmac_secret' }), { code: 'MC_LOCAL_IDENTITY_STORAGE_INVALID' })
	fs.unlinkSync(path.join(root, 'rotations'))
	const audit = path.join(root, 'mission-control-audit.ndjson')
	fs.mkdirSync(audit)
	await assert.rejects(revealMissionControlSecret('install_hmac_secret', { confirm: 'REVEAL install_hmac_secret' }), { code: 'MC_LOCAL_IDENTITY_AUDIT_UNAVAILABLE' })
	assert.deepEqual(fs.readdirSync(target), [])
})

test('env backend rotations are explicitly memory-only and never claim an active deployment version', async t => {
	fixture(t)
	process.env.BETTERPPTX_MC_SECRET_BACKEND = 'env'
	const id = 'scanner_token'
	const original = process.env.BETTERPPTX_SCANNER_TOKEN
	const rotated = await rotateMissionControlSecret(id, { confirm: `ROTATE ${id}` })
	assert.equal(rotated.secret.status, 'staged-memory-only')
	assert.equal(rotated.secret.activeVersion, null)
	assert.equal(rotated.secret.lastRotationTime, null)
	assert.equal(rotated.secret.activation.persisted, false)
	assert.equal(rotated.secret.activation.activated, false)
	assert.equal(process.env.BETTERPPTX_SCANNER_TOKEN, original)
	const revealed = await revealMissionControlSecret(id, { confirm: `REVEAL ${id}` })
	assert.equal(revealed.activeVersion, null)
	const checked = await testMissionControlSecret(id)
	assert.equal(checked.test.runtimeVerified, false)
	assert.equal(checked.test.activation.persisted, false)
})
