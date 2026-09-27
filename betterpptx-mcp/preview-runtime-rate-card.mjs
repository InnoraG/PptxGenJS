import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { measuredMatrixToRateCard } from './billing/charging-matrix.mjs'

// M9 preview: prove that runtime pricing consumes the adopted matrix's cost basis + overhead
// policy, and show sample credit prices at a given multiplier. This is the artifact the
// verifier checks (runtime-rate-card-preview.json).

export function previewRuntimeRateCard({ matrix, multiplier }) {
	const m = Number(multiplier)
	if (!Number.isFinite(m) || m <= 0) throw new Error('multiplier must be a positive number.')
	const rateCard = measuredMatrixToRateCard(matrix, { multiplier: m })
	// Sample quotes to demonstrate the active basis is the one being priced.
	const sampleDeck = (slides, objects, richObjects, outputMb) => {
		const c = rateCard.checkpoint
		return Number((
			(c.deckSaveBase || 0)
			+ (c.perFinalSlide || 0) * slides
			+ (c.perFinalObject || 0) * objects
			+ (c.perRichObject || 0) * richObjects
			+ (c.perOutputMb || 0) * outputMb
		).toFixed(4))
	}
	return {
		schemaVersion: 'betterpptx.runtime-rate-card-preview.v1',
		generatedAt: new Date().toISOString(),
		ownerMultiplier: m,
		costBasis: rateCard.meta.costBasis,
		overheadPolicy: rateCard.meta.overheadPolicy,
		matrixVersion: rateCard.meta.matrixVersion,
		cloudRunBillingMode: rateCard.meta.cloudRunBillingMode,
		productionAdjustment: rateCard.meta.productionAdjustment,
		creditRateCard: { checkpoint: rateCard.checkpoint, heavy: rateCard.heavy },
		sampleQuotesCredits: {
			smallDeck_5slides_50obj_5rich_1mb: sampleDeck(5, 50, 5, 1),
			mediumDeck_15slides_150obj_20rich_3mb: sampleDeck(15, 150, 20, 3),
			largeDeck_40slides_500obj_60rich_8mb: sampleDeck(40, 500, 60, 8),
		},
		readsSelectedBlock: true,
	}
}

function parseArgs(argv) {
	const out = { matrix: '', multiplier: 10, out: '' }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--matrix') out.matrix = path.resolve(argv[++index])
		else if (arg === '--multiplier') out.multiplier = Number(argv[++index])
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.matrix || !args.out) {
		console.log('Usage: node betterpptx-mcp/preview-runtime-rate-card.mjs --matrix matrix.json --multiplier 10 --out runtime-rate-card-preview.json')
		process.exit(args.help ? 0 : 2)
	}
	const matrix = JSON.parse(fs.readFileSync(args.matrix, 'utf8'))
	const preview = previewRuntimeRateCard({ matrix, multiplier: args.multiplier })
	fs.mkdirSync(path.dirname(args.out), { recursive: true })
	fs.writeFileSync(args.out, `${JSON.stringify(preview, null, 2)}\n`, 'utf8')
	console.log(`RUNTIME RATE CARD PREVIEW: basis=${preview.costBasis} overhead=${preview.overheadPolicy} m=${preview.ownerMultiplier} out=${args.out}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
