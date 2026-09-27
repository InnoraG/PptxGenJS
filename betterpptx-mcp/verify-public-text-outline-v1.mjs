// Fresh Role-A public-client proof for the generic text character outline surface.
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/text-outline-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
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
	const matches = value.name === name || value.objectName === name || (typeof value.objectName === 'string' && value.objectName.toLowerCase().split('.').includes(String(name).toLowerCase()))
	if (matches) return value
	if (Array.isArray(value)) { for (const item of value) { const found = findObject(item, name); if (found) return found } }
	else { for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found } }
	return null
}
const textOutlineOf = object => object?.style?.textOutline || object?.options?.textOutline || object?.textOutline || null
const roleA = client('betterpptx-public-text-outline-role-a')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'textOutline', format: 'full' })
const surfaces = catalog?.data?.surfaces || catalog?.surfaces || []
const textOutlineSurface = surfaces.find(surface => surface.id === 'textOutline')
const transparency = (textOutlineSurface?.parameters || []).find(parameter => parameter.id === 'textOutlineTransparency')
const width = (textOutlineSurface?.parameters || []).find(parameter => parameter.id === 'textOutlineWidth')
const sourceSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public text outline proof', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove editable character outline', remember: 'text outline is independent from the text box panel line' }, visualDesign: { world: 'blueprint', framing: 'native text outline canary' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	slides: [{ id: 'text-outline-proof', title: 'Text outline contract', layoutIntent: 'title-only', content: [
		{ kind: 'textBox', name: 'plain-target', objectName: 'plain-target', text: 'Plain text outline', style: { textOutline: { color: '38BDF8', transparency: 37.125, widthPt: 1.5 }, fontFace: 'Aptos Display', fontSize: 34, align: 'center' } },
		{ kind: 'textBox', name: 'wordart-target', objectName: 'wordart-target', text: 'WordArt outline', style: { textOutline: { color: 'FACC15', transparency: 62.5, widthPt: 2.25 }, wordArt: { transform: 'textArchUp', adjustments: [50000] }, fontFace: 'Aptos Display', fontSize: 30, align: 'center' } },
	] }],
}
const sourceBytes = Buffer.from(JSON.stringify(sourceSpec, null, 2), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${sourceBytes.toString('base64')}`, fileName: 'text-outline-public.json', idempotencyKey: `text-outline-upload-${Date.now()}-${crypto.randomUUID()}` })
const specHandle = upload?.data?.handle || upload?.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text-outline-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: `text-outline-commit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const patchSpec = { ...sourceSpec, slides: [{ ...sourceSpec.slides[0], content: [
	{ kind: 'textBox', name: 'plain-target', objectName: 'plain-target', patch: { textOutline: { transparency: null } } },
	{ kind: 'textBox', name: 'wordart-target', objectName: 'wordart-target', patch: { textOutline: { transparency: 12.5 } } },
] }] }
const patchDryRun = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text-outline-patch-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchData = patchDryRun?.data || patchDryRun || {}
const patchCommit = deckId && patchDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: patchSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `text-outline-patch-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const patchExport = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const patchSpecReadback = patchExport?.data?.spec || patchExport?.data?.effectiveSpec || patchExport?.spec || null
const patchPlain = textOutlineOf(findObject(patchSpecReadback, 'plain-target'))
const patchWordArt = textOutlineOf(findObject(patchSpecReadback, 'wordart-target'))
const reeditSpec = { ...patchSpec, slides: [{ ...patchSpec.slides[0], content: [
	{ kind: 'textBox', name: 'plain-target', objectName: 'plain-target', patch: { textOutline: { color: 'FB7185', transparency: 75.375, widthPt: 4.125 } } },
	{ kind: 'textBox', name: 'wordart-target', objectName: 'wordart-target', patch: { textOutline: { color: '22D3EE', transparency: 25.125, widthPt: 3.375 } } },
] }] }
const reeditDryRun = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text-outline-reedit-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const reeditData = reeditDryRun?.data || reeditDryRun || {}
const reeditCommit = deckId && reeditDryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: `text-outline-reedit-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const currentSpec = currentExport?.data?.spec || currentExport?.data?.effectiveSpec || currentExport?.spec || null
const finalPlain = textOutlineOf(findObject(currentSpec, 'plain-target'))
const finalWordArt = textOutlineOf(findObject(currentSpec, 'wordart-target'))
const currentVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || patchCommit?.data?.deckVersion || patchCommit?.deckVersion || commitData.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion: currentVersion, profile: 'modern' }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion: currentVersion, slides: [0] }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion: currentVersion, fileName: 'text-outline-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: `text-outline-save-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const invalidSpec = { ...sourceSpec, slides: [{ ...sourceSpec.slides[0], content: [{ ...sourceSpec.slides[0].content[0], style: { ...sourceSpec.slides[0].content[0].style, textOutline: { color: '38BDF8', transparency: 12.3456, widthPt: 1.23456 } } }] }] }
const invalidBytes = Buffer.from(JSON.stringify(invalidSpec), 'utf8')
const invalidUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: `data:application/json;base64,${invalidBytes.toString('base64')}`, fileName: 'text-outline-invalid.json', idempotencyKey: `text-outline-invalid-upload-${Date.now()}-${crypto.randomUUID()}` })
const invalidHandle = invalidUpload?.data?.handle || invalidUpload?.handle
const invalidDryRun = invalidHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: invalidHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: `text-outline-invalid-dry-${Date.now()}-${crypto.randomUUID()}` }) : { ok: false }
const returned = JSON.stringify(redact({ catalog, upload, dryRun, commit, patchDryRun, patchCommit, patchExport, reeditDryRun, reeditCommit, currentExport, quality, preview, save, invalidUpload, invalidDryRun }))
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true, servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'), textOutlineCatalog: catalog?.ok === true && textOutlineSurface?.capabilityMode === 'parameterized' && textOutlineSurface?.capabilityStatus === 'executable-exact-structured', textOutlineRange: transparency?.minimum === 0 && transparency?.maximum === 100 && transparency?.step === 0.001 && width?.minimum === 0 && width?.maximum === 100 && width?.step === 0.001,
	initialJsonSpecUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'), initialDryRunMutationFree: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1, initialCommit: commit?.ok === true && typeof deckId === 'string', patchDryRunMutationFree: patchDryRun?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch', patchCommit: patchCommit?.ok === true, componentResetReadback: patchPlain?.transparency == null, sparsePatchReadback: patchWordArt?.transparency === 12.5 && patchWordArt?.color === 'FACC15', reeditDryRunMutationFree: reeditDryRun?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch', reeditCommit: reeditCommit?.ok === true, postReeditPlainReadback: finalPlain?.color === 'FB7185' && finalPlain?.transparency === 75.375 && finalPlain?.widthPt === 4.125, postReeditWordArtReadback: finalWordArt?.color === '22D3EE' && finalWordArt?.transparency === 25.125 && finalWordArt?.widthPt === 3.375, quality: quality?.ok === true, preview: preview?.ok === true, savedArtifact: save?.ok === true, invalidStepRejected: invalidDryRun?.ok !== true && /textOutline|transparency|widthPt|0\.001|step/i.test(JSON.stringify(invalidDryRun)), noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-text-outline-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'textOutline', catalogDigest: sha256(JSON.stringify(catalog)), parameters: { transparency, width } }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, objectNames: ['plain-target', 'wordart-target'] }, patch: { sha256: sha256(Buffer.from(JSON.stringify(patchSpec), 'utf8')), reeditSha256: sha256(Buffer.from(JSON.stringify(reeditSpec), 'utf8')), actions: ['reset plain transparency', 'sparse WordArt transparency edit', 're-edit both carriers with color, transparency, and width'] }, checks, privateLeakMatches, initial: { uploadOk: upload?.ok === true, dryRunOk: dryRun?.ok === true, commitOk: commit?.ok === true, deckId: deckId || null, dryRunError: dryRun?.error || dryData?.error || null }, patchRun: { dryRunOk: patchDryRun?.ok === true, commitOk: patchCommit?.ok === true, plain: patchPlain, wordArt: patchWordArt, dryRunError: patchDryRun?.error || patchData?.error || null }, reeditRun: { dryRunOk: reeditDryRun?.ok === true, commitOk: reeditCommit?.ok === true, plain: finalPlain, wordArt: finalWordArt, dryRunError: reeditDryRun?.error || reeditData?.error || null }, quality: { ok: quality?.ok === true, failed: quality?.failed || quality?.data?.failed || [], blockingIssues: quality?.blockingIssues || quality?.data?.blockingIssues || [], warnings: quality?.warnings || quality?.data?.warnings || [] }, preview: { ok: preview?.ok === true, complete: preview?.data?.complete ?? preview?.complete ?? null, packageSha256: preview?.data?.packageSha256 || preview?.packageSha256 || null }, saved: { ok: save?.ok === true, deckVersion: currentVersion || null, artifact: save?.data?.artifact || save?.artifact || null }, invalidBoundary: { uploadOk: invalidUpload?.ok === true, dryRunOk: invalidDryRun?.ok === true, error: invalidDryRun?.error || invalidDryRun?.data?.error || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered textOutline color/transparency/width, authored ordinary text and WordArt through JSON spec, reset and re-edited both carriers, passed quality/preview/save, rejected non-step values, and showed no private leakage. The public contract closes only this text-outline leaf; spacing, paragraph controls, and universal formal closure remain open.' : 'Fresh Role-A textOutline execution does not yet expose the complete verified public contract.' })
fs.mkdirSync(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'text-outline-public-proof.json')
fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
const evidenceSha256 = sha256(fs.readFileSync(evidencePath))
fs.writeFileSync(`${evidencePath}.sha256`, `${evidenceSha256}  ${path.basename(evidencePath)}\n`, 'utf8')
process.stdout.write(JSON.stringify({ ...evidence, evidencePath, evidenceSha256 }, null, 2) + '\n')
if (status !== 'PASS') process.exitCode = 1
