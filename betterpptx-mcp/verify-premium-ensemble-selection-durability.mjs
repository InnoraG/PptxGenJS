// Offline proof for the premium ensemble selection index. It uses an owned
// synthetic raster, persists the winner and opaque selection record, then
// hydrates both in a cold process and across a different tenant boundary.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const self = fileURLToPath(import.meta.url)
const outputRoot = path.join(here, 'outputs')
const sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-premium-selection-'))
const tenantA = 'premium-selection-tenant-a'
const tenantB = 'premium-selection-tenant-b'
const baseHash = '1111111111111111111111111111111111111111'
const finalHash = '2222222222222222222222222222222222222222'
const selection = { status: 'selected', reason: 'SHARPEST_ELIGIBLE_CANDIDATE', policy: 'hard-gates-then-owner-sharpness-proxy', selectedLane: 'reference', ranked: [{ lane: 'reference', sharpness: 24 }, { lane: 'create', sharpness: 12 }] }
const candidatePlan = { crossModelEnsemble: true, initialCandidates: 2, hardGenerationCallCeiling: 2, capabilityLanes: ['create', 'reference'] }
const evaluationPlan = { sharpnessFirstResearch: true, selection: 'hard-gates-then-owner-sharpness-proxy' }
const checks = []
let passed = 0
const ok = (name, condition, detail = '') => { checks.push({ name, status: condition ? 'PASS' : 'FAIL', detail }); if (condition) passed += 1; console.log(`  ${condition ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`) }

const baseEnv = {
	...process.env, BETTERPPTX_GEN_ASSET_STORE: 'local', BETTERPPTX_GEN_ASSET_DIR: sharedDir,
	BETTERPPTX_ASSETS_ROOT: path.resolve(here, '..'), BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_BILLING_ENFORCE: '0',
}

if (process.argv[2] === 'cold') {
	// Keep the parent's shared directory; this module creates a throwaway temp
	// path at load time, but a cold child must not overwrite the inherited one.
	Object.assign(process.env, { BETTERPPTX_GEN_ASSET_STORE: 'local', BETTERPPTX_ASSETS_ROOT: path.resolve(here, '..'), BETTERPPTX_LOCAL_MAINTAINER: '1', BETTERPPTX_BILLING_ENFORCE: '0' })
	const provider = await import('./assets/image-gen-providers.mjs')
	const store = await import('./storage/gen-asset-store.mjs')
	const tenant = process.argv[3] || tenantA
	const indexHash = process.argv[4]
	const image = await provider.hydrateGeneratedImage(finalHash, tenant)
	const index = await provider.loadGeneratedImageEnsembleSelection(indexHash, tenant)
	console.log('RESULT ' + JSON.stringify({ image: Boolean(image?.dataUri), imagePromptHash: image?.promptHash || null, index, otherTenant: tenant === tenantA ? Boolean(await provider.loadGeneratedImageEnsembleSelection(indexHash, tenantB)) : null, provider: store.genAssetStoreProviderName() }))
	process.exit(0)
}

Object.assign(process.env, baseEnv)
const provider = await import('./assets/image-gen-providers.mjs')
const store = await import('./storage/gen-asset-store.mjs')
const selectionHash = provider.imageEnsembleSelectionHashFor({ baseHash, candidatePlan, evaluationPlan })
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mP8z8Dwn4GBgYGJAQgAJw4DA1U01/kAAAAASUVORK5CYII='
provider.cacheGeneratedImage({
	promptHash: finalHash, handle: `gen://image/${finalHash}`, dataUri: `data:image/png;base64,${png}`, contentType: 'image/png', width: 1280, height: 768,
	provider: 'private-fixture', model: 'private-fixture', capability: 'reference', license: { license: 'Apache-2.0', attributionRequired: false, commercialUse: 'allowed' },
	ensembleSelection: { ...selection, selectionIndexHash: selectionHash, reused: false },
})
const imagePersist = await provider.persistGeneratedImage(finalHash, tenantA)
const indexPersist = await provider.persistGeneratedImageEnsembleSelection({ selectionHash, tenantId: tenantA, baseHash, finalHash, selectedLane: 'reference', selection, candidateHashes: [{ lane: 'create', hash: '3333333333333333333333333333333333333333' }, { lane: 'reference', hash: finalHash }] })
ok('selection identity is deterministic and opaque', /^[a-f0-9]{40}$/.test(selectionHash) && !selectionHash.includes(baseHash))
ok('winner image persists idempotently under the tenant boundary', imagePersist.ok === true && imagePersist.skipped === false)
ok('selection index persists separately from the image blob', indexPersist.ok === true && indexPersist.skipped === false)
const indexPath = path.join(sharedDir, 'betterpptx-gen-assets', 'tenants', tenantA, 'records', `${selectionHash}.json`)
const rawIndex = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, 'utf8') : ''
ok('selection index contains hashes and no prompt text', rawIndex.includes(finalHash) && !rawIndex.includes('durable') && !rawIndex.includes('prompt'))

const cold = spawnSync(process.execPath, [self, 'cold', tenantA, selectionHash], { encoding: 'utf8', timeout: 120000, env: baseEnv, windowsHide: true })
const line = String(cold.stdout || '').split(/\r?\n/).find(value => value.startsWith('RESULT '))
const coldResult = line ? JSON.parse(line.slice(7)) : {}
ok('cold process hydrates the accepted image and selection decision', cold.status === 0 && coldResult.image === true && coldResult.index?.finalHash === finalHash && coldResult.index?.selectedLane === 'reference', String(cold.stderr || cold.stdout).slice(-800))
ok('cold process preserves the ranked sharpness evidence', Array.isArray(coldResult.index?.selection?.ranked) && coldResult.index.selection.ranked.length === 2, JSON.stringify(coldResult.index || {}))
ok('different tenant cannot read the selection index', coldResult.otherTenant === false)

const idempotent = await provider.persistGeneratedImageEnsembleSelection({ selectionHash, tenantId: tenantA, baseHash, finalHash, selectedLane: 'reference', selection })
ok('selection index repersist is idempotent', idempotent.ok === true && idempotent.skipped === true)

const report = {
	schemaVersion: 'betterpptx.premium-ensemble-selection-durability.v1', status: passed === checks.length ? 'research-premium-ensemble-selection-durability-pass' : 'research-premium-ensemble-selection-durability-fail',
	checks: checks.length, failures: checks.length - passed, passed, selectionHash, finalHash, tenantScoped: true, coldProcess: true,
	customerImages: false, consentedHumanImages: false, training: false, externalAi: false, productionPromotion: false, checksDetail: checks,
}
fs.mkdirSync(outputRoot, { recursive: true })
fs.writeFileSync(path.join(outputRoot, 'premium-ensemble-selection-durability-report.json'), JSON.stringify(report, null, 2) + '\n')
try { fs.rmSync(sharedDir, { recursive: true, force: true }) } catch {}
console.log(`\nPREMIUM ENSEMBLE SELECTION DURABILITY: ${passed}/${checks.length} checks passed`)
process.exit(passed === checks.length ? 0 : 1)
