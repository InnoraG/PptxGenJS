import { spawnSync } from 'node:child_process'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
	const arg = process.argv[i]
	if (arg.startsWith('--') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
		args.set(arg, process.argv[++i])
	} else if (arg.startsWith('--')) {
		const [key, value] = arg.split('=', 2)
		args.set(key, value || '1')
	}
}

const base = String(args.get('--base') || process.env.BETTERPPTX_VERIFY_LIVE_BASE || '').replace(/\/+$/, '')
const project = String(args.get('--project') || process.env.BETTERPPTX_VERIFY_GCP_PROJECT || 'betterpptx-mcp-staging').trim()
const secretName = String(args.get('--secret') || process.env.BETTERPPTX_VERIFY_MISSION_CONTROL_SECRET || 'betterpptx-mission-control-token').trim()
const explicitToken = String(args.get('--token') || process.env.BETTERPPTX_MISSION_CONTROL_TOKEN || '').trim()

function fail(message, details = {}) {
	const error = new Error(message)
	error.details = details
	throw error
}

function runCommand(command, commandArgs) {
	const isWindows = process.platform === 'win32'
	const file = isWindows ? (process.env.ComSpec || 'cmd.exe') : command
	const cliArgs = isWindows ? ['/d', '/s', '/c', command, ...commandArgs] : commandArgs
	const result = spawnSync(file, cliArgs, {
		cwd: process.cwd(),
		encoding: 'utf8',
		windowsHide: true,
		stdio: ['ignore', 'pipe', 'pipe'],
	})
	if (result.error) throw result.error
	return {
		status: Number(result.status || 0),
		stdout: String(result.stdout || ''),
		stderr: String(result.stderr || ''),
	}
}

function readMissionControlToken() {
	if (explicitToken) return explicitToken
	if (!project) fail('A GCP project is required to read the Mission Control token.')
	const result = runCommand('gcloud', [
		'secrets',
		'versions',
		'access',
		'latest',
		`--secret=${secretName}`,
		`--project=${project}`,
	])
	if (result.status !== 0) {
		fail('Unable to read Mission Control token from Secret Manager.', {
			status: result.status,
			stderrTail: result.stderr.slice(-500),
		})
	}
	const token = result.stdout.trim()
	if (!token) fail('Mission Control token secret was empty.')
	return token
}

async function readJson(url, { token = '' } = {}) {
	const headers = { Accept: 'application/json' }
	if (token) headers['x-betterpptx-mission-control-token'] = token
	const response = await fetch(url, { method: 'GET', headers })
	const raw = await response.text()
	let body = null
	try { body = raw ? JSON.parse(raw) : null } catch {}
	return {
		status: response.status,
		contentType: response.headers.get('content-type') || '',
		raw,
		body,
	}
}

function assertNoLeaks(payload) {
	const text = JSON.stringify(payload || {})
	const forbidden = [
		/betterpptx-payram-hot-wallet-private-key/i,
		/betterpptx-x402-gas-relayer-key/i,
		/betterpptx-forwarder-sweeper-key/i,
		/privateKey/i,
		/0x[a-fA-F0-9]{64}/,
		/-----BEGIN [^-]+-----/,
	]
	for (const pattern of forbidden) {
		if (pattern.test(text)) fail(`Payment health leaked forbidden material: ${pattern}`, {})
	}
}

if (!base) {
	console.error('Usage: node betterpptx-mcp/verify-live-payment-health.mjs --base <cloud-run-base-url> [--project <gcp-project>]')
	process.exit(2)
}

const url = `${base}/ops/mission-control/payment-health`
const unauthorized = await readJson(url)
if (unauthorized.status < 400 || unauthorized.status >= 500) {
	fail('Payment health endpoint should reject unauthenticated requests.', {
		status: unauthorized.status,
		body: unauthorized.body,
	})
}

const token = readMissionControlToken()
const authorized = await readJson(url, { token })
if (authorized.status !== 200 || !authorized.body || typeof authorized.body !== 'object') {
	fail('Payment health endpoint did not return a JSON health payload.', {
		status: authorized.status,
		contentType: authorized.contentType,
		body: authorized.body,
	})
}

const health = authorized.body
assertNoLeaks(health)

if (typeof health.paymentsReady !== 'boolean') fail('paymentsReady must be a boolean.', { health })
if (!health.relayer || typeof health.relayer !== 'object') fail('relayer health is missing.', { health })
if (!health.lease || typeof health.lease !== 'object') fail('lease health is missing.', { health })
if (!health.payram || typeof health.payram !== 'object') fail('PayRam health is missing.', { health })
if (!health.forwarder || typeof health.forwarder !== 'object') fail('forwarder health is missing.', { health })
if (!health.forwarderSweeper || typeof health.forwarderSweeper !== 'object') fail('forwarder sweeper health is missing.', { health })

if (health.relayer.addressRedacted && /^0x[a-fA-F0-9]{40}$/.test(health.relayer.addressRedacted)) {
	fail('Relayer address was not redacted.', { relayer: health.relayer })
}
if (health.forwarderSweeper.addressRedacted && /^0x[a-fA-F0-9]{40}$/.test(health.forwarderSweeper.addressRedacted)) {
	fail('Forwarder sweeper address was not redacted.', { forwarderSweeper: health.forwarderSweeper })
}

console.log([
	'LIVE PAYMENT HEALTH: PASS',
	`paymentsReady=${health.paymentsReady ? 1 : 0}`,
	`relayerReady=${health.relayer.ready ? 1 : 0}`,
	`relayerLow=${health.relayer.lowBalance ? 1 : 0}`,
	`payramEnabled=${health.payram.enabled ? 1 : 0}`,
	`forwarderEnabled=${health.forwarder.enabled ? 1 : 0}`,
	`forwarderSweeperEnabled=${health.forwarderSweeper.enabled ? 1 : 0}`,
	'unauth=1',
	'redacted=1',
].join(' '))
