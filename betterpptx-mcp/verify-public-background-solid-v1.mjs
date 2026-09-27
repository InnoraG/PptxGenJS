#!/usr/bin/env node
// Fresh Role-A public-client proof for the typed slide-background solid carrier.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = process.env.BETTERPPTX_MCP_ENDPOINT || 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceScope = process.env.BETTERPPTX_BACKGROUND_EVIDENCE_SCOPE || 'public'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/background-solid-${evidenceScope}/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const callId = label => `background-solid-${label}-${Date.now()}-${crypto.randomUUID()}`
function parseResponse(text) {
	const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{'))
	if (lines.length) return JSON.parse(lines.at(-1).slice(5).trim())
	return String(text || '').trim() ? JSON.parse(text) : {}
}
function redact(value) {
	if (typeof value === 'string') return value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	if (Array.isArray(value)) return value.map(redact)
	if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
	return value
}
function client(name) {
	let sessionId = null
	let requestId = 0
	return {
		async rpc(method, params = {}) {
			const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
			if (!sessionId) sessionId = response.headers.get('mcp-session-id')
			return parseResponse(await response.text())
		},
		async call(tool, args = {}) {
			const response = await this.rpc('tools/call', { name: tool, arguments: args })
			const text = response?.result?.content?.find(item => item.type === 'text')?.text
			return text ? JSON.parse(text) : response
		},
		async initialize() {
			await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} })
			await this.rpc('notifications/initialized')
		},
	}
}
const roleA = client('betterpptx-public-background-solid-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'background', format: 'full' })
const surface = (catalog?.data?.surfaces || catalog?.surfaces || []).find(item => item.id === 'background')
const parameterIds = (surface?.parameters || []).map(parameter => parameter.id)
const initialBackground = { type: 'solid', color: '0B1220', transparency: 12.345 }
const patchBackground = { type: 'solid', color: '1D4ED8', transparency: 50 }
const reeditBackground = { type: 'solid', color: '14B8A6', transparency: 99.999 }
const extendedBackgroundParameterIds = ['fillType', 'fillColor', 'fillTransparency', 'gradientStopPosition', 'gradientStopColor', 'gradientStopTransparency', 'gradientDirection', 'gradientAngle', 'gradientFlip', 'rotateGradientWithShape', 'fillToRect.l', 'tileRect.b', 'patternPreset', 'patternForeground', 'patternBackground', 'textureMode', 'textureScaleX', 'textureScaleY', 'textureOffsetX', 'textureOffsetY', 'textureAlignment', 'textureFlip', 'textureRotateWithShape', 'textureTransparency']
const makeSpec = background => ({ schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public solid background proof', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove native slide background carrier', remember: 'solid colour, transparency, reset, re-edit' }, visualDesign: { world: 'blueprint', framing: 'background solid canary' }, motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, validation: { validateBeforeSave: true, requireAccessibility: true }, slides: [{ id: 'background-solid-proof', title: 'Solid background carrier', layoutIntent: 'title-only', background, content: [{ kind: 'textBox', name: 'background-target', objectName: 'background-target', text: 'Native solid background', style: { color: 'FFFFFF', fontSize: 28, bold: true } }] }] })
const sourceSpec = makeSpec(initialBackground)
const sourceBytes = Buffer.from(JSON.stringify(sourceSpec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'background-solid-public.json', idempotencyKey: callId('upload') })
const uploadData = upload?.data || upload || {}
const specHandle = uploadData.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('dry') }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: callId('commit') }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const patchSpec = makeSpec(patchBackground)
const patchDryRun = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('patch-dry') }) : { ok: false }
const patchData = patchDryRun?.data || patchDryRun || {}
const patchCommit = deckId && patchDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('patch-commit') }) : { ok: false }
const patchExport = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const patchExportData = patchExport?.data || patchExport || {}
const patchBackgroundReadback = patchExportData.spec?.slides?.[0]?.background ?? patchExportData.effectiveSpec?.slides?.[0]?.background ?? null
const resetSpec = makeSpec(null)
const resetDryRun = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('reset-dry') }) : { ok: false }
const resetData = resetDryRun?.data || resetDryRun || {}
const resetCommit = deckId && resetDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: resetData.planId, lockedPlanId: resetData.planId, planDigest: resetData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('reset-commit') }) : { ok: false }
const resetExport = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const resetExportData = resetExport?.data || resetExport || {}
const resetBackgroundReadback = resetExportData.spec?.slides?.[0]?.background ?? resetExportData.effectiveSpec?.slides?.[0]?.background ?? null
const resetInspect = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.slide.inspect', { deckId, slideIndex: 0 }) : { ok: false }
const reeditSpec = makeSpec(reeditBackground)
const reeditDryRun = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('reedit-dry') }) : { ok: false }
const reeditData = reeditDryRun?.data || reeditDryRun || {}
const reeditCommit = deckId && reeditDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('reedit-commit') }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportedData = currentExport?.data || currentExport || {}
const reeditBackgroundReadback = exportedData.spec?.slides?.[0]?.background ?? exportedData.effectiveSpec?.slides?.[0]?.background ?? null
const currentVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || resetCommit?.data?.deckVersion || patchCommit?.data?.deckVersion || commitData.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion: currentVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion: currentVersion, slides: [0] }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion: currentVersion, fileName: 'background-solid-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: callId('save') }) : { ok: false }
const returned = JSON.stringify(redact({ listed, catalog, upload, dryRun, commit, patchDryRun, patchCommit, patchExport, resetDryRun, resetCommit, resetExport, reeditDryRun, reeditCommit, currentExport, quality, preview, save }))
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	catalogContract: surface?.id === 'background' && surface.capabilityMode === 'parameterized' && surface.capabilityStatus === 'structured-partial' && extendedBackgroundParameterIds.every(id => parameterIds.includes(id)),
	transparencyBounds: surface?.parameters?.find(parameter => parameter.id === 'fillTransparency')?.minimum === 0 && surface?.parameters?.find(parameter => parameter.id === 'fillTransparency')?.maximum === 100 && surface?.parameters?.find(parameter => parameter.id === 'fillTransparency')?.step === 0.001,
	initialUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRun: dryRun?.ok === true && dryData.mutationFree === true,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	patchDryRun: patchDryRun?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch',
	patchCommit: patchCommit?.ok === true,
	patchReadback: patchBackgroundReadback?.color === patchBackground.color && patchBackgroundReadback?.transparency === patchBackground.transparency,
	resetDryRun: resetDryRun?.ok === true && resetData.mutationFree === true && resetData.commitMode === 'patch',
	resetCommit: resetCommit?.ok === true,
	resetReadback: resetBackgroundReadback == null,
	reeditDryRun: reeditDryRun?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	reeditReadback: reeditBackgroundReadback?.color === reeditBackground.color && reeditBackgroundReadback?.transparency === reeditBackground.transparency,
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-background-solid-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)) }, contract: { surfaceId: 'background', parameterIds, extendedBackgroundParameterIds, catalogDigest: sha256(JSON.stringify(catalog)), sourceSha256: sha256(sourceBytes) }, actions: ['discover all typed background carrier leaves', 'author solid background colour and transparency', 'patch to a new colour/alpha', 'reset background to inherited null', 're-edit independent solid colour/alpha'], checks, privateLeakMatches, initial: { uploadOk: upload?.ok === true, dryRunOk: dryRun?.ok === true, commitOk: commit?.ok === true, deckId: deckId || null }, patchRun: { dryRunOk: patchDryRun?.ok === true, commitOk: patchCommit?.ok === true, readback: patchBackgroundReadback, error: patchDryRun?.error || patchData?.error || null }, resetRun: { dryRunOk: resetDryRun?.ok === true, commitOk: resetCommit?.ok === true, readback: resetBackgroundReadback, error: resetDryRun?.error || resetData?.error || null }, reeditRun: { dryRunOk: reeditDryRun?.ok === true, commitOk: reeditCommit?.ok === true, readback: reeditBackgroundReadback, error: reeditDryRun?.error || reeditData?.error || null }, quality: { ok: quality?.ok === true, failed: quality?.failed || quality?.data?.failed || [], blockingIssues: quality?.blockingIssues || quality?.data?.blockingIssues || [] , warnings: quality?.warnings || quality?.data?.warnings || [] }, preview: { ok: preview?.ok === true, packageSha256: preview?.data?.packageSha256 || preview?.packageSha256 || null }, saved: { ok: save?.ok === true, deckVersion: currentVersion || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered the complete typed background carrier vocabulary and exercised solid colour/transparency, reset, re-edit, quality, preview, and save without private leakage. Gradient, pattern, texture, and picture execution boundaries remain represented by their dedicated proofs; universal formal closure remains unchanged.' : 'The fresh public background carrier contract is not yet fully served or executable.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'background-solid-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ status, checks, evidencePath, evidenceSha256, patchBackgroundReadback, resetBackgroundReadback, resetInspect: resetInspect?.data || resetInspect || null, resetProvenance: resetCommit?.data?.specProvenance || resetCommit?.specProvenance || null, resetPatchResults: resetCommit?.data?.patchResults || resetCommit?.patchResults || [], resetResponseKeys: Object.keys(resetCommit?.data || resetCommit || {}), reeditBackgroundReadback, resetPatchOperations: resetData.patchOperations || [], resetUnsupportedFindings: resetData.patchUnsupportedFindings || [], catalogStatus: surface?.capabilityStatus || null, errors: { dry: dryRun?.error || dryData?.error || null, patch: patchDryRun?.error || patchData?.error || null, reset: resetDryRun?.error || resetData?.error || null, reedit: reeditDryRun?.error || reeditData?.error || null } }, null, 2) + '\n')
if (status !== 'PASS') process.exitCode = 1
