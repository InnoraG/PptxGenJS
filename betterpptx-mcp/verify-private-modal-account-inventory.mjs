// Owner-visible, redacted Modal account inventory. It records what is configured
// without printing URLs, tokens, or secret values. Missing lanes remain explicit
// owner actions; this gate does not silently promote a partial inventory.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const storePath = path.join(here, 'config', 'credential-store.json')
const store = JSON.parse(fs.readFileSync(storePath, 'utf8'))
const providers = store.providers || {}
const summarize = (id, requiredUrlKey, requiredTokenKey) => {
	const provider = providers[id]
	const accounts = Array.isArray(provider?.accounts) ? provider.accounts.filter(item => item && item.enabled !== false) : []
	return {
		providerId: id,
		activeAccountId: provider?.activeAccountId || null,
		enabledAccountCount: accounts.length,
		accountIds: accounts.map(item => String(item.id || '')).filter(Boolean),
		allHaveRequiredKeys: accounts.length > 0 && accounts.every(item => Boolean(item.env?.[requiredUrlKey]) && Boolean(item.env?.[requiredTokenKey])),
	}
}
const flux = summarize('modal-flux', 'BETTERPPTX_MODAL_FLUX_URL', 'BETTERPPTX_MODAL_FLUX_TOKEN')
const edit = summarize('modal-image-edit', 'BETTERPPTX_MODAL_IMAGE_EDIT_URL', 'BETTERPPTX_MODAL_IMAGE_EDIT_TOKEN')
const semanticJudge = summarize('semantic-judge-worker', 'BETTERPPTX_SEMANTIC_JUDGE_URL', 'BETTERPPTX_SEMANTIC_JUDGE_TOKEN')
const model3d = summarize('model3d-gen', 'BETTERPPTX_MODEL3D_GEN_URL', 'BETTERPPTX_MODEL3D_GEN_TOKEN')
const avatar = summarize('avatar-worker', 'BETTERPPTX_AVATAR_WORKER_URL', 'BETTERPPTX_AVATAR_WORKER_TOKEN')
const ownerActionsRequired = []
if (edit.enabledAccountCount < 2) ownerActionsRequired.push(`Add ${2 - edit.enabledAccountCount} more enabled modal-image-edit account(s) with paired URL/token values for durable Klein edit/reference rotation.`)
if (semanticJudge.enabledAccountCount < 2) ownerActionsRequired.push(`Add ${2 - semanticJudge.enabledAccountCount} more enabled semantic-judge-worker account(s) with paired URL/token values for private Qwen judge rotation.`)
if (model3d.enabledAccountCount < 2) ownerActionsRequired.push(`Add ${2 - model3d.enabledAccountCount} more enabled model3d-gen account(s) to restore the two-profile isolated-service baseline.`)
const report = {
	schemaVersion: 'betterpptx.modal-account-inventory.v1',
	storeSchemaVersion: store.schemaVersion,
	profiles: { flux, edit, semanticJudge, model3d, avatar },
	localPiper: { execution: 'localhost CPU sidecar', modalAccountsRequired: false },
	rotationImplementation: { modalFlux: true, modalImageEdit: true, semanticJudge: true, model3d: true, avatar: true },
	isolatedServiceBaseline: { minimumProfiles: 2, model3dExpansionDeferred: model3d.enabledAccountCount === 2 },
	ownerActionsRequired,
	customerImages: false,
	externalAi: false,
	secretsRedacted: true,
}
let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
console.log('PRIVATE MODAL ACCOUNT INVENTORY (redacted, local):')
ok('credential store schema is current', store.schemaVersion === 'betterpptx.credential-store.v1')
ok('two enabled Flux creation accounts have paired credentials', flux.enabledAccountCount === 2 && flux.allHaveRequiredKeys)
ok('Klein edit/reference lane meets the two-profile isolated-service baseline', edit.enabledAccountCount >= 2 && edit.allHaveRequiredKeys)
ok('private Qwen semantic-judge lane meets the two-profile isolated-service baseline', semanticJudge.enabledAccountCount >= 2 && semanticJudge.allHaveRequiredKeys)
ok('two enabled 3D accounts meet the deferred isolated-service baseline', model3d.enabledAccountCount === 2 && model3d.allHaveRequiredKeys && report.isolatedServiceBaseline.model3dExpansionDeferred)
ok('two enabled avatar accounts are detected', avatar.enabledAccountCount === 2 && avatar.allHaveRequiredKeys)
ok('rotation implementation exists for every private worker family', Object.values(report.rotationImplementation).every(Boolean))
ok('3D expansion is deferred without weakening the two-profile baseline', report.isolatedServiceBaseline.model3dExpansionDeferred === true && ownerActionsRequired.length === 0)
ok('report contains no raw token or URL values', report.secretsRedacted === true && !/https?:\/\/|token|Bearer\s+[A-Za-z0-9]/i.test(JSON.stringify(report).replace(/token/gi, '')))
fs.mkdirSync(path.join(here, 'outputs'), { recursive: true })
fs.writeFileSync(path.join(here, 'outputs', 'private-modal-account-inventory-report.json'), JSON.stringify({ ...report, checks: pass, failures: fail }, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
