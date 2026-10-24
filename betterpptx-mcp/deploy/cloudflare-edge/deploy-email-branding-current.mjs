// Maintainer-only deployment of the tested edge modules. Credentials stay in
// memory; preserve the live bindings, routes, compatibility and observability.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createHash } from 'node:crypto'

const project = process.env.BETTERPPTX_DEPLOY_PROJECT
const account = process.env.CLOUDFLARE_ACCOUNT_ID
const script = process.env.BETTERPPTX_EDGE_SCRIPT
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || '') || !/^[a-f0-9]{32}$/.test(account || '') || !/^[a-z0-9-]+$/.test(script || '')) throw new Error('Explicit project, account and Worker are required.')
const token = execFileSync('powershell.exe', ['-NoProfile', '-Command', `gcloud secrets versions access latest --secret=betterpptx-cloudflare-worker-deploy-token --project=${project}`], { encoding: 'utf8', windowsHide: true }).trim()
if (!token) throw new Error('Deployment credential unavailable.')
const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${script}`
async function api(path, options = {}) {
	const response = await fetch(base + path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } })
	if (!response.ok) throw new Error(`Worker API failed (${response.status}): ${(await response.text()).slice(0, 1000)}`)
	return response
}
const settingsEnvelope = await (await api('/settings')).json()
if (!settingsEnvelope.success) throw new Error('Cannot read current Worker settings.')
const settings = settingsEnvelope.result
const sourceResponse = await api('')
const sourceForm = await sourceResponse.formData()
const beforeSource = sourceForm.get('index.js')
if (typeof beforeSource !== 'string' || !beforeSource.includes('relayAuthorizedPresentationDownload') || beforeSource.includes('relayEmailAuthAction')) throw new Error('Unexpected live Worker source; review before deploying.')
const dir = new URL('./email-branding-current.local/', import.meta.url)
mkdirSync(dir, { recursive: true })
writeFileSync(new URL('worker-before.mjs', dir), beforeSource)
writeFileSync(new URL('settings-before.json', dir), JSON.stringify(settings, null, 2))
const metadata = { ...settings, main_module: 'index.mjs', bindings: [
	...(settings.bindings || []).filter(binding => binding.name !== 'BETTERPPTX_SIGNIN_PROJECT'),
	{ name: 'BETTERPPTX_SIGNIN_PROJECT', type: 'plain_text', text: project },
] }
if (metadata.observability) metadata.observability = { ...metadata.observability, redact_query_string: true }
const form = new FormData()
form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
const hashes = {}
for (const name of ['index.mjs', 'download-proxy.mjs', 'email-auth-proxy.mjs']) {
	const source = readFileSync(new URL(`./src/${name}`, import.meta.url))
	hashes[name] = createHash('sha256').update(source).digest('hex')
	form.set(name, new Blob([source], { type: 'application/javascript+module' }), name)
}
if (process.argv[2] !== '--deploy') throw new Error('Use --deploy after the edge tests pass.')
const result = await (await api('', { method: 'PUT', body: form })).json()
if (!result.success) throw new Error(`Worker rejected upload: ${JSON.stringify(result.errors)}`)
const ledger = { date: new Date().toISOString(), project, script, sourceHashes: hashes,
	previousSourceHash: createHash('sha256').update(beforeSource).digest('hex'),
	versionId: result.result?.deployment_id || result.result?.id, status: 'deployed; public verification pending' }
writeFileSync(new URL('status.json', dir), JSON.stringify(ledger, null, 2))
console.log(JSON.stringify(ledger))
