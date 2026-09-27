#!/usr/bin/env node
// No-network contract gate for the owner-frozen production talking-head route.
// Private implementation labels are written only to this maintainer report.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	PRODUCTION_TALKING_HEAD_ENHANCEMENT,
	PRODUCTION_TALKING_HEAD_CONTRACT_VERSION,
	PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
	PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
	PRODUCTION_TALKING_HEAD_PIPELINE,
	PRODUCTION_TALKING_HEAD_PROVIDER,
	assertProductionTalkingHeadAttestation,
	resolveProductionTalkingHeadOptions,
	resolveProductionTalkingHeadProvider,
} from './avatar/production-profile.mjs'
import { normalizeAvatarMotionProfile, normalizeAvatarMouthProfile } from './avatar/providers/musetalkHttp.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const read = relative => fs.readFileSync(path.join(here, relative), 'utf8')
const checks = []
const check = (id, ok, detail) => checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })

const productionEnv = {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_AVATAR_PRODUCTION_ONLY: '1',
	BETTERPPTX_AVATAR_PROVIDER: PRODUCTION_TALKING_HEAD_PROVIDER,
	BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE: PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
	BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE: PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
}
check('canonical-provider-resolves',
	resolveProductionTalkingHeadProvider(undefined, { env: productionEnv }) === PRODUCTION_TALKING_HEAD_PROVIDER,
	'The production resolver selects the frozen commercial provider when the author supplies only talking-head intent.')
let alternateRejected = true
for (const alternate of ['test-static', 'musetalk', 'liveportrait-musetalk', 'sadtalker', 'disabled']) {
	try { resolveProductionTalkingHeadProvider(alternate, { env: productionEnv }); alternateRejected = false } catch (error) {
		if (error?.code !== 'AVATAR_PRODUCTION_PROFILE_REQUIRED') alternateRejected = false
	}
}
check('alternate-providers-rejected', alternateRejected,
	'Explicit local, research, disabled, and alternate-worker requests cannot override production routing.')
const options = resolveProductionTalkingHeadOptions(PRODUCTION_TALKING_HEAD_PROVIDER, {}, {
	env: productionEnv,
	normalizeMotionProfile: normalizeAvatarMotionProfile,
	normalizeMouthProfile: normalizeAvatarMouthProfile,
})
check('approved-profile-frozen', options.motionProfile === 'blink' && options.mouthProfile === 'jaw',
	'The exact motion and mouth treatment used by the owner-reviewed canary is frozen with the provider route.')
let attested = false
try {
	attested = assertProductionTalkingHeadAttestation(PRODUCTION_TALKING_HEAD_PROVIDER, {
		pipeline: PRODUCTION_TALKING_HEAD_PIPELINE,
		enhancement: PRODUCTION_TALKING_HEAD_ENHANCEMENT,
		motionProfile: PRODUCTION_TALKING_HEAD_MOTION_PROFILE,
		mouthProfile: PRODUCTION_TALKING_HEAD_MOUTH_PROFILE,
		restorationSeconds: 1,
	}, { env: productionEnv }) === true
} catch { attested = false }
check('private-response-attestation', attested,
	'Commercial output must privately attest the reviewed pipeline, enhancement, and motion profile before media is accepted.')

const providerSource = read('avatar/providers/musetalkHttp.mjs')
const accountSlice = providerSource.slice(providerSource.indexOf('export function avatarWorkerAccounts'), providerSource.indexOf('function accountEndpoint'))
check('isolated-credential-namespace',
	providerSource.includes("const COMMERCIAL_AVATAR_STORE_PROVIDER_ID = 'avatar-worker-commercial'") &&
	accountSlice.includes('COMMERCIAL_AVATAR_STORE_PROVIDER_ID') &&
	!accountSlice.includes('|| account.env?.BETTERPPTX_AVATAR_WORKER_URL') &&
	!accountSlice.includes('|| account.env?.BETTERPPTX_AVATAR_WORKER_TOKEN'),
	'Commercial routing reads only the commercial credential namespace and has no generic-worker credential fallback.')
const attestationCall = providerSource.indexOf('\n\t\t\tassertProductionTalkingHeadAttestation(provider, providerUsage)')
const writeCall = providerSource.indexOf('\n\t\t\tawait writeResponseVideo(response, outputPath')
check('attestation-before-accept', attestationCall > 0 && writeCall > attestationCall,
	'Private response attestation runs before returned video bytes are accepted into the artifact path.')

const engine = read('engine.mjs')
const service = read('avatar/service.mjs')
check('central-engine-resolver', engine.includes('return resolveAvatarProvider(') && service.includes('const resolvedProvider = resolveAvatarProvider('),
	'Both direct tool execution and spec-driven asset resolution use the same fail-closed provider resolver.')
check('pre-guard-cache-invalidated', service.includes('productionContract:') && service.includes('PRODUCTION_TALKING_HEAD_CONTRACT_VERSION') && PRODUCTION_TALKING_HEAD_CONTRACT_VERSION.includes('2026-08-14'),
	'Production cache keys carry a new reviewed-contract version, so pre-guard media cannot be reused silently.')

const piper = read('deploy/cloud-run-mcp-piper.yaml')
const overlay = read('deploy/deploy-avatar-cloud-run-overlay.py')
const promotion = read('deploy/promote-commercial-avatar-production.ps1')
for (const [id, token] of [
	['deployment-production-only', 'BETTERPPTX_AVATAR_PRODUCTION_ONLY'],
	['deployment-motion-profile', 'BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE'],
	['deployment-mouth-profile', 'BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE'],
]) {
	check(id, piper.includes(token) && overlay.includes(token) && promotion.includes(token),
		`${token} is pinned by the declarative template, overlay, and promotion path.`)
}
check('deployment-provider-not-client-selectable', !overlay.includes('"--avatar-provider"'),
	'The production deployment overlay no longer accepts a provider-selection argument.')
check('production-fallback-disabled', !overlay.includes('rollbackPrepared') && !promotion.includes('rollbackProvider'),
	'Current production deployment scripts do not configure an alternate talking-head fallback lane.')

const blackbox = read('blackbox.mjs')
check('public-diagnostics-hidden', ['pipeline', 'enhancement', 'headers', 'providerExecutionIds'].every(token => blackbox.includes(`'${token}'`)),
	'Private lane and response diagnostics remain hidden by the public black-box result boundary.')

const failed = checks.filter(item => item.status === 'FAIL')
const report = {
	schemaVersion: 'betterpptx.avatar-production-routing.v1',
	measuredAt: new Date().toISOString(),
	status: failed.length ? 'FAIL' : 'PASS',
	productionTalkingHeadOnly: failed.length === 0,
	checks,
	publicDiagnosticsExposed: false,
	networkCalls: 0,
}
const outputPath = path.join(here, 'outputs', 'avatar-production-routing-report.json')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(`AVATAR PRODUCTION ROUTING: ${report.status} checks=${checks.length - failed.length}/${checks.length}`)
if (failed.length) {
	console.error(failed.map(item => `${item.id}: ${item.detail}`).join('\n'))
	process.exitCode = 1
}
assert.equal(failed.length, 0)
