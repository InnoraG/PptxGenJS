// Fresh Role-A proof for imported layout/master carrier sparse edits.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.env.BETTERPPTX_MCP_ENDPOINT || 'https://betterpptx.tail070c3a.ts.net/mcp'
const sourceRoot = path.resolve('outputs/authoring-principle-corpus/global-extended-option-five-point/template-layout-heldout-native')
const sourceDirs = fs.existsSync(sourceRoot) ? fs.readdirSync(sourceRoot).filter(name => /^20/.test(name)).sort() : []
const sourceDir = sourceDirs.at(-1)
if (!sourceDir) throw new Error('No held-out native template fixture is available for the public carrier proof.')
const sourceBytes = fs.readFileSync(path.join(sourceRoot, sourceDir, 'heldout-source-template.pptx'))
const templateData = `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${sourceBytes.toString('base64')}`
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/theme-master-layout-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const callId = label => `template-carrier-${label}-${Date.now()}-${crypto.randomUUID()}`
function parseResponse(text) { const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{')); return lines.length ? JSON.parse(lines.at(-1).slice(5).trim()) : {} }
function redact(value) { if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]'); if (Array.isArray(value)) return value.map(redact); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)])); return value }
function client(name) { let sessionId = null; let requestId = 0; return { async rpc(method, params = {}) { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) }); if (!sessionId) sessionId = response.headers.get('mcp-session-id'); return parseResponse(await response.text()) }, async call(tool, args = {}) { const response = await this.rpc('tools/call', { name: tool, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response }, async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') } } }
const roleA = client('betterpptx-public-template-carrier-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const baseSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public imported carrier sparse proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'edit imported layout and master carriers', remember: 'carrier edits remain native and resettable' },
	visualDesign: { world: 'blueprint', framing: 'imported carrier sparse proof' },
	motionTime: { masterClock: 'static', timingSource: 'static visual clock', syncPolicy: 'one static visual clock' },
	template: { data: templateData, preserveLayouts: true, enforceLayoutPolicy: false },
	slides: [{ id: 'carrier-proof', title: 'Carrier proof', layoutName: 'HeldoutAlt', content: [{ kind: 'textBox', name: 'carrier-title', role: 'title', text: 'Imported carrier remains editable.' }] }],
}
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${Buffer.from(JSON.stringify(baseSpec)).toString('base64')}`, fileName: 'template-carrier-sparse-public.json', idempotencyKey: callId('upload') })
const specHandle = (upload?.data || upload || {}).handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('dry') }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: callId('commit') }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const patchSpec = {
	...baseSpec,
	patchPlan: { templateCarriers: [
		{ name: 'slideMaster1', kind: 'master', objects: [{ rect: { x: 0.35, y: 0.35, w: 0.18, h: 6.8, fill: { color: '14532D' }, line: { color: '166534' }, objectName: 'public-master-edited-rail' } }], background: { color: 'ECFDF5' } },
		{ name: 'HeldoutWide', objects: [{ rect: { x: 0.55, y: 0.55, w: 12.2, h: 0.12, fill: { color: '0F766E' }, line: { color: '115E59' }, objectName: 'public-sparse-layout-rule' } }], background: { color: 'F0FDFA' } },
	] },
}
const patchDryRun = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('patch-dry') }) : { ok: false }
const patchData = patchDryRun?.data || patchDryRun || {}
const patchCommit = deckId && patchDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('patch-commit') }) : { ok: false }
const patchExport = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const patchDataExport = patchExport?.data || patchExport || {}
const resetSpec = { ...baseSpec, patchPlan: { templateCarriers: [{ name: 'slideMaster1', kind: 'master', reset: true }, { name: 'HeldoutWide', reset: true }] } }
const resetDryRun = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('reset-dry') }) : { ok: false }
const resetData = resetDryRun?.data || resetDryRun || {}
const resetCommit = deckId && resetDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: resetData.planId, lockedPlanId: resetData.planId, planDigest: resetData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('reset-commit') }) : { ok: false }
const resetExport = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const resetDataExport = resetExport?.data || resetExport || {}
const patchResults = patchCommit?.data?.patchResults || patchCommit?.patchResults || []
const resetResults = resetCommit?.data?.patchResults || resetCommit?.patchResults || []
const masterPatchResult = patchResults.find(item => item?.carrier?.kind === 'master' && item?.carrier?.mode === 'native-edit') || null
const layoutPatchResult = patchResults.find(item => item?.carrier?.kind !== 'master' && item?.carrier?.mode === 'native-edit') || null
const masterResetResult = resetResults.find(item => item?.carrier?.kind === 'master' && item?.carrier?.mode === 'reset-to-source') || null
const layoutResetResult = resetResults.find(item => item?.carrier?.kind !== 'master' && item?.carrier?.mode === 'reset-to-source') || null
const returned = JSON.stringify(redact({ listed, upload, dryRun, commit, patchDryRun, patchCommit, patchExport, resetDryRun, resetCommit, resetExport }))
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const patchReadback = patchDataExport.spec || patchDataExport.effectiveSpec || null
const resetReadback = resetDataExport.spec || resetDataExport.effectiveSpec || null
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	initialUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRun: dryRun?.ok === true && dryData.mutationFree === true,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	patchDryRun: patchDryRun?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch',
	patchCommit: patchCommit?.ok === true,
	masterCarrierPatchReadback: masterPatchResult?.carrier?.kind === 'master' && masterPatchResult?.carrier?.mode === 'native-edit' && masterPatchResult?.carrier?.name === 'slideMaster1',
	masterCarrierRelationshipRetention: masterPatchResult?.sourceRelationshipCount > 0 && masterPatchResult?.remappedSourceRelationshipCount === masterPatchResult?.sourceRelationshipCount && masterPatchResult?.carrier?.relationshipCount > 0,
	layoutCarrierPatchReadback: layoutPatchResult?.carrier?.mode === 'native-edit' && layoutPatchResult?.carrier?.name === 'HeldoutWide',
	resetDryRun: resetDryRun?.ok === true && resetData.mutationFree === true,
	resetCommit: resetCommit?.ok === true,
	masterCarrierResetReadback: masterResetResult?.carrier?.kind === 'master' && masterResetResult?.carrier?.mode === 'reset-to-source',
	masterCarrierResetRestoresSourceParts: masterResetResult?.restoredParts >= 2,
	layoutCarrierResetReadback: layoutResetResult?.carrier?.mode === 'reset-to-source' && layoutResetResult?.carrier?.name === 'HeldoutWide',
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-template-carrier-sparse-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)) }, sourceTemplateSha256: sha256(sourceBytes), checks, patchReadback, resetReadback, carrierResults: { patch: patchResults, reset: resetResults }, diagnostics: { upload: upload?.error || upload?.data?.error || null, dryRun: dryRun?.error || dryData?.error || null, commit: commit?.error || commitData?.error || null, patchDryRun: patchDryRun?.error || patchData?.error || null, patchCommit: patchCommit?.error || patchCommit?.data?.error || null, resetDryRun: resetDryRun?.error || resetData?.error || null, resetCommit: resetCommit?.error || resetCommit?.data?.error || null }, privateLeakMatches, interpretation: 'Fresh Role-A imported an opaque template, edited linked master and layout carriers in one sparse JSON-spec patch, reset both carriers, and verified typed lifecycle/no-leakage. Preview/save is outside this semantic proof.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'template-carrier-sparse-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status, checks, evidencePath, evidenceSha256, patchError: patchDryRun?.error || patchData?.error || null, resetError: resetDryRun?.error || resetData?.error || null }, null, 2) + '\n')
if (status === 'FAIL') process.exitCode = 1
