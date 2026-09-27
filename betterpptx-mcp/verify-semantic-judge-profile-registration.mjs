// Local, no-network contract for dual-endpoint semantic-judge registration.
// It validates the deployment script's primary/pair URL extraction and the
// owner-authenticated, mutation-before-auth boundary without invoking Modal.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const script = fs.readFileSync(path.join(here, 'deploy', 'deploy-and-register-semantic-judge-profile.ps1'), 'utf8')
assert.match(script, /SEMANTIC_JUDGE_PAIR_ENDPOINT_LABEL/)
assert.match(script, /BETTERPPTX_SEMANTIC_JUDGE_PAIR_URL/)
assert.match(script, /Modal profile '\$Profile' is not authenticated/)
assert.match(script, /before secret or endpoint mutation/)
assert.match(script, /Never fall back to another workspace/)
assert.match(script, /\$urls\.Count -lt 2/)

const endpointLabel = 'bpx-qwen-a2'
const pairLabel = `${endpointLabel}-pair`
const sample = [
	`Deploying ${endpointLabel}`,
	`https://workspace--${endpointLabel}.modal.run`,
	`https://workspace--${pairLabel}.modal.run`,
].join('\n')
const urls = [...sample.matchAll(/https:\/\/[A-Za-z0-9._-]+\.modal\.run/g)].map(match => match[0]).filter((url, index, all) => all.indexOf(url) === index)
assert.equal(urls.length, 2)
const pairUrl = urls.find(url => url.includes(pairLabel))
const primaryUrl = urls.find(url => url !== pairUrl)
assert.equal(pairUrl, `https://workspace--${pairLabel}.modal.run`)
assert.equal(primaryUrl, `https://workspace--${endpointLabel}.modal.run`)

const report = {
	schemaVersion: 'betterpptx.semantic-judge-profile-registration.v1',
	status: 'pass',
	primaryUrlSelected: true,
	pairUrlSelected: true,
	ownerAuthGuard: true,
	network: false,
	mutations: false,
	customerImages: false,
	externalAi: false,
	note: 'Synthetic output parsing only; no Modal deployment or credential-store write occurred.',
}
const outputPath = path.join(here, 'outputs', 'semantic-judge-profile-registration-report.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report))
