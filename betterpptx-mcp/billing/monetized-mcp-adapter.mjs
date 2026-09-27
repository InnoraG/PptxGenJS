import * as crypto from 'node:crypto'

import { normalizeEvmAddress } from './address-inventory.mjs'
import { configuredCryptoPacks, creditsPerUsdc } from './crypto-packs.mjs'
import { createBillingLedgerStore } from './ledger-store.mjs'
import { mintJobPaymentEnvelope, mintPaymentEnvelope, tryMintPaymentEnvelope, verifyJobPaymentEnvelope, verifyPaymentEnvelope } from './payment-envelope.mjs'
import { createX402QuoteStore, publicX402Quote, settleX402Quote } from './x402-packs.mjs'
import { normalizeX402PaymentPayload } from './x402-self-settle.mjs'
import { configuredBaseNetwork } from './base-network.mjs'
import { buildSpecPremiumPresentationQuote } from './premium-quote.mjs'
import { createJobPaymentBinding, createJobPaymentRecord, publicJobPayment } from './job-payment-contract.mjs'

export const MONETIZED_MCP_PROTOCOL_TOOLS = new Set([
	'price-listing',
	'pricing-listing',
	'payment-methods',
	'make-purchase',
])

const ITEM_PREFIX = 'betterpptx.credit_pack.'
export const MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID = 'betterpptx.presentation.premium'
export const MONETIZED_MCP_GENERATE_DECK_ITEM_ID = MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID
const LEGACY_GENERATE_DECK_ITEM_ID = 'betterpptx.service.generate_deck_from_spec'
const PURCHASE_PURPOSE = 'monetized_mcp_topup'
const SERVICE_PURPOSE = 'monetized_mcp_service'
const JOB_PURPOSE = 'monetized_mcp_job'
const SERVICE_SETTLEMENT_PACK_ID = 'starter_500'
const paidServiceResultCache = new Map()
const PAID_SERVICE_RESULT_CACHE_MAX = 1000

function paymentMethod() {
	return configuredBaseNetwork().paymentMethod
}

export class MonetizedMcpAdapterError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'MonetizedMcpAdapterError'
		this.code = code
		this.details = details
	}
}

export function isMonetizedMcpCompatibilityEnabled() {
	return process.env.BETTERPPTX_MONETIZED_MCP_ENABLED === '1'
}

export function isBetterPptxPayPerJobEnabled() {
	return String(process.env.BETTERPPTX_BILLING_MODEL || '').trim().toLowerCase() === 'pay_per_job'
}

function assertEnabled() {
	if (!isMonetizedMcpCompatibilityEnabled()) {
		throw new MonetizedMcpAdapterError(
			'MONETIZED_MCP_DISABLED',
			'Agent-native purchase compatibility is not enabled for this deployment.',
		)
	}
}

function treasuryAddress() {
	try {
		return normalizeEvmAddress(process.env.BETTERPPTX_TREASURY_EVM_ADDRESS)
	} catch {
		throw new MonetizedMcpAdapterError(
			'X402_TREASURY_NOT_CONFIGURED',
			'Agent-native purchase settlement is not configured for this deployment.',
		)
	}
}

function itemIdFor(packId) {
	return `${ITEM_PREFIX}${packId}`
}

function serviceSettlementPack() {
	return configuredCryptoPacks().find(candidate => candidate.id === SERVICE_SETTLEMENT_PACK_ID) || configuredCryptoPacks()[0]
}

function premiumQuoteFromInput(input = {}) {
	const source = input.premiumQuote && typeof input.premiumQuote === 'object'
		? input.premiumQuote
		: input
	const credits = Number(source.quoteCapCredits ?? source.credits ?? source.estimatedCredits)
	const fallback = serviceSettlementPack()
	if ([source.quoteCapCredits, source.credits, source.estimatedCredits].some(value => value !== undefined && value !== null && (!Number.isFinite(Number(value)) || Number(value) <= 0))) {
		throw new MonetizedMcpAdapterError('PURCHASE_PRICE_INVALID', 'The requested credit quote is invalid.')
	}
	const resolvedCredits = Number.isFinite(credits) && credits > 0 ? Number(credits.toFixed(2)) : fallback.credits
	const amountAtomic = Math.ceil((resolvedCredits / creditsPerUsdc()) * 1e6)
	if (!Number.isSafeInteger(amountAtomic) || amountAtomic <= 0
		|| (source.amountAtomic !== undefined && String(source.amountAtomic) !== String(amountAtomic))
		|| (source.priceUsdc !== undefined && Number(source.priceUsdc) !== amountAtomic / 1e6)) {
		throw new MonetizedMcpAdapterError('PURCHASE_PRICE_MISMATCH', 'The requested amount does not match the credit quote.')
	}
	const priceUsdc = Number((amountAtomic / 1e6).toFixed(6))
	const digestInput = JSON.stringify({
		credits: resolvedCredits,
		priceUsdc,
		rateCardVersion: source.rateCardVersion || '',
		toolName: source.toolName || '',
		deckId: source.deckId || '',
		specDigest: source.specDigest || '',
		pricingInputDigest: source.pricingInputDigest || '',
	})
	let hash = 'default'
	try {
		hash = Buffer.from(digestInput).toString('base64url').slice(0, 32)
	} catch {}
	return {
		id: `premium_presentation_${hash}`,
		credits: resolvedCredits,
		priceUsdc,
		metadata: {
			pricingModel: 'deck_dynamic_quote',
			quoteCapCredits: resolvedCredits,
			priceUsdc,
			creditsPerUsdc: creditsPerUsdc(),
			rateCardVersion: source.rateCardVersion || null,
			toolName: source.toolName || 'betterpptx.deck.save',
			pricingInputDigest: source.pricingInputDigest || null,
			specDigest: source.specDigest || null,
			estimatedPlanDigest: source.estimatedPlanDigest || null,
			planDigest: source.planDigest || null,
			specOperationCount: Number.isFinite(Number(source.specOperationCount)) ? Number(source.specOperationCount) : null,
			billableSpecOperationCount: Number.isFinite(Number(source.billableSpecOperationCount)) ? Number(source.billableSpecOperationCount) : null,
			projectedOutputBytes: source.projectedOutputBytes ?? null,
			amountAtomic: String(amountAtomic),
			quoteSchemaVersion: source.quoteSchemaVersion || null,
			quoteId: source.quoteId || null,
			quoteBindingDigest: source.quoteBindingDigest || null,
			preparedTimelineDigest: source.preparedTimelineDigest || null,
			...(source.quoteBinding && typeof source.quoteBinding === 'object' ? { quoteBinding: source.quoteBinding } : {}),
			...(source.deckId ? { deckId: String(source.deckId) } : {}),
			...(source.deckVersion !== undefined && source.deckVersion !== null ? { deckVersion: Number(source.deckVersion) } : {}),
		},
	}
}

