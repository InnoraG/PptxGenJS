import { configuredBaseNetwork } from './base-network.mjs'

function positiveNumber(name, fallback) {
	const value = Number(process.env[name])
	return Number.isFinite(value) && value > 0 ? value : fallback
}

export function creditsPerUsdc() {
	return positiveNumber('BETTERPPTX_CREDITS_PER_USDC', 100)
}

export function minimumPaymentUsdc() {
	return positiveNumber('BETTERPPTX_MIN_PAYMENT_USDC', 1)
}

export function configuredCryptoPacks() {
	const ratio = creditsPerUsdc()
	const paymentNetwork = configuredBaseNetwork()
	const defaults = [
		{ id: 'starter_500', credits: 500 },
		{ id: 'builder_1500', credits: 1500 },
		{ id: 'studio_5000', credits: 5000 },
	]
	return defaults.map(pack => ({
		...pack,
		priceUsdc: Number((pack.credits / ratio).toFixed(6)),
		asset: 'USDC',
		network: paymentNetwork.displayName,
	}))
}

export function publicCryptoPackModel() {
	const paymentNetwork = configuredBaseNetwork()
	return {
		model: 'prepaid crypto credits',
		asset: 'USDC',
		network: paymentNetwork.displayName,
		creditsPerUsdc: creditsPerUsdc(),
		minimumPaymentUsdc: minimumPaymentUsdc(),
		packs: configuredCryptoPacks(),
		overage: 'disabled',
		pricingStatus: 'finalized 2026-07-02: measured-local cost basis (serial ceiling) at owner multiplier m=25, GPU families m=3; cloud W1-W5 reconciliation pending billing-export visibility',
	}
}
