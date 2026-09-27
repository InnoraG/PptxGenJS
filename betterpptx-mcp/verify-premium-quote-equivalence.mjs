#!/usr/bin/env node

import * as fs from 'node:fs'
import * as path from 'node:path'

const outputDir = path.resolve('outputs', 'premium-quote-equivalence-verify', `run-${Date.now()}-${process.pid}`)
fs.mkdirSync(outputDir, { recursive: true })

process.env.BETTERPPTX_BILLING_PROVIDER = 'crypto_credits'
process.env.BETTERPPTX_BILLING_ENFORCE = '1'
process.env.BETTERPPTX_CREDITS_PER_USDC = '100'
process.env.BETTERPPTX_ESTIMATE_CALIBRATION_MULTIPLIER = '1.25'
process.env.BETTERPPTX_MONETIZED_MCP_ENABLED = '1'
process.env.BETTERPPTX_TREASURY_EVM_ADDRESS = '0x1111111111111111111111111111111111111111'
process.env.BETTERPPTX_PAYMENT_ENVELOPE_SECRET = 'verify-premium-quote-equivalence-secret'
process.env.BETTERPPTX_X402_STORE = 'local'
process.env.BETTERPPTX_X402_FILE = path.join(outputDir, 'quotes.json')

const { publicBillingEstimate } = await import('./billing/checkout.mjs')
const { preflightBillingReservation } = await import('./billing/reservations.mjs')
const { listMonetizedMcpPrices } = await import('./billing/monetized-mcp-adapter.mjs')
const { buildPremiumPresentationQuote } = await import('./billing/premium-quote.mjs')
const { createX402QuoteStore } = await import('./billing/x402-packs.mjs')

function fail(message, detail = {}) {
	console.error('PREMIUM QUOTE EQUIVALENCE: FAIL')
	console.error(message)
	if (Object.keys(detail).length) console.error(JSON.stringify(detail, null, 2))
	process.exit(1)
}

function expect(condition, message, detail = {}) {
	if (!condition) fail(message, detail)
}

function fakeEntry() {
	return {
		deckVersion: 7,
		pptx: {
			slides: [
				{
					_slideObjects: [
						{ type: 'text', text: 'Title' },
						{ type: 'image', imageSizingCrop: true },
						{ type: 'chart', chart: { type: 'bar' } },
					],
					_animations: [{ target: 'Title' }],
					transition: { type: 'fade' },
				},
				{
					_slideObjects: [
						{ type: 'table', data: [[1, 2]] },
						{ type: 'shape' },
					],
				},
			],
		},
	}
}

function fakeLedger() {
	const customers = new Map()
	return {
		async getCustomer(customerHash) {
			return customers.get(customerHash) || {
				availableBalanceCredits: 10000,
				pendingReservedCredits: 0,
				queuedUsageCredits: 0,
			}
		},
		async upsertCustomer(customerHash, data = {}) {
			customers.set(customerHash, { ...(await this.getCustomer(customerHash)), ...data })
			return customers.get(customerHash)
		},
		async createReservation(args = {}) {
			return {
				reservation: {
					reservationId: args.reservationId,
					operationId: args.operationId,
					amountCredits: args.amountCredits,
					state: 'reserved',
					metadata: args.metadata,
				},
				idempotent: false,
			}
		},
	}
}

const entry = fakeEntry()
const args = { deckId: 'deck_verify_dynamic_quote', idempotencyKey: 'quote-equivalence' }
const toolName = 'betterpptx.deck.save'
const direct = buildPremiumPresentationQuote({ toolName, args, entry, deckId: args.deckId, deckVersion: entry.deckVersion })
const publicEstimate = publicBillingEstimate({ toolName, args, entry })
const gate = await preflightBillingReservation({
	name: toolName,
	args,
	context: { sessionId: 'verify-premium-quote-equivalence' },
	entry,
	billingEntitlement: {
		provider: 'crypto_credits',
		billingCustomerHash: 'customer_verify_premium_quote',
		creditEntitlementId: 'crypto',
		billingStatus: 'active',
	},
	store: fakeLedger(),
})
const listing = listMonetizedMcpPrices({ premiumQuote: publicEstimate }, { installHash: 'install_verify_premium_quote' })
const item = listing.items?.[0]

