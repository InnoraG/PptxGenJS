#!/usr/bin/env node
// Fresh Role-A public-client proof for the generic gradient-stop contract.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/fill-gradient-stops-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
function parseResponse(text) {
	const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{'))
	if (lines.length) return JSON.parse(lines.at(-1).slice(5).trim())
	if (!String(text || '').trim()) return {}
	return JSON.parse(text)
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
	if (Array.isArray(value)) for (const item of value) { const found = findObject(item, name); if (found) return found }
	else for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found }
	return null
}
const fillOf = object => object?.style?.fill || object?.options?.fill || object?.fill || null
const roleA = client('betterpptx-public-gradient-stop-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const fillCatalog = await roleA.call('betterpptx.options.catalog', { surface: 'fill', format: 'full' })
const backgroundCatalog = await roleA.call('betterpptx.options.catalog', { surface: 'background', format: 'full' })
const fillSurface = (fillCatalog?.data?.surfaces || fillCatalog?.surfaces || []).find(surface => surface.id === 'fill')
const backgroundSurface = (backgroundCatalog?.data?.surfaces || backgroundCatalog?.surfaces || []).find(surface => surface.id === 'background')
const parameterIds = (fillSurface?.parameters || []).map(parameter => parameter.id)
const stop = {
	position: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopPosition'),
	color: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor'),
	tint: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor.tint'),
	shade: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor.shade'),
	saturation: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor.saturation'),
	luminance: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor.luminance'),
	luminanceOffset: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor.luminanceOffset'),
	opacity: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopColor.opacity'),
	transparency: fillSurface?.parameters?.find(parameter => parameter.id === 'gradientStopTransparency'),
}
const initialStops = [{ position: 0, color: { scheme: 'accent1', tint: 0.18, shade: 0.04, saturation: 1.25, luminance: 1.1, luminanceOffset: -0.08, opacity: 0.86 } }, { position: 37.125, color: 'FACC15', transparency: 22.222 }, { position: 100, color: '2563EB', transparency: 77.777 }]
const editedStops = [{ position: 0, color: { color: 'FDE68A', shade: 0.22, saturation: 1.35, luminance: 0.92, luminanceOffset: 0.06, opacity: 0.74 }, transparency: 2.5 }, { position: 18.875, color: 'EC4899', transparency: 18.875 }, { position: 63.25, color: '14B8A6', transparency: 63.25 }, { position: 100, color: '0F172A', transparency: 96.5 }]
const backgroundStops = [{ position: 0, color: { preset: 'white', tint: 0.12 } }, { position: 50, color: '312E81', transparency: 33.333 }, { position: 100, color: { scheme: 'accent4', luminance: 1.15 }, transparency: 66.666 }]
const sourceSpec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public gradient-stop proof', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove arbitrary native gradient stops', remember: 'position, colour, transparency, reset, re-edit' }, visualDesign: { world: 'blueprint', framing: 'native gradient-stop canary' }, motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true }, slides: [{ id: 'gradient-stop-proof', title: 'Gradient-stop contract', layoutIntent: 'title-only', background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 37.125, gradientStops: backgroundStops }, content: [{ kind: 'shape', name: 'gradient-target', objectName: 'gradient-target', shapeName: 'roundRect', options: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 37.125, gradientStops: initialStops }, line: { color: 'FFFFFF', width: 1.25 } } }, { kind: 'shape', name: 'reset-target', objectName: 'reset-target', shapeName: 'roundRect', options: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 120, gradientStops: initialStops }, line: { color: 'FFFFFF', width: 1.25 } } }] }] }
const sourceBytes = Buffer.from(JSON.stringify(sourceSpec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'gradient-stop-public.json', idempotencyKey: `gradient-stop-upload-${Date.now()}-${crypto.randomUUID()}` })
const uploadData = upload?.data || upload || {}
const specHandle = uploadData.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `gradient-stop-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `gradient-stop-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const patchSpec = { ...sourceSpec, slides: [{ ...sourceSpec.slides[0], background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 271.875, gradientStops: editedStops.slice(0, 2) }, content: [{ kind: 'shape', name: 'gradient-target', objectName: 'gradient-target', patch: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 271.875, gradientStops: editedStops } } }, { kind: 'shape', name: 'reset-target', objectName: 'reset-target', patch: { fill: null } }] }] }
const patchDryRun = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `gradient-stop-patch-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchData = patchDryRun?.data || patchDryRun || {}
const patchCommit = deckId && patchDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `gradient-stop-patch-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchCommitData = patchCommit?.data || patchCommit || {}
const exportAfterPatch = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportAfterPatchData = exportAfterPatch?.data || exportAfterPatch || {}
const resetObjectAfterPatch = findObject(exportAfterPatchData.spec || exportAfterPatchData.effectiveSpec || null, 'reset-target')
const reeditSpec = { ...patchSpec, slides: [{ ...patchSpec.slides[0], background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 359.999, gradientStops: [{ position: 0, color: '020617' }, { position: 100, color: '0F766E', transparency: 35.25 }] }, content: [{ kind: 'shape', name: 'gradient-target', objectName: 'gradient-target' }, { kind: 'shape', name: 'reset-target', objectName: 'reset-target', patch: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 359.999, gradientStops: editedStops } } }] }] }
const reeditDryRun = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `gradient-stop-reedit-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const reeditData = reeditDryRun?.data || reeditDryRun || {}
const reeditCommit = deckId && reeditDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `gradient-stop-reedit-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportedData = currentExport?.data || currentExport || {}
const exportedSpec = exportedData.spec || exportedData.effectiveSpec || null
const gradientObject = findObject(exportedSpec, 'gradient-target')
const resetObject = findObject(exportedSpec, 'reset-target')
const currentVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || patchCommitData.deckVersion || commitData.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion: currentVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion: currentVersion, slides: [0] }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion: currentVersion, fileName: 'gradient-stop-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `gradient-stop-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const returned = JSON.stringify({ fillCatalog, backgroundCatalog, upload, dryRun, commit, patchDryRun, patchCommit, reeditDryRun, reeditCommit, currentExport, quality, preview, save })
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const gradientFill = fillOf(gradientObject)
const resetFill = fillOf(resetObject)
const transformedReadbackColor = gradientFill?.gradientStops?.[0]?.color && typeof gradientFill.gradientStops[0].color === 'object' ? gradientFill.gradientStops[0].color : (gradientFill?.gradientStops?.[0] || {})
const checks = {
	freshPublicSession: true,
	servedSpecFirstRoute: servedNames.includes('betterpptx.deck.generate_from_spec') && servedNames.includes('betterpptx.assets.upload'),
	fillCatalogContract: fillSurface?.id === 'fill' && fillSurface?.capabilityMode === 'parameterized' && parameterIds.includes('gradientStopPosition') && parameterIds.includes('gradientStopColor') && ['tint', 'shade', 'saturation', 'luminance', 'luminanceOffset', 'opacity'].every(key => parameterIds.includes(`gradientStopColor.${key}`)) && parameterIds.includes('gradientStopTransparency') && Boolean(fillSurface?.resetBehavior?.full),
	backgroundCatalogContract: backgroundSurface?.id === 'background' && (backgroundSurface?.parameters || []).some(parameter => parameter.id === 'gradientStopPosition'),
	initialJsonSpecUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRunMutationFree: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	patchDryRunMutationFree: patchDryRun?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch',
	patchCommit: patchCommit?.ok === true,
	gradientReeditReadback: Array.isArray(gradientFill?.gradientStops) && gradientFill.gradientStops.length === editedStops.length && gradientFill.gradientStops[1]?.position === editedStops[1].position && gradientFill.gradientStops[1]?.color === editedStops[1].color && gradientFill.gradientStops[1]?.transparency === editedStops[1].transparency,
	gradientColorTransformReadback: transformedReadbackColor?.shade === editedStops[0].color.shade && transformedReadbackColor?.saturation === editedStops[0].color.saturation && transformedReadbackColor?.luminance === editedStops[0].color.luminance && transformedReadbackColor?.luminanceOffset === editedStops[0].color.luminanceOffset,
	componentResetReadback: fillOf(resetObjectAfterPatch) == null || fillOf(resetObjectAfterPatch)?.type === 'none',
	reeditDryRunMutationFree: reeditDryRun?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	postResetReeditReadback: Array.isArray(resetFill?.gradientStops),
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-fill-gradient-stops-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), fillCatalogDigest: sha256(JSON.stringify(fillCatalog)), backgroundCatalogDigest: sha256(JSON.stringify(backgroundCatalog)), parameters: parameterIds, resetBehavior: fillSurface?.resetBehavior || null, stopContract: stop }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, objectNames: ['gradient-target', 'reset-target'] }, patch: { sha256: sha256(Buffer.from(JSON.stringify(patchSpec), 'utf8')), reeditSha256: sha256(Buffer.from(JSON.stringify(reeditSpec), 'utf8')), actions: ['replace arbitrary shape and background gradient-stop arrays', 'reset one shape fill to null', 're-edit the reset shape with a new gradient-stop array'] }, checks, privateLeakMatches, initial: { uploadOk: upload?.ok === true, dryRunOk: dryRun?.ok === true, commitOk: commit?.ok === true, deckId: deckId || null, dryRunError: dryRun?.error || dryData?.error || null }, patchRun: { dryRunOk: patchDryRun?.ok === true, commitOk: patchCommit?.ok === true, patchOperationCount: (patchData.patchOperations || []).length, unsupportedFindings: patchData.patchUnsupportedFindings || [], dryRunError: patchDryRun?.error || patchData?.error || null }, reeditRun: { dryRunOk: reeditDryRun?.ok === true, commitOk: reeditCommit?.ok === true, unsupportedFindings: reeditData.patchUnsupportedFindings || [], dryRunError: reeditDryRun?.error || reeditData?.error || null }, exportedReadback: { gradientObject, resetObject }, quality: { ok: quality?.ok === true, failed: quality?.failed || quality?.data?.failed || [], blockingIssues: quality?.blockingIssues || quality?.data?.blockingIssues || [], warnings: quality?.warnings || quality?.data?.warnings || [], error: quality?.ok === true ? null : (quality?.error || quality?.data?.error || null) }, preview: { ok: preview?.ok === true, complete: preview?.data?.complete ?? preview?.complete ?? null, packageSha256: preview?.data?.packageSha256 || preview?.packageSha256 || null, error: preview?.ok === true ? null : (preview?.error || preview?.data?.error || null) }, saved: { ok: save?.ok === true, deckVersion: save?.data?.deckVersion || save?.deckVersion || null, artifact: save?.data?.artifact || save?.artifact || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered typed gradient-stop controls for fill and background, authored arbitrary positions/colors/transparency, reset one fill, re-edited it, passed quality/preview/save, and showed no private leakage.' : 'Fresh Role-A gradient-stop execution does not yet expose the complete public contract.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'fill-gradient-stops-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
