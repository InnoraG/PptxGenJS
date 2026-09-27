process.env.BETTERPPTX_PAYRAM_ENABLED = '1'
process.env.BETTERPPTX_PAYRAM_BASE_URL = 'https://payram.example.test'
process.env.BETTERPPTX_PAYRAM_API_KEY = 'payram_api_key_verify_0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN = 'payram_webhook_token_verify_0123456789abcdef'
process.env.BETTERPPTX_PAYRAM_TIMEOUT_MS = '25'
process.env.BETTERPPTX_BILLING_HASH_SALT = 'verify-payram-client-salt'

const {
	createPayramPayment,
	getPayramPaymentStatus,
	normalizePayramPaymentState,
	payramConfigured,
	payramReadiness,
	publicPayramPayment,
	PayRamClientError,
} = await import('./billing/payram-client.mjs')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

function jsonResponse(data, { status = 200, ok = status >= 200 && status < 300 } = {}) {
	return {
		status,
		ok,
		text: async () => JSON.stringify(data),
	}
}

async function expectPayRamError(code, fn, message) {
	let seen = null
	try {
		await fn()
	} catch (error) {
		seen = error
	}
	expect(seen instanceof PayRamClientError && seen.code === code, message, { expected: code, actual: seen?.code, error: seen?.message, details: seen?.details })
	expect(!JSON.stringify(seen).includes(process.env.BETTERPPTX_PAYRAM_API_KEY), 'PayRam error leaked API key.', { code, seen })
	return seen
}

const ready = payramReadiness()
expect(payramConfigured() === true && ready.configured === true && ready.enabled === true, 'Configured PayRam env should be ready.', { ready })
expect(ready.apiKeyFingerprint && !JSON.stringify(ready).includes(process.env.BETTERPPTX_PAYRAM_API_KEY), 'Readiness should expose only an API-key fingerprint.', { ready })

const calls = []
const createPayment = await createPayramPayment({
	customerEmail: 'Buyer@Example.com',
	customerId: 'install_hash_001',
	amountUsd: 5,
	metadata: {
		ignoredByProvider: true,
		apiKey: 'must_not_be_sent',
	},
}, {
	fetchFn: async (url, options) => {
		calls.push({ url, options, body: JSON.parse(options.body) })
		return jsonResponse({
			host: 'https://payram.example.test',
			reference_id: 'payram_reference_001',
			url: 'https://payram.example.test/payments?reference_id=payram_reference_001',
		})
	},
})
expect(calls.length === 1, 'Create payment should call PayRam once.', { calls })
expect(calls[0].url === 'https://payram.example.test/api/v1/payment', 'Create payment endpoint mismatch.', { call: calls[0] })
expect(calls[0].options.method === 'POST', 'Create payment should use POST.', { call: calls[0] })
expect(calls[0].options.headers['API-Key'] === process.env.BETTERPPTX_PAYRAM_API_KEY, 'Create payment should send API-Key header.', { call: calls[0] })
expect(JSON.stringify(calls[0].body) === JSON.stringify({
	customerEmail: 'Buyer@Example.com',
	customerID: 'install_hash_001',
	amountInUSD: 5,
}), 'Create payment body should use only documented fields.', { body: calls[0].body })
expect(createPayment.referenceId === 'payram_reference_001' && createPayment.url.includes('reference_id=payram_reference_001'), 'Create payment response should expose public reference/url.', { createPayment })
expect(createPayment.customerEmailHash && createPayment.customerIdHash, 'Public payment should return hashes for customer identity.', { createPayment })
expect(!JSON.stringify(createPayment).includes('Buyer@Example.com') && !JSON.stringify(createPayment).includes('install_hash_001'), 'Public PayRam payment leaked raw customer identity.', { createPayment })

const statusCalls = []
const status = await getPayramPaymentStatus('payram_reference_001', {
	fetchFn: async (url, options) => {
		statusCalls.push({ url, options })
		return jsonResponse({
			invoiceID: 'invoice_001',
			customerID: '0',
			amountInUSD: '5',
			paymentState: 'FILLED',
			referenceID: 'payram_reference_001',
			filled_amount_in_usd: 5,
			fee_in_usd: 0.15,
			createdAt: '2026-06-17T00:00:00.000Z',
		})
	},
})
expect(statusCalls[0].url === 'https://payram.example.test/api/v1/payment/reference/payram_reference_001', 'Status endpoint mismatch.', { statusCalls })
expect(statusCalls[0].options.method === 'GET', 'Status should default to GET.', { statusCalls })
expect(status.state === 'paid' && status.creditable === true && status.providerStatus === 'FILLED', 'FILLED status should normalize as creditable paid.', { status })
expect(status.providerFilledAmountUsd === 5 && status.providerFeeUsd === 0.15, 'Status should preserve fee/filled amount fields without hardcoding credit policy.', { status })

