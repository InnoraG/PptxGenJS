import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
	const arg = process.argv[i]
	if (arg.startsWith('--') && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
		args.set(arg, process.argv[++i])
	} else if (arg.startsWith('--')) {
		args.set(arg, '1')
	}
}

const project = String(args.get('--project') || process.env.BETTERPPTX_VERIFY_GCP_PROJECT || 'betterpptx-mcp-staging').trim()
const region = String(args.get('--region') || process.env.BETTERPPTX_VERIFY_GCP_REGION || 'us-central1').trim()
const publicBase = String(args.get('--base') || process.env.BETTERPPTX_VERIFY_LIVE_BASE || '').replace(/\/+$/, '')
const payramJobName = String(args.get('--payram-job') || 'betterpptx-payram-reconcile').trim()
const forwarderJobName = String(args.get('--forwarder-job') || 'betterpptx-forwarder-sweep').trim()
const expectForwarderDisabled = !args.has('--expect-forwarder-enabled')

function runGcloud(gcloudArgs, { json = false, allowFailure = false } = {}) {
	return new Promise((resolve, reject) => {
		const command = process.platform === 'win32' ? 'cmd.exe' : 'gcloud'
		const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'gcloud', ...gcloudArgs] : gcloudArgs
		const child = spawn(command, commandArgs, {
			cwd: process.cwd(),
			env: process.env,
			windowsHide: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		})
		let stdout = ''
		let stderr = ''
		child.stdout.on('data', chunk => { stdout += String(chunk) })
		child.stderr.on('data', chunk => { stderr += String(chunk) })
		child.on('error', error => {
			if (allowFailure) resolve(null)
			else reject(error)
		})
		child.on('close', code => {
			if (code !== 0 && allowFailure) {
				resolve(null)
				return
			}
			if (code !== 0) {
				const tail = String(stderr || '').split(/\r?\n/).slice(-8).join('\n')
				reject(new Error(`gcloud ${gcloudArgs.slice(0, 4).join(' ')} failed with exit ${code}: ${tail}`))
				return
			}
			const value = String(stdout || '').trim()
			resolve(json ? (value ? JSON.parse(value) : {}) : value)
		})
	})
}

async function describeJob(name, { optional = false } = {}) {
	return runGcloud([
		'scheduler',
		'jobs',
		'describe',
		name,
		`--project=${project}`,
		`--location=${region}`,
		'--format=json',
	], { json: true, allowFailure: optional })
}

function headers(job) {
	return job?.httpTarget?.headers || {}
}

function headerKeys(job) {
	return Object.keys(headers(job)).map(key => key.toLowerCase())
}

function targetUri(job) {
	return String(job?.httpTarget?.uri || '')
}

function assertNoQueryToken(label, uri) {
	assert(uri, `${label} must have a target URI.`)
	assert(!/[?&](token|secret|key|api_key|apikey)=/i.test(uri), `${label} must not carry secrets in query parameters.`)
}

function assertHttpJob(label, job, { expectedPath, expectedHeader, enabled }) {
	assert(job, `${label} scheduler job must exist.`)
	assert.equal(job.state, enabled ? 'ENABLED' : job.state, `${label} scheduler job must be enabled.`)
	if (enabled) assert.equal(job.state, 'ENABLED', `${label} scheduler job must be enabled.`)
	assert.equal(job.schedule, '*/5 * * * *', `${label} scheduler must run every five minutes.`)
	assert.equal(job.timeZone, 'Etc/UTC', `${label} scheduler timezone must be UTC.`)
	assert.equal(job.attemptDeadline, '60s', `${label} scheduler attempt deadline must be 60 seconds.`)
	assert.equal(job.httpTarget?.httpMethod, 'POST', `${label} scheduler must POST.`)
	const uri = targetUri(job)
	assertNoQueryToken(label, uri)
	assert(new URL(uri).pathname === expectedPath, `${label} scheduler path must be ${expectedPath}.`)
	if (publicBase) assert(uri.startsWith(`${publicBase}/`), `${label} scheduler must target the verified live Cloud Run base.`)
	const keys = headerKeys(job)
	assert(keys.includes(expectedHeader.toLowerCase()), `${label} scheduler must authenticate with ${expectedHeader} header.`)
	assert(keys.includes('content-type'), `${label} scheduler must send Content-Type header.`)
	assert.equal(String(headers(job)['Content-Type'] || headers(job)['content-type'] || '').toLowerCase(), 'application/json', `${label} scheduler Content-Type must be application/json.`)
}

const payramJob = await describeJob(payramJobName)
assertHttpJob('PayRam reconciler', payramJob, {
	expectedPath: '/internal/payments/payram/reconcile',
	expectedHeader: 'x-betterpptx-payram-token',
	enabled: true,
})

const forwarderJob = await describeJob(forwarderJobName, { optional: true })
let forwarderState = 'absent'
if (forwarderJob) {
	forwarderState = String(forwarderJob.state || 'unknown').toLowerCase()
	assertHttpJob('Forwarder sweeper', forwarderJob, {
		expectedPath: '/internal/payments/forwarders/sweep',
		expectedHeader: 'x-betterpptx-scanner-token',
		enabled: !expectForwarderDisabled,
	})
	if (expectForwarderDisabled) {
		assert.notEqual(forwarderJob.state, 'ENABLED', 'Forwarder sweep scheduler must not be enabled before CREATE2 proof and explicit forwarder switch.')
	}
}

console.log(`GCP PAYMENT SCHEDULERS: PASS project=${project} payram=enabled schedule=*/5 forwarder=${forwarderState} querySecrets=0 headerTokens=1`)
