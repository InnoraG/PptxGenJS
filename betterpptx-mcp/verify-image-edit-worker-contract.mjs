// Static offline gate for the dedicated edit/reference worker. No Modal import, build, network, or GPU.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const workerPath = path.join(root, 'deploy', 'image-edit-worker', 'image_edit_app.py')
const lockPath = path.join(root, 'deploy', 'image-edit-worker', 'dependency-lock.json')
const resolvedPath = path.join(root, 'deploy', 'image-edit-worker', 'resolved-dependencies.json')
const worker = fs.readFileSync(workerPath, 'utf8')
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
const resolved = fs.existsSync(resolvedPath) ? JSON.parse(fs.readFileSync(resolvedPath, 'utf8')) : null
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}

console.log('IMG2 EDIT WORKER CONTRACT (static/offline):')
ok('audited model is exact Apache 4B revision', lock.model.repository === 'black-forest-labs/FLUX.2-klein-4B' && /^[a-f0-9]{40}$/.test(lock.model.revision) && lock.model.license === 'Apache-2.0')
ok('worker loads the exact locked model revision', worker.includes(`MODEL_REVISION = "${lock.model.revision}"`) && worker.includes('revision=MODEL_REVISION'))
ok('Diffusers source is commit-pinned, never floating main', /^[a-f0-9]{40}$/.test(lock.sourceRevisions[0].revision) && worker.includes(`diffusers/archive/${lock.sourceRevisions[0].revision}.tar.gz`))
ok('every direct runtime dependency has an exact version and license', lock.directRuntimeDependencies.every(item => /^\d+\.\d+\.\d+/.test(item.version) && item.license))
ok('forbidden non-commercial checkpoints are not loadable', !/MODEL_ID\s*=.*(?:9B|dev|pro)/i.test(worker) && lock.commercialSafetyBoundary.forbiddenModels.length >= 5)
ok('public request cannot select a model', !/item\.get\(["']model["']\)/.test(worker) && !/from_pretrained\([^\n]*item/.test(worker))
ok('worker supports only edit/reference capability names', /\{"edit", "reference", "multi-reference"\}/.test(worker))
ok('strict input bounds: four refs, bytes, pixels, reference edge', worker.includes('MAX_REFERENCES = 4') && worker.includes('MAX_INPUT_BYTES = 16 * 1024 * 1024') && worker.includes('MAX_INPUT_PIXELS = 25_000_000') && worker.includes('MAX_REFERENCE_EDGE = 2048'))
ok('strict GPU ceiling: scale-to-zero and one concurrent container', worker.includes('min_containers=0') && worker.includes('max_containers=1') && worker.includes('timeout=300'))
ok('reference pixels are processed in memory and released', worker.includes('io.BytesIO(raw)') && worker.includes('references.clear()'))
ok('no training or customer-asset filesystem path exists', !/train\s*\(|Trainer|fine.?tun|open\([^\n]*image|write\([^\n]*reference/i.test(worker))
ok('research secret reuse is explicit while production keeps a dedicated default', worker.includes('IMAGE_EDIT_MODAL_SECRET_NAME') && worker.includes('betterpptx-image-edit-token') && worker.includes('FLUX_ENDPOINT_TOKEN'))
ok('authenticated CLI canary uses the same bounded inference path', worker.includes('def research_canary') && worker.includes('return self._perform({') && worker.includes('@app.local_entrypoint()'))
ok('multi-reference canary uses the same bounded inference path', worker.includes('def research_multi_canary') && worker.includes('"capability": "multi-reference"') && worker.includes('image_b64s'))
ok('multi-reference evidence records every input and the output digest', worker.includes('def multi_canary(') && worker.includes('"inputs": input_records') && worker.includes('"outputSha256"'))
ok('two-call benchmark records cold/warm metrics and output digests', worker.includes('def benchmark(') && worker.includes('("cached-cold", "warm")') && worker.includes('identicalOutputDigest'))
ok('real GPU seconds and cold-start attribution are returned', worker.includes('"gpuSeconds"') && worker.includes('"coldStart"') && worker.includes('"gpuType"'))
ok('future calls report peak allocated and reserved GPU memory', worker.includes('torch.cuda.reset_peak_memory_stats()') && worker.includes('"peakAllocatedBytes"') && worker.includes('"peakReservedBytes"'))
ok('live production is explicitly blocked pending broader canary/safety/retention gates',
	/pending/.test(lock.status)
	&& lock.productionUseBlockedUntil.length >= 3
	&& lock.productionUseBlockedUntil.some(item => /safety|retention/i.test(item)))
ok('built container exported a substantial exact transitive inventory', resolved?.packages?.length >= 100 && resolved.packages.every(item => item.name && /^\d/.test(item.version)))
const installed = new Map((resolved?.packages || []).map(item => [String(item.name).toLowerCase().replace(/[-_]/g, ''), item.version]))
const normalizedResolvedNames = (resolved?.packages || []).map(item => String(item.name).toLowerCase().replace(/[-_]/g, ''))
const duplicates = [...new Set(normalizedResolvedNames.filter((name, index, values) => values.indexOf(name) !== index))].sort()
const allowedDuplicates = [...(lock.managedRuntimeShadowPolicy?.allowedDuplicateNormalizedNames || [])].sort()
ok('only documented managed-runtime distributions are shadowed', JSON.stringify(duplicates) === JSON.stringify(allowedDuplicates))
ok('resolved inventory matches every requested direct package pin', lock.directRuntimeDependencies.every(item =>
	(resolved?.packages || []).some(entry => entry.name.toLowerCase().replace(/[-_]/g, '') === item.name.toLowerCase().replace(/[-_]/g, '') && entry.version === item.version)))
const selected = new Map(Object.entries(resolved?.selectedVersions || {}).map(([name, version]) => [name.toLowerCase().replace(/[-_]/g, ''), version]))
ok('Python selects every direct worker pin over managed-runtime shadows', lock.directRuntimeDependencies.every(item => selected.get(item.name.toLowerCase().replace(/[-_]/g, '')) === item.version))
ok('resolved inventory matches the commit-built Diffusers package', installed.get('diffusers') === '0.40.0.dev0')

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
