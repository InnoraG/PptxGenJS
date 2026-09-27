import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { normalizeEvmAddress } from './address-inventory.mjs'
import { configuredCryptoPacks } from './crypto-packs.mjs'
import { configuredBaseNetwork } from './base-network.mjs'
import { createBillingLedgerStore } from './ledger-store.mjs'
import { meteredFirestoreGet, meteredFirestoreQueryGet, runMeteredFirestoreTransaction } from './firestore-meter.mjs'
import { recordResourceUsage } from './resource-meter.mjs'
import { eip3009SettlementId, settleX402PaymentSelf, verifyX402PaymentForQuote, verifyX402SettlementReceipt, x402QuoteAuthorizationNonce, x402SettlementMode } from './x402-self-settle.mjs'
import { withLocalBillingFileLock, withX402BroadcastOnce, writeBillingJsonAtomically } from './relayer-lease.mjs'
import { isProductionBillingEnvironment } from './security-policy.mjs'
import { recordBillingCreditTelemetry } from '../telemetry.mjs'
import { createJobPaymentBinding, createJobPaymentRecord, publicJobPayment, transitionJobPayment } from './job-payment-contract.mjs'

export class X402PackError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'X402PackError'
		this.code = code
		this.details = details
	}
}

function providerName() {
	return String(process.env.BETTERPPTX_X402_STORE || process.env.BETTERPPTX_BILLING_LEDGER_STORE || 'local').trim().toLowerCase()
}

function storeFile() {
	const configured = String(process.env.BETTERPPTX_X402_FILE || '').trim()
	if (configured) return path.resolve(configured)
	const root = String(process.env.BETTERPPTX_OUT_DIR || process.env.BETTERPPTX_DOWNLOAD_ROOT || 'outputs').trim()
	return path.resolve(root, 'betterpptx-x402-quotes.json')
}

function prefix() {
	return String(process.env.BETTERPPTX_FIRESTORE_BILLING_PREFIX || 'betterpptx_billing').trim()
}

function quoteTtlSeconds() {
	const value = Number(process.env.BETTERPPTX_X402_QUOTE_TTL_SECONDS)
	return Number.isFinite(value) && value >= 60 ? Math.round(value) : 10 * 60
}

function serviceFulfillmentLeaseMs() {
	const value = Number(process.env.BETTERPPTX_X402_SERVICE_FULFILLMENT_LEASE_MS)
	return Number.isFinite(value) && value >= 1000 ? Math.round(value) : 120000
}

function treasuryAddress() {
	try {
		const address = normalizeEvmAddress(process.env.BETTERPPTX_TREASURY_EVM_ADDRESS)
		if (/^0x0{40}$/.test(address)) throw new Error('Zero treasury')
		return address
	} catch {
		throw new X402PackError('X402_TREASURY_NOT_CONFIGURED', 'x402 payment is not configured for this deployment.')
	}
}

function packById(packId) {
	const pack = configuredCryptoPacks().find(item => item.id === String(packId))
	if (!pack) throw new X402PackError('CRYPTO_PACK_NOT_FOUND', 'The requested credit pack is unavailable.')
	return pack
}

function normalizedQuotePack({ packId, packOverride = null } = {}) {
	const paymentNetwork = configuredBaseNetwork()
	if (!packOverride) return packById(packId)
	const id = String(packOverride.id || packId || '').trim()
	const credits = Number(packOverride.credits)
	const priceUsdc = Number(packOverride.priceUsdc)
	if (!id || !Number.isFinite(credits) || credits <= 0 || !Number.isFinite(priceUsdc) || priceUsdc <= 0) {
		throw new X402PackError('CRYPTO_PACK_INVALID', 'The requested payment quote is unavailable.')
	}
	return {
		id,
		credits: Number(credits.toFixed(2)),
		priceUsdc: Number(priceUsdc.toFixed(6)),
		asset: 'USDC',
		network: paymentNetwork.displayName,
		...(packOverride.metadata && typeof packOverride.metadata === 'object' ? { metadata: JSON.parse(JSON.stringify(packOverride.metadata)) } : {}),
	}
}

function nowIso() {
	return new Date().toISOString()
}

function newLeaseToken() {
	return `qfl_${Date.now().toString(36)}_${crypto.randomBytes(12).toString('hex')}`
}

function updateJobPayment(quote, state, patch = {}) {
	if (!quote?.jobPayment || typeof quote.jobPayment !== 'object') return quote?.jobPayment || null
	return transitionJobPayment(quote.jobPayment, state, patch, { nowMs: Date.now() })
}

function serviceResultDigest(result) {
	return crypto.createHash('sha256').update(JSON.stringify(result ?? null)).digest('hex')
}