function packForItemId(itemId) {
	const value = String(itemId || '').trim()
	const packId = value.startsWith(ITEM_PREFIX) ? value.slice(ITEM_PREFIX.length) : value
	const pack = configuredCryptoPacks().find(candidate => candidate.id === packId)
	if (!pack) throw new MonetizedMcpAdapterError('PURCHASABLE_ITEM_NOT_FOUND', 'The requested credit pack is unavailable.')
	return pack
}

function purchasableForItemId(itemId) {
	const value = String(itemId || '').trim()
	if (value === MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID || value === LEGACY_GENERATE_DECK_ITEM_ID) {
		return {
			kind: isBetterPptxPayPerJobEnabled() ? 'job_payment' : 'premium_presentation',
			id: MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID,
			purpose: isBetterPptxPayPerJobEnabled() ? JOB_PURPOSE : SERVICE_PURPOSE,
			settlementPack: null,
		}
	}
	if (isBetterPptxPayPerJobEnabled() && value.startsWith(ITEM_PREFIX)) {
		throw new MonetizedMcpAdapterError('CREDIT_PACKS_DISABLED', 'This deployment uses one payment per bounded job; reusable BetterPPTX credit packs are not enabled.')
	}
	const pack = packForItemId(value)
	return {
		kind: 'credit_pack',
		id: itemIdFor(pack.id),
		purpose: PURCHASE_PURPOSE,
		settlementPack: pack,
	}
}

function boundedObject(value, name) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new MonetizedMcpAdapterError('PURCHASE_ARGUMENT_INVALID', `${name} must be an object.`)
	}
	let text
	try {
		text = JSON.stringify(value)
	} catch {
		throw new MonetizedMcpAdapterError('PURCHASE_ARGUMENT_INVALID', `${name} is not valid JSON data.`)
	}
	if (text.length > 32000) {
		throw new MonetizedMcpAdapterError('PURCHASE_ARGUMENT_TOO_LARGE', `${name} is too large.`)
	}
	return value
}

function boundedSignedTransaction(value) {
	if (typeof value === 'string') {
		const text = value.trim()
		if (!text) throw new MonetizedMcpAdapterError('PURCHASE_ARGUMENT_INVALID', 'signedTransaction is required.')
		if (text.length > 64000) throw new MonetizedMcpAdapterError('PURCHASE_ARGUMENT_TOO_LARGE', 'signedTransaction is too large.')
		return text
	}
	return boundedObject(value, 'signedTransaction')
}

function publicCatalogItem(pack, { installHash = '' } = {}) {
	const paymentNetwork = configuredBaseNetwork()
	const purchaseContext = installHash
		? tryMintPaymentEnvelope({
			purpose: PURCHASE_PURPOSE,
			installHash,
			packId: pack.id,
		})
		: null
	return {
		id: itemIdFor(pack.id),
		name: `${pack.credits} BetterPPTX credits`,
		description: `Add ${pack.credits} prepaid BetterPPTX credits to this anonymous installation.`,
		price: {
			amount: pack.priceUsdc,
			currency: 'USDC',
			paymentMethod: paymentMethod(),
		},
		params: {
			purchaseContext: purchaseContext || 'Obtain an opaque purchaseContext from betterpptx.billing.portal on the identity-bound BetterPPTX connection.',
		},
		metadata: {
			packId: pack.id,
			credits: pack.credits,
			network: paymentNetwork.network,
			chainId: paymentNetwork.chainId,
			tokenContract: paymentNetwork.tokenContract,
			payTo: treasuryAddress(),
			amountAtomic: String(Math.round(pack.priceUsdc * 1e6)),
			assetDecimals: 6,
			eip712Name: String(process.env.BETTERPPTX_USDC_EIP712_NAME || 'USD Coin'),
			eip712Version: String(process.env.BETTERPPTX_USDC_EIP712_VERSION || '2'),
		},
	}
}

