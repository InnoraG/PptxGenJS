export const RATE_CARD_VERSION = '2026-06-04.shadow.1'

export const BILLING_RATE_CARD = {
	checkpoint: {
		deckSaveBase: 5.00,
		perFinalSlide: 0.60,
		perFinalObject: 0.06,
		perRichObject: 0.50,
		perOutputMb: 0.80,
		maxEditComplexitySurchargeRatio: 0.20,
	},
	heavy: {
		openUploadedBase: 4.00,
		openUploadedPerMb: 0.75,
		narrationBase: 2.00,
		narrationPer1000Chars: 0.80,
		model3dBase: 5.00,
		model3dPerMb: 1.00,
		mediaImportBase: 1.00,
		mediaImportPerMb: 0.50,
		batchTransformBase: 2.00,
		batchTransformPerObject: 0.05,
	},
	thresholds: {
		minCharge: 0.01,
		confirmationRequiredAbove: 150.00,
		hardBlockAboveWithoutExplicitOverride: 300.00,
	},
}

function numericEnv(name, fallback) {
	const n = Number(process.env[name])
	return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function currentRateCard() {
	const card = JSON.parse(JSON.stringify(BILLING_RATE_CARD))
	card.thresholds.confirmationRequiredAbove = numericEnv(
		'BETTERPPTX_BILLING_CONFIRMATION_THRESHOLD_CREDITS',
		card.thresholds.confirmationRequiredAbove,
	)
	card.thresholds.hardBlockAboveWithoutExplicitOverride = numericEnv(
		'BETTERPPTX_BILLING_HARD_BLOCK_THRESHOLD_CREDITS',
		card.thresholds.hardBlockAboveWithoutExplicitOverride,
	)
	return card
}

export function currentRateCardVersion() {
	return process.env.BETTERPPTX_BILLING_RATE_CARD_VERSION || RATE_CARD_VERSION
}

export function roundCredits(value) {
	const n = Number(value)
	if (!Number.isFinite(n) || n <= 0) return 0
	return Number(n.toFixed(2))
}

export function applyMinimumCharge(value, rateCard = currentRateCard()) {
	const n = roundCredits(value)
	if (n <= 0) return 0
	return Math.max(roundCredits(rateCard.thresholds.minCharge), n)
}