function createQuoteRecord({ installHash = '', jobId = '', jobBindingDigest = '', packId, packOverride = null, envelopeJti = '', nowMs = Date.now() } = {}) {
	if (!installHash && !jobId) throw new X402PackError('X402_PAYMENT_BINDING_MISSING', 'An installation or job identity is required before payment can be requested.')
	const pack = normalizedQuotePack({ packId, packOverride })
	const paymentNetwork = configuredBaseNetwork()
	const quoteId = `x402q_${crypto.randomBytes(16).toString('hex')}`
	const expiresAt = new Date(nowMs + quoteTtlSeconds() * 1000).toISOString()
	const amountAtomic = String(Math.round(pack.priceUsdc * 1e6))
	if (!Number.isSafeInteger(Number(amountAtomic)) || Number(amountAtomic) <= 0 || !Number.isFinite(pack.credits) || pack.credits <= 0) {
		throw new X402PackError('CRYPTO_PACK_INVALID', 'The requested payment quote is unavailable.')
	}
	const metadata = pack.metadata && typeof pack.metadata === 'object' ? pack.metadata : {}
	const jobBindingSeed = metadata.jobBindingSeed && typeof metadata.jobBindingSeed === 'object' ? metadata.jobBindingSeed : null
	const jobPayment = metadata.settlementMode === 'job' || metadata.paymentModel === 'one_payment_per_job'
		? createJobPaymentRecord({
			binding: createJobPaymentBinding({
				productId: 'betterpptx',
				jobId: String(metadata.jobId || jobId || ''),
				operation: String(jobBindingSeed?.operation || metadata.toolName || 'betterpptx.deck.generate_from_spec'),
				inputDigest: String(jobBindingSeed?.inputDigest || metadata.specDigest || metadata.pricingInputDigest || ''),
				outputProfile: jobBindingSeed?.outputProfile || { service: 'generate_deck_from_spec' },
				limits: jobBindingSeed?.limits || { maxQuotedCredits: Number(metadata.quoteCapCredits || pack.credits) },
				amountAtomic,
				asset: 'USDC',
				assetContract: paymentNetwork.tokenContract,
				network: paymentNetwork.network,
				payTo: treasuryAddress(),
				expiresAt,
				quoteId,
				preparationDigest: String(metadata.preparedTimelineDigest || ''),
				narrationDigest: String(metadata.narrationDigest || ''),
				nowMs,
			}),
			nowMs,
		})
		: null
	return {
		quoteId,
		...(installHash ? { installHash: String(installHash), customerHash: String(installHash) } : { installHash: null, customerHash: null }),
		...(jobId ? { jobId: String(jobId), jobBindingDigest: String(jobBindingDigest || '') } : {}),
		envelopeJti: String(envelopeJti || ''),
		packId: pack.id,
		credits: pack.credits,
		priceUsdc: pack.priceUsdc,
		...(pack.metadata ? { packMetadata: pack.metadata } : {}),
		...(metadata.quoteSchemaVersion ? { quoteSchemaVersion: String(metadata.quoteSchemaVersion) } : {}),
		...(metadata.pricingModel ? { pricingModel: String(metadata.pricingModel) } : {}),
		...(metadata.pricingInputDigest ? { pricingInputDigest: String(metadata.pricingInputDigest) } : {}),
		...(metadata.specDigest ? { specDigest: String(metadata.specDigest) } : {}),
		...(metadata.estimatedPlanDigest ? { estimatedPlanDigest: String(metadata.estimatedPlanDigest) } : {}),
		...(metadata.planDigest ? { planDigest: String(metadata.planDigest) } : {}),
		...(metadata.rateCardVersion ? { rateCardVersion: String(metadata.rateCardVersion) } : {}),
		...(Number.isFinite(Number(metadata.quoteCapCredits)) ? { quoteCapCredits: Number(metadata.quoteCapCredits) } : {}),
		...(Number.isFinite(Number(metadata.projectedOutputBytes)) ? { projectedOutputBytes: Number(metadata.projectedOutputBytes) } : {}),
		...(metadata.settlementMode ? { settlementMode: String(metadata.settlementMode) } : {}),
		...(metadata.paymentModel ? { paymentModel: String(metadata.paymentModel) } : {}),
		...(jobPayment ? { jobPayment } : {}),
		...(metadata.jobId || jobId ? { jobId: String(metadata.jobId || jobId) } : {}),
		...(metadata.jobBindingDigest ? { jobBindingDigest: String(metadata.jobBindingDigest) } : {}),
		amountAtomic,
		asset: 'USDC',
		network: paymentNetwork.network,
		chainId: paymentNetwork.chainId,
		tokenContract: paymentNetwork.tokenContract,
		payTo: treasuryAddress(),
		nonce: crypto.randomBytes(16).toString('hex'),
		authorizationBindingVersion: 1,
		eip712Name: String(process.env.BETTERPPTX_USDC_EIP712_NAME || 'USD Coin'),
		eip712Version: String(process.env.BETTERPPTX_USDC_EIP712_VERSION || '2'),
		state: 'quoted',
		createdAt: new Date(nowMs).toISOString(),
		expiresAt,
		updatedAt: new Date(nowMs).toISOString(),
	}
}

function publicQuote(quote = {}) {
	const publicBase = String(process.env.BETTERPPTX_PAYMENT_BASE_URL || process.env.BETTERPPTX_PUBLIC_BASE || '').trim().replace(/\/+$/, '')
	const isJobPayment = quote.settlementMode === 'job' || quote.paymentModel === 'one_payment_per_job'
	const resourceUrl = publicBase && quote.packId && !isJobPayment
		? `${publicBase}/pay/x402/${isJobPayment ? 'jobs' : 'credit-packs'}/${encodeURIComponent(quote.jobId || quote.packId)}`
		: undefined
	return {
		x402Version: 2,
		...(resourceUrl ? {
			resource: {
				url: resourceUrl,
				description: isJobPayment
					? 'Authorize one bounded BetterPPTX job. The payment does not create a reusable product balance.'
					: `Purchase ${quote.credits} BetterPPTX prepaid credits.`,
				mimeType: 'application/json',
			},
		} : {}),
		quoteId: quote.quoteId,
		...(isJobPayment ? {
			jobId: quote.jobId || null,
			paymentModel: 'one_payment_per_job',
			bindingDigest: quote.jobPayment?.binding?.bindingDigest || quote.jobBindingDigest || null,
		} : { packId: quote.packId, credits: quote.credits }),
		expiresAt: quote.expiresAt,
		accepts: [{
			scheme: 'exact',
			network: quote.network,
			asset: quote.tokenContract,
			amount: quote.amountAtomic,
			payTo: quote.payTo,
			maxTimeoutSeconds: quoteTtlSeconds(),
			extra: {
				assetSymbol: quote.asset,
				assetDecimals: 6,
				name: quote.eip712Name || 'USD Coin',
				version: quote.eip712Version || '2',
				...(quote.authorizationBindingVersion === 1 ? {
					authorizationBinding: 'quote_nonce_v1',
					authorizationNonce: x402QuoteAuthorizationNonce(quote),
				} : {}),
				quoteId: quote.quoteId,
				quoteFingerprint: crypto.createHash('sha256').update(`${quote.quoteId}:${quote.nonce}`).digest('hex').slice(0, 32),
			},
		}],
	}
}

