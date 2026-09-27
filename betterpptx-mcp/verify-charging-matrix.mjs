import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { buildChargingMatrixFromFiles } from '../tools/build-charging-matrix.mjs'

const outputDir = path.resolve('outputs', 'charging-matrix-verify', `run-${Date.now()}-${process.pid}`)
const rowsFile = path.join(outputDir, 'rows.ndjson')
const matrixFile = path.join(outputDir, 'charging-matrix.json')
const reportFile = path.join(outputDir, 'cost-metrology-report.md')
fs.mkdirSync(outputDir, { recursive: true })

const checkpointCoefficients = {
	deckSaveBase: 0.001,
	perFinalSlide: 0.0001,
	perFinalObject: 0.00002,
	perRichObject: 0.00007,
	perOutputMb: 0.00003,
	// OPTIONAL server/service families (free-content processing): raw measured USD, no multiplier.
	perImageOp: 0.00005,
	perResolvedAssetMb: 0.0004,
}
const heavyCoefficients = {
	openUploadedBase: 0.0008,
	openUploadedPerMb: 0.00004,
	narrationBase: 0.0005,
	narrationPer1000Chars: 0.0002,
	avatarBase: 0.002,
	avatarPerSecond: 0.00008,
	model3dBase: 0.001,
	model3dPerMb: 0.00006,
	mediaImportBase: 0.0003,
	mediaImportPerMb: 0.00004,
	batchTransformBase: 0.0002,
	batchTransformPerObject: 0.00001,
	// External 3D import server/service family: raw measured USD, no multiplier.
	model3dImportBase: 0.0006,
	model3dImportPerMb: 0.00003,
}

const rows = []
for (const [feature, measuredUsd] of Object.entries(checkpointCoefficients)) {
	rows.push({
		model: 'checkpoint',
		scenario: `checkpoint.${feature}`,
		measuredUsd,
		catalogDigest: 'fixture_catalog_digest',
		features: { [feature]: 1 },
	})
}
for (const [feature, measuredUsd] of Object.entries(heavyCoefficients)) {
	rows.push({
		model: 'heavy',
		scenario: `heavy.${feature}`,
		measuredUsd,
		catalogDigest: 'fixture_catalog_digest',
		features: { [feature]: 1 },
	})
}
fs.writeFileSync(rowsFile, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`, 'utf8')

buildChargingMatrixFromFiles({
	inputs: [rowsFile],
	output: matrixFile,
	report: reportFile,
	allowSmall: true,
})
assert(fs.existsSync(matrixFile), 'Matrix builder did not write output JSON.')
assert(fs.existsSync(reportFile), 'Matrix builder did not write the decision report.')

const matrix = JSON.parse(fs.readFileSync(matrixFile, 'utf8'))
assert.equal(matrix.schemaVersion, 'betterpptx.charging-matrix.v1')
assert.equal(matrix.status, 'measured')
assert.equal(matrix.pricingDecision, 'owner_multiplier_pending')
// DOCTRINE GUARD (owner: "no multiplier at all in costing data; the CEO plays on the
// multiplier later"): the matrix is pure COST. EVERY fitted rateCardUsd coefficient must
// equal its raw measured-USD input — proving NO owner multiplier / credits / x100 is baked at
// build time, for ALL families including the server/service ones (perImageOp, perResolvedAssetMb,
// model3dImport*). The multiplier is the CEO's separate later lever, applied ONLY downstream by
// measuredMatrixToRateCard (asserted below to REQUIRE the external env and throw without it).
for (const [feature, usd] of Object.entries(checkpointCoefficients)) {
	assert.equal(matrix.rateCardUsd.checkpoint[feature], usd, `checkpoint.${feature} must be pure measured USD (no multiplier baked in costing)`)
}
for (const [feature, usd] of Object.entries(heavyCoefficients)) {
	assert.equal(matrix.rateCardUsd.heavy[feature], usd, `heavy.${feature} must be pure measured USD (no multiplier baked in costing)`)
}
assert(matrix.models.checkpoint.fitCoverageWithin15Pct >= 0.95)
assert(matrix.models.heavy.fitCoverageWithin15Pct >= 0.95)

const report = fs.readFileSync(reportFile, 'utf8')
assert(report.includes('No pricing decision is requested'), 'Decision report should not request pricing approval.')
assert(report.includes('m=100'), 'Decision report should include owner multiplier examples.')

const {
	configuredOwnerPricingMultiplier,
	measuredMatrixToRateCard,
	validateChargingMatrix,
} = await import('./billing/charging-matrix.mjs')

delete process.env.BETTERPPTX_OWNER_PRICING_MULTIPLIER
delete process.env.BETTERPPTX_PRICING_MULTIPLIER
assert.throws(
	() => configuredOwnerPricingMultiplier(),
	error => error?.code === 'OWNER_PRICING_MULTIPLIER_REQUIRED',
)
assert.throws(
	() => measuredMatrixToRateCard(matrix),
	error => error?.code === 'OWNER_PRICING_MULTIPLIER_REQUIRED',
)
assert.throws(
	() => validateChargingMatrix({ ...matrix, status: 'pending' }),
	error => error?.code === 'CHARGING_MATRIX_NOT_MEASURED',
)

process.env.BETTERPPTX_CHARGING_MATRIX_FILE = matrixFile
process.env.BETTERPPTX_OWNER_PRICING_MULTIPLIER = '10'
const { currentRateCard, currentRateCardVersion } = await import('./billing/rate-card.mjs')
const rateCard = currentRateCard()
assert.equal(rateCard.meta.source, 'charging-matrix')
assert.equal(rateCard.meta.ownerMultiplier, 10)
assert.equal(rateCard.checkpoint.deckSaveBase, 1)
assert.equal(rateCard.checkpoint.perFinalSlide, 0.1)
// GPU family: avatar coefficients use the GPU-fair multiplier (min(main, 3) unset), because
// A10G per-clip cost is real provider money and cannot bear the CPU-op margin multiple.
assert.equal(rateCard.meta.avatarMultiplier, 3)
assert.equal(rateCard.heavy.avatarPerSecond, 0.024)
assert.equal(currentRateCardVersion(), matrix.version)

process.env.BETTERPPTX_OWNER_PRICING_MULTIPLIER_AVATAR = '10'
const overriddenRateCard = currentRateCard()
assert.equal(overriddenRateCard.meta.avatarMultiplier, 10)
assert.equal(overriddenRateCard.heavy.avatarPerSecond, 0.08)
assert.equal(overriddenRateCard.heavy.narrationBase, rateCard.heavy.narrationBase, 'Avatar override must not touch CPU-family coefficients.')
delete process.env.BETTERPPTX_OWNER_PRICING_MULTIPLIER_AVATAR

console.log(`CHARGING MATRIX VERIFY: PASS rows=${rows.length} version=${matrix.version} deckSaveBaseCredits=${rateCard.checkpoint.deckSaveBase}`)
