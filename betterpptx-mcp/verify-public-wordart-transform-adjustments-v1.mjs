#!/usr/bin/env node
// Fresh Role-A public-client proof for the verified native WordArt guide surface.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/wordart-transform-adjustments-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) {
	const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{'))
	return lines.length ? JSON.parse(lines.at(-1).slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {})
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
function findObject(value, name) {
	if (!value || typeof value !== 'object') return null
	if (value.name === name || value.objectName === name) return value
	if (Array.isArray(value)) { for (const item of value) { const found = findObject(item, name); if (found) return found } }
	else { for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found } }
	return null
}
const wordArtOf = object => object?.style?.wordArt || object?.options?.wordArt || object?.wordArt || null
const roleA = client('betterpptx-public-wordart-adjustments-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'wordArt', format: 'full' })
const surfaces = catalog?.data?.surfaces || catalog?.surfaces || []
const transformSurface = surfaces.find(surface => surface.id === 'wordArtTransform')
const adjustment0 = (transformSurface?.parameters || []).find(parameter => parameter.id === 'adjustment0')
const sourceSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public WordArt adjustment proof', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove native WordArt transform guide authoring', remember: 'one Office-persisted guide, applicability, reset, re-edit' }, visualDesign: { world: 'blueprint', framing: 'native WordArt guide canary' }, motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: [{ id: 'wordart-adjustment-proof', title: 'WordArt guide contract', layoutIntent: 'title-only', content: [
		{ kind: 'wordart', name: 'arch-target', objectName: 'arch-target', text: 'Arch guide', transform: 'textArchUp', wordArt: { adjustments: [50000] }, style: { fontFace: 'Aptos Display', fontSize: 38, color: '38BDF8', align: 'center' } },
		{ kind: 'wordart', name: 'chevron-target', objectName: 'chevron-target', text: 'Chevron guide', transform: 'textChevron', wordArt: { adjustments: [75000] }, style: { fontFace: 'Aptos Display', fontSize: 30, color: 'FACC15', align: 'center' } },
		{ kind: 'wordart', name: 'no-guide-target', objectName: 'no-guide-target', text: 'Discrete wave', transform: 'textWave1', style: { fontFace: 'Aptos Display', fontSize: 26, color: 'F8FAFC', align: 'center' } },
	] }],
}
const sourceBytes = Buffer.from(JSON.stringify(sourceSpec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'wordart-adjustments-public.json', idempotencyKey: `wordart-adjustments-upload-${Date.now()}-${crypto.randomUUID()}` })
const uploadData = upload?.data || upload || {}
const specHandle = uploadData.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `wordart-adjustments-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `wordart-adjustments-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const patchSpec = { ...sourceSpec, slides: [{ ...sourceSpec.slides[0], content: [
	{ kind: 'wordart', name: 'arch-target', objectName: 'arch-target', patch: { wordArt: { adjustments: null } } },
	{ kind: 'wordart', name: 'chevron-target', objectName: 'chevron-target', patch: { wordArt: { adjustments: [25000] } } },
	{ kind: 'wordart', name: 'no-guide-target', objectName: 'no-guide-target', patch: { wordArt: { transform: 'textWave1' } } },
] }] }
const patchDryRun = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `wordart-adjustments-patch-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchData = patchDryRun?.data || patchDryRun || {}
const patchCommit = deckId && patchDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `wordart-adjustments-patch-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchCommitData = patchCommit?.data || patchCommit || {}
const exportAfterPatch = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportAfterPatchData = exportAfterPatch?.data || exportAfterPatch || {}
const patchArch = wordArtOf(findObject(exportAfterPatchData.spec || exportAfterPatchData.effectiveSpec || null, 'arch-target'))
const patchChevron = wordArtOf(findObject(exportAfterPatchData.spec || exportAfterPatchData.effectiveSpec || null, 'chevron-target'))
const reeditSpec = { ...patchSpec, slides: [{ ...patchSpec.slides[0], content: [
	{ kind: 'wordart', name: 'arch-target', objectName: 'arch-target', patch: { wordArt: { transform: 'textChevron', adjustments: [80000] } } },
	{ kind: 'wordart', name: 'chevron-target', objectName: 'chevron-target', patch: { wordArt: { adjustments: null } } },
	{ kind: 'wordart', name: 'no-guide-target', objectName: 'no-guide-target', patch: { wordArt: { transform: 'textArchDown', adjustments: [25000] } } },
] }] }
const reeditDryRun = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `wordart-adjustments-reedit-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const reeditData = reeditDryRun?.data || reeditDryRun || {}
const reeditCommit = deckId && reeditDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `wordart-adjustments-reedit-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportedData = currentExport?.data || currentExport || {}
const exportedSpec = exportedData.spec || exportedData.effectiveSpec || null
const archObject = findObject(exportedSpec, 'arch-target')
const chevronObject = findObject(exportedSpec, 'chevron-target')
const noGuideObject = findObject(exportedSpec, 'no-guide-target')
const currentVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || patchCommitData.deckVersion || commitData.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion: currentVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion: currentVersion, slides: [0] }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion: currentVersion, fileName: 'wordart-transform-adjustments-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `wordart-adjustments-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const invalidSpec = { ...sourceSpec, slides: [{ ...sourceSpec.slides[0], content: [{ ...sourceSpec.slides[0].content[0], wordArt: { adjustments: [50000, 75000] } }] }] }
const invalidBytes = Buffer.from(JSON.stringify(invalidSpec), 'utf8')
const invalidUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${invalidBytes.toString('base64')}`, fileName: 'wordart-adjustments-invalid-public.json', idempotencyKey: `wordart-adjustments-invalid-upload-${Date.now()}-${crypto.randomUUID()}` })
const invalidHandle = invalidUpload?.data?.handle || invalidUpload?.handle
const invalidDryRun = invalidHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: invalidHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `wordart-adjustments-invalid-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const returned = JSON.stringify({ catalog, upload, dryRun, commit, patchDryRun, patchCommit, reeditDryRun, reeditCommit, currentExport, quality, preview, save, invalidUpload, invalidDryRun })
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const adjustmentIds = (transformSurface?.parameters || []).map(parameter => parameter.id)
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	wordArtAdjustmentCatalog: catalog?.ok === true && transformSurface?.capabilityMode === 'parameterized' && transformSurface?.capabilityStatus === 'executable-exact-structured' && adjustmentIds.includes('adjustment0') && !adjustmentIds.includes('adjustment1') && Array.isArray(adjustment0?.applicability) && adjustment0.applicability.includes('textArchUp'),
	wordArtAdjustmentRange: adjustment0?.minimum === 0 && adjustment0?.maximum === 100000 && adjustment0?.step === 1,
	initialJsonSpecUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRunMutationFree: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	patchDryRunMutationFree: patchDryRun?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch',
	patchCommit: patchCommit?.ok === true,
	componentResetReadback: patchArch?.adjustments == null || patchArch?.adjustments?.length === 0,
	patchReeditReadback: patchChevron?.adjustments?.[0] === 25000,
	reeditDryRunMutationFree: reeditDryRun?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	postReeditArchReadback: wordArtOf(archObject)?.transform === 'textChevron' && wordArtOf(archObject)?.adjustments?.[0] === 80000,
	postReeditChevronReset: wordArtOf(chevronObject)?.adjustments == null || wordArtOf(chevronObject)?.adjustments?.length === 0,
	postReeditSecondFamilyReadback: wordArtOf(noGuideObject)?.transform === 'textArchDown' && wordArtOf(noGuideObject)?.adjustments?.[0] === 25000,
	invalidSecondGuideRejected: invalidDryRun?.ok !== true && /adjustment|adj1|one persisted/i.test(JSON.stringify(invalidDryRun)),
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-wordart-transform-adjustments-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'wordArt', catalogDigest: sha256(JSON.stringify(catalog)), parameterIds: adjustmentIds, adjustment0 }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, objectNames: ['arch-target', 'chevron-target', 'no-guide-target'] }, patch: { sha256: sha256(Buffer.from(JSON.stringify(patchSpec), 'utf8')), reeditSha256: sha256(Buffer.from(JSON.stringify(reeditSpec), 'utf8')), actions: ['reset arch guide', 'sparse re-edit chevron guide', 're-edit transform and guide', 'reset chevron guide', 're-edit a second guide-applicable transform'] }, checks, privateLeakMatches, initial: { uploadOk: upload?.ok === true, dryRunOk: dryRun?.ok === true, commitOk: commit?.ok === true, deckId: deckId || null, dryRunError: dryRun?.error || dryData?.error || null }, patchRun: { dryRunOk: patchDryRun?.ok === true, commitOk: patchCommit?.ok === true, unsupportedFindings: patchData.patchUnsupportedFindings || [], dryRunError: patchDryRun?.error || patchData?.error || null }, reeditRun: { dryRunOk: reeditDryRun?.ok === true, commitOk: reeditCommit?.ok === true, unsupportedFindings: reeditData.patchUnsupportedFindings || [], dryRunError: reeditDryRun?.error || reeditData?.error || null }, exportedReadback: { archObject, chevronObject, noGuideObject, patchArch, patchChevron }, invalidBoundary: { uploadOk: invalidUpload?.ok === true, dryRunOk: invalidDryRun?.ok === true, error: invalidDryRun?.error || invalidDryRun?.data?.error || null }, quality: { ok: quality?.ok === true, failed: quality?.failed || quality?.data?.failed || [], blockingIssues: quality?.blockingIssues || quality?.data?.blockingIssues || [], warnings: quality?.warnings || quality?.data?.warnings || [] }, preview: { ok: preview?.ok === true, complete: preview?.data?.complete ?? preview?.complete ?? null, packageSha256: preview?.data?.packageSha256 || preview?.packageSha256 || null }, saved: { ok: save?.ok === true, deckVersion: currentVersion || null, artifact: save?.data?.artifact || save?.artifact || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered the verified one-guide WordArt contract, authored it, reset and re-edited it through JSON-spec patch mode, rejected an invented second guide, passed quality/preview/save, and showed no private leakage. Non-applicable warp families remain discrete selectors.' : 'Fresh Role-A WordArt guide execution does not yet expose the complete verified public contract.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'wordart-transform-adjustments-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