function emptyStore() {
	return { version: 1, quotes: {}, envelopes: {}, settlements: {}, authorizations: {} }
}

function claimPaymentRecord(quote, authorizationId, existing) {
	if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
	if (!/^eip3009_[a-f0-9]{32}$/.test(authorizationId || '')) throw new X402PackError('X402_PAYMENT_INVALID', 'x402 payment verification failed.')
	if ((quote.paymentAuthorizationId && quote.paymentAuthorizationId !== authorizationId)
		|| (existing && existing.quoteId !== quote.quoteId)) {
		throw new X402PackError('X402_AUTHORIZATION_REPLAYED', 'Payment authorization was already assigned.')
	}
	return { ...quote, paymentAuthorizationId: authorizationId, updatedAt: nowIso() }
}

function settlementKeys(quote, settlement) {
	return [settlement.settlementId, `tx_${crypto.createHash('sha256').update(`${quote.network}:${settlement.txHash}`).digest('hex')}`]
}

function claimSettlementRecord(quote, settlement, existing = []) {
	if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
	if (!settlement?.settlementId || quote.paymentAuthorizationId !== settlement.settlementId
		|| !/^0x[a-f0-9]{64}$/.test(settlement.txHash || '') || settlement.network !== quote.network
		|| !/^0x[a-f0-9]{40}$/.test(settlement.payer || '')) {
		throw new X402PackError('X402_SETTLEMENT_INVALID', 'x402 settlement receipt is invalid.')
	}
	if (existing.some(record => record && record.quoteId !== quote.quoteId)) throw new X402PackError('X402_SETTLEMENT_REPLAYED', 'x402 settlement was already used.')
	if (quote.pendingSettlement && (quote.pendingSettlement.settlementId !== settlement.settlementId
		|| quote.pendingSettlement.txHash !== settlement.txHash || quote.pendingSettlement.payer !== settlement.payer)) {
		throw new X402PackError('X402_SETTLEMENT_REPLAYED', 'x402 quote already has a different settlement.')
	}
	return { ...quote, state: quote.state === 'settled' ? 'settled' : 'settling', pendingSettlement: quote.pendingSettlement || settlement, updatedAt: nowIso() }
}

