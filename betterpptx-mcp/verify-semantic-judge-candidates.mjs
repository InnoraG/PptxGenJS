// IMG5 candidate ledger gate. Network/model downloads are intentionally not performed.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(fileURLToPath(import.meta.url))
const ledger = JSON.parse(await fs.readFile(path.join(root, 'quality', 'semantic-judge-candidates.json'), 'utf8'))
let pass = 0
let fail = 0
const ok = (name, condition) => {
	if (condition) { pass += 1; console.log(`  ok   ${name}`) }
	else { fail += 1; console.error(`  FAIL ${name}`) }
}
const allowed = new Set(['Apache-2.0', 'MIT'])
console.log(`IMG5 JUDGE CANDIDATE LEDGER (${ledger.version}):`)
ok('ledger is private and research-only', ledger.publicExposure === false && ledger.policy.includes('research-only'))
ok('ledger has at least one primary judge candidate', ledger.candidates.some(candidate => candidate.role === 'primary-semantic-judge'))
ok('all candidates have pinned 40-character revisions', ledger.candidates.every(candidate => /^[0-9a-f]{40}$/i.test(candidate.revision)))
ok('all candidate licenses are explicitly permissive', ledger.candidates.every(candidate => allowed.has(candidate.license)))
ok('all candidates have official source and license links', ledger.candidates.every(candidate => /^https:\/\/huggingface\.co\//.test(candidate.source) && candidate.licenseSource.includes('/blob/main/')))
const qwenPrimary = ledger.candidates.find(candidate => candidate.id === 'qwen3-vl-8b-instruct')
ok('Qwen primary candidate is Apache-2.0', qwenPrimary?.license === 'Apache-2.0')
ok('Qwen primary revision matches the recorded official snapshot', qwenPrimary?.revision === '0c351dd01ed87e9c1b53cbc748cba10e6187ff3b')
ok('Florence auxiliary candidate is MIT', ledger.candidates.find(candidate => candidate.id === 'florence-2-large')?.license === 'MIT')
ok('no candidate is auto-approved before transitive audit', ledger.candidates.every(candidate => ['candidate-not-approved', 'approved-research-probe'].includes(candidate.status)) && qwenPrimary?.status === 'approved-research-probe' && /remain fail-closed/i.test(qwenPrimary.notes || ''))
ok('ledger explicitly records no weight download for unapproved candidates', ledger.candidates.filter(candidate => candidate.status === 'candidate-not-approved').every(candidate => /no weights downloaded/i.test(candidate.notes)))
ok('auxiliary candidate is not presented as the semantic judge', ledger.candidates.find(candidate => candidate.id === 'florence-2-large')?.notes.includes('cannot replace'))

console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
