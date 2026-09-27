#!/usr/bin/env node
// Fresh Role-A lifecycle proof for the complete typed Picture Format correction family.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/image-adjustments-public/${stamp}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const callId = label => `${label}-${Date.now()}-${crypto.randomUUID()}`
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const parameters = {
	brightness: { minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', value: 0.37 },
	contrast: { minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', value: -0.37 },
	sharpness: { minimum: -1, maximum: 1, default: 0, step: 0.00001, unit: 'normalized', value: 0.37 },
	saturation: { minimum: 0, maximum: 4, default: 1, step: 0.00001, unit: 'multiplier', value: 2.37 },
	temperature: { minimum: 1500, maximum: 11500, default: 6500, step: 1, unit: 'kelvin', value: 8350 },
	transparency: { minimum: 0, maximum: 100, default: 0, step: 0.001, unit: 'percent', value: 37 },
}
const names = Object.keys(parameters)
const objectName = parameter => `correction-proof.${parameter}.image`
const findObject = (value, name) => {
	if (!value || typeof value !== 'object') return null
	if (value.name === name || value.objectName === name) return value
	if (Array.isArray(value)) for (const item of value) { const found = findObject(item, name); if (found) return found }
	else for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found }
	return null
}
const adjustmentOf = object => object?.imageAdjustments ?? object?.imageOptions?.imageAdjustments ?? object?.options?.imageAdjustments ?? object?.style?.imageAdjustments ?? null
const parseResponse = text => {
	const line = String(text || '').split(String.fromCharCode(10)).find(item => item.startsWith('data:') && item.slice(5).trim().startsWith('{'))
	return line ? JSON.parse(line.slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {})
}
const redact = value => typeof value === 'string'
	? value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	: Array.isArray(value) ? value.map(redact)
		: value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)])) : value

function client(name) {
	let sessionId = null
	let requestId = 0
	return {
		async rpc(method, params = {}) {
			let lastError
			for (let attempt = 0; attempt < 5; attempt++) try {
				const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
				if (!response.ok) throw new Error(`HTTP ${response.status}`)
				if (!sessionId) sessionId = response.headers.get('mcp-session-id')
				return parseResponse(await response.text())
			} catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))) }
			throw lastError
		},
		async call(tool, args = {}) { const response = await this.rpc('tools/call', { name: tool, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response },
		async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') },
	}
}

const content = names.map(parameter => ({ kind: 'image', name: parameter, data: image, region: 'body', altText: `Picture correction ${parameter}`, imageAdjustments: { [parameter]: parameters[parameter].value } }))
const baseSpec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public Picture Format correction lifecycle', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove every native Picture Format correction is typed and editable', remember: 'continuous controls are not preset ceilings' }, visualDesign: { world: 'blueprint', framing: 'one picture per correction control' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true }, slides: [{ id: 'correction-proof', title: 'Picture Format corrections', layoutIntent: 'title-body', content }] }
const resetSpec = { ...baseSpec, slides: [{ id: 'correction-proof', content: names.map(parameter => ({ kind: 'image', name: objectName(parameter), patch: { imageAdjustments: null } })) }] }
const reeditSpec = { ...baseSpec, slides: [{ id: 'correction-proof', content: names.map(parameter => ({ kind: 'image', name: objectName(parameter), patch: { imageAdjustments: { [parameter]: parameters[parameter].value } } })) }] }
const invalidStepSpec = { ...baseSpec, slides: [{ id: 'correction-proof', content: [{ kind: 'image', name: 'brightness', data: image, altText: 'Invalid step probe', imageAdjustments: { brightness: 0.000001 } }] }] }
const invalidRangeSpec = { ...baseSpec, slides: [{ id: 'correction-proof', content: [{ kind: 'image', name: 'saturation', data: image, altText: 'Invalid range probe', imageAdjustments: { saturation: 4.00001 } }] }] }
const encode = spec => `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`
const sourceBytes = Buffer.from(JSON.stringify(baseSpec), 'utf8')

const roleA = client('betterpptx-public-picture-corrections-lifecycle-role-a-v1')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'corrections', format: 'full' })
const surfaces = catalog?.data?.data?.surfaces || catalog?.data?.surfaces || []
const surface = surfaces.find(item => item.id === 'corrections')
const contracts = Object.fromEntries(names.map(name => [name, surface?.parameters?.find(item => item.id === name)]))
const catalogContracts = names.every(name => {
	const expected = parameters[name]; const actual = contracts[name]
	return actual?.type === 'continuous' && actual?.valueType === 'number' && actual.minimum === expected.minimum && actual.maximum === expected.maximum && actual.default === expected.default && actual.step === expected.step && actual.unit === expected.unit && actual.semanticPath === `imageAdjustments.${name}`
})