function createLocalStore() {
	if (['1', 'true', 'yes', 'on'].includes(String(process.env.BETTERPPTX_REQUIRE_SHARED_STORES || '').toLowerCase())) {
		throw new X402PackError('X402_STORE_NOT_SHARED', 'x402 quote storage is not configured for this deployment.')
	}
	const file = storeFile()

	function load() {
		try {
			const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
			if (parsed?.version !== 1 || !['quotes', 'envelopes', 'settlements'].every(key => parsed[key] && typeof parsed[key] === 'object' && !Array.isArray(parsed[key]))
				|| (parsed.authorizations !== undefined && (!parsed.authorizations || typeof parsed.authorizations !== 'object' || Array.isArray(parsed.authorizations)))) throw new Error('Invalid store')
			return { ...emptyStore(), ...parsed }
		} catch (error) {
			if (error.code === 'ENOENT') return emptyStore()
			throw new X402PackError('X402_STORE_UNAVAILABLE', 'x402 payment storage requires recovery.')
		}
	}

	function save(store) {
		writeBillingJsonAtomically(file, store)
	}

	function withLock(fn) {
		return withLocalBillingFileLock(file, fn)
	}

	async function createQuote(input = {}) {
		return withLock(() => {
			const store = load()
			if (input.envelopeJti && store.envelopes[input.envelopeJti]) throw new X402PackError('PAYMENT_ENVELOPE_REPLAYED', 'Payment link was already used.')
			const quote = createQuoteRecord(input)
			store.quotes[quote.quoteId] = quote
			if (input.envelopeJti) store.envelopes[input.envelopeJti] = { quoteId: quote.quoteId, usedAt: nowIso() }
			save(store)
			return quote
		})
	}

	async function getQuote(quoteId) {
		const quote = load().quotes[String(quoteId)]
		return quote ? JSON.parse(JSON.stringify(quote)) : null
	}

	async function getQuoteByEnvelopeJti(envelopeJti) {
		const store = load()
		const quoteId = store.envelopes[String(envelopeJti)]?.quoteId
		if (!quoteId) return null
		const quote = store.quotes[String(quoteId)]
		return quote ? JSON.parse(JSON.stringify(quote)) : null
	}

	async function getQuoteByJobId(jobId) {
		const value = String(jobId || '').trim()
		if (!value) return null
		const store = load()
		const quote = Object.values(store.quotes).find(candidate => String(candidate?.jobId || '') === value)
		return quote ? JSON.parse(JSON.stringify(quote)) : null
	}

	async function markSettled(quoteId, settlement = {}) {
		return withLock(() => {
			const store = load()
			const quote = store.quotes[String(quoteId)]
			if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			if (quote.state === 'settled') return { quote, idempotent: true }
			if (quote.state !== 'settling' || !quote.pendingSettlement) throw new X402PackError('X402_SETTLEMENT_NOT_CLAIMED', 'Payment settlement must be reserved before crediting.')
			claimSettlementRecord(quote, settlement)
			const settlementId = String(settlement.settlementId || settlement.id || '').trim()
			if (!settlementId) throw new X402PackError('X402_SETTLEMENT_INVALID', 'x402 settlement receipt is invalid.')
			const existing = store.settlements[settlementId]
			if (existing && existing.quoteId !== quote.quoteId) throw new X402PackError('X402_SETTLEMENT_REPLAYED', 'x402 settlement was already used.')
			const next = {
				...quote,
				state: 'settled',
				settlementId,
				settlementTxHash: String(settlement.txHash || settlement.transaction || '').toLowerCase() || null,
				settlementPayer: String(settlement.payer || '').toLowerCase() || null,
				settlementRoute: String(settlement.route || 'facilitator'),
				settlementFingerprint: crypto.createHash('sha256').update(JSON.stringify(settlement)).digest('hex'),
				settledAt: nowIso(),
				updatedAt: nowIso(),
			}
			if (next.jobPayment && typeof next.jobPayment === 'object') {
				next.jobPayment = transitionJobPayment(next.jobPayment, 'paid', {
					payment: {
						settlementId,
						txHash: next.settlementTxHash,
						payer: next.settlementPayer,
						settledAt: next.settledAt,
					},
				}, { nowMs: Date.now() })
			}
			store.quotes[quote.quoteId] = next
			store.settlements[settlementId] = { settlementId, quoteId: quote.quoteId, txHash: next.settlementTxHash, settledAt: next.settledAt }
			save(store)
			return { quote: next, idempotent: false }
		})
	}

	async function claimQuotePayment(quoteId, authorizationId) {
		return withLock(() => {
			const data = load()
			const quote = claimPaymentRecord(data.quotes[String(quoteId)], authorizationId, data.authorizations[authorizationId])
			data.quotes[quote.quoteId] = quote
			data.authorizations[authorizationId] = { quoteId: quote.quoteId, authorizationId }
			save(data)
			return quote
		})
	}

	async function claimSettlement(quoteId, settlement) {
		return withLock(() => {
			const data = load()
			const quote = data.quotes[String(quoteId)]
			if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			const keys = settlementKeys(quote, settlement)
			const next = claimSettlementRecord(quote, settlement, keys.map(key => data.settlements[key]))
			data.quotes[quote.quoteId] = next
			for (const key of keys) data.settlements[key] = { quoteId: quote.quoteId, settlementId: settlement.settlementId, txHash: settlement.txHash }
			save(data)
			return { quote: next, idempotent: quote.state === 'settled' }
		})
	}

	async function getQuoteServiceResult(quoteId) {
		const quote = load().quotes[String(quoteId)]
		return quote?.serviceResult ? JSON.parse(JSON.stringify(quote.serviceResult)) : null
	}

	async function claimQuoteServiceFulfillment(quoteId, { inputDigest = '', nowMs = Date.now(), leaseMs = serviceFulfillmentLeaseMs() } = {}) {
		return withLock(() => {
			const store = load()
			const quote = store.quotes[String(quoteId)]
			if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			if (quote.serviceResult) return { state: 'completed', serviceResult: JSON.parse(JSON.stringify(quote.serviceResult)) }
			const current = quote.serviceFulfillment && typeof quote.serviceFulfillment === 'object' ? quote.serviceFulfillment : null
			const currentExpires = Date.parse(current?.leaseExpiresAt || 0)
			if (current?.state === 'running' && currentExpires > nowMs) {
				if (current.inputDigest && inputDigest && current.inputDigest !== inputDigest) {
					throw new X402PackError('X402_SERVICE_FULFILLMENT_CONFLICT', 'A different paid service fulfillment is already running for this quote.')
				}
				return { state: 'busy', leaseExpiresAt: current.leaseExpiresAt }
			}
			const leaseToken = newLeaseToken()
			const now = new Date(nowMs).toISOString()
			const next = {
				...quote,
				serviceFulfillment: {
					state: 'running',
					inputDigest: String(inputDigest || ''),
					leaseToken,
					startedAt: current?.startedAt || now,
					leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
					updatedAt: now,
				},
				updatedAt: now,
			}
			if (next.jobPayment) next.jobPayment = updateJobPayment(quote, 'running', {
					execution: { updatedAt: now },
			})
			store.quotes[quote.quoteId] = next
			save(store)
			return { state: 'claimed', leaseToken, leaseExpiresAt: next.serviceFulfillment.leaseExpiresAt }
		})
	}

	async function saveQuoteServiceResult(quoteId, serviceResult = {}, { leaseToken = '' } = {}) {
		return withLock(() => {
			const store = load()
			const quote = store.quotes[String(quoteId)]
			if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			if (quote.serviceResult) return JSON.parse(JSON.stringify(quote.serviceResult))
			if (leaseToken && quote.serviceFulfillment?.leaseToken !== leaseToken) {
				throw new X402PackError('X402_SERVICE_FULFILLMENT_LEASE_LOST', 'Paid service fulfillment lease was lost.')
			}
			const next = {
				...quote,
				serviceResult: JSON.parse(JSON.stringify(serviceResult)),
				serviceFulfillment: {
					...(quote.serviceFulfillment || {}),
					state: 'completed',
					completedAt: nowIso(),
				},
				serviceResultSavedAt: nowIso(),
				updatedAt: nowIso(),
			}
			if (next.jobPayment) next.jobPayment = updateJobPayment(quote, 'succeeded', {
				execution: {
					resultDigest: serviceResultDigest(serviceResult),
					updatedAt: nowIso(),
				},
			})
			store.quotes[quote.quoteId] = next
			save(store)
			return JSON.parse(JSON.stringify(next.serviceResult))
		})
	}

	async function releaseQuoteServiceFulfillment(quoteId, { leaseToken = '', errorCode = '' } = {}) {
		return withLock(() => {
			const store = load()
			const quote = store.quotes[String(quoteId)]
			if (!quote || quote.serviceResult) return false
			if (leaseToken && quote.serviceFulfillment?.leaseToken !== leaseToken) return false
			const next = {
				...quote,
				serviceFulfillment: {
					...(quote.serviceFulfillment || {}),
					state: 'released',
					errorCode: String(errorCode || ''),
					releasedAt: nowIso(),
				},
				updatedAt: nowIso(),
			}
			if (next.jobPayment) next.jobPayment = updateJobPayment(quote, 'failed', {
				execution: { errorCode: String(errorCode || 'PAID_SERVICE_FAILED'), updatedAt: nowIso() },
			})
			store.quotes[quote.quoteId] = next
			save(store)
			return true
		})
	}

	return { provider: 'local', shared: false, file, createQuote, getQuote, getQuoteByEnvelopeJti, getQuoteByJobId, claimQuotePayment, claimSettlement, markSettled, getQuoteServiceResult, claimQuoteServiceFulfillment, saveQuoteServiceResult, releaseQuoteServiceFulfillment }
}

