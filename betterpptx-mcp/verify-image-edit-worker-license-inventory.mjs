// Static gate for the exact resolved private-worker inventory. No network, Modal, or GPU.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const workerRoot = path.join(root, 'deploy', 'image-edit-worker')
const resolved = JSON.parse(fs.readFileSync(path.join(workerRoot, 'resolved-dependencies.json'), 'utf8'))
const lock = JSON.parse(fs.readFileSync(path.join(workerRoot, 'dependency-lock.json'), 'utf8'))
const review = fs.readFileSync(path.join(workerRoot, 'LICENSE-REVIEW.md'), 'utf8')
const packages = resolved.packages || []
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}
const names = entries => [...new Set(entries.map(item => String(item.name).toLowerCase()))].sort()
const proprietary = packages.filter(item =>
	/Proprietary/i.test(item.declaredLicense || '')
	|| /Proprietary/i.test((item.licenseClassifiers || []).join(' ')))
const classifierOnly = packages.filter(item => !item.declaredLicense && (item.licenseClassifiers || []).length)
const missing = packages.filter(item => !item.declaredLicense && !(item.licenseClassifiers || []).length)
const mpl = packages.filter(item => /(^|\s|-)MPL([-0-9.]|\s|$)/i.test(item.declaredLicense || ''))
const nonCommercial = packages.filter(item => /non[- ]?commercial|CC[- ]?BY[- ]?NC/i.test(`${item.declaredLicense || ''} ${(item.licenseClassifiers || []).join(' ')}`))

const expectedProprietary = [
	'nvidia-cublas-cu12', 'nvidia-cuda-cupti-cu12', 'nvidia-cuda-nvrtc-cu12',
	'nvidia-cuda-runtime-cu12', 'nvidia-cudnn-cu12', 'nvidia-cufft-cu12',
	'nvidia-cufile-cu12', 'nvidia-curand-cu12', 'nvidia-cusolver-cu12',
	'nvidia-cusparse-cu12', 'nvidia-cusparselt-cu12', 'nvidia-nccl-cu12',
	'nvidia-nvjitlink-cu12', 'nvidia-nvtx-cu12',
].sort()
const expectedClassifierOnly = [
	'annotated-types', 'idna', 'jinja2', 'markdown-it-py', 'mdurl', 'safetensors',
	'tokenizers', 'triton', 'wheel',
].sort()

console.log('IMG2 EDIT WORKER LICENSE INVENTORY (static/offline):')
ok('resolved inventory is the attested 105-record image', packages.length === 105)
ok('selected runtime contains 101 exact distributions', Object.keys(resolved.selectedVersions || {}).length === 101)
ok('every record has declared or classifier license metadata', missing.length === 0)
ok('classifier-only records are an exact reviewed OSI set', JSON.stringify(names(classifierOnly)) === JSON.stringify(expectedClassifierOnly) && classifierOnly.every(item => item.licenseClassifiers.some(value => /OSI Approved/.test(value))))
ok('proprietary-marked records are the exact reviewed NVIDIA set', JSON.stringify(names(proprietary)) === JSON.stringify(expectedProprietary))
ok('MPL records remain limited to certifi and tqdm', JSON.stringify(names(mpl)) === JSON.stringify(['certifi', 'tqdm']))
ok('no resolved package declares a non-commercial restriction', nonCommercial.length === 0)
ok('model/source remain exact Apache-2.0 pins', lock.model.license === 'Apache-2.0' && lock.sourceRevisions.every(item => item.license === 'Apache-2.0'))
ok('review records PPTX-only hosted boundary and production block', /Customers receive a generated PPTX/.test(review) && /do \*\*not\*\* receive the worker image/.test(review) && /Production remains blocked/.test(review))
ok('review cites the current CUDA EULA and exact model/source evidence', /cuda\/archive\/13\.0\.1\/eula/.test(review) && review.includes(lock.model.repository) && review.includes(lock.sourceRevisions[0].revision))

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
