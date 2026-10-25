// Maintainer-only account transfer. Records stay in memory, collisions cannot
// overwrite accounts, and the original project is never modified.
import { execFileSync } from 'node:child_process'
import { planSignInUserImport, userIdentityDigest } from './auth-project-users.mjs'

const source = process.env.BETTERPPTX_SOURCE_AUTH_PROJECT
const target = process.env.BETTERPPTX_TARGET_AUTH_PROJECT
for (const project of [source, target]) if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(project || '')) throw new Error('Explicit source and target projects required.')
if (source === target) throw new Error('Source and target must differ.')
const token = execFileSync('powershell.exe', ['-NoProfile', '-Command', 'gcloud auth print-access-token'], { encoding: 'utf8', windowsHide: true }).trim()
async function api(project, suffix, body) {
	const response = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${project}/accounts:${suffix}`, {
		method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'X-Goog-User-Project': project, 'Content-Type': 'application/json' },
		...(body ? { body: JSON.stringify(body) } : {}),
	})
	if (!response.ok) {
		const failure = await response.json().catch(() => ({}))
		const code = String(failure.error?.message || '').split(/[ :]/)[0]
		throw new Error(`Account API failed (${response.status}, ${/^[A-Z_]+$/.test(code) ? code : 'REJECTED'}); no account data printed.`)
	}
	return response.json()
}
async function list(project) {
	const users = []; let next = ''
	do {
		const page = await api(project, `batchGet?maxResults=1000${next ? `&nextPageToken=${encodeURIComponent(next)}` : ''}`)
		users.push(...(page.users || [])); next = page.nextPageToken || ''
	} while (next)
	return users
}
const original = await list(source)
const before = await list(target)
const plan = planSignInUserImport(original, before)
if (process.argv[2] !== '--import-after-verified-test') {
	console.log(JSON.stringify({ mode: 'audit', source, target, sourceCount: original.length, targetCount: before.length, pending: plan.users.length, sourceIdentityDigest: plan.sourceDigest }))
	process.exit(0)
}
const proof = await (await fetch('http://127.0.0.1:48671/status')).json()
if (proof.status !== 'verified' || proof.project !== target) throw new Error('Isolated sign-in test must succeed before account import.')
for (let offset = 0; offset < plan.users.length; offset += 1000) {
	const result = await api(target, 'batchCreate', { users: plan.users.slice(offset, offset + 1000), sanityCheck: true, allowOverwrite: false })
	if (result.error?.length) throw new Error(`Account import reported ${result.error.length} failures; readback required before retry.`)
}
const after = await list(target)
const migrated = after.filter(user => original.some(old => old.localId === user.localId))
if (userIdentityDigest(migrated) !== plan.sourceDigest) throw new Error('Imported account identity/profile parity failed.')
const sourceAfter = await list(source)
if (userIdentityDigest(sourceAfter) !== plan.sourceDigest) throw new Error('Source changed during import; run a final delta transfer before cutover.')
console.log(JSON.stringify({ mode: 'import-verified', source, target, sourceCount: original.length, imported: plan.users.length,
	preserved: migrated.length, targetCount: after.length, identityParity: true, sourceUnchanged: true, sourceIdentityDigest: plan.sourceDigest }))