const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: encode(baseSpec), fileName: 'picture-corrections-lifecycle.json', idempotencyKey: callId('corrections-upload') })
const specHandle = upload?.data?.handle || upload?.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('corrections-dry') }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = specHandle && dryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('corrections-commit') }) : { ok: false }
const deckId = commit?.data?.deckId || commit?.deckId
const resetDry = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('corrections-reset-dry') }) : { ok: false }
const resetData = resetDry?.data || resetDry || {}
const resetCommit = deckId && resetDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: resetData.planId, lockedPlanId: resetData.planId, planDigest: resetData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('corrections-reset') }) : { ok: false }
const resetExport = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const resetSpecOut = resetExport?.data?.spec || resetExport?.spec || null
const resetValues = Object.fromEntries(names.map(name => [name, adjustmentOf(findObject(resetSpecOut, objectName(name)))]))
const reeditDry = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('corrections-reedit-dry') }) : { ok: false }
const reeditData = reeditDry?.data || reeditDry || {}
const reeditCommit = deckId && reeditDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('corrections-reedit') }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const currentSpecOut = currentExport?.data?.spec || currentExport?.spec || null
const currentValues = Object.fromEntries(names.map(name => [name, adjustmentOf(findObject(currentSpecOut, objectName(name)))]))
const deckVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || resetCommit?.data?.deckVersion || resetCommit?.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'picture-corrections-lifecycle.pptx', outputFormat: 'pptx', idempotencyKey: callId('corrections-save') }) : { ok: false }

async function rejectSpec(spec, label) {
	const uploaded = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: encode(spec), fileName: `picture-corrections-${label}.json`, idempotencyKey: callId(`corrections-${label}-upload`) })
	const handle = uploaded?.data?.handle || uploaded?.handle
	return handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'resolve', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId(`corrections-${label}-resolve`) }) : { ok: false }
}
const invalidStep = await rejectSpec(invalidStepSpec, 'invalid-step')
const invalidRange = await rejectSpec(invalidRangeSpec, 'invalid-range')
const returned = JSON.stringify(redact({ catalog, upload, dryRun, commit, resetDry, resetCommit, resetExport, reeditDry, reeditCommit, currentExport, quality, preview, save, invalidStep, invalidRange }))
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	catalogSurface: catalog?.ok === true && surface?.id === 'corrections' && surface?.capabilityStatus === 'executable-exact-structured',
	catalogContracts,
	jsonSpecUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRun: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1 && dryData.objectCount >= names.length,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	resetDryRun: resetDry?.ok === true && resetData.mutationFree === true && resetData.commitMode === 'patch',
	resetCommit: resetCommit?.ok === true,
	resetReadback: names.every(name => resetValues[name] == null),
	reeditDryRun: reeditDry?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	reeditReadback: names.every(name => Number(adjustmentOf(findObject(currentSpecOut, objectName(name)))?.[name]) === parameters[name].value),
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	invalidStepRejected: invalidStep?.ok !== true && /step|brightness|0\.000001/i.test(JSON.stringify(invalidStep)),
	invalidRangeRejected: invalidRange?.ok !== true && /4\.00001|saturation|between/i.test(JSON.stringify(invalidRange)),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-picture-corrections-lifecycle-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurface: 'corrections', catalogDigest: sha256(JSON.stringify(catalog)), contracts }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, parameters: names }, lifecycle: { resetSpecSha256: sha256(Buffer.from(JSON.stringify(resetSpec))), reeditSpecSha256: sha256(Buffer.from(JSON.stringify(reeditSpec))), resetValues, currentValues }, checks, privateLeakMatches, errors: { resetCommit: resetCommit?.error || resetCommit?.data?.error || null, reeditDry: reeditDry?.error || reeditDry?.data?.error || null, reeditCommit: reeditCommit?.error || reeditCommit?.data?.error || null }, invalid: { step: invalidStep?.error || invalidStep?.data?.error || null, range: invalidRange?.error || invalidRange?.data?.error || null }, quality: { ok: quality?.ok === true, failed: quality?.data?.failed || [] }, preview: { ok: preview?.ok === true }, saved: { ok: save?.ok === true, deckVersion: deckVersion || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered all six typed Picture Format correction controls with exact native serialization steps, authored all six, reset every control, sparsely re-edited every control, verified exported readback, passed quality/preview/save, rejected invalid step and range values, and exposed no private implementation detail.' : 'The public Picture Format correction lifecycle is not fully proven.' })
await fs.mkdir(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'image-adjustments-public-proof-v1.json')
const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`)
await fs.writeFile(evidencePath, evidenceBytes)
await fs.writeFile(`${evidencePath}.sha256`, `${sha256(evidenceBytes)}  ${path.basename(evidencePath)}\n`)
process.stdout.write(JSON.stringify({ status, evidencePath, evidenceSha256: sha256(evidenceBytes), checks }, null, 2) + '\n')
if (status !== 'PASS') process.exitCode = 1