function publicServiceCatalogItem({ installHash = '', premiumQuote = null, jobId = '' } = {}) {
	const paymentNetwork = configuredBaseNetwork()
	const pack = premiumQuoteFromInput(premiumQuote || {})
	const jobMode = isBetterPptxPayPerJobEnabled()
	const bindingDigest = String(pack.metadata?.quoteBindingDigest || pack.metadata?.specDigest || pack.metadata?.pricingInputDigest || '').trim()
	// A job id is an execution identity, not a digest-derived alias.  Repeated
	// identical specs are still separate jobs unless the caller explicitly
	// supplies the previously issued id for recovery.
	const resolvedJobId = String(jobId || pack.metadata?.jobId || (jobMode && premiumQuote ? `job_${crypto.randomBytes(16).toString('hex')}` : '')).trim()
	const purchaseContext = jobMode
		? (resolvedJobId
			? (() => {
				try {
					return mintJobPaymentEnvelope({
						jobId: resolvedJobId,
						bindingDigest,
						packId: pack.id,
						metadata: {
							operation: pack.metadata?.toolName || 'betterpptx.deck.generate_from_spec',
							quoteCapCredits: pack.credits,
							priceUsdc: pack.priceUsdc,
							quoteBinding: pack.metadata?.quoteBinding || null,
							specDigest: pack.metadata?.specDigest || null,
							pricingInputDigest: pack.metadata?.pricingInputDigest || null,
						},
					})
				} catch { return null }
			})()
			: null)
		: installHash
			? tryMintPaymentEnvelope({
			purpose: SERVICE_PURPOSE,
			installHash,
			packId: pack.id,
			metadata: pack.metadata,
			})
		: null
	const publicJob = jobMode && resolvedJobId
	return {
		id: MONETIZED_MCP_PREMIUM_PRESENTATION_ITEM_ID,
		name: jobMode ? 'BetterPPTX presentation job' : 'BetterPPTX full premium presentation',
		description: jobMode
			? 'Authorize exactly one bounded BetterPPTX job with one exact x402 payment. Payment settles the frozen job and does not create a reusable product balance; retries and polling do not charge again.'
			: 'Unlock one full premium BetterPPTX presentation with a fixed x402 USDC payment. Freemium preview remains free; optional params.spec lets an agent receive the generated deck artifact in toolResult.',
		price: {
			// Without an exact authored quote there is no executable final price.
			// Keep the value null rather than showing a legacy pack price as if it
			// were authoritative.
			amount: jobMode && !premiumQuote ? null : pack.priceUsdc,
			currency: 'USDC',
			paymentMethod: paymentMethod(),
		},
		params: {
			purchaseContext: purchaseContext || (jobMode
				? 'Provide the exact authored specification to price-listing first; the returned job-bound purchaseContext is required for payment.'
				: 'Obtain an opaque purchaseContext from price-listing on the identity-bound BetterPPTX connection.'),
		},
		metadata: {
			kind: jobMode ? 'job_payment' : 'premium_presentation',
			service: jobMode ? 'bounded_job' : 'premium_presentation',
			paymentModel: jobMode ? 'one_payment_per_job' : 'prepaid_or_direct_service',
			...(publicJob ? { jobId: resolvedJobId, jobBindingDigest: bindingDigest } : {}),
			pricingModel: 'deck_dynamic_quote',
			quoteRequiredForFinalPrice: jobMode ? !premiumQuote : false,
			...(!jobMode ? { settlementPackId: pack.id, packId: pack.id, credits: pack.credits, includedCredits: pack.credits, quoteCapCredits: pack.credits } : {}),
			rateCardVersion: pack.metadata?.rateCardVersion || null,
			pricingInputDigest: pack.metadata?.pricingInputDigest || null,
			specDigest: pack.metadata?.specDigest || null,
			estimatedPlanDigest: pack.metadata?.estimatedPlanDigest || null,
			planDigest: pack.metadata?.planDigest || null,
			specOperationCount: pack.metadata?.specOperationCount ?? null,
			billableSpecOperationCount: pack.metadata?.billableSpecOperationCount ?? null,
			projectedOutputBytes: pack.metadata?.projectedOutputBytes ?? null,
			quoteSchemaVersion: pack.metadata?.quoteSchemaVersion || null,
			quoteId: pack.metadata?.quoteId || null,
			quoteBindingDigest: pack.metadata?.quoteBindingDigest || null,
			preparedTimelineDigest: pack.metadata?.preparedTimelineDigest || null,
			...(pack.metadata?.quoteBinding && typeof pack.metadata.quoteBinding === 'object' ? { quoteBinding: pack.metadata.quoteBinding } : {}),
			freemium: 'free',
			optionalParams: ['spec', 'fileName', 'save', 'validateAfterCompile'],
			network: paymentNetwork.network,
			chainId: paymentNetwork.chainId,
			tokenContract: paymentNetwork.tokenContract,
			payTo: treasuryAddress(),
			...(jobMode && !premiumQuote ? {} : { amountAtomic: String(Math.round(pack.priceUsdc * 1e6)) }),
			assetDecimals: 6,
			eip712Name: String(process.env.BETTERPPTX_USDC_EIP712_NAME || 'USD Coin'),
			eip712Version: String(process.env.BETTERPPTX_USDC_EIP712_VERSION || '2'),
		},
	}
}

