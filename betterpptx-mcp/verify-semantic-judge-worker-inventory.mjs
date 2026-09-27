// IMG5 dependency/inventory preflight. Offline and fail-closed: this does not install
// packages, download weights, contact Modal, or turn incomplete license metadata into approval.
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const worker = path.join(here, 'deploy', 'semantic-judge-worker')
const lockPath = path.join(worker, 'dependency-lock.json')
const resolutionPath = path.join(worker, 'resolved-dependencies-linux-modal-dry-run.json')
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const resolutionBytes = fs.readFileSync(resolutionPath)
const resolution = JSON.parse(resolutionBytes)
const inImage = JSON.parse(fs.readFileSync(path.join(here, 'outputs', 'semantic-judge-in-image-inventory.json'), 'utf8'))
const install = Array.isArray(resolution.install) ? resolution.install : []
const normalize = value => String(value || '').toLowerCase().replace(/[-_.]+/g, '')
const packageName = item => item?.metadata?.name || ''
const packageVersion = item => item?.metadata?.version || ''
const byName = new Map(install.map(item => [normalize(packageName(item)), item]))
const inImageByName = new Map((Array.isArray(inImage.packages) ? inImage.packages : []).map(item => [normalize(item?.name), item]))
const licenseClassifiers = item => (Array.isArray(item?.metadata?.classifier) ? item.metadata.classifier : []).filter(value => /^License ::/i.test(value))
// PEP 639 adds License-Expression. pip's report stores it as license_expression;
// treating only the legacy `license` field as evidence created a false 28-record gap.
const declaredLicense = item => String(item?.metadata?.license_expression || item?.metadata?.license || '').trim()
const incompleteLicense = install.filter(item => !declaredLicense(item) && licenseClassifiers(item).length === 0)
const expressionCount = install.filter(item => Boolean(item?.metadata?.license_expression)).length
const nonCommercial = install.filter(item => /non[- ]?commercial|(?:CC[- ]?BY[- ]?NC)/i.test(`${declaredLicense(item)} ${(licenseClassifiers(item)).join(' ')}`))
const missingDirect = Object.keys(lock.directPins || {}).filter(name => !byName.has(normalize(name)) && !inImageByName.has(normalize(name)))
const mismatchedDirect = Object.entries(lock.directPins || {}).filter(([name, version]) => {
	const resolved = byName.get(normalize(name))?.metadata?.version || inImageByName.get(normalize(name))?.version
	return resolved !== version
})
const hashMissing = install.filter(item => !item?.download_info?.archive_info?.hashes?.sha256)
const duplicateNames = [...new Set(install.map(packageName).filter(Boolean))].filter(name => install.filter(item => normalize(packageName(item)) === normalize(name)).length > 1)
const report = {
	 schemaVersion: 'betterpptx.img5-semantic-judge-inventory.v1',
	 worker: 'betterpptx-semantic-judge',
	 source: 'offline pip dry-run plus exact Modal in-image attestation; no customer image or production approval',
	 packageCount: install.length,
	 directPinCount: Object.keys(lock.directPins || {}).length,
	 missingDirect,
	 mismatchedDirect,
	 incompleteLicensePackages: incompleteLicense.map(packageName).sort(),
	 incompleteLicenseCount: incompleteLicense.length,
	 pep639LicenseExpressionCount: expressionCount,
	 nonCommercialPackageCount: nonCommercial.length,
	 hashMissingCount: hashMissing.length,
	 duplicateNames,
	 linuxEvidenceSha256: crypto.createHash('sha256').update(resolutionBytes).digest('hex'),
	 approval: lock.linuxModalDryRun?.approval || 'unknown',
	 productionUseBlockedUntil: lock.productionUseBlockedUntil || [],
	 customerImages: false,
	 externalAi: false,
	 network: false,
}
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

console.log('IMG5 SEMANTIC-JUDGE WORKER INVENTORY (offline, fail-closed):')
ok('Linux resolution has the attested 66 records', install.length === 66)
ok('every direct runtime pin is present', missingDirect.length === 0, missingDirect)
ok('every direct runtime pin has the exact locked version', mismatchedDirect.length === 0, mismatchedDirect)
ok('every resolved record has name and version metadata', install.every(item => packageName(item) && packageVersion(item)))
ok('every resolved wheel has a sha256 archive hash', hashMissing.length === 0)
ok('package names are unique after normalization', duplicateNames.length === 0, duplicateNames)
ok('PEP 639 license expressions are included in the evidence', expressionCount >= 30 && declaredLicense(install.find(item => packageName(item) === 'detect-installer')) === '0BSD')
ok('all resolved records have explicit license evidence', incompleteLicense.length === 0, incompleteLicense.map(packageName))
ok('no resolved package declares a non-commercial restriction', nonCommercial.length === 0, nonCommercial.map(packageName))
ok('deployment remains blocked for the independent owner/runtime gates', lock.linuxModalDryRun?.approval === 'blocked' && lock.productionUseBlockedUntil.length >= 4)
ok('evidence digest matches the lock', report.linuxEvidenceSha256 === lock.linuxModalDryRun?.evidenceSha256)
ok('no customer image or external AI path is part of this preflight', report.customerImages === false && report.externalAi === false && report.network === false)

fs.mkdirSync(path.join(here, 'outputs'), { recursive: true })
fs.writeFileSync(path.join(here, 'outputs', 'img5-semantic-judge-inventory-report.json'), JSON.stringify({ ...report, checks: pass, failures: fail }, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