process.env.BETTERPPTX_PAYRAM_STATUS_METHOD = 'POST'
const postStatus = await getPayramPaymentStatus('payram_reference_002', {
	fetchFn: async (url, options) => {
		expect(options.method === 'POST' && options.body === '{}', 'Configured POST status method should send an empty JSON body.', { url, options })
		return jsonResponse({ reference_id: 'payram_reference_002', paymentState: 'OPEN', amountInUSD: '10' })
	},
})
delete process.env.BETTERPPTX_PAYRAM_STATUS_METHOD
expect(postStatus.state === 'open' && postStatus.creditable === false, 'OPEN status should not be creditable.', { postStatus })

const states = [
	['OPEN', 'open', false],
	['PARTIALLY_FILLED', 'partial', false],
	['FILLED', 'paid', true],
	['OVER_FILLED', 'paid', true],
	['CANCELLED', 'cancelled', false],
	['UNKNOWN_VENDOR_STATE', 'verification_pending', false],
]
for (const [providerStatus, expectedState, creditable] of states) {
	const normalized = normalizePayramPaymentState({ reference_id: `ref_${providerStatus}`, paymentState: providerStatus })
	expect(normalized.state === expectedState && normalized.creditable === creditable, 'PayRam state normalization mismatch.', { providerStatus, normalized })
}

await expectPayRamError('PAYRAM_INVALID_JSON', () => createPayramPayment({
	customerEmail: 'Buyer@Example.com',
	customerId: 'install_hash_001',
	amountUsd: 5,
}, {
	fetchFn: async () => ({
		status: 200,
		ok: true,
		text: async () => '{not json',
	}),
}), 'Invalid JSON should fail safely.')

await expectPayRamError('PAYRAM_HTTP_ERROR', () => getPayramPaymentStatus('bad_reference', {
	fetchFn: async () => jsonResponse({
		error: `bad ${process.env.BETTERPPTX_PAYRAM_API_KEY}`,
	}, { status: 500 }),
}), 'HTTP errors should fail safely.')

await expectPayRamError('PAYRAM_TIMEOUT', () => getPayramPaymentStatus('slow_reference', {
	timeoutMs: 5,
	fetchFn: async (_url, options) => new Promise((_resolve, reject) => {
		options.signal.addEventListener('abort', () => {
			const error = new Error('aborted')
			error.name = 'AbortError'
			reject(error)
		})
	}),
}), 'Timeouts should fail safely.')

await expectPayRamError('PAYRAM_NOT_CONFIGURED', () => createPayramPayment({
	customerEmail: 'Buyer@Example.com',
	customerId: 'install_hash_001',
	amountUsd: 5,
}, {
	env: {
		BETTERPPTX_PAYRAM_ENABLED: '1',
		BETTERPPTX_PAYRAM_BASE_URL: 'https://payram.example.test',
		BETTERPPTX_PAYRAM_API_KEY: '',
		BETTERPPTX_PAYRAM_WEBHOOK_CUSTOM_TOKEN: '',
	},
	fetchFn: async () => jsonResponse({}),
}), 'Missing config should fail closed.')

const publicPayment = publicPayramPayment({
	reference_id: 'public_ref',
	url: 'https://payram.example.test/payments?reference_id=public_ref',
	customerEmail: 'Buyer@Example.com',
	customerID: 'install_hash_001',
	paymentState: 'PARTIALLY_FILLED',
	amountInUSD: '5',
	filled_amount_in_usd: '4.8',
})
expect(publicPayment.referenceId === 'public_ref' && publicPayment.state === 'partial', 'Public payment should normalize partial state.', { publicPayment })
expect(!JSON.stringify(publicPayment).includes('Buyer@Example.com') && !JSON.stringify(publicPayment).includes('install_hash_001'), 'Public payment should not expose raw customer data.', { publicPayment })

console.log('PAYRAM CLIENT: PASS create=1 documentedFields=1 status=1 normalization=1 timeout=1 invalidJson=1 sanitizedErrors=1')