export async function listMonetizedMcpPrices(args = {}, context = {}, { store = createX402QuoteStore(), nowMs = Date.now(), premiumQuote = null } = {}) {
	assertEnabled()
	for (const field of ['premiumQuote', 'quoteCapCredits', 'estimatedCredits', 'amountAtomic', 'priceUsdc', 'price', 'credits']) {
		if (Object.hasOwn(args, field)) throw new MonetizedMcpAdapterError('PURCHASE_PRICE_OVERRIDE_NOT_ALLOWED', 'Payment prices must be calculated by the service from the presentation.')
	}
	const query = String(args.searchQuery || '').trim().toLowerCase().slice(0, 200)
	const requestedJobId = String(args.jobId || '').trim()
	const items = [
		publicServiceCatalogItem({ installHash: context.installHash || '', premiumQuote, jobId: requestedJobId }),
	]
		.filter(item => !query || JSON.stringify(item).toLowerCase().includes(query))
	for (const item of items) {
		const jobMode = isBetterPptxPayPerJobEnabled()
		const identityReady = jobMode ? Boolean(item.metadata?.jobId && item.metadata?.jobBindingDigest) : Boolean(context.installHash)
		if (!identityReady || !premiumQuote) {
			item.metadata.quoteRequiredForFinalPrice = true
			continue
		}
		const envelope = jobMode
			? verifyJobPaymentEnvelope(item.params.purchaseContext, { nowMs })
			: verifyPaymentEnvelope(item.params.purchaseContext, { purpose: SERVICE_PURPOSE, nowMs })
		const pack = premiumPackFromEnvelope(envelope)
		const quote = await quoteForEnvelope(envelope, pack, store, nowMs, { create: true })
		const publicQuote = publicX402Quote(quote)
		const accepted = publicQuote.accepts[0]
		if (accepted.extra?.authorizationBinding !== 'quote_nonce_v1' || !/^0x[0-9a-f]{64}$/.test(accepted.extra?.authorizationNonce || '')) {
			throw new MonetizedMcpAdapterError('PURCHASE_QUOTE_INVALID', 'The payment quote does not contain a supported authorization binding.')
		}
		item.params.quoteId = quote.quoteId
		item.price.amount = quote.priceUsdc
		if (jobMode) {
			// purchaseContext remains the envelope binding used by the quote
			// store.  The full contract digest is exposed separately for clients
			// that want to bind their local journal and recovery record to the
			// complete job contract.
			item.params.jobId = quote.jobId
			item.params.bindingDigest = quote.jobBindingDigest || ''
		}
		item.metadata = {
			...item.metadata,
			// Retain the existing presentation-estimate identity separately from
			// the settlement quote that the wallet will authorize.
			premiumQuoteId: item.metadata.quoteId || null,
			quoteId: quote.quoteId, expiresAt: quote.expiresAt,
			...(jobMode ? {
				jobId: quote.jobId,
				bindingDigest: quote.jobPayment?.binding?.bindingDigest || quote.jobBindingDigest || null,
			} : {}),
			authorizationBinding: accepted.extra.authorizationBinding,
			authorizationNonce: accepted.extra.authorizationNonce,
			network: accepted.network, chainId: quote.chainId, tokenContract: accepted.asset,
			payTo: accepted.payTo, amountAtomic: accepted.amount, assetDecimals: accepted.extra.assetDecimals,
			eip712Name: accepted.extra.name, eip712Version: accepted.extra.version,
		}
	}
	return { items }
}

/**
 * Recover a paid presentation job using the opaque job-bound purchase context.
 * A public transaction hash is deliberately not accepted as a credential.
 */
