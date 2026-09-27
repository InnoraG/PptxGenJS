#!/usr/bin/env node

// Fresh Role-A public lifecycle for the same nine shape-style rows proved by
// the native/Office boundary. This script intentionally sees only the public
// MCP contract and exercises import, readback, reset, re-edit, preview, save,
// and leakage checks.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = process.argv.includes('--endpoint')
	? process.argv[process.argv.indexOf('--endpoint') + 1]
	: (process.env.BETTERPPTX_MCP_ENDPOINT || 'http://127.0.0.1:3345/mcp')
const root = path.resolve('.')
const matrix = JSON.parse(await fs.readFile(path.resolve('betterpptx-mcp/preset-decomposition-matrix.json'), 'utf8'))
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/shape-style-row-public/${stamp}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const enc = spec => `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`
const callId = label => `${label}-${Date.now()}-${crypto.randomUUID()}`
const parseResponse = text => {
	const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{'))
	return lines.length ? JSON.parse(lines.at(-1).slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {})
}
const redact = value => typeof value === 'string'
	? value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]')
	: Array.isArray(value) ? value.map(redact)
		: value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]))
			: value
function client(name) {
	let sessionId = null
	let requestId = 0
	return {
		async rpc(method, params = {}) {
			let lastError
			for (let attempt = 0; attempt < 4; attempt++) {
				try {
					const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) })
					if (!response.ok) throw new Error(`HTTP ${response.status}`)
					if (!sessionId) sessionId = response.headers.get('mcp-session-id')
					return parseResponse(await response.text())
				} catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1))) }
			}
			throw lastError
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
function readStyleId(value, name) {
	const object = findObject(value, name)
	return object?.shapeStylePresetId ?? object?.style?.shapeStylePresetId ?? object?.options?.shapeStylePresetId ?? object?.patch?.shapeStylePresetId ?? null
}
const startIndex = Number(process.argv.includes('--start') ? process.argv[process.argv.indexOf('--start') + 1] : 1) || 1
const styleIds = Array.from({ length: 9 }, (_, i) => `shape-style-${String(startIndex + i).padStart(3, '0')}`)
const rowIds = styleIds.map(styleId => matrix.catalogRows.find(row => row.label?.endsWith(`-> ${styleId}`) && row.family === 'shapes-gradients')?.id)
const rowObjects = styleIds.map((styleId, index) => ({ kind: 'shape', name: `brand-panel-${String.fromCharCode(97 + index)}`, objectName: `brand-panel-${String.fromCharCode(97 + index)}`, shapeName: 'roundRect', region: ['leftThird', 'midThird', 'rightThird'][index % 3], shapeStylePresetId: styleId, decorative: true }))
const makeSlide = (index, title, message) => ({ id: `brand-language-${index + 1}`, title, message, layoutIntent: 'three-column', content: rowObjects.slice(index * 3, index * 3 + 3) })
const baseSpec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Shape style row batch public proof',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', objectIdentity: 'stable-names-required' },
	contentStory: { audience: 'brand and presentation authors', outcome: 'choose a visual language for a launch story', remember: 'native visual language stays editable as the story evolves' },
	visualDesign: { world: 'blueprint', framing: 'native shape-style row batch' },
	styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
	motionTime: { masterClock: 'static', timingSource: 'static', syncPolicy: 'one static clock' },
	validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
	layout: 'LAYOUT_WIDE',
	slides: [makeSlide(0, 'Explore the visual language', 'Start with a clean set of brand directions.'), makeSlide(1, 'Choose the strongest signal', 'Compare tone and emphasis before committing.'), makeSlide(2, 'Apply the chosen language', 'Keep the visual system editable as the story grows.')],
}
const resetSpec = { ...baseSpec, title: 'Evolving visual language', slides: baseSpec.slides.map(slide => ({ ...slide, content: slide.content.map(item => ({ kind: 'shape', name: item.name, objectName: item.objectName, shapeName: 'roundRect', region: item.region, decorative: true, patch: { shapeStylePresetId: null } })) })) }
const reeditSpec = { ...baseSpec, title: 'Evolving visual language', slides: baseSpec.slides.map((slide, slideIndex) => ({ ...slide, content: slide.content.map((item, localIndex) => { const globalIndex = slideIndex * 3 + localIndex; return { kind: 'shape', name: item.name, objectName: item.objectName, shapeName: 'roundRect', region: item.region, decorative: true, patch: { shapeStylePresetId: styleIds[styleIds.length - globalIndex - 1] } } }) })) }

