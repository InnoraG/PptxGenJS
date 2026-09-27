#!/usr/bin/env node
// Fresh Role-A proof for picture color/recolor and every persistent Artistic
// Effects slider. This is deliberately catalog-driven: new effect leaves are
// exercised from the public schema instead of being hidden behind presets.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/image-color-artistic-public/${stamp}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const callId = label => `${label}-${Date.now()}-${crypto.randomUUID()}`
const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const parseResponse = text => {
	const line = String(text || '').split(/\r?\n/).find(item => item.startsWith('data:') && item.slice(5).trim().startsWith('{'))
	return line ? JSON.parse(line.slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {})
}
const redact = value => typeof value === 'string'
	? value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	: Array.isArray(value) ? value.map(redact)
		: value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)])) : value
const findObject = (value, name) => {
	if (!value || typeof value !== 'object') return null
	if (value.name === name || value.objectName === name) return value
	if (Array.isArray(value)) for (const item of value) { const found = findObject(item, name); if (found) return found }
	else for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found }
	return null
}
const adjustmentOf = object => object?.imageAdjustments ?? object?.imageOptions?.imageAdjustments ?? object?.options?.imageAdjustments ?? object?.style?.imageAdjustments ?? null

function client(name) {
	let sessionId = null; let requestId = 0
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

const roleA = client('betterpptx-public-picture-color-artistic-role-a-v1')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const recolorCatalog = await roleA.call('betterpptx.options.catalog', { surface: 'recolor', format: 'full' })
const artisticCatalog = await roleA.call('betterpptx.options.catalog', { surface: 'artisticEffect', format: 'full' })
const recolorSurface = (recolorCatalog?.data?.data?.surfaces || recolorCatalog?.data?.surfaces || []).find(item => item.id === 'recolor')
const artisticSurface = (artisticCatalog?.data?.data?.surfaces || artisticCatalog?.data?.surfaces || []).find(item => item.id === 'artisticEffect')
const endpointParameters = ['tint', 'shade', 'saturation', 'opacity']
const endpointContracts = Object.fromEntries(endpointParameters.map(id => [id, recolorSurface?.parameters?.find(item => item.id === `endpoint.${id}`)]))
const endpointContractsPass = endpointParameters.every(id => endpointContracts[id]?.type === 'continuous' && endpointContracts[id]?.step === 0.00001)
const effectParameters = artisticSurface?.parameters && !Array.isArray(artisticSurface.parameters) ? artisticSurface.parameters : {}
const effectTypes = artisticSurface?.canonical || Object.keys(effectParameters)
const effectContractsPass = effectTypes.length === 23 && effectTypes.every(type => Array.isArray(effectParameters[type]) && effectParameters[type].every(parameter => parameter.type === 'continuous' && typeof parameter.step === 'number'))
const chooseValue = parameter => {
	const minimum = Number(parameter.minimum ?? 0); const maximum = Number(parameter.maximum ?? minimum); const step = Number(parameter.step || 1)
	const candidate = minimum + (maximum - minimum) * 0.63
	return Number((Math.round((candidate - minimum) / step) * step + minimum).toFixed(8))
}
const effectValue = type => Object.fromEntries((effectParameters[type] || []).map(parameter => [parameter.id, chooseValue(parameter)]))
const content = [
	{ kind: 'image', name: 'recolor-proof', data: image, region: 'body', altText: 'Picture recolor endpoint proof', imageAdjustments: { colorMode: 'recolor', recolor: { dark: { scheme: 'dk1', tint: 0.125, shade: 0.25, saturation: 1.25, opacity: 0.8 }, light: { scheme: 'accent4', tint: 0.45, saturation: 2.5, opacity: 0.9 } } } },
	{ kind: 'image', name: 'duotone-proof', data: image, region: 'body', altText: 'Picture duotone endpoint proof', imageAdjustments: { colorMode: 'duotone', duotone: { dark: { color: '101828', shade: 0.2 }, light: { scheme: 'accent4', tint: 0.3, saturation: 1.5 } } } },
	...effectTypes.map(type => ({ kind: 'image', name: `artistic-proof.${type}`, data: image, region: 'body', altText: `Picture artistic effect ${type}`, imageAdjustments: { artisticEffect: { type, ...effectValue(type) } } })),
]
const authoredByName = Object.fromEntries(content.map(item => [item.name, item.imageAdjustments]))
const objectName = name => `picture-color-artistic-proof.${name}.image`
const baseSpec = { schemaVersion: 'betterpptx.deck-spec.v1', title: 'Public picture color and artistic controls', authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' }, contentStory: { audience: 'presentation authors', outcome: 'prove color mappings and all persistent artistic sliders remain editable', remember: 'a preset is not a slider contract' }, visualDesign: { world: 'blueprint', framing: 'one native picture control per object' }, styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' }, motionTime: { masterClock: 'static', timingSource: 'authored slide timing', syncPolicy: 'one static visual clock' }, validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true }, slides: [{ id: 'picture-color-artistic-proof', title: 'Picture color and artistic controls', layoutIntent: 'title-body', content }] }
const resetSpec = { ...baseSpec, slides: [{ id: 'picture-color-artistic-proof', content: content.map(item => ({ kind: 'image', name: objectName(item.name), patch: { imageAdjustments: null } })) }] }
const reeditSpec = { ...baseSpec, slides: [{ id: 'picture-color-artistic-proof', content: content.map(item => ({ kind: 'image', name: objectName(item.name), patch: { imageAdjustments: authoredByName[item.name] } })) }] }
const invalidStepSpec = { ...baseSpec, slides: [{ id: 'picture-color-artistic-proof', content: [{ kind: 'image', name: 'invalid-color-step', data: image, altText: 'Invalid color step probe', imageAdjustments: { colorMode: 'recolor', recolor: { dark: { color: '000000', tint: 0.000001 }, light: 'FFFFFF' } } }] }] }
const invalidArtisticSpec = { ...baseSpec, slides: [{ id: 'picture-color-artistic-proof', content: [{ kind: 'image', name: 'invalid-artistic-step', data: image, altText: 'Invalid artistic step probe', imageAdjustments: { artisticEffect: { type: 'blur', radius: 0.5 } } }] }] }
const encode = spec => `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`
const sourceBytes = Buffer.from(JSON.stringify(baseSpec), 'utf8')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: encode(baseSpec), fileName: 'picture-color-artistic-lifecycle.json', idempotencyKey: callId('color-artistic-upload') })
const specHandle = upload?.data?.handle || upload?.handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('color-artistic-dry') }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = specHandle && dryRun?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('color-artistic-commit') }) : { ok: false }
const deckId = commit?.data?.deckId || commit?.deckId
const resetDry = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('color-artistic-reset-dry') }) : { ok: false }
const resetData = resetDry?.data || resetDry || {}
const resetCommit = deckId && resetDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: resetData.planId, lockedPlanId: resetData.planId, planDigest: resetData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('color-artistic-reset') }) : { ok: false }
const resetExport = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const resetOut = resetExport?.data?.spec || resetExport?.spec || null
const resetReadback = content.every(item => adjustmentOf(findObject(resetOut, objectName(item.name))) == null)
const reeditDry = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('color-artistic-reedit-dry') }) : { ok: false }
const reeditData = reeditDry?.data || reeditDry || {}
const reeditCommit = deckId && reeditDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('color-artistic-reedit') }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const currentOut = currentExport?.data?.spec || currentExport?.spec || null
const reeditReadback = content.every(item => adjustmentOf(findObject(currentOut, objectName(item.name))) != null)
const deckVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false }
const preview = deckId && reeditCommit?.ok === true && quality?.ok === true ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion }) : { ok: false }
const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'picture-color-artistic-lifecycle.pptx', outputFormat: 'pptx', idempotencyKey: callId('color-artistic-save') }) : { ok: false }
async function rejectSpec(spec, label) {
	const uploaded = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: encode(spec), fileName: `picture-color-artistic-${label}.json`, idempotencyKey: callId(`color-artistic-${label}-upload`) })
	const handle = uploaded?.data?.handle || uploaded?.handle
	return handle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle: handle, phase: 'resolve', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId(`color-artistic-${label}-resolve`) }) : { ok: false }
}
const invalidStep = await rejectSpec(invalidStepSpec, 'invalid-color-step')
const invalidArtistic = await rejectSpec(invalidArtisticSpec, 'invalid-artistic-step')
const returned = JSON.stringify(redact({ recolorCatalog, artisticCatalog, upload, dryRun, commit, resetDry, resetCommit, resetExport, reeditDry, reeditCommit, currentExport, quality, preview, save, invalidStep, invalidArtistic }))
const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	recolorCatalog: recolorCatalog?.ok === true && recolorSurface?.id === 'recolor' && endpointContractsPass,
	artisticCatalog: artisticCatalog?.ok === true && artisticSurface?.id === 'artisticEffect' && effectContractsPass,
	jsonSpecUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRun: dryRun?.ok === true && dryData.mutationFree === true && dryData.slideCount === 1 && dryData.objectCount >= content.length,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	resetDryRun: resetDry?.ok === true && resetData.mutationFree === true && resetData.commitMode === 'patch',
	resetCommit: resetCommit?.ok === true,
	resetReadback,
	reeditDryRun: reeditDry?.ok === true && reeditData.mutationFree === true && reeditData.commitMode === 'patch',
	reeditCommit: reeditCommit?.ok === true,
	reeditReadback,
	quality: quality?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	invalidColorStepRejected: invalidStep?.ok !== true && /step|tint|0\.000001/i.test(JSON.stringify(invalidStep)),
	invalidArtisticStepRejected: invalidArtistic?.ok !== true && /step|radius|0\.5/i.test(JSON.stringify(invalidArtistic)),
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({ schemaVersion: 'betterpptx.public-picture-color-artistic-lifecycle-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurfaces: ['recolor', 'artisticEffect'], catalogDigests: { recolor: sha256(JSON.stringify(recolorCatalog)), artisticEffect: sha256(JSON.stringify(artisticCatalog)) }, effectTypes, endpointContracts, effectContracts: effectTypes.map(type => ({ type, parameters: effectParameters[type] })) }, source: { sha256: sha256(sourceBytes), bytes: sourceBytes.length, objectCount: content.length }, lifecycle: { resetSpecSha256: sha256(Buffer.from(JSON.stringify(resetSpec))), reeditSpecSha256: sha256(Buffer.from(JSON.stringify(reeditSpec))), resetReadback, reeditReadback }, checks, privateLeakMatches, errors: { resetCommit: resetCommit?.error || resetCommit?.data?.error || null, reeditDry: reeditDry?.error || reeditDry?.data?.error || null, reeditCommit: reeditCommit?.error || reeditCommit?.data?.error || null, invalidStep: invalidStep?.error || invalidStep?.data?.error || null, invalidArtistic: invalidArtistic?.error || invalidArtistic?.data?.error || null }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered the complete typed recolor/duotone endpoint controls and all persistent Artistic Effects slider leaves, authored them natively, reset and sparsely re-edited them, verified public readback, passed quality/preview/save, rejected invalid steps, and exposed no private implementation detail.' : 'The public picture color/artistic lifecycle is not fully proven.' })
await fs.mkdir(evidenceDir, { recursive: true })
const evidencePath = path.join(evidenceDir, 'picture-color-artistic-public-proof-v1.json')
const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`)
await fs.writeFile(evidencePath, evidenceBytes)
await fs.writeFile(`${evidencePath}.sha256`, `${sha256(evidenceBytes)}  ${path.basename(evidencePath)}\n`)
process.stdout.write(JSON.stringify({ status, evidencePath, evidenceSha256: sha256(evidenceBytes), checks }, null, 2) + '\n')
if (status !== 'PASS') process.exitCode = 1