export async function getMonetizedMcpJobStatus({ jobId = '', purchaseContext = '', quoteId = '' } = {}, {
	store = createX402QuoteStore(),
	nowMs = Date.now(),
} = {}) {
	assertEnabled()
	if (!isBetterPptxPayPerJobEnabled()) {
		throw new MonetizedMcpAdapterError('JOB_PAYMENT_DISABLED', 'Payment-per-job recovery is not enabled for this deployment.')
	}
	let envelope
	try {
		envelope = verifyJobPaymentEnvelope(purchaseContext, { nowMs, allowExpired: true })
	} catch (error) {
		throw new MonetizedMcpAdapterError(error?.code || 'PURCHASE_CONTEXT_INVALID', 'The job recovery credential is invalid or unavailable.')
	}
	const requestedJobId = String(jobId || '').trim()
	if (requestedJobId && requestedJobId !== String(envelope.jobId || '')) {
		throw new MonetizedMcpAdapterError('JOB_PAYMENT_ID_MISMATCH', 'The recovery credential is bound to a different job.')
	}
	const pack = premiumPackFromEnvelope(envelope)
	const quote = await quoteForEnvelope(envelope, pack, store, nowMs, {
		quoteId: String(quoteId || ''),
		allowMissingQuoteId: true,
	})
	if (!(quote.settlementMode === 'job' || quote.paymentModel === 'one_payment_per_job') || !quote.jobPayment) {
		throw new MonetizedMcpAdapterError('JOB_PAYMENT_BINDING_INVALID', 'The recovered quote is not a BetterPPTX bounded job.')
	}
	const serviceResult = typeof store.getQuoteServiceResult === 'function'
		? await store.getQuoteServiceResult(quote.quoteId)
		: quote.serviceResult || null
	const jobPayment = publicJobPayment(quote.jobPayment)
	const state = jobPayment.state || (quote.state === 'settled' ? 'paid' : quote.state || 'unknown')
	const next = state === 'succeeded'
		? { type: 'use_result' }
		: state === 'paid'
			? { type: 'resume_execution', tool: 'make-purchase', required: ['itemId', 'params.purchaseContext', 'params.resume:true', 'params.spec when the result is not already persisted'], reason: 'The job is paid and may be resumed with the same job-bound credential; omit signedTransaction for this recovery call and do not approve another payment.' }
			: state === 'settlement_uncertain' || state === 'reconciliation_required'
				? { type: 'reconcile', reason: 'Settlement is unresolved. Reconcile this job before submitting another payment.' }
				: { type: 'poll_or_retry', reason: 'Poll this same job with the same protected credential.' }
	return {
		ok: true,
		paymentModel: 'one_payment_per_job',
		jobId: envelope.jobId,
		quoteId: quote.quoteId,
		state,
		jobPayment,
		quote: publicX402Quote(quote),
		result: serviceResult,
		recovery: { method: 'opaque-job-bound-purchase-context', credentialAccepted: true, transactionHashAloneInsufficient: true },
		next,
	}
}

export function listMonetizedMcpPaymentMethods() {
	assertEnabled()
	const network = configuredBaseNetwork()
	return [{
		walletAddress: treasuryAddress(),
		paymentMethod: network.paymentMethod,
		network: network.network,
		networkName: network.displayName,
		chainId: network.chainId,
		asset: network.tokenSymbol,
		tokenContract: network.tokenContract,
		assetDecimals: network.tokenDecimals,
	}]
}

export function publicMonetizedMcpRecovery({ installHash = '' } = {}) {
	if (!isMonetizedMcpCompatibilityEnabled() || (!installHash && !isBetterPptxPayPerJobEnabled())) return { enabled: false }
	try {
		return {
			enabled: true,
			protocol: 'MonetizedMCP-compatible',
			discoveryTool: 'price-listing',
			paymentMethodsTool: 'payment-methods',
			purchaseTool: 'make-purchase',
			models: isBetterPptxPayPerJobEnabled()
				? ['one-payment-per-bounded-job', 'optional-direct-paid-service-result']
				: ['fixed-premium-presentation', 'optional-direct-paid-service-result'],
			items: [
				publicServiceCatalogItem({ installHash }),
			],
		}
	} catch {
		return { enabled: false }
	}
}

function premiumPackFromEnvelope(envelope = {}) {
	const metadata = envelope.metadata && typeof envelope.metadata === 'object' ? envelope.metadata : {}
	const credits = Number(metadata.quoteCapCredits)
	const priceUsdc = Number(metadata.priceUsdc)
	if (!Number.isFinite(credits) || credits <= 0 || !Number.isFinite(priceUsdc) || priceUsdc <= 0) {
		return serviceSettlementPack()
	}
	return {
		id: String(envelope.packId || `premium_presentation_${envelope.jti || 'quote'}`),
		credits: Number(credits.toFixed(2)),
		priceUsdc: Number(priceUsdc.toFixed(6)),
		metadata,
	}
}