expect(direct.projectedOutputBytes > 0, 'Direct premium quote must include projected checkpoint output bytes.', { direct })
expect(publicEstimate.projectedOutputBytes === direct.projectedOutputBytes, 'Public estimate must use the shared checkpoint projection.', { publicEstimate, direct })
expect(publicEstimate.quoteCapCredits === direct.quoteCapCredits, 'Public estimate quote cap must match direct builder.', { publicEstimate, direct })
expect(publicEstimate.pricingInputDigest === direct.pricingInputDigest, 'Public estimate digest must match direct builder.', { publicEstimate, direct })
expect(gate.amountCredits === publicEstimate.quoteCapCredits, 'Reservation amount must match public quote cap.', { gate, publicEstimate })
expect(gate.estimate.pricingInputDigest === publicEstimate.pricingInputDigest, 'Reservation digest must match public estimate digest.', { gate, publicEstimate })
expect(gate.reservation.metadata.projectedOutputBytes === publicEstimate.projectedOutputBytes, 'Reservation metadata must carry projected output bytes.', { gate, publicEstimate })
expect(item?.price?.amount === publicEstimate.priceUsdc, 'MonetizedMCP listing price must match public premium quote.', { item, publicEstimate })
expect(String(item?.metadata?.amountAtomic) === String(publicEstimate.amountAtomic), 'Listing atomic amount must match public premium quote.', { item, publicEstimate })
expect(item?.metadata?.pricingInputDigest === publicEstimate.pricingInputDigest, 'Listing must carry the pricing input digest.', { item, publicEstimate })

const storedQuote = await createX402QuoteStore().createQuote({
	installHash: 'install_verify_premium_quote',
	packId: item.metadata.packId,
	packOverride: {
		id: item.metadata.packId,
		credits: item.metadata.credits,
		priceUsdc: item.price.amount,
		metadata: item.metadata,
	},
	envelopeJti: 'quote_binding_env',
})
expect(storedQuote.pricingInputDigest === publicEstimate.pricingInputDigest, 'Stored x402 quote must bind the pricing input digest at top level.', { storedQuote, publicEstimate })
expect(storedQuote.quoteSchemaVersion === publicEstimate.quoteSchemaVersion, 'Stored x402 quote must bind the quote schema version.', { storedQuote, publicEstimate })
expect(storedQuote.pricingModel === publicEstimate.pricingModel, 'Stored x402 quote must bind the pricing model.', { storedQuote, publicEstimate })
expect(storedQuote.amountAtomic === publicEstimate.amountAtomic, 'Stored x402 quote atomic amount must match the premium quote.', { storedQuote, publicEstimate })

const rounded = buildPremiumPresentationQuote({
	toolName,
	args: { deckId: 'rounding' },
	entry: null,
	result: { slideCount: 1, bytes: 1 },
	rateCard: {
		checkpoint: { deckSaveBase: 1, perFinalSlide: 0, perFinalObject: 0, perRichObject: 0, perOutputMb: 0 },
		heavy: {},
		thresholds: { minCharge: 0.01, confirmationRequiredAbove: 9999, hardBlockAboveWithoutExplicitOverride: 99999 },
	},
})
expect(Number(rounded.amountAtomic) >= Math.ceil((rounded.quoteCapCredits / 100) * 1e6), 'USDC atomic amount must never round down.', { rounded })

console.log('PREMIUM QUOTE EQUIVALENCE: PASS')
console.log(JSON.stringify({
	quoteCapCredits: publicEstimate.quoteCapCredits,
	priceUsdc: publicEstimate.priceUsdc,
	projectedOutputBytes: publicEstimate.projectedOutputBytes,
	pricingInputDigest: publicEstimate.pricingInputDigest,
}, null, 2))
