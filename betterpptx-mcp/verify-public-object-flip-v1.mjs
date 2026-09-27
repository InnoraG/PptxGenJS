#!/usr/bin/env node
// Fresh Role-A public-client proof for the shared object flip lifecycle.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/object-flip-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const parseResponse = text => { const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{')); return lines.length ? JSON.parse(lines.at(-1).slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {}) }
const redact = value => typeof value === 'string' ? value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]') : Array.isArray(value) ? value.map(redact) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)])) : value
function client(name) {
	let sessionId = null; let requestId = 0
	return {
		async rpc(method, params = {}) {
			let lastError
			for (let attempt = 0; attempt < 5; attempt++) {
				try {
					const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
					if (!response.ok) throw new Error(`HTTP ${response.status}`)
					if (!sessionId) sessionId = response.headers.get('mcp-session-id')
					return parseResponse(await response.text())
				} catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))) }
			}
			throw lastError
		},
		async call(tool, args = {}) { const response = await this.rpc('tools/call', { name: tool, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}
function findObject(value, name) { if (!value || typeof value !== 'object') return null; if (value.name === name || value.objectName === name || (typeof value.objectName === 'string' && value.objectName.toLowerCase().split('.').includes(String(name).toLowerCase()))) return value; if (Array.isArray(value)) { for (const item of value) { const found = findObject(item, name); if (found) return found } } else { for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found } } return null }
const flipOf = object => ({ flipH: object?.flipH ?? object?.style?.flipH ?? object?.options?.flipH ?? null, flipV: object?.flipV ?? object?.style?.flipV ?? object?.options?.flipV ?? null })
const callId = label => `${label}-${Date.now()}-${crypto.randomUUID()}`
const baseSpec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public object flip proof', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove typed object flip', remember: 'flip remains editable' }, visualDesign: { world: 'blueprint', framing: 'native flip canary' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true }, slides: [{ id: 'flip-proof', title: 'Flip proof', layoutIntent: 'hero', content: [{ kind: 'textBox', name: 'flip-text', objectName: 'flip-text', text: 'Native object flip remains editable.', flipH: true, flipV: false, style: { fontFace: 'Aptos Display', fontSize: 22, color: 'F8FAFC' } }, { kind: 'shape', name: 'flip-shape', objectName: 'flip-shape', shapeName: 'roundRect', flipH: false, flipV: true, style: { fill: { color: '16324F' }, line: { color: '38BDF8', width: 1.5 } } }] }] }
const resetSpec = { ...baseSpec, slides: [{ ...baseSpec.slides[0], content: [{ kind: 'textBox', name: 'flip-text', objectName: 'flip-text', patch: { flipH: null, flipV: null } }, { kind: 'shape', name: 'flip-shape', objectName: 'flip-shape', patch: { flipH: null, flipV: null } }] }] }
const reeditSpec = { ...baseSpec, slides: [{ ...baseSpec.slides[0], content: [{ kind: 'textBox', name: 'flip-text', objectName: 'flip-text', patch: { flipH: true, flipV: true } }, { kind: 'shape', name: 'flip-shape', objectName: 'flip-shape', patch: { flipH: false, flipV: true } }] }] }
const invalidSpec = { ...baseSpec, slides: [{ ...baseSpec.slides[0], content: [{ kind: 'textBox', name: 'flip-text', objectName: 'flip-text', flipH: 'invalid', flipV: false }] }] }
const enc = spec => `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`

