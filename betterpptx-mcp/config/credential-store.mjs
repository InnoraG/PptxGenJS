// CENTRAL CREDENTIAL STORE — runtime reader (M-cred). The single parameter store for ALL
// provider tokens/keys (stock, image-gen, Modal workers, avatar, HF, …), with UNLIMITED
// accounts per provider to enable free-tier ROTATION.
//
// The store file is `credential-store.json` next to this module (override with
// BETTERPPTX_CREDENTIAL_STORE). It is GITIGNORED — it holds real secrets. It is managed by
// the localhost web UI (tools/betterpptx-mcp-param-store.mjs); this module is the read-only
// runtime consumer. Reads are mtime-cached, so UI edits are picked up LIVE (no restart).
//
// Consumption model:
//   - Most subsystems read creds from env (.mcp.json env block). The UI's "Apply" writes each
//     provider's ACTIVE account into .mcp.json — full generality with zero engine changes.
//   - Rotation-aware providers (image-gen Cloudflare) additionally read the FULL account list
//     here at request time and rotate across accounts on free-tier exhaustion.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

export const CREDENTIAL_STORE_VERSION = 'betterpptx.credential-store.v1'

export function credentialStorePath() {
	const explicit = String(process.env.BETTERPPTX_CREDENTIAL_STORE || '').trim()
	if (explicit) return path.resolve(explicit)
	return path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'credential-store.json')
}

let cache = { path: '', stamp: '', data: null }

export function loadCredentialStore({ refresh = false } = {}) {
	const file = credentialStorePath()
	let stat
	try { stat = fs.statSync(file) } catch { cache = { path: file, stamp: '', data: null }; return null }
	// mtimeMs is only millisecond-resolution on some Windows/filesystem combinations;
	// rapid owner/UI rewrites can otherwise reuse stale credentials. Prefer nanoseconds,
	// with size as a fallback for runtimes that do not expose mtimeNs.
	const stamp = stat.mtimeNs != null ? `${stat.mtimeNs.toString()}:${stat.size}` : `${stat.mtimeMs}:${stat.size}`
	if (!refresh && cache.data && cache.path === file && cache.stamp === stamp) return cache.data
	try {
		// Windows PowerShell 5 writes UTF-8 with a BOM. Accept that owner-managed
		// store encoding while keeping the public/runtime schema strict.
		const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
		const data = JSON.parse(raw)
		if (data?.schemaVersion !== CREDENTIAL_STORE_VERSION) return null
		cache = { path: file, stamp, data }
		return data
	} catch { return null }
}

// Enabled accounts for a provider, ACTIVE account first, then declared order. Each account:
// { id, label, enabled, env: { ENV_KEY: value, ... }, notes }. Empty array = store absent /
// provider absent → callers fall back to plain env vars.
export function credentialAccounts(providerId) {
	const store = loadCredentialStore()
	const provider = store?.providers?.[String(providerId || '')]
	if (!provider || !Array.isArray(provider.accounts)) return []
	const enabled = provider.accounts.filter(account =>
		account && account.enabled !== false && account.env && typeof account.env === 'object' && !Array.isArray(account.env))
	const active = enabled.filter(account => account.id === provider.activeAccountId)
	const rest = enabled.filter(account => account.id !== provider.activeAccountId)
	return [...active, ...rest]
}
