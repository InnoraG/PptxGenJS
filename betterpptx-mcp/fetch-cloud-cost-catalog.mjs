import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateCloudBillingCatalogSnapshot } from './billing/cost-model.mjs'

// Official source references recorded in every snapshot (Official Source Policy). Prices are NOT
// hard-coded from old notes; they must come from a reviewed override file (or a future live
// Cloud Billing Catalog API mapping). The tool fails closed rather than invent prices.
export const OFFICIAL_SOURCES = Object.freeze({
	cloudRunPricing: 'https://cloud.google.com/run/pricing',
	billingExport: 'https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery',
	detailedSchema: 'https://docs.cloud.google.com/billing/docs/how-to/export-data-bigquery-tables/detailed-usage',
})

const PRICE_GROUPS = Object.freeze({
	cloudRun: ['vcpuUsdPerSecond', 'gibUsdPerSecond', 'requestUsdPerMillion'],
	gcs: ['classAUsdPer1000', 'classBUsdPer1000', 'storageUsdPerGibMonth', 'egressUsdPerGib'],
	firestore: ['readUsdPer100k', 'writeUsdPer100k', 'deleteUsdPer100k'],
	external: ['ttsUsdPerMillionCharacters', 'avatarUsdPerGpuSecond', 'otherUsdPerCall'],
})

function assertCompletePrices(prices) {
	const missing = []
	for (const [group, fields] of Object.entries(PRICE_GROUPS)) {
		for (const field of fields) {
			const value = Number(prices?.[group]?.[field])
			if (!Number.isFinite(value) || value < 0) missing.push(`${group}.${field}`)
		}
	}
	if (missing.length) {
		throw new Error(`Reviewed price source is incomplete; missing/invalid fields: ${missing.join(', ')}. Supply a complete reviewed --override file (see ${OFFICIAL_SOURCES.cloudRunPricing}).`)
	}
}

export function buildCatalogSnapshot({
	prices,
	region,
	billingMode = 'request_based',
	cpuAlwaysAllocated,
	effectiveAt,
	retrievedAt = new Date().toISOString(),
	sourceReference,
} = {}) {
	if (!prices) throw new Error('A reviewed price source is required (pass --override <file>).')
	assertCompletePrices(prices)
	const snapshot = {
		schemaVersion: 'betterpptx.cloud-cost-catalog.v1',
		currency: 'USD',
		region: String(region || prices.region || ''),
		effectiveAt: String(effectiveAt || prices.effectiveAt || retrievedAt),
		retrievedAt,
		cloudRunBillingMode: billingMode,
		cpuAlwaysAllocated: cpuAlwaysAllocated === undefined ? (billingMode === 'instance_based') : Boolean(cpuAlwaysAllocated),
		source: {
			type: 'reviewed-price-source',
			reference: String(sourceReference || prices.source?.reference || OFFICIAL_SOURCES.cloudRunPricing),
			officialSources: OFFICIAL_SOURCES,
		},
		cloudRun: { ...prices.cloudRun },
		gcs: { ...prices.gcs },
		firestore: { ...prices.firestore },
		external: { ...prices.external },
	}
	// Validate strictly: a fetched catalog must always carry a pinned billing mode.
	return validateCloudBillingCatalogSnapshot(snapshot, { requireBillingMode: true })
}

function parseArgs(argv) {
	const out = { project: '', region: 'us-central1', out: '', override: '', billingMode: 'request_based', cpuAlwaysAllocated: undefined }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--project') out.project = String(argv[++index] || '')
		else if (arg === '--region') out.region = String(argv[++index] || '')
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--override') out.override = path.resolve(argv[++index])
		else if (arg === '--billing-mode') out.billingMode = String(argv[++index] || '')
		else if (arg === '--cpu-always-allocated') out.cpuAlwaysAllocated = true
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.out) {
		console.log('Usage: node betterpptx-mcp/fetch-cloud-cost-catalog.mjs --out catalog.json --override reviewed-prices.json [--region us-central1] [--billing-mode request_based|instance_based] [--cpu-always-allocated]')
		console.log('Reviewed override prices are authoritative. Live Cloud Billing Catalog API mapping is intentionally not auto-fabricated; supply reviewed current prices.')
		process.exit(args.help ? 0 : 2)
	}
	if (!args.override) {
		console.error('No reviewed price source provided. Pass --override <reviewed-prices.json>. The tool will not invent prices.')
		process.exit(2)
	}
	const prices = JSON.parse(fs.readFileSync(args.override, 'utf8'))
	const snapshot = buildCatalogSnapshot({
		prices,
		region: args.region,
		billingMode: args.billingMode,
		cpuAlwaysAllocated: args.cpuAlwaysAllocated,
		sourceReference: prices.source?.reference,
	})
	fs.mkdirSync(path.dirname(args.out), { recursive: true })
	fs.writeFileSync(args.out, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')
	console.log(`CLOUD COST CATALOG: mode=${snapshot.cloudRunBillingMode} region=${snapshot.region} digest=${snapshot.digest.slice(0, 12)} out=${args.out}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
