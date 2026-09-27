import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = path.resolve(root, '..')
const deployDir = path.join(root, 'deploy')
const evidencePath = path.join(root, 'docs', 'release-safety', 'G4-DEPLOYMENT-EVIDENCE.json')
const strict = process.argv.includes('--strict') || process.env.BETTERPPTX_G4_RELEASE_GATE === '1'

const checks = []
function check(id, ok, detail) {
	checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail })
}
function read(name) {
	const file = path.join(deployDir, name)
	if (!fs.existsSync(file)) throw new Error(`missing deployment template: ${name}`)
	return fs.readFileSync(file, 'utf8')
}
function has(text, needle) { return text.includes(needle) }

const piper = read('cloud-run-mcp-piper.yaml')
const worker = read('cloud-run-avatar-worker.yaml')
const overlay = read('deploy-avatar-cloud-run-overlay.py')
const promotion = read('promote-commercial-avatar-production.ps1')

check('piper-payram-secret-ref',
	/ name: BETTERPPTX_PAYRAM_API_KEY[\s\S]{0,180}valueFrom:[\s\S]{0,120}secretKeyRef:[\s\S]{0,160}name: betterpptx-payram-api-key/.test(piper),
	'Piper/MCP production template injects the PayRam key through a Secret Manager secretKeyRef.')
check('piper-avatar-secret-volume',
	has(piper, 'secretName: betterpptx-avatar-worker-credentials') && has(piper, 'path: avatar-worker-credentials.json'),
	'Piper/MCP production template mounts the owner-controlled avatar credential bundle as a read-only secret volume.')
check('avatar-worker-token-secret-ref',
	/ name: AVATAR_WORKER_TOKEN[\s\S]{0,140}valueFrom:[\s\S]{0,120}secretKeyRef:[\s\S]{0,140}name: betterpptx-avatar-worker-token/.test(worker),
	'Avatar worker template injects its endpoint token through Secret Manager.')

const secretNamePattern = /(?:_TOKEN|_API_KEY|_SECRET|PRIVATE_KEY|PASSWORD)$/
function rawSecretEnvValues(text, file) {
	const lines = text.split(/\r?\n/)
	const hits = []
	for (let i = 0; i < lines.length; i += 1) {
		const name = lines[i].match(/^\s*-?\s*name:\s*([A-Z0-9_]+)\s*$/)?.[1]
		if (!name || !secretNamePattern.test(name)) continue
		const window = lines.slice(i + 1, i + 5).join('\n')
		if (/^\s*value:\s*\S+/m.test(window)) hits.push(`${file}:${i + 1}:${name}`)
	}
	return hits
}
const rawTemplateHits = [...rawSecretEnvValues(piper, 'cloud-run-mcp-piper.yaml'), ...rawSecretEnvValues(worker, 'cloud-run-avatar-worker.yaml')]
check('no-raw-template-secret-values', rawTemplateHits.length === 0,
	rawTemplateHits.length ? `raw secret-like env values found: ${rawTemplateHits.join(', ')}` : 'No secret-like production env is supplied with a literal value.')

check('overlay-secret-boundary',
	has(overlay, 'secretName": args.secret') && has(overlay, 'secretValuesPrinted": False') && has(overlay, 'readOnly'),
	'Cloud Run overlay adds a read-only secret volume and reports no secret values.')
check('promotion-secret-boundary',
	has(promotion, 'rawSecretsPrinted = $false') && has(promotion, 'tokenFingerprint = Get-FileFingerprint16'),
	'Commercial promotion records only a token fingerprint and explicitly marks raw secrets as unprinted.')
check('commercial-only-talking-head-route',
	has(piper, 'BETTERPPTX_AVATAR_PRODUCTION_ONLY') &&
	has(piper, 'BETTERPPTX_AVATAR_PRODUCTION_MOTION_PROFILE') &&
	has(piper, 'BETTERPPTX_AVATAR_PRODUCTION_MOUTH_PROFILE') &&
	!has(overlay, '"--avatar-provider"') &&
	!has(promotion, 'rollbackProvider'),
	'The production route is frozen to the owner-reviewed commercial talking-head profile with no client-selectable or automatic alternate lane.')
check('owner-control-verifiers',
	fs.existsSync(path.join(root, 'verify-mission-control-secrets.mjs')) && fs.existsSync(path.join(root, 'verify-mission-control-secret-routes.mjs')),
	'Owner-only Mission Control secret and route verifiers are present.')

const evidenceExists = fs.existsSync(evidencePath)
let evidenceValid = false
if (evidenceExists) {
	try {
		const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'))
		evidenceValid = evidence.schema === 'betterpptx.g4-deployment-evidence.v1' &&
			evidence.status === 'PASS' &&
			/^[a-f0-9]{40}$/i.test(evidence.source?.commit || '') &&
			evidence.source?.gitTreeClean === true && evidence.source?.ship === 'PASS' &&
			evidence.deployment?.ready === true && evidence.deployment?.trafficPercent === 100 &&
			typeof evidence.deployment?.activeRevision === 'string' && evidence.deployment.activeRevision.length > 0 &&
			/^sha256:[a-f0-9]{64}$/i.test(evidence.deployment?.imageDigest || '') &&
			evidence.deployment?.secretManagerBacked === true &&
			evidence.deployment?.productionTalkingHeadOnlyVerified === true &&
			evidence.rotation?.tested === true && evidence.rotation?.authenticatedCanaryPass === true &&
			evidence.rotation?.oldCredentialRevokedOrDisabled === true &&
			evidence.breakGlass?.audited === true && evidence.breakGlass?.rollbackCanaryPass === true &&
			evidence.breakGlass?.restoredApprovedRevision === true &&
			evidence.audit?.rawSecretsPrinted === false && evidence.audit?.publicBlackBoxLeakScanPass === true
	} catch { evidenceValid = false }
}
check('deployment-evidence', evidenceValid,
	evidenceValid ? 'Immutable clean-SHA deployment, Secret Manager rotation, break-glass, canary, and no-leak evidence is present.' : 'External clean-SHA deployment/rotation/break-glass evidence is absent or incomplete; local templates and unbound booleans do not prove a live release.')

const report = {
	schema: 'betterpptx.g4-deployment-secret-gate-report.v1',
	measuredAt: new Date().toISOString(),
	mode: strict ? 'strict' : 'report-only',
	status: checks.every(item => item.status === 'PASS') ? 'PASS' : 'PENDING',
	strictReleaseAllowed: checks.every(item => item.status === 'PASS'),
	checks,
	evidencePath: path.relative(repoRoot, evidencePath).replaceAll('\\', '/'),
}
const outDir = path.join(root, 'outputs')
fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(path.join(outDir, 'g4-deployment-secret-gate-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`G4 DEPLOYMENT SECRET GATE: ${report.status} mode=${report.mode} checks=${checks.filter(item => item.status === 'PASS').length}/${checks.length}`)
for (const item of checks) console.log(`${item.status} ${item.id}: ${item.detail}`)
if (strict && report.status !== 'PASS') process.exitCode = 1
