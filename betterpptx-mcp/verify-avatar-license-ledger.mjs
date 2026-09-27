#!/usr/bin/env node
// Fail-closed, local evidence check for the avatar worker's commercial model
// boundary. This is an evidence ledger, not legal advice or a license grant.
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp')
const ledgerPath = path.join(root, 'avatar', 'license-ledger.json')
const defaultMetaPath = path.join(root, 'avatar', 'assets', 'default-presenter.meta.json')
const ownerApprovalPath = path.join(root, 'docs', 'release-safety', 'AVATAR-LICENSE-OWNER-APPROVAL-2026-07-19.json')
const outputPath = path.join(root, 'outputs', 'avatar-license-ledger-report.json')

const ledger = JSON.parse(await fs.readFile(ledgerPath, 'utf8'))
const defaultMeta = JSON.parse(await fs.readFile(defaultMetaPath, 'utf8'))
const ownerApproval = await fs.readFile(ownerApprovalPath, 'utf8').then(JSON.parse).catch(() => null)
const entries = Array.isArray(ledger.entries) ? ledger.entries : []
const required = [
	'liveportrait-code',
	'liveportrait-insightface-models',
	'liveportrait-yunet-detector',
	'musetalk-code',
	'musetalk-trained-model',
	'musetalk-transitive-models',
	'musetalk-testdata',
	'betterpptx-default-presenter',
]
const byId = new Map(entries.map(entry => [entry.id, entry]))
const requiredChecks = required.map(id => ({ id, present: byId.has(id) }))
const statusCounts = entries.reduce((counts, entry) => {
	const key = String(entry.reviewStatus || 'missing')
	counts[key] = (counts[key] || 0) + 1
	return counts
}, {})
const blocked = entries.filter(entry => ['blocked', 'open'].includes(entry.reviewStatus)).map(entry => entry.id)
const defaultPresenterCommercial = /product-owned|commercial-safe/i.test(String(defaultMeta.commercialUseStatus || ''))
const ownerApprovalRecorded = ['RECORDED_WITH_CONDITIONS', 'APPROVED_AND_CLOSED'].includes(String(ownerApproval?.status || '')) &&
	(ownerApproval?.licenseGateClosed === true || ownerApproval?.status === 'RECORDED_WITH_CONDITIONS') &&
	ownerApproval?.publicEnablementAllowed === false &&
	String(ownerApproval?.scope || '').includes('LivePortrait+MuseTalk')
const checks = [
	{ id: 'ledger-schema', status: ledger.schemaVersion === 'betterpptx.avatar-license-ledger.v1' ? 'PASS' : 'BLOCKED' },
	{ id: 'required-entry-coverage', status: requiredChecks.every(check => check.present) ? 'PASS' : 'BLOCKED' },
	{ id: 'official-evidence-links', status: entries.every(entry => /^https:\/\/github\.com\//.test(entry.evidence) || entry.evidence.startsWith('betterpptx-')) ? 'PASS' : 'BLOCKED' },
	{ id: 'default-presenter-provenance', status: defaultPresenterCommercial ? 'PASS' : 'BLOCKED' },
	{ id: 'owner-approval-recorded', status: ownerApprovalRecorded ? 'PASS' : 'BLOCKED' },
	{ id: 'commercial-model-approval', status: blocked.length === 0 ? 'PASS' : 'BLOCKED' },
]
const blockers = [
	...checks.filter(check => check.status !== 'PASS').map(check => check.id),
	...blocked.map(id => `review:${id}`),
]
const report = {
	schemaVersion: 'betterpptx.avatar-license-ledger-report.v1',
	status: blockers.length ? 'BLOCKED' : 'PASS',
	entryCount: entries.length,
	statusCounts,
	checks,
	blockers,
	defaultPresenterCommercial,
	ownerApproval: {
		recorded: ownerApprovalRecorded,
		status: String(ownerApproval?.status || 'missing'),
		artifact: 'betterpptx-mcp/docs/release-safety/AVATAR-LICENSE-OWNER-APPROVAL-2026-07-19.json',
		publicEnablementAllowed: ownerApproval?.publicEnablementAllowed === true,
	},
	legalClearanceClaimed: false,
}
await fs.mkdir(path.dirname(outputPath), { recursive: true })
await fs.writeFile(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
if (blockers.length) process.exitCode = 2