async function quoteForEnvelope(envelope, pack, store, nowMs, { create = false, quoteId = '', allowMissingQuoteId = false } = {}) {
	if (typeof store.getQuoteByEnvelopeJti !== 'function') throw new MonetizedMcpAdapterError('PURCHASE_QUOTE_UNAVAILABLE', 'The payment quote cannot be retrieved safely.')
	const existing = envelope.jobId && typeof store.getQuoteByJobId === 'function'
		? await store.getQuoteByJobId(envelope.jobId)
		: await store.getQuoteByEnvelopeJti(envelope.jti)
	if (existing) {
		const identityMismatch = envelope.jobId
			? (existing.jobId !== envelope.jobId || existing.jobBindingDigest !== String(envelope.bindingDigest || ''))
			: existing.installHash !== envelope.installHash
		const envelopeMismatch = envelope.jobId ? false : existing.envelopeJti !== envelope.jti
		if (identityMismatch || envelopeMismatch || existing.packId !== pack.id
			|| existing.priceUsdc !== pack.priceUsdc || existing.credits !== pack.credits
			|| existing.amountAtomic !== String(Math.round(pack.priceUsdc * 1e6))) {
			throw new MonetizedMcpAdapterError('PURCHASE_CONTEXT_REPLAYED', 'Purchase context binding is invalid.')
		}
		if (!create && ((!quoteId && !allowMissingQuoteId) || (quoteId && existing.quoteId !== quoteId))) throw new MonetizedMcpAdapterError('PURCHASE_QUOTE_NOT_FOUND', 'Use the original quoteId and purchaseContext returned by price-listing.')
		return existing
	}
	if (!create) throw new MonetizedMcpAdapterError('PURCHASE_QUOTE_NOT_FOUND', 'The payment quote is unknown. Request a fresh price listing before signing.')
	if (Number(envelope.exp || 0) <= Math.floor(nowMs / 1000)) {
		throw new MonetizedMcpAdapterError('PAYMENT_ENVELOPE_EXPIRED', 'Purchase context has expired.')
	}
	return store.createQuote({
		...(envelope.jobId
			? {
				jobId: envelope.jobId,
				jobBindingDigest: String(envelope.bindingDigest || ''),
			}
			: { installHash: envelope.installHash }),
		envelopeJti: envelope.jti,
		packId: pack.id,
		packOverride: envelope.jobId
			? {
				...pack,
				metadata: {
					...(pack.metadata || {}),
					settlementMode: 'job',
					paymentModel: 'one_payment_per_job',
					jobId: envelope.jobId,
					jobBindingDigest: String(envelope.bindingDigest || ''),
					jobBindingSeed: {
						operation: pack.metadata?.toolName || 'betterpptx.deck.generate_from_spec',
						inputDigest: pack.metadata?.specDigest || pack.metadata?.pricingInputDigest || '',
						outputProfile: { service: 'generate_deck_from_spec', projectedOutputBytes: pack.metadata?.projectedOutputBytes ?? null },
						limits: { maxQuotedCredits: Number(pack.metadata?.quoteCapCredits || pack.credits) },
					},
				},
			}
			: pack,
		nowMs,
	})
}

function redactedMakePurchaseRequest(args = {}, params = {}) {
	return {
		itemId: String(args.itemId || ''),
		params: {
			...(params.spec ? { spec: '[accepted]' } : {}),
			...(params.jobId ? { jobId: String(params.jobId).slice(0, 160) } : {}),
			...(params.bindingDigest ? { bindingDigest: String(params.bindingDigest).slice(0, 128) } : {}),
			...(params.fileName ? { fileName: String(params.fileName).slice(0, 128) } : {}),
			...(params.outputName ? { outputName: String(params.outputName).slice(0, 128) } : {}),
			...(params.save === false ? { save: false } : {}),
			...(params.validateAfterCompile === false ? { validateAfterCompile: false } : {}),
			...(params.resume === true ? { resume: true } : {}),
			...(params.purchaseContext || params.paymentContext ? {
				purchaseContext: '[redacted]',
				...(params.paymentContext ? { paymentContext: '[redacted]' } : {}),
			} : {}),
		},
		signedTransaction: '[redacted]',
		paymentMethod: String(args.paymentMethod || ''),
	}
}

async function cachedPaidServiceResult(store, quoteId) {
	const memory = paidServiceResultCache.get(quoteId)
	if (memory) return memory
	if (typeof store.getQuoteServiceResult !== 'function') return null
	const persisted = await store.getQuoteServiceResult(quoteId)
	if (!persisted) return null
	rememberPaidServiceResult(quoteId, persisted)
	return persisted
}

function rememberPaidServiceResult(quoteId, result) {
	if (paidServiceResultCache.size >= PAID_SERVICE_RESULT_CACHE_MAX) {
		const oldest = paidServiceResultCache.keys().next().value
		if (oldest) paidServiceResultCache.delete(oldest)
	}
	paidServiceResultCache.set(quoteId, result)
}

async function persistPaidServiceResult(store, quoteId, result) {
	if (typeof store.saveQuoteServiceResult !== 'function') {
		rememberPaidServiceResult(quoteId, result)
		return result
	}
	const persisted = await store.saveQuoteServiceResult(quoteId, result)
	rememberPaidServiceResult(quoteId, persisted)
	return persisted
}

function paidServiceInputDigest({ itemId = '', params = {}, quote = {} } = {}) {
	const specDigest = quote.packMetadata?.specDigest || quote.specDigest || ''
	const input = {
		itemId,
		quoteId: quote.quoteId || '',
		specDigest,
		fileName: params.fileName || params.outputName || '',
		save: params.save !== false,
		validateAfterCompile: params.validateAfterCompile !== false,
	}
	return crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')
}

function fulfillmentWaitMs() {
	const value = Number(process.env.BETTERPPTX_PAID_SERVICE_FULFILLMENT_WAIT_MS)
	return Number.isFinite(value) && value >= 0 ? Math.round(value) : 5000
}

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForPaidServiceResult(store, quoteId, waitMs = fulfillmentWaitMs()) {
	const started = Date.now()
	while (Date.now() - started <= waitMs) {
		const result = await cachedPaidServiceResult(store, quoteId)
		if (result) return result
		await sleep(50)
	}
	return null
}

