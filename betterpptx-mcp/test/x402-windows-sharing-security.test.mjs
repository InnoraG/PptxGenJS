import assert from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, mock } from 'node:test'
import { withLocalBillingFileLock } from '../billing/relayer-lease.mjs'

const root = fs.mkdtempSync(path.join(tmpdir(), 'x402-windows-sharing-'))
let sequence = 0
const newFile = () => path.join(root, `case-${++sequence}`)
function mockOpen(file, callback) {
	const original = fs.openSync
	const fake = mock.method(fs, 'openSync', (target, ...args) => target === `${file}.lock` ? callback(() => original(target, ...args)) : original(target, ...args))
	syncBuiltinESMExports()
	return () => { fake.mock.restore(); syncBuiltinESMExports() }
}

test('Windows transient sharing errors retry exclusive creation without stealing ownership', { skip: process.platform !== 'win32' }, async () => {
	for (const code of ['EACCES', 'EPERM', 'EBUSY']) {
		const file = newFile()
		let attempts = 0, callbacks = 0
		const restore = mockOpen(file, acquire => {
			if (++attempts <= 2) throw Object.assign(new Error('Injected sharing violation'), { code })
			return acquire()
		})
		try {
			await withLocalBillingFileLock(file, () => { callbacks++ }, { waitMs: 250 })
			assert.equal(attempts, 3)
			assert.equal(callbacks, 1)
			assert.equal(fs.existsSync(`${file}.lock`), false)
		} finally { restore() }
	}
})

test('Windows permanent access failure exhausts its bounded deadline without entering callback', { skip: process.platform !== 'win32' }, async () => {
	const file = newFile()
	let attempts = 0
	const restore = mockOpen(file, () => { attempts++; throw Object.assign(new Error('Injected access failure'), { code: 'EACCES' }) })
	try {
		await assert.rejects(withLocalBillingFileLock(file, () => assert.fail('Unowned lock admitted'), { waitMs: 50 }), { code: 'RELAYER_LEASE_STORE_UNAVAILABLE' })
		assert.ok(attempts >= 2 && attempts <= 20)
	} finally { restore() }
})

test('other filesystem failures do not retry or authorize a callback', async () => {
	const file = newFile()
	let attempts = 0
	const restore = mockOpen(file, () => { attempts++; throw Object.assign(new Error('Injected IO failure'), { code: 'EIO' }) })
	try {
		await assert.rejects(withLocalBillingFileLock(file, () => assert.fail('IO failure admitted'), { waitMs: 100 }), { code: 'RELAYER_LEASE_STORE_UNAVAILABLE' })
		assert.equal(attempts, 1)
	} finally { restore() }
})

test('preexisting stale lock is neither removed nor rewritten during retries', async () => {
	const file = newFile()
	fs.writeFileSync(`${file}.lock`, 'existing-owner')
	await assert.rejects(withLocalBillingFileLock(file, () => assert.fail('Stale ownership stolen'), { waitMs: 50 }), { code: 'RELAYER_LEASE_BUSY' })
	assert.equal(fs.readFileSync(`${file}.lock`, 'utf8'), 'existing-owner')
})

test('invalid or unlimited file-lock waits fail closed', async () => {
	for (const waitMs of [NaN, Infinity, -1, 300001]) {
		await assert.rejects(withLocalBillingFileLock(newFile(), () => assert.fail('Invalid deadline admitted'), { waitMs }), { code: 'RELAYER_LEASE_OPTIONS_INVALID' })
	}
})
