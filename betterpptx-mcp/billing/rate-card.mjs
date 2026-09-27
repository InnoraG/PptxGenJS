import { configuredMatrixRateCard } from './charging-matrix.mjs'

export const RATE_CARD_VERSION = '2026-07-02.measured-local.1'

// PRICING BASIS (2026-07-02, owner-finalized; avatar corrected 2026-07-03): heavy-family
// prices are grounded in the measured-local cost matrix (serial ceiling, request-based
// us-central1 catalog, run tmp_autonomous_test resume_cost_refresh -> billing/cost-basis/)
// at owner multiplier m=25; the avatar family uses the GPU-fair multiplier m=3 on the
// MEASURED Modal A10G warm-bench decomposition (avatar-metrology 2026-06-27:
// model-load tax ~59s = $0.018/cold job -> avatarBase; warm compute ~49s per 10.7s clip
// = $0.0014 per AUDIO-second -> avatarPerSecond; a 30s clip costs ~$0.042 warm / ~$0.06
// cold). Real provider cost cannot bear the CPU-op margin multiple. Checkpoint-family and
// model3d/media/transform prices stay VALUE-based: their measured compile cost is below
// measurement noise (<$0.0001/op), so cost puts no floor under them. Narration is the
// true cost driver (Piper wall-time ~ linear in characters): at m=25 a typical 200-char
// slide prices within 1% of the previous card (2.15 vs 2.16 credits) — measurement
// CONFIRMED the old anchor while long scripts now pay their real cost. The quote-time
// avatar estimate derives duration from TTS length (script chars / 13 ≈ speech seconds)
// so the user-facing price scales with the narration before anything is synthesized.
// Cloud W1-W5 reconciliation is now UNBLOCKED (owner verified the BigQuery billing
// export active, 2026-07-03) and runs with BETTERPPTX_OWNER_PRICING_MULTIPLIER=25.
export const BILLING_RATE_CARD = {
	checkpoint: {
		deckSaveBase: 5.00,
		perFinalSlide: 0.60,
		perFinalObject: 0.06,
		perRichObject: 0.50,
		perOutputMb: 0.80,
		maxEditComplexitySurchargeRatio: 0.20,
		// SERVER/SERVICE credit-PRICE placeholders for free-content processing (imageOps raster
		// CPU + stock resolve download/decode in the free edit loop, recovered at the save
		// checkpoint). NOTE: these are CREDIT prices (owner multiplier already applied per the
		// m=25 header above) — NOT the USD cost basis. The pure measured USD cost basis lives
		// upstream in the charging-matrix rateCardUsd (multiplier-free); the CEO's multiplier is
		// applied downstream only. They give the fit a dedicated column so cost stops smearing
		// onto perRichObject/perOutputMb. Placeholder until measured-cloud; not added to the
		// customer estimate — the artifact is already priced via perRichObject/perOutputMb.
		perImageOp: 0.02,
		perResolvedAssetMb: 0.10,
	},
	heavy: {
		openUploadedBase: 0.50,
		openUploadedPerMb: 1.05,
		narrationBase: 1.00,
		narrationPer1000Chars: 5.75,
		avatarBase: 5.40,
		avatarPerSecond: 0.42,
		avatarQualityMultiplier: 1.50,
		model3dBase: 5.00,
		model3dPerMb: 1.00,
		// SERVER/SERVICE credit-PRICE placeholders (3D content is free-licensed): live external
		// model import (Sketchfab/assets.generate_model3d) = archive download + extract/convert +
		// write. CREDIT prices (multiplier already applied per header) — the pure USD cost basis
		// is upstream in charging-matrix rateCardUsd. Distinct from model3dBase/PerMb which price
		// placing an ALREADY-imported GLB.
		model3dImportBase: 1.50,
		model3dImportPerMb: 0.60,
		// SERVER/SERVICE credit-PRICE placeholders for GENERATED images (Flux content is Apache-2.0
		// = free): the real cost is scale-to-zero GPU compute (~sub-cent–half-cent/image), a genuine
		// external USD driver — NOT free like a stock resolve. CREDIT prices (owner multiplier already
		// applied per the m=25 header); the pure USD basis lives upstream in charging-matrix rateCardUsd
		// once measured-cloud. Placeholder until measured; imageGenBase × generation ops + imageGenPerImage
		// × images produced. Distinct from perRichObject/perOutputMb which price the embedded artifact.
		imageGenBase: 3.00,
		imageGenPerImage: 2.00,
		// Flux Modal L40S per-request GPU credit-PRICE placeholder (0 on the Cloudflare edge host). GPU-fair
		// family (see charging-matrix GPU_FAMILY_FIELDS), like model3dGenPerGpuSecond. Pure USD basis upstream.
		imageGenPerGpuSecond: 0.35,
		// Private Qwen semantic-review L40S GPU rate. This is a separate family for
		// owner-visible attribution; the measured USD catalog is authoritative.
		semanticJudgePerGpuSecond: 0.35,
		// SERVER/SERVICE credit-PRICE placeholders for GENERATED RIGGED 3D models (TRELLIS.2 image→mesh
		// + UniRig auto-rig; both MIT = content free). The real cost is GPU-seconds on Modal L40S
		// (generation + rigging + cold model-load), a genuine external USD driver — priced like the
		// avatar GPU family, NOT the m=25 CPU margin. CREDIT prices (owner multiplier already applied per
		// the m=3 GPU-fair header for GPU families); the pure USD basis lives upstream in charging-matrix
		// rateCardUsd once measured-cloud. model3dGenBase × 1 (cold-start amortized) + model3dGenPerGpuSecond
		// × worker-reported gpuSeconds; ×model3dGenQualityMultiplier for 'standard'. Distinct from
		// model3dBase/PerMb (placing an already-built GLB) and model3dImport* (external import).
		model3dGenBase: 5.00,
		model3dGenPerGpuSecond: 0.35,
		// Paid provider-credit path (for example premium multi-image avatar generation). This is
		// distinct from self-hosted GPU seconds and can be owner-adjusted from measured invoices.
		model3dGenPerProviderCredit: 1.00,
		model3dGenQualityMultiplier: 1.20,
		// Baker (presenter clip-baker) CPU-second credit-PRICE placeholder. CPU-only Modal container, so this
		// takes the NORMAL CPU margin (it is NOT in charging-matrix GPU_FAMILY_FIELDS, unlike model3dGenPerGpuSecond).
		// Baker is cheap (~6s CPU/perform) → small. Pure USD basis lives upstream in charging-matrix once measured.
		model3dGenPerBakeCpuSecond: 0.02,
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
	const thresholds = {
		...BILLING_RATE_CARD.thresholds,
		confirmationRequiredAbove: numericEnv(
			'BETTERPPTX_BILLING_CONFIRMATION_THRESHOLD_CREDITS',
			BILLING_RATE_CARD.thresholds.confirmationRequiredAbove,
		),
		hardBlockAboveWithoutExplicitOverride: numericEnv(
			'BETTERPPTX_BILLING_HARD_BLOCK_THRESHOLD_CREDITS',
			BILLING_RATE_CARD.thresholds.hardBlockAboveWithoutExplicitOverride,
		),
	}
	const measured = configuredMatrixRateCard({
		thresholds,
		defaultHeavy: BILLING_RATE_CARD.heavy,
	})
	if (measured) {
		return {
			checkpoint: { ...BILLING_RATE_CARD.checkpoint, ...measured.checkpoint },
			heavy: { ...BILLING_RATE_CARD.heavy, ...measured.heavy },
			thresholds,
			meta: measured.meta,
		}
	}
	return {
		checkpoint: { ...BILLING_RATE_CARD.checkpoint },
		heavy: { ...BILLING_RATE_CARD.heavy },
		thresholds,
		meta: { source: 'v0-placeholder', pricingDecision: 'plumbing_default_not_owner_approval' },
	}
}

export function currentRateCardVersion() {
	const measured = currentRateCard().meta
	if (measured?.source === 'charging-matrix' && measured.matrixVersion) return measured.matrixVersion
	return process.env.BETTERPPTX_BILLING_RATE_CARD_VERSION || RATE_CARD_VERSION
}

export function estimateCalibrationMultiplier() {
	const configured = Number(process.env.BETTERPPTX_ESTIMATE_CALIBRATION_MULTIPLIER)
	return Number.isFinite(configured) && configured > 0 ? configured : 1
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