async function executePaidServiceOnce({ store, quote, itemId, params, execute }) {
	const quoteId = quote.quoteId
	const inputDigest = paidServiceInputDigest({ itemId, params, quote })
	if (typeof store.claimQuoteServiceFulfillment !== 'function') {
		const cachedResult = await cachedPaidServiceResult(store, quoteId)
		if (cachedResult) return cachedResult
		return persistPaidServiceResult(store, quoteId, await execute())
	}
	const claim = await store.claimQuoteServiceFulfillment(quoteId, { inputDigest })
	if (claim.state === 'completed') {
		rememberPaidServiceResult(quoteId, claim.serviceResult)
		return claim.serviceResult
	}
	if (claim.state === 'busy') {
		const result = await waitForPaidServiceResult(store, quoteId)
		if (result) return result
		throw new MonetizedMcpAdapterError(
			'PAID_SERVICE_FULFILLMENT_IN_PROGRESS',
			'The paid service fulfillment is already running. Retry shortly.',
			{ orderId: quoteId, leaseExpiresAt: claim.leaseExpiresAt || null },
		)
	}
	if (claim.state !== 'claimed') {
		throw new MonetizedMcpAdapterError('PAID_SERVICE_FULFILLMENT_UNAVAILABLE', 'The paid service fulfillment could not be claimed.')
	}
	try {
		const result = await execute()
		if (typeof store.saveQuoteServiceResult === 'function') {
			const persisted = await store.saveQuoteServiceResult(quoteId, result, { leaseToken: claim.leaseToken })
			rememberPaidServiceResult(quoteId, persisted)
			return persisted
		}
		return persistPaidServiceResult(store, quoteId, result)
	} catch (error) {
		if (typeof store.releaseQuoteServiceFulfillment === 'function') {
			await store.releaseQuoteServiceFulfillment(quoteId, {
				leaseToken: claim.leaseToken,
				errorCode: error?.code || error?.name || 'PAID_SERVICE_FAILED',
			}).catch(() => {})
		}
		throw error
	}
}

function verifyPaidSpecMatchesQuote(params = {}, quote = {}) {
	const expectedSpecDigest = quote.packMetadata?.specDigest || quote.specDigest || null
	if (!expectedSpecDigest) throw new MonetizedMcpAdapterError('PAID_SERVICE_SPEC_QUOTE_REQUIRED', 'Obtain a quote for this presentation spec before authorizing its generation.')
	const actual = buildSpecPremiumPresentationQuote({
		spec: params.spec,
		args: {
			fileName: params.fileName || params.outputName || '',
			save: params.save,
			validateAfterCompile: params.validateAfterCompile,
		},
	})
	if (actual.specDigest !== expectedSpecDigest) {
		throw new MonetizedMcpAdapterError(
			'PAID_SERVICE_SPEC_MISMATCH',
			'The paid service spec does not match the quoted premium presentation.',
			{
				expectedSpecDigest,
				actualSpecDigest: actual.specDigest,
			},
		)
	}
}

