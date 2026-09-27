#!/usr/bin/env node
// Fresh Role-A public-client proof for the generic gradient geometry contract.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/fill-gradient-direction-path-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
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
const roleA = client('betterpptx-public-gradient-direction-path-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const fillCatalog = await roleA.call('betterpptx.options.catalog', { surface: 'fill', format: 'full' })
const backgroundCatalog = await roleA.call('betterpptx.options.catalog', { surface: 'background', format: 'full' })
const fillSurface = (fillCatalog?.data?.surfaces || fillCatalog?.surfaces || []).find(surface => surface.id === 'fill')
const backgroundSurface = (backgroundCatalog?.data?.surfaces || backgroundCatalog?.surfaces || []).find(surface => surface.id === 'background')
const parameterIds = (fillSurface?.parameters || []).map(parameter => parameter.id)
const parameter = id => fillSurface?.parameters?.find(item => item.id === id)
const sourceSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Public gradient geometry proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
	contentStory: { audience: 'presentation authors', outcome: 'prove direction/path and extended gradient controls', remember: 'path, focus, flip, tile, rotation, reset, re-edit' },
	visualDesign: { world: 'blueprint', framing: 'native gradient geometry canary' },
	motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: [{ id: 'gradient-geometry-proof', title: 'Gradient geometry contract', layoutIntent: 'title-only', background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 33.333, gradientFlip: 'x', rotateGradientWithShape: false, tileRect: { l: 1.25, t: 2.5, r: 96.75, b: 98.5 }, gradientStops: [{ position: 0, color: '07111F' }, { position: 100, color: '0EA5E9', transparency: 33.333 }] }, content: [
		{ kind: 'shape', name: 'direction-target', objectName: 'direction-target', shapeName: 'roundRect', options: { fill: { type: 'gradient', gradient: { type: 'circle', flip: 'xy', rotateWithShape: false, focusRect: { l: 12.125, t: 24.25, r: 76.875, b: 88.75 }, tileRect: { l: 3.5, t: 4.25, r: 94.75, b: 95.125 }, stops: [{ position: 0, color: 'EF4444' }, { position: 0.37125, color: 'FACC15', transparency: 22.222 }, { position: 1, color: '2563EB', transparency: 77.777 }] } }, line: { color: 'FFFFFF', width: 1.25 } } },
		{ kind: 'shape', name: 'reset-target', objectName: 'reset-target', shapeName: 'roundRect', options: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 120, gradientStops: [{ position: 0, color: 'FDE68A' }, { position: 100, color: '0F766E' }] }, line: { color: 'FFFFFF', width: 1.25 } } },
	] }],
}
const sourceBytes = Buffer.from(JSON.stringify(sourceSpec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'gradient-geometry-public.json', idempotencyKey: `gradient-geometry-upload-${Date.now()}-${crypto.randomUUID()}` })
const uploadData = upload?.data || upload || {}
const specHandle = uploadData.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `gradient-geometry-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `gradient-geometry-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const patchSpec = { ...sourceSpec, slides: [{ ...sourceSpec.slides[0], background: { type: 'gradient', gradientDirection: 'rect', gradientFlip: 'y', rotateGradientWithShape: true, fillToRect: { l: 8.5, t: 14.25, r: 82.75, b: 91.125 }, gradientStops: [{ position: 0, color: 'FDE68A' }, { position: 100, color: '7C3AED', transparency: 51.5 }] }, content: [
	{ kind: 'shape', name: 'direction-target', objectName: 'direction-target', patch: { fill: { type: 'gradient', gradientDirection: 'rect', gradientFlip: 'y', rotateGradientWithShape: true, fillToRect: { l: 8.5, t: 14.25, r: 82.75, b: 91.125 }, tileRect: { l: 5.5, t: 6.25, r: 92.75, b: 93.125 }, gradientStops: [{ position: 0, color: 'FDE68A' }, { position: 100, color: '7C3AED', transparency: 51.5 }] } } },
	{ kind: 'shape', name: 'reset-target', objectName: 'reset-target', patch: { fill: null } },
] }] }
const patchDryRun = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `gradient-geometry-patch-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchData = patchDryRun?.data || patchDryRun || {}
const patchCommit = deckId && patchDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `gradient-geometry-patch-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchCommitData = patchCommit?.data || patchCommit || {}
const exportAfterPatch = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportAfterPatchData = exportAfterPatch?.data || exportAfterPatch || {}
const resetObjectAfterPatch = findObject(exportAfterPatchData.spec || exportAfterPatchData.effectiveSpec || null, 'reset-target')
const reeditSpec = { ...patchSpec, slides: [{ ...patchSpec.slides[0], background: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 271.875, gradientStops: [{ position: 0, color: '020617' }, { position: 100, color: '0F766E', transparency: 35.25 }] }, content: [
	{ kind: 'shape', name: 'direction-target', objectName: 'direction-target' },
	{ kind: 'shape', name: 'reset-target', objectName: 'reset-target', patch: { fill: { type: 'gradient', gradient: { type: 'shape', flip: 'none', rotateWithShape: false, focusRect: { l: 17.75, t: 22.5, r: 73.25, b: 81.125 }, stops: [{ position: 0, color: '020617' }, { position: 1, color: '0F766E', transparency: 35.25 }] } } } },
] }] }
const reeditDryRun = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `gradient-geometry-reedit-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const reeditData = reeditDryRun?.data || reeditDryRun || {}
const reeditCommit = deckId && reeditDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `gradient-geometry-reedit-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const exportedData = currentExport?.data || currentExport || {}
const exportedSpec = exportedData.spec || exportedData.effectiveSpec || null
const directionObject = findObject(exportedSpec, 'direction-target')
const resetObject = findObject(exportedSpec, 'reset-target')
const currentVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || patchCommitData.deckVersion || commitData.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion: currentVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion: currentVersion, slides: [0] }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion: currentVersion, fileName: 'gradient-geometry-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `gradient-geometry-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const returned = JSON.stringify({ fillCatalog, backgroundCatalog, upload, dryRun, commit, patchDryRun, patchCommit, reeditDryRun, reeditCommit, currentExport, quality, preview, save })
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const directionFill = fillOf(directionObject)
const resetFill = fillOf(resetObject)
const checks = {
	freshPublicSession: true,
	servedSpecFirstRoute: servedNames.includes('betterpptx.deck.generate_from_spec') && servedNames.includes('betterpptx.assets.upload'),
	fillCatalogContract: fillSurface?.id === 'fill' && fillSurface?.capabilityMode === 'parameterized' && parameterIds.includes('gradientDirection') && parameterIds.includes('gradientAngle') && parameterIds.includes('gradientFlip') && parameterIds.includes('rotateGradientWithShape') && parameterIds.includes('fillToRect.l') && parameterIds.includes('tileRect.b') && Boolean(fillSurface?.resetBehavior?.full),
	backgroundCatalogContract: backgroundSurface?.id === 'background' && (backgroundSurface?.parameters || []).some(item => item.id === 'gradientDirection') && (backgroundSurface?.parameters || []).some(item => item.id === 'fillToRect.l'),
	rangeAndApplicability: parameter('gradientAngle')?.minimum === 0 && parameter('gradientAngle')?.maximum === 360 && parameter('fillToRect.l')?.minimum === 0 && parameter('fillToRect.l')?.maximum === 100 && Array.isArray(parameter('fillToRect.l')?.applicability),
	initialJsonSpecUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRunMutationFree: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	patchDryRunMutationFree: patchDryRun?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch',
	patchCommit: patchCommit?.ok === true,
	geometryReeditReadback: directionFill?.gradientDirection === 'rect' && directionFill?.gradientFlip === 'y' && directionFill?.rotateGradientWithShape === true && directionFill?.fillToRect?.l === 8.5,
	componentResetReadback: resetObjectAfterPatch && (fillOf(resetObjectAfterPatch) == null || fillOf(resetObjectAfterPatch)?.type === 'none'),
	reeditDryRunMutationFree: reeditDryRun?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	postResetReeditReadback: (resetFill?.gradientDirection === 'shape' || resetFill?.gradient?.type === 'shape') && (resetFill?.fillToRect?.l === 17.75 || resetFill?.gradient?.focusRect?.l === 17.75),
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-fill-gradient-direction-path-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), fillCatalogDigest: sha256(JSON.stringify(fillCatalog)), backgroundCatalogDigest: sha256(JSON.stringify(backgroundCatalog)), parameters: parameterIds }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, objectNames: ['direction-target', 'reset-target'] }, patch: { sha256: sha256(Buffer.from(JSON.stringify(patchSpec), 'utf8')), reeditSha256: sha256(Buffer.from(JSON.stringify(reeditSpec), 'utf8')), actions: ['replace nested and direct path geometry', 'reset one shape fill to null', 're-edit the reset shape with a shape-path gradient'] }, checks, privateLeakMatches, initial: { uploadOk: upload?.ok === true, dryRunOk: dryRun?.ok === true, commitOk: commit?.ok === true, deckId: deckId || null, dryRunError: dryRun?.error || dryData?.error || null }, patchRun: { dryRunOk: patchDryRun?.ok === true, commitOk: patchCommit?.ok === true, unsupportedFindings: patchData.patchUnsupportedFindings || [], dryRunError: patchDryRun?.error || patchData?.error || null }, reeditRun: { dryRunOk: reeditDryRun?.ok === true, commitOk: reeditCommit?.ok === true, unsupportedFindings: reeditData.patchUnsupportedFindings || [], dryRunError: reeditDryRun?.error || reeditData?.error || null }, exportedReadback: { directionObject, resetObject }, quality: { ok: quality?.ok === true, failed: quality?.failed || quality?.data?.failed || [], blockingIssues: quality?.blockingIssues || quality?.data?.blockingIssues || [], warnings: quality?.warnings || quality?.data?.warnings || [], error: quality?.ok === true ? null : (quality?.error || quality?.data?.error || null) }, preview: { ok: preview?.ok === true, complete: preview?.data?.complete ?? preview?.complete ?? null, packageSha256: preview?.data?.packageSha256 || preview?.packageSha256 || null, error: preview?.ok === true ? null : (preview?.error || preview?.data?.error || null) }, saved: { ok: save?.ok === true, deckVersion: save?.data?.deckVersion || save?.deckVersion || null, artifact: save?.data?.artifact || save?.artifact || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered the full typed gradient geometry contract, authored nested and direct direction/path controls, reset one fill, re-edited it, passed quality/preview/save, and showed no private leakage.' : 'Fresh Role-A gradient geometry execution does not yet expose the complete public contract.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'fill-gradient-direction-path-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
console.log(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2))
if (status !== 'PASS') process.exitCode = 1
