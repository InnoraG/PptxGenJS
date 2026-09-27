#!/usr/bin/env node
// Bounded, read-only reachability probe for the configured private native-3D
// Modal profiles. This intentionally performs GET only: the worker contract is
// POST submit/poll, so this probe never creates a generation job or spends GPU.
import fs from 'node:fs'
import path from 'node:path'
import { writeJsonReport } from './lib/atomic-report.mjs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { credentialAccounts } from './config/credential-store.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
const demo = path.join(repo, 'research-demos', '2026-07-18-meshy-avatar')
const output = path.join(demo, 'visual-artifacts', 'release-gates', 'meshy-modal-live-profile-health-20260718.json')
const timeoutMs = 8000
const accounts = credentialAccounts('model3d-gen')

function fingerprint(value) {
	return createHash('sha256').update(String(value)).digest('hex').slice(0, 12)
}

function isSha256(value) {
	return typeof value === 'string' && /^[A-Fa-f0-9]{64}$/.test(value)
}

async function probe(account) {
	const profile = String(account.id || '')
	const healthUrl = String(account.env?.BETTERPPTX_MODEL3D_GEN_HEALTH_URL || '').trim()
	const rawUrl = healthUrl || String(account.env?.BETTERPPTX_MODEL3D_GEN_URL || '').trim()
	const url = new URL(rawUrl)
	if (url.protocol !== 'https:') throw new Error('PRIVATE_PROFILE_MUST_USE_HTTPS')
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeoutMs)
	const started = Date.now()
	try {
		const response = await fetch(url, { method: 'GET', redirect: 'manual', signal: controller.signal })
		let healthPayloadValidated = false
		let revision = null
		let sourceDigest = null
		if (healthUrl && response.ok) {
			try {
				const payload = await response.json()
				revision = typeof payload?.revision === 'string' ? payload.revision : null
				sourceDigest = typeof payload?.sourceDigest === 'string' ? payload.sourceDigest : null
				const keys = Object.keys(payload || {}).sort()
				const expectedKeys = ['revision', 'scope', 'sourceDigest', 'status']
				healthPayloadValidated = payload?.status === 'ok' &&
					payload?.scope === 'native-3d-presenter-only' &&
					keys.length === expectedKeys.length &&
					keys.every((key, index) => key === expectedKeys[index]) &&
					Boolean(revision) && isSha256(sourceDigest)
			} catch { healthPayloadValidated = false }
		}
		return {
			profile,
			configured: true,
			reachable: true,
			probeKind: healthUrl ? 'health-identity' : 'legacy-generate-root',
			healthRouteConfigured: Boolean(healthUrl),
		healthPayloadValidated,
		healthIdentityPinned: Boolean(revision && isSha256(sourceDigest)),
			revision,
			sourceDigest,
			endpointHostFingerprint: fingerprint(url.hostname),
			status: response.status,
			methodContract: response.status === 405 ? 'POST_ONLY_ROUTE_CONFIRMED' : 'ROUTE_RESPONDED',
			latencyMs: Date.now() - started,
			bodyCaptured: false,
		}
	} catch (error) {
		return {
			profile,
			configured: true,
			reachable: false,
			probeKind: healthUrl ? 'health-identity' : 'legacy-generate-root',
			healthRouteConfigured: Boolean(healthUrl),
			healthPayloadValidated: false,
			healthIdentityPinned: false,
			endpointHostFingerprint: fingerprint(url.hostname),
			errorClass: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK_OR_TLS_ERROR',
			latencyMs: Date.now() - started,
			bodyCaptured: false,
		}
	} finally {
		clearTimeout(timer)
	}
}

const configuredProfiles = accounts.filter(account => account?.enabled !== false && account?.id && account?.env?.BETTERPPTX_MODEL3D_GEN_URL && account?.env?.BETTERPPTX_MODEL3D_GEN_TOKEN)
const results = await Promise.all(configuredProfiles.map(probe))
const checks = {
	configuredProfileCount: results.length === 2,
	expectedProfileIds: results.map(result => result.profile).sort().join(',') === 'betterpptx,betterxavatar',
	allProfilesReachable: results.length > 0 && results.every(result => result.reachable),
	readOnlyMethodOnly: results.every(result => result.methodContract === 'POST_ONLY_ROUTE_CONFIRMED' || result.methodContract === 'ROUTE_RESPONDED'),
	healthPayloadContractValid: results.every(result => !result.healthRouteConfigured || result.healthPayloadValidated),
	healthIdentityPinnedForConfiguredRoutes: results.every(result => !result.healthRouteConfigured || result.healthIdentityPinned),
	healthRouteConfiguredForAllProfiles: results.length > 0 && results.every(result => result.healthRouteConfigured),
	noGenerationRequestSent: true,
	noResponseBodyCaptured: results.every(result => result.bodyCaptured === false),
}

const report = {
	schemaVersion: 'betterpptx.native-3d-modal-live-profile-health.v1',
	status: checks.allProfilesReachable && checks.readOnlyMethodOnly && checks.healthPayloadContractValid && checks.noGenerationRequestSent && checks.noResponseBodyCaptured ? 'PASS_LIVE_READ_ONLY' : (results.length ? 'OPEN_LIVE_PROFILE_HEALTH' : 'OPEN_NO_CONFIGURED_PROFILES'),
	scope: 'native-3d-presenter-only',
	developmentMode: 'premium',
	probe: { method: 'GET', path: 'per-profile-configured-health-or-legacy-root', timeoutMs, networkAttempted: results.length > 0, generationSubmitted: false, providerRequestBodySent: false },
	checks,
	profiles: results,
	ownerNextAction: 'Record immutable Modal revision and image digests for both private profiles, then perform one owner-authorized bounded canary and rollback replay. This read-only probe is not a generation or rollback proof.',
}
writeJsonReport(output, report)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS_LIVE_READ_ONLY') process.exitCode = 1