let firestorePromise = null
async function firestore() {
	if (!firestorePromise) {
		firestorePromise = import('@google-cloud/firestore').then(({ Firestore }) => new Firestore({
			projectId: process.env.BETTERPPTX_GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || undefined,
			databaseId: process.env.BETTERPPTX_FIRESTORE_DATABASE || undefined,
		}))
	}
	return firestorePromise
}

function createFirestoreStore(suppliedDb = null) {
	async function refs() {
		const db = suppliedDb || await firestore()
		return {
			db,
			quotes: db.collection(`${prefix()}_x402_quotes`),
			envelopes: db.collection(`${prefix()}_x402_envelopes`),
			settlements: db.collection(`${prefix()}_x402_settlements`),
			authorizations: db.collection(`${prefix()}_x402_authorizations`),
		}
	}

	async function createQuote(input = {}) {
		const quote = createQuoteRecord(input)
		const r = await refs()
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const envelopeRef = input.envelopeJti ? r.envelopes.doc(String(input.envelopeJti)) : null
			if (envelopeRef) {
				const envelopeSnap = await tx.get(envelopeRef)
				if (envelopeSnap.exists) throw new X402PackError('PAYMENT_ENVELOPE_REPLAYED', 'Payment link was already used.')
			}
			tx.create(r.quotes.doc(quote.quoteId), quote)
			if (envelopeRef) tx.create(envelopeRef, { quoteId: quote.quoteId, usedAt: nowIso() })
			return quote
		})
	}

	async function getQuote(quoteId) {
		const snap = await meteredFirestoreGet((await refs()).quotes.doc(String(quoteId)))
		return snap.exists ? snap.data() || null : null
	}

	async function getQuoteByEnvelopeJti(envelopeJti) {
		const r = await refs()
		const envelopeSnap = await meteredFirestoreGet(r.envelopes.doc(String(envelopeJti)))
		if (!envelopeSnap.exists) return null
		const quoteId = String(envelopeSnap.data()?.quoteId || '')
		if (!quoteId) return null
		const quoteSnap = await meteredFirestoreGet(r.quotes.doc(quoteId))
		return quoteSnap.exists ? quoteSnap.data() || null : null
	}

	async function getQuoteByJobId(jobId) {
		const value = String(jobId || '').trim()
		if (!value) return null
		const r = await refs()
		const snapshot = await meteredFirestoreQueryGet(r.quotes.where('jobId', '==', value).limit(1))
		const quote = snapshot.docs?.[0]?.data?.() || null
		return quote
	}

	async function markSettled(quoteId, settlement = {}) {
		const r = await refs()
		const quoteRef = r.quotes.doc(String(quoteId))
		const settlementId = String(settlement.settlementId || settlement.id || '').trim()
		if (!settlementId) throw new X402PackError('X402_SETTLEMENT_INVALID', 'x402 settlement receipt is invalid.')
		const settlementRef = r.settlements.doc(settlementId)
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const [quoteSnap, settlementSnap] = await Promise.all([tx.get(quoteRef), tx.get(settlementRef)])
			if (!quoteSnap.exists) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			const quote = quoteSnap.data() || {}
			if (quote.state === 'settled') return { quote, idempotent: true }
			if (quote.state !== 'settling' || !quote.pendingSettlement) throw new X402PackError('X402_SETTLEMENT_NOT_CLAIMED', 'Payment settlement must be reserved before crediting.')
			claimSettlementRecord(quote, settlement)
			if (settlementSnap.exists && settlementSnap.data()?.quoteId !== quote.quoteId) throw new X402PackError('X402_SETTLEMENT_REPLAYED', 'x402 settlement was already used.')
			const next = {
				...quote,
				state: 'settled',
				settlementId,
				settlementTxHash: String(settlement.txHash || settlement.transaction || '').toLowerCase() || null,
				settlementPayer: String(settlement.payer || '').toLowerCase() || null,
				settlementRoute: String(settlement.route || 'facilitator'),
				settlementFingerprint: crypto.createHash('sha256').update(JSON.stringify(settlement)).digest('hex'),
				settledAt: nowIso(),
				updatedAt: nowIso(),
			}
			if (next.jobPayment && typeof next.jobPayment === 'object') {
				next.jobPayment = transitionJobPayment(next.jobPayment, 'paid', {
					payment: {
						settlementId,
						txHash: next.settlementTxHash,
						payer: next.settlementPayer,
						settledAt: next.settledAt,
					},
				}, { nowMs: Date.now() })
			}
			tx.set(quoteRef, next, { merge: true })
			tx.set(settlementRef, { settlementId, quoteId: quote.quoteId, txHash: next.settlementTxHash, settledAt: next.settledAt })
			return { quote: next, idempotent: false }
		})
	}

	async function claimQuotePayment(quoteId, authorizationId) {
		const r = await refs()
		const quoteRef = r.quotes.doc(String(quoteId))
		if (!/^eip3009_[a-f0-9]{32}$/.test(authorizationId || '')) throw new X402PackError('X402_PAYMENT_INVALID', 'x402 payment verification failed.')
		const authRef = r.authorizations.doc(authorizationId)
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const [quoteSnap, authSnap] = await Promise.all([tx.get(quoteRef), tx.get(authRef)])
			const quote = claimPaymentRecord(quoteSnap.exists ? quoteSnap.data() : null, authorizationId, authSnap.exists ? authSnap.data() : null)
			tx.set(quoteRef, quote)
			if (!authSnap.exists) tx.create(authRef, { quoteId: quote.quoteId, authorizationId })
			return quote
		})
	}

	async function claimSettlement(quoteId, settlement) {
		const r = await refs()
		const quoteRef = r.quotes.doc(String(quoteId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const quoteSnap = await tx.get(quoteRef)
			if (!quoteSnap.exists) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			const quote = quoteSnap.data()
			const claimRefs = settlementKeys(quote, settlement).map(key => r.settlements.doc(key))
			const claims = await Promise.all(claimRefs.map(ref => tx.get(ref)))
			const next = claimSettlementRecord(quote, settlement, claims.map(snap => snap.exists ? snap.data() : null))
			tx.set(quoteRef, next)
			for (let i = 0; i < claimRefs.length; i++) {
				if (!claims[i].exists) tx.create(claimRefs[i], { quoteId: quote.quoteId, settlementId: settlement.settlementId, txHash: settlement.txHash })
			}
			return { quote: next, idempotent: quote.state === 'settled' }
		})
	}

	async function getQuoteServiceResult(quoteId) {
		const snap = await meteredFirestoreGet((await refs()).quotes.doc(String(quoteId)))
		if (!snap.exists) return null
		const result = snap.data()?.serviceResult
		return result && typeof result === 'object' ? JSON.parse(JSON.stringify(result)) : null
	}

	async function claimQuoteServiceFulfillment(quoteId, { inputDigest = '', nowMs = Date.now(), leaseMs = serviceFulfillmentLeaseMs() } = {}) {
		const r = await refs()
		const quoteRef = r.quotes.doc(String(quoteId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const quoteSnap = await tx.get(quoteRef)
			if (!quoteSnap.exists) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			const quote = quoteSnap.data() || {}
			if (quote.serviceResult) return { state: 'completed', serviceResult: JSON.parse(JSON.stringify(quote.serviceResult)) }
			const current = quote.serviceFulfillment && typeof quote.serviceFulfillment === 'object' ? quote.serviceFulfillment : null
			const currentExpires = Date.parse(current?.leaseExpiresAt || 0)
			if (current?.state === 'running' && currentExpires > nowMs) {
				if (current.inputDigest && inputDigest && current.inputDigest !== inputDigest) {
					throw new X402PackError('X402_SERVICE_FULFILLMENT_CONFLICT', 'A different paid service fulfillment is already running for this quote.')
				}
				return { state: 'busy', leaseExpiresAt: current.leaseExpiresAt }
			}
			const leaseToken = newLeaseToken()
			const now = new Date(nowMs).toISOString()
			const serviceFulfillment = {
				state: 'running',
				inputDigest: String(inputDigest || ''),
				leaseToken,
				startedAt: current?.startedAt || now,
				leaseExpiresAt: new Date(nowMs + leaseMs).toISOString(),
				updatedAt: now,
			}
			const jobPayment = quote.jobPayment
				? updateJobPayment(quote, 'running', { execution: { updatedAt: now } })
				: null
			tx.set(quoteRef, {
				serviceFulfillment,
				...(jobPayment ? { jobPayment } : {}),
				updatedAt: now,
			}, { merge: true })
			return { state: 'claimed', leaseToken, leaseExpiresAt: serviceFulfillment.leaseExpiresAt }
		})
	}

	async function saveQuoteServiceResult(quoteId, serviceResult = {}, { leaseToken = '' } = {}) {
		const r = await refs()
		const quoteRef = r.quotes.doc(String(quoteId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const quoteSnap = await tx.get(quoteRef)
			if (!quoteSnap.exists) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
			const quote = quoteSnap.data() || {}
			if (quote.serviceResult) return JSON.parse(JSON.stringify(quote.serviceResult))
			if (leaseToken && quote.serviceFulfillment?.leaseToken !== leaseToken) {
				throw new X402PackError('X402_SERVICE_FULFILLMENT_LEASE_LOST', 'Paid service fulfillment lease was lost.')
			}
			const result = JSON.parse(JSON.stringify(serviceResult))
			const jobPayment = quote.jobPayment
				? updateJobPayment(quote, 'succeeded', {
					execution: {
						resultDigest: serviceResultDigest(result),
						updatedAt: nowIso(),
					},
				})
				: null
			tx.set(quoteRef, {
				serviceResult: result,
				...(jobPayment ? { jobPayment } : {}),
				serviceFulfillment: {
					...(quote.serviceFulfillment || {}),
					state: 'completed',
					completedAt: nowIso(),
				},
				serviceResultSavedAt: nowIso(),
				updatedAt: nowIso(),
			}, { merge: true })
			return result
		})
	}

	async function releaseQuoteServiceFulfillment(quoteId, { leaseToken = '', errorCode = '' } = {}) {
		const r = await refs()
		const quoteRef = r.quotes.doc(String(quoteId))
		return runMeteredFirestoreTransaction(r.db, async tx => {
			const quoteSnap = await tx.get(quoteRef)
			if (!quoteSnap.exists) return false
			const quote = quoteSnap.data() || {}
			if (quote.serviceResult) return false
			if (leaseToken && quote.serviceFulfillment?.leaseToken !== leaseToken) return false
			const jobPayment = quote.jobPayment
				? updateJobPayment(quote, 'failed', {
					execution: { errorCode: String(errorCode || 'PAID_SERVICE_FAILED'), updatedAt: nowIso() },
				})
				: null
			tx.set(quoteRef, {
				serviceFulfillment: {
					...(quote.serviceFulfillment || {}),
					state: 'released',
					errorCode: String(errorCode || ''),
					releasedAt: nowIso(),
				},
				...(jobPayment ? { jobPayment } : {}),
				updatedAt: nowIso(),
			}, { merge: true })
			return true
		})
	}

	return { provider: 'firestore', shared: true, createQuote, getQuote, getQuoteByEnvelopeJti, getQuoteByJobId, claimQuotePayment, claimSettlement, markSettled, getQuoteServiceResult, claimQuoteServiceFulfillment, saveQuoteServiceResult, releaseQuoteServiceFulfillment }
}

