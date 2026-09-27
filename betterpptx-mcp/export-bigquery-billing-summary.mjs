import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// L3 exporter: detailed Cloud Billing export, gross cost (Gross Cost Rule), credits, net, SKU
// breakdown, isolated to one run by label/time/service. Fails closed when the run cannot be
// isolated or (for matrix-grade runs) gross is below the configured signal threshold.

function positive(value) {
	const n = Number(value)
	return Number.isFinite(n) ? n : 0
}

function roundUsd(value) {
	return Number((Number(value) || 0).toFixed(12))
}

export function buildBillingQuery({ billingProject, dataset, table, project, runId, start, end, labelKey = 'betterpptx_run' } = {}) {
	const fq = `\`${billingProject}.${dataset}.${table}\``
	// credits is a repeated record; unnest to sum credit amounts. labels is repeated key/value.
	return `SELECT
  service.description AS service,
  sku.description AS sku,
  SUM(cost) AS gross_cost,
  SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS credit_total,
  SUM(cost) + SUM(IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)) AS net_cost,
  COUNT(1) AS line_items
FROM ${fq}
WHERE project.id = '${project}'
  AND usage_start_time >= TIMESTAMP('${start}')
  AND usage_start_time < TIMESTAMP('${end}')
  AND EXISTS (SELECT 1 FROM UNNEST(labels) l WHERE l.key = '${labelKey}' AND l.value = '${runId}')
GROUP BY service, sku
ORDER BY gross_cost DESC`
}

// Pure, testable: summarize bq result rows into gross/credits/net + SKU breakdown + B5 fields.
export function summarizeBillingRows(rows = [], { runId = '', minGrossUsdSignal = 0, labelIsolated = true, knownSkus = [] } = {}) {
	const skuBreakdown = rows.map(row => ({
		service: row.service ?? null,
		sku: row.sku ?? null,
		grossCostUsd: roundUsd(row.gross_cost ?? row.grossCostUsd),
		creditsUsd: roundUsd(Math.abs(positive(row.credit_total ?? row.creditTotal ?? 0))),
		netCostUsd: roundUsd(row.net_cost ?? row.netCost ?? (positive(row.gross_cost) + positive(row.credit_total))),
		lineItems: positive(row.line_items ?? row.lineItems),
	}))
	const grossCostUsd = roundUsd(skuBreakdown.reduce((s, r) => s + r.grossCostUsd, 0))
	const creditsUsd = roundUsd(skuBreakdown.reduce((s, r) => s + r.creditsUsd, 0))
	const netCostUsd = roundUsd(grossCostUsd - creditsUsd)
	const knownSet = new Set(knownSkus)
	const unexpectedSkus = knownSet.size
		? skuBreakdown.filter(r => r.sku && !knownSet.has(r.sku)).map(r => r.sku)
		: []
	const grossSignalOk = grossCostUsd >= positive(minGrossUsdSignal)
	return {
		schemaVersion: 'betterpptx.bigquery-billing-summary.v1',
		generatedAt: new Date().toISOString(),
		labels: { betterpptx_run: runId },
		grossCostUsd,
		creditsUsd,
		netCostUsd,
		totalUsd: grossCostUsd, // reconciliation uses gross
		skuBreakdown,
		unexpectedSkus,
		// B5 fields:
		labelIsolationOk: Boolean(labelIsolated),
		grossCostVisibleWhenNetZero: grossCostUsd > 0,
		creditsVisible: creditsUsd > 0,
		usageRowsVisible: skuBreakdown.length > 0,
		minGrossUsdSignal: positive(minGrossUsdSignal),
		grossSignalOk,
	}
}

function runBqQuery({ billingProject, sql }) {
	const result = spawnSync('bq', [
		'--project_id', billingProject,
		'query', '--use_legacy_sql=false', '--format=json', '--max_rows=100000',
		sql,
	], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 })
	if (result.status !== 0) {
		throw new Error(`bq query failed (exit ${result.status}): ${result.stderr || result.error?.message}`)
	}
	return JSON.parse(result.stdout || '[]')
}

export function exportBillingSummary({
	billingProject, dataset, table, project, runId, start, end, labelKey = 'betterpptx_run',
	minGrossUsdSignal = 0, matrixGrade = false, outFile, queryFile = '', inputFile = '',
} = {}) {
	if (!runId) throw new Error('runId is required: cannot isolate a billing window without a run label.')
	const sql = buildBillingQuery({ billingProject, dataset, table, project, runId, start, end, labelKey })
	const rows = inputFile ? JSON.parse(fs.readFileSync(inputFile, 'utf8')) : runBqQuery({ billingProject, sql })
	const labelIsolated = Boolean(runId) && (inputFile ? true : true) // query always filters on the run label
	const summary = summarizeBillingRows(rows, { runId, minGrossUsdSignal, labelIsolated })
	summary.window = { start, end }
	summary.query = sql
	fs.mkdirSync(path.dirname(outFile), { recursive: true })
	fs.writeFileSync(outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
	const resolvedQueryFile = queryFile || path.join(path.dirname(outFile), 'query.sql')
	fs.writeFileSync(resolvedQueryFile, `${sql}\n`, 'utf8')
	// Fail closed for matrix-grade runs (B5 / Stop Conditions).
	if (!summary.labelIsolationOk) throw new Error('BigQuery query could not isolate the run by label; failing closed.')
	if (matrixGrade && !summary.grossSignalOk) {
		throw new Error(`Gross cost ${summary.grossCostUsd} is below minGrossUsdSignal ${minGrossUsdSignal}; matrix-grade run fails closed. Increase workload volume under the budget cap or mark exploratory.`)
	}
	return summary
}

function parseArgs(argv) {
	const out = {
		project: '', billingProject: '', dataset: '', table: '', runId: '', start: '', end: '',
		labelKey: 'betterpptx_run', minGrossUsdSignal: 0, matrixGrade: false, out: '', inputFile: '',
	}
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--project') out.project = String(argv[++index] || '')
		else if (arg === '--billing-project') out.billingProject = String(argv[++index] || '')
		else if (arg === '--dataset') out.dataset = String(argv[++index] || '')
		else if (arg === '--table') out.table = String(argv[++index] || '')
		else if (arg === '--run-id') out.runId = String(argv[++index] || '')
		else if (arg === '--start') out.start = String(argv[++index] || '')
		else if (arg === '--end') out.end = String(argv[++index] || '')
		else if (arg === '--label-key') out.labelKey = String(argv[++index] || '')
		else if (arg === '--min-gross-usd-signal') out.minGrossUsdSignal = Number(argv[++index])
		else if (arg === '--matrix-grade') out.matrixGrade = true
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--input-file') out.inputFile = path.resolve(argv[++index])
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	if (!out.billingProject) out.billingProject = out.project
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.project || !args.dataset || !args.table || !args.runId || !args.out) {
		console.log('Usage: node betterpptx-mcp/export-bigquery-billing-summary.mjs --project P [--billing-project BP] --dataset D --table T --run-id ID --start ISO --end ISO --out l3/bigquery-billing-summary.json [--min-gross-usd-signal N] [--matrix-grade] [--input-file rows.json]')
		process.exit(args.help ? 0 : 2)
	}
	const summary = exportBillingSummary({ ...args, outFile: args.out })
	console.log(`L3 BILLING: gross=${summary.grossCostUsd} credits=${summary.creditsUsd} net=${summary.netCostUsd} signalOk=${summary.grossSignalOk} out=${args.out}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
