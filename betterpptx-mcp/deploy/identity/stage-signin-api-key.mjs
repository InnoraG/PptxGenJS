// Stage a new authentication browser key in the existing infrastructure's
// Secret Manager without changing the currently deployed secret or its versions.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
const infra = process.env.BETTERPPTX_INFRASTRUCTURE_PROJECT
const keyResource = process.env.BETTERPPTX_NEW_SIGNIN_KEY_RESOURCE
const secret = process.env.BETTERPPTX_NEW_SIGNIN_SECRET
const runtime = process.env.BETTERPPTX_RUNTIME_SERVICE_ACCOUNT
if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(infra || '') || !/^projects\/\d+\/locations\/global\/keys\/[a-z0-9-]+$/.test(keyResource || '') || !/^[a-zA-Z0-9_-]+$/.test(secret || '') || !/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/.test(runtime || '')) throw new Error('Explicit validated deployment identities required.')
const token = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token'], { encoding: 'utf8', windowsHide: true }).trim()
async function api(url, body, allowMissing = false) {
	const response = await fetch(url, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Goog-User-Project': infra }, ...(body ? { body: JSON.stringify(body) } : {}) })
	if (allowMissing && response.status === 404) return null
	if (!response.ok) throw new Error(`Credential staging API failed (${response.status}); no credential details printed.`)
	return response.json()
}
const key = (await api(`https://apikeys.googleapis.com/v2/${keyResource}/keyString`)).keyString
if (!/^[A-Za-z0-9_-]{20,100}$/.test(key || '')) throw new Error('Invalid browser key.')
const parent = `https://secretmanager.googleapis.com/v1/projects/${infra}`
const name = `${parent}/secrets/${secret}`
if (!await api(name, null, true)) await api(`${parent}/secrets?secretId=${secret}`, { replication: { automatic: {} } })
const existing = await api(`${name}/versions/latest:access`, null, true)
let version
if (existing && Buffer.from(existing.payload.data, 'base64').toString('utf8') === key) version = existing.name
else version = (await api(`${name}:addVersion`, { payload: { data: Buffer.from(key).toString('base64') } })).name
const policy = await api(`${name}:getIamPolicy`)
policy.bindings ||= []
let binding = policy.bindings.find(b => b.role === 'roles/secretmanager.secretAccessor' && !b.condition)
if (!binding) { binding = { role: 'roles/secretmanager.secretAccessor', members: [] }; policy.bindings.push(binding) }
const member = `serviceAccount:${runtime}`
if (!binding.members.includes(member)) {
	binding.members.push(member)
	await api(`${name}:setIamPolicy`, { policy })
}
console.log(JSON.stringify({ secretVersion: version, browserKeyFingerprint: createHash('sha256').update(key).digest('hex'), previousSecretUntouched: true }))
