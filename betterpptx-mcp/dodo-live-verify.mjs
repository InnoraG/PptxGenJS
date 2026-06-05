import * as fs from 'node:fs'
import * as path from 'node:path'

const __dirname = path.dirname(new URL(import.meta.url).pathname)
const here = process.platform === 'win32' && __dirname.startsWith('/') ? __dirname.slice(1) : __dirname
const privateDir = path.join(here, '.betterpptx-mcp-runtime')
const envFile = path.join(privateDir, 'dodo-live.env')
const statusFile = path.join(privateDir, 'dodo-live-status.json')
const dodoBase = 'https://live.dodopayments.com'

function readEnvFile(file) {
	if (!fs.existsSync(file)) return {}
	const env = {}
	for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
		const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*?)\s*$/)
		if (!m) continue
		let value = m[2].trim()
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1)
		}
		env[m[1]] = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
	}
	return env
}

function extractItems(data) {
	if (Array.isArray(data)) return data
	for (const key of ['items', 'data', 'results', 'products']) {
		if (Array.isArray(data?.[key])) return data[key]
	}
	return []
}

async function dodo(pathname, { method = 'GET', body, token } = {}) {
	const headers = { Accept: 'application/json' }
	if (token) headers.Authorization = `Bearer ${token}`
	if (body !== undefined) headers['Content-Type'] = 'application/json'
	const response = await fetch(`${dodoBase}${pathname}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body),
	})
	const raw = await response.text()
	let data = null
	try { data = raw ? JSON.parse(raw) : null } catch { data = { raw } }
	if (!response.ok) {
		const msg = data?.message || data?.error || data?.raw || response.statusText
		throw new Error(`Dodo live ${method} ${pathname} failed with HTTP ${response.status}: ${msg}`)
	}
	return data
}

function summarizeProduct(product = {}) {
	return {
		productId: product.product_id || product.id || null,
		name: product.name || null,
		isRecurring: product.is_recurring ?? null,
		licenseKeyEnabled: product.license_key_enabled ?? null,
		taxCategory: product.tax_category || null,
		metadataProduct: product.metadata?.product || null,
	}
}

async function validateLiveLicense(licenseKey) {
	const response = await fetch(`${dodoBase}/licenses/validate`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
		body: JSON.stringify({ license_key: licenseKey }),
	})
	const raw = await response.text()
	let data = null
	try { data = raw ? JSON.parse(raw) : null } catch { data = { raw } }
	if (!response.ok) {
		const msg = data?.message || data?.error || data?.raw || response.statusText
		throw new Error(`Dodo live license validation failed with HTTP ${response.status}: ${msg}`)
	}
	return data || {}
}

async function main() {
	const env = readEnvFile(envFile)
	const token = env.DODO_PAYMENTS_API_KEY || process.env.DODO_PAYMENTS_API_KEY
	if (!token) throw new Error(`DODO_PAYMENTS_API_KEY is missing from ${envFile}.`)

	if (env.BETTERPPTX_DODO_VALIDATE_URL && !String(env.BETTERPPTX_DODO_VALIDATE_URL).startsWith(`${dodoBase}/`)) {
		throw new Error('dodo-live.env is not configured for the Dodo live validation host.')
	}

	const productsPayload = await dodo('/products', { token })
	const products = extractItems(productsPayload)
	const candidates = products
		.filter(p => /betterpptx/i.test(String(p?.name || '')) || /betterpptx/i.test(String(p?.metadata?.product || '')))
		.map(summarizeProduct)

	let activation = { checked: false, valid: null }
	if (env.BETTERPPTX_VERIFY_ACTIVATION_KEY) {
		const validation = await validateLiveLicense(env.BETTERPPTX_VERIFY_ACTIVATION_KEY)
		activation = {
			checked: true,
			valid: validation.valid !== false,
			providerStatus: validation.valid === true ? 'valid' : 'accepted',
		}
		if (validation.valid === false) throw new Error('Saved live activation key was rejected by Dodo live validation.')
	}

	const status = {
		updatedAt: new Date().toISOString(),
		dodoEnvironment: 'live',
		apiKeyVerified: true,
		validateUrl: `${dodoBase}/licenses/validate`,
		productCount: products.length,
		betterpptxProductCandidates: candidates,
		activation,
	}
	fs.mkdirSync(privateDir, { recursive: true })
	fs.writeFileSync(statusFile, `${JSON.stringify(status, null, 2)}\n`, 'utf8')

	const activationText = activation.checked ? `activation=${activation.valid ? 'ok' : 'failed'}` : 'activation=skipped'
	console.log(`DODO LIVE VERIFY: PASS products=${products.length} betterpptxCandidates=${candidates.length} ${activationText}`)
}

main().catch(err => {
	console.error(`DODO LIVE VERIFY: FAIL - ${err?.message || err}`)
	process.exit(1)
})
