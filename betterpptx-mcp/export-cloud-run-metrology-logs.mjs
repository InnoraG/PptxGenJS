import * as fs from 'node:fs'
import * as path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// L1 exporter: pull betterpptx resource-meter rows from Cloud Logging for one run, reject rows
// that belong to a different run/service/revision/topology, and normalize to ndjson.

function parsePayload(entry) {
	if (entry && typeof entry.jsonPayload === 'object' && entry.jsonPayload) return entry.jsonPayload
	const text = entry?.textPayload ?? entry?.message ?? ''
	if (typeof text !== 'string' || !text.trim().startsWith('{')) return null
	try {
		return JSON.parse(text)
	} catch {
		return null
	}
}

// Pure, testable normalizer. Returns accepted resource_measurement rows plus rejection reasons.
export function normalizeMetrologyLogEntries(entries = [], { runId = '', service = '', revision = '', topology = '' } = {}) {
	const accepted = []
	const rejected = []
	for (const entry of entries) {
		const row = parsePayload(entry)
		if (!row || row.schemaVersion !== 'betterpptx.metrology.v1') {
			rejected.push({ reason: 'not-a-metrology-row', sample: row ? { schemaVersion: row.schemaVersion } : null })
			continue
		}
		if (row.metricType !== 'betterpptx.resource_measurement') {
			rejected.push({ reason: 'not-a-resource-measurement', metricType: row.metricType })
			continue
		}
		if (runId && row.workload && row.workload !== runId) {
			rejected.push({ reason: 'run-id-mismatch', workload: row.workload })
			continue
		}
		if (service && row.service && row.service !== service) {
			rejected.push({ reason: 'service-mismatch', service: row.service })
			continue
		}
		if (revision && row.revision && row.revision !== revision) {
			rejected.push({ reason: 'revision-mismatch', revision: row.revision })
			continue
		}
		if (topology && row.topology && row.topology !== topology) {
			rejected.push({ reason: 'topology-mismatch', topology: row.topology })
			continue
		}
		accepted.push(row)
	}
	return { accepted, rejected }
}

function buildLoggingFilter({ service, revision, runId, start, end }) {
	const parts = [
		'resource.type="cloud_run_revision"',
		`resource.labels.service_name="${service}"`,
		'severity>=DEFAULT',
		'"betterpptx.resource_measurement"',
	]
	if (revision) parts.push(`resource.labels.revision_name="${revision}"`)
	if (runId) parts.push(`"${runId}"`)
	if (start) parts.push(`timestamp>="${start}"`)
	if (end) parts.push(`timestamp<="${end}"`)
	return parts.join(' AND ')
}

function fetchLogEntries({ project, filter }) {
	const result = spawnSync('gcloud', [
		'logging', 'read', filter,
		`--project=${project}`,
		'--format=json',
		'--order=asc',
		'--limit=100000',
	], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
	if (result.status !== 0) {
		throw new Error(`gcloud logging read failed (exit ${result.status}): ${result.stderr || result.error?.message}`)
	}
	return JSON.parse(result.stdout || '[]')
}

export function exportMetrologyLogs({
	project, region, service, runId, revision = '', topology = '', start = '', end = '',
	outFile, rawFile = '', queryFile = '', inputFile = '',
} = {}) {
	const filter = buildLoggingFilter({ service, revision, runId, start, end })
	const entries = inputFile
		? JSON.parse(fs.readFileSync(inputFile, 'utf8'))
		: fetchLogEntries({ project, filter })
	const { accepted, rejected } = normalizeMetrologyLogEntries(entries, { runId, service, revision, topology })
	const resolvedRaw = rawFile || outFile.replace(/\.ndjson$/, '.raw.ndjson')
	fs.mkdirSync(path.dirname(outFile), { recursive: true })
	fs.writeFileSync(resolvedRaw, `${entries.map(e => JSON.stringify(parsePayload(e) ?? e)).join('\n')}\n`, 'utf8')
	fs.writeFileSync(outFile, `${accepted.map(r => JSON.stringify(r)).join('\n')}${accepted.length ? '\n' : ''}`, 'utf8')
	const resolvedQuery = queryFile || path.join(path.dirname(outFile), 'log-export-query.txt')
	fs.writeFileSync(resolvedQuery, `# project=${project} region=${region}\n${filter}\n`, 'utf8')
	return { acceptedCount: accepted.length, rejectedCount: rejected.length, rejected, filter, outFile, rawFile: resolvedRaw, queryFile: resolvedQuery }
}

function parseArgs(argv) {
	const out = { project: '', region: 'us-central1', service: '', runId: '', revision: '', topology: '', start: '', end: '', out: '', inputFile: '' }
	for (let index = 0; index < argv.length; index += 1) {
		const arg = argv[index]
		if (arg === '--project') out.project = String(argv[++index] || '')
		else if (arg === '--region') out.region = String(argv[++index] || '')
		else if (arg === '--service') out.service = String(argv[++index] || '')
		else if (arg === '--run-id') out.runId = String(argv[++index] || '')
		else if (arg === '--revision') out.revision = String(argv[++index] || '')
		else if (arg === '--topology') out.topology = String(argv[++index] || '')
		else if (arg === '--start') out.start = String(argv[++index] || '')
		else if (arg === '--end') out.end = String(argv[++index] || '')
		else if (arg === '--out') out.out = path.resolve(argv[++index])
		else if (arg === '--input-file') out.inputFile = path.resolve(argv[++index])
		else if (arg === '--help') out.help = true
		else throw new Error(`Unknown argument: ${arg}`)
	}
	return out
}

function main() {
	const args = parseArgs(process.argv.slice(2))
	if (args.help || !args.service || !args.runId || !args.out) {
		console.log('Usage: node betterpptx-mcp/export-cloud-run-metrology-logs.mjs --project P --region R --service S --run-id ID --start ISO --end ISO --out l1/resource-meter.ndjson [--revision REV] [--topology ROLE] [--input-file raw-gcloud.json]')
		process.exit(args.help ? 0 : 2)
	}
	const result = exportMetrologyLogs({ ...args, outFile: args.out })
	console.log(`L1 LOG EXPORT: accepted=${result.acceptedCount} rejected=${result.rejectedCount} out=${result.outFile}`)
	if (!result.acceptedCount) process.exit(1)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