export function createX402QuoteStore({ firestoreDb = null } = {}) {
	const provider = providerName()
	if (provider === 'firestore') return createFirestoreStore(firestoreDb)
	if (provider === 'local') return createLocalStore()
	throw new X402PackError('X402_STORE_UNAVAILABLE', 'x402 quote storage is not configured for this deployment.')
}

function decodedFacilitatorPaymentPayload(value) {
	if (value && typeof value === 'object') return value
	const text = String(value || '').trim()
	if (!text) return null
	try { return JSON.parse(text) } catch {}
	try { return JSON.parse(Buffer.from(text, 'base64').toString('utf8')) } catch {}
	return null
}

function facilitatorV2Body({ paymentPayload, paymentRequirements }) {
	const requirementsEnvelope = paymentRequirements && typeof paymentRequirements === 'object'
		? paymentRequirements
		: {}
	const accepted = Array.isArray(requirementsEnvelope.accepts)
		? requirementsEnvelope.accepts[0]
		: requirementsEnvelope
	const decoded = decodedFacilitatorPaymentPayload(paymentPayload)
	if (!decoded || !accepted?.scheme || !accepted?.network) {
		throw new X402PackError('X402_FACILITATOR_PAYLOAD_INVALID', 'x402 facilitator payment payload is invalid.')
	}
	const normalizedPayload = decoded.x402Version === 2 && decoded.payload
		? {
			...decoded,
			x402Version: 2,
			accepted,
			...(requirementsEnvelope.resource ? { resource: requirementsEnvelope.resource } : {}),
		}
		: {
			x402Version: 2,
			accepted,
			payload: decoded.payload && typeof decoded.payload === 'object' ? decoded.payload : decoded,
			...(requirementsEnvelope.resource ? { resource: requirementsEnvelope.resource } : {}),
		}
	return {
		x402Version: 2,
		paymentPayload: normalizedPayload,
		paymentRequirements: accepted,
	}
}

