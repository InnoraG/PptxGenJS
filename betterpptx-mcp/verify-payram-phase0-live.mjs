import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { execFileSync } from 'node:child_process'

import {
	createPayramPayment,
	getPayramPaymentStatus,
	payramReadiness,
	PayRamClientError,
} from './billing/payram-client.mjs'
import { hashPayload, hashStableId } from './billing/ledger-store.mjs'

function usage() {
	console.log(`Usage:
  node betterpptx-mcp/verify-payram-phase0-live.mjs --customer-email <email> [options]

Options:
  --amount-usd <n>              Payment link amount. Default: 5
  --customer-id <id>            Pseudonymous PayRam customer id. Default: proof hash
  --reference-id <id>           Skip create and query an existing PayRam reference
  --expect-paid                 Require status to be paid/creditable
  --require-card-keywords       Fail if opened payment page lacks card/onramp text markers
  --use-gcloud-secrets          Load PayRam env from Google Secret Manager
  --project <id>                GCP project for --use-gcloud-secrets
  --output <path>               Evidence JSON path. Default: outputs/payram-phase0-proof/<timestamp>.json
  --help                        Show this help

Required env unless --use-gcloud-secrets is set:
  BETTERPPTX_PAYRAM_ENABLED=1
  BETTERPPTX_PAYRAM_BASE_URL
  BETTERPPTX_PAYRAM_API_KEY
  BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN
`)
}

function parseArgs(argv) {
	const out = {
		amountUsd: 5,
		customerEmail: '',
		customerId: '',
		referenceId: '',
		expectPaid: false,
		requireCardKeywords: false,
		useGcloudSecrets: false,
		project: '',
		output: '',
	}
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]
		const next = () => {
			i += 1
			if (i >= argv.length) throw new Error(`Missing value for ${arg}`)
			return argv[i]
		}
		if (arg === '--help' || arg === '-h') { out.help = true; continue }
		if (arg === '--customer-email') { out.customerEmail = next(); continue }
		if (arg === '--amount-usd') { out.amountUsd = Number(next()); continue }
		if (arg === '--customer-id') { out.customerId = next(); continue }
		if (arg === '--reference-id') { out.referenceId = next(); continue }
		if (arg === '--expect-paid') { out.expectPaid = true; continue }
		if (arg === '--require-card-keywords') { out.requireCardKeywords = true; continue }
		if (arg === '--use-gcloud-secrets') { out.useGcloudSecrets = true; continue }
		if (arg === '--project') { out.project = next(); continue }
		if (arg === '--output') { out.output = next(); continue }
		throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function fail(message, details = {}) {
	const error = new Error(message)
	error.details = details
	throw error
}

function redactUrl(value, extraSecrets = []) {
	const text = String(value || '')
	if (!text) return ''
	try {
		const url = new URL(text)
		for (const key of [...url.searchParams.keys()]) {
			if (/token|key|secret|signature|auth/i.test(key)) url.searchParams.set(key, '[redacted]')
		}
		return redactSensitiveText(url.toString(), extraSecrets)
	} catch {
		return redactSensitiveText(text, extraSecrets)
	}
}

function redactSensitiveText(value, extraSecrets = []) {
	let text = String(value || '')
	const secrets = [
		process.env.BETTERPPTX_PAYRAM_API_KEY,
		process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN,
		...extraSecrets,
	]
	for (const secret of secrets) {
		const needle = String(secret || '')
		if (needle.length >= 4) text = text.split(needle).join('[redacted]')
	}
	return text
		.replace(/(API-Key:\s*)[A-Za-z0-9._:-]+/gi, '$1[redacted]')
		.replace(/([?&](?:token|key|secret|signature|auth)=)[^&\s]+/gi, '$1[redacted]')
		.slice(0, 1000)
}

function redactEvidence(value, extraSecrets = [], depth = 0) {
	if (depth > 8) return '[redacted-depth]'
	if (value == null || typeof value === 'number' || typeof value === 'boolean') return value
	if (typeof value === 'string') return redactSensitiveText(value, extraSecrets)
	if (Array.isArray(value)) return value.map(item => redactEvidence(item, extraSecrets, depth + 1))
	if (typeof value === 'object') {
		const out = {}
		for (const [key, item] of Object.entries(value)) {
			if (/api.?key|token|secret|signature|auth/i.test(key)) {
				out[key] = '[redacted]'
			} else {
				out[key] = redactEvidence(item, extraSecrets, depth + 1)
			}
		}
		return out
	}
	return redactSensitiveText(value, extraSecrets)
}

function referenceHash(value) {
	const text = String(value || '').trim()
	return text ? hashStableId('payram_reference', text) : null
}

function statusEvidence(value) {
	const status = value && typeof value === 'object' ? { ...value } : {}
	const rawReference = status.referenceId
	const hashedReference = referenceHash(rawReference)
	delete status.referenceId
	if (hashedReference) status.referenceIdHash = hashedReference
	return redactEvidence(status, [rawReference])
}

function gcloudSecret(name, project) {
	const args = ['secrets', 'versions', 'access', 'latest', '--secret', name]
	if (project) args.push('--project', project)
	const value = runGcloud(args).trim()
	if (!value) fail(`GCP Secret Manager secret is empty: ${name}`)
	return value
}

function runGcloud(args) {
	if (process.env.BETTERPPTX_GCLOUD_BIN) {
		return execFileSync(process.env.BETTERPPTX_GCLOUD_BIN, args, {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
	}
	if (process.platform === 'win32') {
		return execFileSync('cmd.exe', ['/d', '/s', '/c', 'gcloud', ...args], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
		})
	}
	return execFileSync('gcloud', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	})
}