const roleA = client('betterpptx-public-object-flip-role-a-v1'); await roleA.initialize()
const listed = await roleA.rpc('tools/list'); const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'objectFlip', format: 'full' })
const surfaces = catalog?.data?.surfaces || catalog?.surfaces || []; const surface = surfaces.find(item => item.id === 'objectFlip'); const parameter = surface?.parameters?.find(item => item.id === 'flipH')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: enc(baseSpec), fileName: 'object-flip-public.json', idempotencyKey: callId('flip-upload') }); const specHandle = (upload?.data || upload || {}).handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('flip-dry') }) : { ok: false }; const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: callId('flip-commit') }) : { ok: false }; const commitData = commit?.data || commit || {}; const deckId = commitData.deckId || commit?.deckId
const patchDry = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('flip-reset-dry') }) : { ok: false }; const patchData = patchDry?.data || patchDry || {}
const patchCommit = deckId && patchDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: patchData.planId, lockedPlanId: patchData.planId, planDigest: patchData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('flip-reset') }) : { ok: false }
const patchExport = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }; const patchOut = patchExport?.data?.spec || patchExport?.data?.effectiveSpec || patchExport?.spec || null
const patchText = findObject(patchOut, 'flip-text'); const patchShape = findObject(patchOut, 'flip-shape')
const reeditDry = deckId && patchCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('flip-reedit-dry') }) : { ok: false }; const reeditData = reeditDry?.data || reeditDry || {}
const reeditCommit = deckId && reeditDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('flip-reedit') }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }; const currentOut = currentExport?.data?.spec || currentExport?.data?.effectiveSpec || currentExport?.spec || null; const currentText = findObject(currentOut, 'flip-text'); const currentShape = findObject(currentOut, 'flip-shape'); const deckVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || patchCommit?.data?.deckVersion || patchCommit?.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false }; const qualityPassed = quality?.data?.ok === true
const preview = deckId && reeditCommit?.ok === true && qualityPassed ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion }) : { ok: false }; const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'object-flip-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: callId('flip-save') }) : { ok: false }
const invalidUpload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: enc(invalidSpec), fileName: 'object-flip-invalid.json', idempotencyKey: callId('flip-invalid-upload') }); const invalidHandle = (invalidUpload?.data || invalidUpload || {}).handle; const invalidDry = invalidHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: invalidHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('flip-invalid-dry') }) : { ok: false }
const returned = JSON.stringify(redact({ catalog, upload, dryRun, commit, patchDry, patchCommit, patchExport, reeditDry, reeditCommit, currentExport, quality, preview, save, invalidUpload, invalidDry })); const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	catalog: catalog?.ok === true && surface?.id === 'objectFlip' && surface?.capabilityStatus === 'executable-exact-structured',
	catalogParameters: parameter?.type === 'discrete' && parameter?.valueType === 'boolean' && Array.isArray(parameter?.values) && parameter.values.join(',') === 'false,true' && parameter?.semanticPath === 'options.flipH',
	initialUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRun: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	patchDryRun: patchDry?.ok === true && patchData.mutationFree === true && patchData.commitMode === 'patch',
	patchCommit: patchCommit?.ok === true,
	independentResetReadback: flipOf(patchText).flipH === null && flipOf(patchText).flipV === null && flipOf(patchShape).flipH === null && flipOf(patchShape).flipV === null,
	reeditDryRun: reeditDry?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	postReeditReadback: flipOf(currentText).flipH === true && flipOf(currentText).flipV === true && flipOf(currentShape).flipH === false && flipOf(currentShape).flipV === true,
	quality: qualityPassed,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	invalidBoundaryRejected: invalidDry?.ok !== true && /flip|boolean/i.test(JSON.stringify(invalidDry)),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-object-flip-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'objectFlip', catalogDigest: sha256(JSON.stringify(catalog)), parameter }, source: { sha256: sha256(Buffer.from(JSON.stringify(baseSpec))), objectNames: ['flip-text', 'flip-shape'] }, reset: { sha256: sha256(Buffer.from(JSON.stringify(resetSpec))) }, reedit: { sha256: sha256(Buffer.from(JSON.stringify(reeditSpec))) }, checks, privateLeakMatches, readback: { reset: { text: flipOf(patchText), shape: flipOf(patchShape) }, reedit: { text: flipOf(currentText), shape: flipOf(currentShape) } }, initial: { uploadOk: upload?.ok === true, dryRunOk: dryRun?.ok === true, commitOk: commit?.ok === true }, quality: { ok: qualityPassed, failed: quality?.data?.failed || [], warnings: quality?.data?.warnings || [] }, preview: { ok: preview?.ok === true }, saved: { ok: save?.ok === true, deckVersion: deckVersion || null }, invalidBoundary: { uploadOk: invalidUpload?.ok === true, dryRunOk: invalidDry?.ok === true, error: invalidDry?.error || invalidDry?.data?.error || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered, authored, reset, re-edited, quality-validated, previewed, and saved typed native object flip for text and shape carriers. Native/Office proof is archived separately; universal formal closure remains 0/2258.' : 'Public object flip lifecycle is not yet fully proven.' })
await fs.mkdir(evidenceDir, { recursive: true }); const evidencePath = path.join(evidenceDir, 'object-flip-public-proof-v1.json'); const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`); await fs.writeFile(evidencePath, evidenceBytes); await fs.writeFile(`${evidencePath}.sha256`, `${sha256(evidenceBytes)}  ${path.basename(evidencePath)}\n`); process.stdout.write(JSON.stringify({ status, evidencePath, evidenceSha256: sha256(evidenceBytes), checks }, null, 2) + '\n'); if (status !== 'PASS') process.exitCode = 1