await fs.mkdir(outDir, { recursive: true })
const roleA = client('betterpptx-public-shape-style-row-role-a-v1')
await roleA.initialize()
const listed = await roleA.rpc('tools/list')
const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalog = await roleA.call('betterpptx.options.catalog', { surface: 'shapeStylePreset', format: 'full' })
const catalogData = catalog?.data || catalog || {}
const surface = (catalogData.surfaces || []).find(item => item.id === 'shapeStylePreset')
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: enc(baseSpec), fileName: 'shape-style-row-batch-public.json', idempotencyKey: callId('shape-style-upload') })
const specHandle = (upload?.data || upload || {}).handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'premium', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('shape-style-dry') }) : { ok: false }
const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'premium', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: callId('shape-style-commit') }) : { ok: false }
const commitData = commit?.data || commit || {}
const deckId = commitData.deckId || commit?.deckId
const deckVersion = commitData.deckVersion || commit?.deckVersion
const initialExport = deckId ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const initialOut = initialExport?.data?.spec || initialExport?.data?.effectiveSpec || initialExport?.spec || null
const initialRows = styleIds.map((styleId, index) => ({ styleId, objectName: rowObjects[index].objectName, readback: readStyleId(initialOut, rowObjects[index].objectName) }))
const resetDry = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'premium', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('shape-style-reset-dry') }) : { ok: false }
const resetData = resetDry?.data || resetDry || {}
const resetCommit = deckId && resetDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'premium', planId: resetData.planId, lockedPlanId: resetData.planId, planDigest: resetData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('shape-style-reset') }) : { ok: false }
const resetExport = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const resetOut = resetExport?.data?.spec || resetExport?.data?.effectiveSpec || resetExport?.spec || null
const resetRows = styleIds.map((styleId, index) => ({ styleId, objectName: rowObjects[index].objectName, readback: readStyleId(resetOut, rowObjects[index].objectName) }))
const reeditDry = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'premium', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('shape-style-reedit-dry') }) : { ok: false }
const reeditData = reeditDry?.data || reeditDry || {}
const reeditCommit = deckId && reeditDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'premium', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('shape-style-reedit') }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }
const currentOut = currentExport?.data?.spec || currentExport?.data?.effectiveSpec || currentExport?.spec || null
const reeditRows = styleIds.map((styleId, index) => ({ expected: styleIds[styleIds.length - index - 1], objectName: rowObjects[index].objectName, readback: readStyleId(currentOut, rowObjects[index].objectName) }))
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion: reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false }
const finalDeckVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || deckVersion
const qualityOk = quality?.ok === true || quality?.data?.ok === true
const preview = deckId && qualityOk ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion: finalDeckVersion, renderer: 'powerpoint' }) : { ok: false }
const save = deckId && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion: finalDeckVersion, fileName: 'shape-style-row-batch-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: callId('shape-style-save') }) : { ok: false }
const returnedRaw = JSON.stringify({ listed, catalog, upload, dryRun, commit, initialExport, resetDry, resetCommit, resetExport, reeditDry, reeditCommit, currentExport, quality, preview, save })
const privateLeakMatches = returnedRaw.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const parameterIds = surface?.parameters?.map(item => item.id) || []
const checks = {
	freshPublicSession: true,
	servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'),
	catalogSurface: catalog?.ok === true && surface?.capabilityMode === 'preset-plus-parameters' && surface?.capabilityStatus === 'executable-exact-structured',
	catalogHasNineSelectors: Array.isArray(surface?.canonical) && styleIds.every(id => surface.canonical.some(preset => preset.id === id)),
	initialUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'),
	initialDryRun: dryRun?.ok === true && dryData.mutationFree === true,
	initialCommit: commit?.ok === true && typeof deckId === 'string',
	initialFullReadback: initialRows.every((row, index) => row.readback === styleIds[index]),
	resetDryRun: resetDry?.ok === true && resetData.mutationFree === true,
	resetCommit: resetCommit?.ok === true,
	resetReadback: resetRows.every(row => row.readback == null),
	reeditDryRun: reeditDry?.ok === true && reeditData.mutationFree === true,
	reeditCommit: reeditCommit?.ok === true,
	reeditFullReadback: reeditRows.every(row => row.readback === row.expected),
	quality: quality?.ok === true || quality?.data?.ok === true,
	preview: preview?.ok === true,
	savedArtifact: save?.ok === true,
	noPrivateImplementationLeakage: privateLeakMatches.length === 0,
}
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'
const evidence = redact({
	schemaVersion: 'betterpptx.g6-shape-style-row-public-proof.v1',
	status,
	generatedAt: new Date().toISOString(),
	endpoint,
	roleA: { freshSession: true, servedToolCount: servedNames.length, catalogSurface: 'shapeStylePreset', catalogSurfaceContract: surface, parameterIds, presetIds: styleIds, rowIds },
	checks,
	diagnostics: { upload: { ok: upload?.ok === true, error: upload?.error || null }, dryRun: { ok: dryRun?.ok === true, error: dryRun?.error || null, data: dryData }, commit: { ok: commit?.ok === true, error: commit?.error || null }, initialExport: redact(initialExport), resetDry: { ok: resetDry?.ok === true, error: resetDry?.error || null }, resetCommit: { ok: resetCommit?.ok === true, error: resetCommit?.error || null }, reeditDry: { ok: reeditDry?.ok === true, error: reeditDry?.error || null }, reeditCommit: { ok: reeditCommit?.ok === true, error: reeditCommit?.error || null }, currentExport: redact(currentExport), quality: { ok: qualityOk, error: quality?.error || null, response: redact(quality) }, preview: { ok: preview?.ok === true, error: preview?.error || null, response: redact(preview) }, save: { ok: save?.ok === true, error: save?.error || null, response: redact(save) } },
	readback: { initialRows, resetRows, reeditRows },
	quality: { ok: quality?.ok === true || quality?.data?.ok === true, failed: quality?.data?.failed || quality?.failed || [], warnings: quality?.data?.warnings || quality?.warnings || [] },
	preview: { ok: preview?.ok === true, response: preview },
	saved: { ok: save?.ok === true, deckVersion: finalDeckVersion, response: save },
	privateLeakMatches,
	interpretation: status === 'PASS' ? 'A fresh public client discovered nine native shape-style selectors, authored them, reset every selector, re-edited them in reverse order, validated, previewed, and saved without private implementation leakage.' : 'The nine-row public lifecycle is incomplete.',
})
await fs.mkdir(outDir, { recursive: true })
const out = path.join(outDir, 'g6-shape-style-row-public-proof.json')
const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`)
await fs.writeFile(out, bytes)
await fs.writeFile(`${out}.sha256`, `${sha256(bytes)}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ status, evidencePath: path.relative(root, out).replaceAll('\\', '/'), evidenceSha256: sha256(bytes), checks }, null, 2))
if (status !== 'PASS') process.exitCode = 1