function loadGcloudSecrets(project) {
	process.env.BETTERPPTX_PAYRAM_ENABLED = '1'
	process.env.BETTERPPTX_PAYRAM_BASE_URL = gcloudSecret('betterpptx-payram-base-url', project)
	process.env.BETTERPPTX_PAYRAM_API_KEY = gcloudSecret('betterpptx-payram-api-key', project)
	process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN = gcloudSecret('betterpptx-payram-webhook-custom-token', project)
}

async function openPaymentPage(url, extraSecrets = []) {
	if (!url) return { opened: false, status: 0, textHash: null, markerHits: [] }
	const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
	const text = await response.text()
	const markerHits = []
	for (const marker of ['card', 'apple pay', 'google pay', 'onramp', 'wallet', 'payram']) {
		if (text.toLowerCase().includes(marker)) markerHits.push(marker)
	}
	return {
		opened: response.ok,
		status: response.status,
		finalUrl: redactUrl(response.url, extraSecrets),
		textHash: hashPayload({ text }),
		markerHits,
	}
}

const args = parseArgs(process.argv.slice(2))
if (args.help) {
	usage()
	process.exit(0)
}

const runId = new Date().toISOString().replace(/[:.]/g, '-')
const output = args.output
	? path.resolve(args.output)
	: path.resolve('outputs', 'payram-phase0-proof', `payram-phase0-${runId}.json`)
fs.mkdirSync(path.dirname(output), { recursive: true })

let readiness = null
let customerId = ''
let created = null
let referenceId = args.referenceId
let page = null
let status = null
const manualChecklist = []

try {
	if (!Number.isFinite(args.amountUsd) || args.amountUsd <= 0) fail('--amount-usd must be positive.')
	if (args.useGcloudSecrets) loadGcloudSecrets(args.project)

	readiness = payramReadiness()
	if (!readiness.configured) {
		fail('PayRam is not configured for live Phase 0 proof.', { missing: readiness.missing, readiness })
	}

	if (!args.referenceId && !args.customerEmail) {
		fail('--customer-email is required when creating a new PayRam payment link.')
	}

	customerId = args.customerId || hashStableId('payram_phase0_customer', `${os.userInfo().username}:${args.customerEmail}:${runId}`)
	if (!referenceId) {
		created = await createPayramPayment({
			customerEmail: args.customerEmail,
			customerId,
			amountUsd: args.amountUsd,
		})
		referenceId = created.referenceId
		page = await openPaymentPage(created.url, [referenceId])
		if (!page.opened) fail('PayRam payment link did not open successfully.', { page })
		if (args.requireCardKeywords && !page.markerHits.some(marker => ['card', 'apple pay', 'google pay', 'onramp'].includes(marker))) {
			fail('PayRam payment page opened but no card/onramp markers were detected.', { page })
		}
		if (!page.markerHits.some(marker => ['card', 'apple pay', 'google pay', 'onramp'].includes(marker))) {
			manualChecklist.push('Visually confirm that the PayRam page offers card/Apple Pay/Google Pay/onramp checkout; JS-rendered widgets may not be visible in static HTML.')
		}
	}

	status = await getPayramPaymentStatus(referenceId)
	if (args.expectPaid && !status.creditable) {
		fail('PayRam status is not paid/creditable yet.', { referenceId, providerStatus: status.providerStatus, state: status.state })
	}
	if (!status.creditable) manualChecklist.push('Complete a small live payment, then rerun with --reference-id and --expect-paid.')
	if (!status.providerFilledAmountUsd && !status.providerNetReceivedUsd && !status.providerFeeUsd) {
		manualChecklist.push('Record PayRam fee semantics after payment: customer charge, filled amount, net received amount, provider fee, or hidden spread.')
	}

	const evidence = {
		ok: true,
		createdAt: new Date().toISOString(),
		payram: {
			readiness: {
				...readiness,
				baseUrl: readiness.baseUrl ? '[configured]' : null,
			},
			referenceIdHash: referenceHash(referenceId),
			paymentUrl: created?.url ? redactUrl(created.url, [referenceId]) : null,
			paymentUrlHash: created?.url ? hashPayload({ url: created.url }) : null,
			page,
			status: statusEvidence(status),
		},
		request: {
			amountUsd: args.amountUsd,
			customerEmailHash: args.customerEmail ? hashStableId('email', args.customerEmail.trim().toLowerCase()) : null,
			customerIdHash: hashStableId('payram_customer', customerId),
		},
		manualChecklist,
	}
	fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
	console.log(`PAYRAM PHASE0 LIVE: PASS referenceHash=${referenceHash(referenceId)} state=${status.state} status=${status.providerStatus} evidence=${output}`)
	if (manualChecklist.length) {
		console.log(`PAYRAM PHASE0 LIVE: MANUAL_ITEMS count=${manualChecklist.length}`)
	}
} catch (error) {
	const extraSecrets = [args.customerEmail, customerId, referenceId]
	const evidence = {
		ok: false,
		createdAt: new Date().toISOString(),
		code: error instanceof PayRamClientError ? error.code : 'PAYRAM_PHASE0_PROOF_FAILED',
		message: redactSensitiveText(error.message, extraSecrets),
		details: redactEvidence(error.details || {}, extraSecrets),
		referenceIdHash: referenceHash(referenceId),
		paymentUrl: created?.url ? redactUrl(created.url, extraSecrets) : null,
	}
	fs.writeFileSync(output, `${JSON.stringify(evidence, null, 2)}\n`)
	console.error(`PAYRAM PHASE0 LIVE: FAIL code=${evidence.code} evidence=${output}`)
	process.exit(1)
}