async function facilitatorAuthorization(_url) {
	const token = String(process.env.BETTERPPTX_X402_FACILITATOR_TOKEN || '').trim()
	return token ? `Bearer ${token}` : ''
}

async function facilitatorRequest(pathname, body, {
	fetchImpl = fetch,
	authorizationProvider = facilitatorAuthorization,
} = {}) {
	const base = String(process.env.BETTERPPTX_X402_FACILITATOR_URL || '').trim().replace(/\/+$/, '')
	if (!/^https:\/\//i.test(base)) throw new X402PackError('X402_FACILITATOR_NOT_CONFIGURED', 'x402 facilitator is not configured.')
	const url = new URL(`${base}${pathname}`)
	const authorization = await authorizationProvider(url)
	recordResourceUsage({ externalCalls: 1 })
	const response = await fetchImpl(url, {
		method: 'POST',
		redirect: 'error',
		signal: AbortSignal.timeout(30000),
		headers: {
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...(authorization ? { Authorization: authorization } : {}),
		},
		body: JSON.stringify(body),
	})
	if (!response.ok) throw new X402PackError('X402_FACILITATOR_ERROR', 'x402 facilitator request failed.', { status: response.status })
	return response.json()
}

export function defaultX402Facilitator(options = {}) {
	return {
		verify: input => facilitatorRequest('/verify', facilitatorV2Body(input), options),
		settle: input => facilitatorRequest('/settle', facilitatorV2Body(input), options),
	}
}

function canonicalSettlement(quote, payment, result, { facilitator = false } = {}) {
	if (facilitator && (result?.success !== true || result.errorReason || result.invalidReason)) throw new X402PackError('X402_FACILITATOR_ERROR', 'x402 facilitator settlement was not confirmed.')
	const txHash = String(result?.txHash || result?.transaction || '').toLowerCase()
	const payer = payment.authorization.from
	if (!/^0x[a-f0-9]{64}$/.test(txHash) || result?.network !== quote.network
		|| (result.txHash !== undefined && result.transaction !== undefined && String(result.txHash).toLowerCase() !== String(result.transaction).toLowerCase())
		|| (result.payer !== undefined && String(result.payer).toLowerCase() !== payer)
		|| (result.amount !== undefined && String(result.amount) !== quote.amountAtomic)
		|| (result.asset !== undefined && String(result.asset).toLowerCase() !== quote.tokenContract)
		|| (result.payTo !== undefined && String(result.payTo).toLowerCase() !== quote.payTo)) {
		throw new X402PackError('X402_SETTLEMENT_INVALID', 'x402 settlement receipt does not match the payment.')
	}
	return { settlementId: eip3009SettlementId(payment.authorization), txHash, payer, network: quote.network,
		route: facilitator ? 'facilitator' : String(result.route || 'relayer') }
}

function settledResponse(quote, idempotent = true) {
	const isJobPayment = quote.settlementMode === 'job' || quote.paymentModel === 'one_payment_per_job'
	return {
		settled: true,
		idempotent,
		quote: publicQuote(quote),
		...(isJobPayment ? { paymentModel: 'one_payment_per_job', jobPayment: quote.jobPayment ? publicJobPayment(quote.jobPayment) : null } : { creditedCredits: quote.credits }),
		settlement: { success: true, transaction: String(quote.settlementTxHash || ''), network: quote.network, payer: String(quote.settlementPayer || '') }
	}
}

export async function settleX402Quote({
	quoteId,
	paymentPayload,
	store = createX402QuoteStore(),
	ledger = null,
	facilitator = null,
	chain = null,
	nowMs = Date.now(),
	leaseOptions = {},
} = {}) {
	const started = Date.now()
	let quote = await store.getQuote(quoteId)
	if (!quote) throw new X402PackError('X402_QUOTE_NOT_FOUND', 'x402 quote was not found.')
	if (quote.state === 'settled') return settledResponse(quote)
	const isJobPayment = quote.settlementMode === 'job' || quote.paymentModel === 'one_payment_per_job'
	if (typeof store.claimQuotePayment !== 'function' || typeof store.claimSettlement !== 'function') {
		throw new X402PackError('X402_STORE_UNAVAILABLE', 'Payment storage does not support safe settlement.')
	}
	if (!Number.isSafeInteger(nowMs) || !Number.isFinite(Date.parse(quote.expiresAt))) throw new X402PackError('X402_PAYMENT_INVALID', 'Payment validity is unavailable.')
	const quoteExpired = Date.parse(quote.expiresAt) <= nowMs
	const requirements = publicQuote(quote)
	let settlement = quote.state === 'settling' ? quote.pendingSettlement : null
	const useFacilitator = facilitator || x402SettlementMode() === 'cdp_facilitator'
	if (!settlement) {
		const payment = await verifyX402PaymentForQuote({ quote, paymentPayload, nowMs, checkTime: false })
		quote = await store.claimQuotePayment(quote.quoteId, eip3009SettlementId(payment.authorization))
		if (quote.state === 'settled') return settledResponse(quote)
		if (useFacilitator) {
			const resolved = facilitator || defaultX402Facilitator()
			const broadcast = await withX402BroadcastOnce({ ...leaseOptions,
				keyId: `facilitator:${quote.quoteId}`, quoteId: quote.quoteId,
				authorizationId: `facilitator:${quote.network}:${quote.tokenContract}:${quote.paymentAuthorizationId}`,
			}, async lease => {
				if (quoteExpired) throw new X402PackError('X402_QUOTE_EXPIRED', 'x402 quote has expired.')
				await verifyX402PaymentForQuote({ quote, paymentPayload, nowMs })
				const verification = await resolved.verify({ paymentPayload, paymentRequirements: requirements })
				if ((verification?.isValid === undefined ? verification?.valid : verification.isValid) !== true || verification?.valid === false
					|| (verification.payer !== undefined && String(verification.payer).toLowerCase() !== payment.authorization.from)) {
					throw new X402PackError('X402_PAYMENT_INVALID', 'x402 payment verification failed.')
				}
				await lease.assertHeld()
				await verifyX402PaymentForQuote({ quote, paymentPayload, nowMs: nowMs + (Date.now() - started) })
				const result = await resolved.settle({ paymentPayload, paymentRequirements: requirements, verification })
				return canonicalSettlement(quote, payment, result, { facilitator: true }).txHash
			})
			if (!broadcast.txHash) {
				// Unknown provider outcome: reconciliation is read-only, including after expiry.
				try {
					settlement = canonicalSettlement(quote, payment, await settleX402PaymentSelf({ quote, paymentPayload, chain, nowMs, allowExpiredReconciliation: true, leaseOptions }))
				} catch (error) {
					if (error.code === 'X402_QUOTE_EXPIRED') throw new X402PackError('X402_SETTLEMENT_PENDING', 'x402 payment is awaiting reconciliation.')
					throw error
				}
			} else {
				settlement = canonicalSettlement(quote, payment, { success: true, transaction: broadcast.txHash, network: quote.network }, { facilitator: true })
			}
		} else {
			settlement = canonicalSettlement(quote, payment, await settleX402PaymentSelf({ quote, paymentPayload, chain, nowMs, allowExpiredReconciliation: quoteExpired, leaseOptions }))
		}
	}
	// Both authorization and transaction replay are checked durably BEFORE ledger
	// credit. A crash on either side resumes this exact proof with one event id.
	if (isProductionBillingEnvironment() || chain?.requiresFinality === true) {
		await verifyX402SettlementReceipt({ quote, settlement, chain })
	}
	const claimed = await store.claimSettlement(quote.quoteId, settlement)
	if (claimed.quote.state === 'settled') return settledResponse(claimed.quote)
	quote = claimed.quote
	settlement = quote.pendingSettlement
	const settlementId = settlement.settlementId
	let credited = null
	if (!isJobPayment) {
		const billingLedger = ledger || createBillingLedgerStore()
		credited = await billingLedger.creditCustomer({
			eventId: `credit_x402_${crypto.createHash('sha256').update(settlementId).digest('hex').slice(0, 32)}`,
			customerHash: quote.customerHash,
			source: 'x402_settlement',
			amountCredits: quote.credits,
			proofRef: {
				settlementId,
				quoteId: quote.quoteId,
				packId: quote.packId,
				chainId: quote.chainId,
				tokenContract: quote.tokenContract,
				txHash: String(settlement?.txHash || settlement?.transaction || '').toLowerCase() || null,
			},
		})
	}
	if (credited && !credited.idempotent) {
		recordBillingCreditTelemetry({ source: 'x402_settlement', amountCredits: quote.credits })
	}
	const marked = await store.markSettled(quote.quoteId, settlement)
	return settledResponse(marked.quote, marked.idempotent || Boolean(credited?.idempotent))
}

export { publicQuote as publicX402Quote }