export async function makeMonetizedMcpPurchase(args = {}, {
	store = createX402QuoteStore(),
	ledger = null,
	facilitator = null,
	chain = null,
	nowMs = Date.now(),
	executePaidItem = null,
} = {}) {
	assertEnabled()
	const item = purchasableForItemId(args.itemId)
	const params = boundedObject(args.params || {}, 'params')
	for (const field of ['premiumQuote', 'quoteCapCredits', 'estimatedCredits', 'credits']) {
		if (Object.hasOwn(args, field) || Object.hasOwn(params, field)) throw new MonetizedMcpAdapterError('PURCHASE_PRICE_OVERRIDE_NOT_ALLOWED', 'Purchase terms come from the stored quote and cannot be overridden.')
	}
	const hasSignedTransaction = args.signedTransaction !== undefined && args.signedTransaction !== null
	const signedTransaction = hasSignedTransaction ? boundedSignedTransaction(args.signedTransaction) : null
	if (String(args.paymentMethod || '') !== paymentMethod()) {
		throw new MonetizedMcpAdapterError('PAYMENT_METHOD_UNSUPPORTED', 'The requested payment method is not supported.')
	}
	const purchaseContext = String(params.purchaseContext || params.paymentContext || '').trim()
	if (!purchaseContext) {
		throw new MonetizedMcpAdapterError(
			'PURCHASE_CONTEXT_MISSING',
			'Use the opaque purchaseContext returned by price-listing for this installation.',
		)
	}
	let envelope
	try {
		envelope = item.kind === 'job_payment'
			? verifyJobPaymentEnvelope(purchaseContext, { nowMs, allowExpired: true })
			: verifyPaymentEnvelope(purchaseContext, { purpose: item.purpose, nowMs, allowExpired: true })
	} catch (error) {
		throw new MonetizedMcpAdapterError(error?.code || 'PURCHASE_CONTEXT_INVALID', 'Purchase context is invalid or expired.')
	}
	const pack = ['premium_presentation', 'job_payment'].includes(item.kind)
		? premiumPackFromEnvelope(envelope)
		: item.settlementPack
	if (envelope.packId !== pack.id) {
		throw new MonetizedMcpAdapterError('PURCHASE_CONTEXT_PACK_MISMATCH', 'Purchase context does not match the requested purchasable item.')
	}
	const quote = await quoteForEnvelope(envelope, pack, store, nowMs, { quoteId: String(params.quoteId || '') })
	if ((args.quoteId !== undefined && args.quoteId !== quote.quoteId)
		|| [args.amountAtomic, params.amountAtomic].some(value => value !== undefined && String(value) !== quote.amountAtomic)
		|| [args.price?.amount, params.price?.amount].some(value => value !== undefined && Number(value) !== quote.priceUsdc)) {
		throw new MonetizedMcpAdapterError('PURCHASE_PRICE_MISMATCH', 'The purchase request does not match its original quote.')
	}
	if (!signedTransaction && !(item.kind === 'job_payment' && params.resume === true && quote.state === 'settled')) {
		throw new MonetizedMcpAdapterError('PURCHASE_PAYMENT_REQUIRED', 'Submit the signed x402 payment for this quote, or set params.resume:true only when recovering an already-settled bounded job.')
	}
	if (quote.state !== 'settled') {
		const payment = normalizeX402PaymentPayload(signedTransaction)
		if (payment.authorization.value !== BigInt(quote.amountAtomic)) throw new MonetizedMcpAdapterError('PURCHASE_PRICE_MISMATCH', 'The signed payment amount does not match the original quote.')
	}
	if (item.kind === 'job_payment') {
		if (!envelope.jobId || String(params.jobId || envelope.jobId) !== String(envelope.jobId)) {
			throw new MonetizedMcpAdapterError('JOB_PAYMENT_ID_MISMATCH', 'The payment request is not bound to the quoted job.')
		}
		const acceptedBindingDigests = [
			String(envelope.bindingDigest || ''),
			String(quote.jobPayment?.binding?.bindingDigest || ''),
		].filter(Boolean)
		if (params.bindingDigest && !acceptedBindingDigests.includes(String(params.bindingDigest))) {
			throw new MonetizedMcpAdapterError('JOB_PAYMENT_BINDING_MISMATCH', 'The payment request does not match the quoted job binding.')
		}
	}
	const premiumHasSpec = ['premium_presentation', 'job_payment'].includes(item.kind) && params.spec && typeof params.spec === 'object' && !Array.isArray(params.spec)
	if (premiumHasSpec) verifyPaidSpecMatchesQuote(params, quote)
	const settled = signedTransaction
		? await settleX402Quote({
			quoteId: quote.quoteId,
			paymentPayload: signedTransaction,
			store,
			ledger,
			facilitator,
			chain,
			nowMs,
		})
		: {
			settled: true,
			idempotent: true,
			paymentModel: 'one_payment_per_job',
			jobPayment: quote.jobPayment ? publicJobPayment(quote.jobPayment) : null,
		}
	const purchaseBase = {
		packId: pack.id,
		...(item.kind === 'job_payment' ? { jobId: envelope.jobId, paymentModel: 'one_payment_per_job' } : { creditedCredits: settled.creditedCredits }),
		idempotent: settled.idempotent,
		paymentMethod: paymentMethod(),
		network: configuredBaseNetwork().displayName,
		asset: 'USDC',
	}
	if (['premium_presentation', 'job_payment'].includes(item.kind)) {
		const hasSpec = premiumHasSpec
		if (hasSpec && typeof executePaidItem !== 'function') {
			throw new MonetizedMcpAdapterError('PAID_ITEM_EXECUTOR_MISSING', 'This deployment cannot fulfill the requested paid service item.')
		}
		const toolResult = hasSpec
			? await executePaidServiceOnce({
				store,
				quote,
				itemId: item.id,
				params,
				execute: () => executePaidItem({
					itemId: item.id,
					params,
					envelope,
					quote,
					settled,
					settlementPack: pack,
				}),
			})
			: 'BetterPPTX full premium presentation was unlocked successfully.'
		const response = {
			purchasableItemId: item.id,
			makePurchaseRequest: redactedMakePurchaseRequest(args, params),
			orderId: quote.quoteId,
			toolResult: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
			purchase: {
				...purchaseBase,
				status: hasSpec ? 'fulfilled' : (item.kind === 'job_payment' ? 'settled' : 'credited'),
				kind: item.kind,
				service: hasSpec ? 'generate_deck_from_spec' : 'premium_presentation_pass',
			},
			...(hasSpec || item.kind === 'job_payment' ? {} : {
				next: {
					tool: 'betterpptx.auth.status',
					instruction: 'Check the updated balance, then continue the premium presentation.',
				},
			}),
		}
		return response
	}
	return {
		purchasableItemId: itemIdFor(pack.id),
		makePurchaseRequest: redactedMakePurchaseRequest(args, params),
		orderId: quote.quoteId,
		toolResult: 'BetterPPTX credits were added successfully.',
		purchase: {
			status: 'credited',
			kind: 'credit_pack',
			...purchaseBase,
		},
		next: {
			tool: 'betterpptx.auth.status',
			instruction: 'Check the updated balance, then retry the interrupted BetterPPTX operation.',
		},
	}
}

export function mintMonetizedMcpPurchaseContext({ installHash, packId }) {
	assertEnabled()
	packForItemId(packId)
	return mintPaymentEnvelope({
		purpose: PURCHASE_PURPOSE,
		installHash,
		packId,
	})
}
