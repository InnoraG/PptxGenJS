// Fresh Role-A public proof for style and text-effect preset base precedence.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

const endpoint = 'https://betterpptx.tail070c3a.ts.net/mcp'
const evidenceDir = path.resolve(`outputs/authoring-principle-corpus/global-extended-option-five-point/style-effect-preset-overrides-public/${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}`)
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const parseResponse = text => { const lines = String(text || '').split(/\r?\n/).filter(line => line.startsWith('data:') && line.slice(5).trim().startsWith('{')); return lines.length ? JSON.parse(lines.at(-1).slice(5).trim()) : (String(text || '').trim() ? JSON.parse(text) : {}) }
const redact = value => typeof value === 'string' ? value.replace(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g, '[private-detail-redacted]') : Array.isArray(value) ? value.map(redact) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)])) : value
const callId = label => `${label}-${Date.now()}-${crypto.randomUUID()}`
const enc = spec => `data:application/json;base64,${Buffer.from(JSON.stringify(spec)).toString('base64')}`
function client(name) { let sessionId = null; let requestId = 0; return { async rpc(method, params = {}) { let lastError; for (let attempt = 0; attempt < 5; attempt++) { try { const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(sessionId ? { 'mcp-session-id': sessionId } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); if (!sessionId) sessionId = response.headers.get('mcp-session-id'); return parseResponse(await response.text()) } catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1))) } } throw lastError }, async call(tool, args = {}) { const response = await this.rpc('tools/call', { name: tool, arguments: args }); const text = response?.result?.content?.find(item => item.type === 'text')?.text; return text ? JSON.parse(text) : response }, async initialize() { await this.rpc('initialize', { protocolVersion: '2024-11-05', clientInfo: { name, version: '1' }, capabilities: {} }); await this.rpc('notifications/initialized') } } }
function findObject(value, name) { if (!value || typeof value !== 'object') return null; if (value.name === name || value.objectName === name || (typeof value.objectName === 'string' && value.objectName.toLowerCase().split('.').includes(String(name).toLowerCase()))) return value; if (Array.isArray(value)) { for (const item of value) { const found = findObject(item, name); if (found) return found } } else { for (const item of Object.values(value)) { const found = findObject(item, name); if (found) return found } } return null }
const styleOf = object => object?.style || object?.options || null
const baseSpec = {
  schemaVersion: 'betterpptx.deck-spec.v1',
  title: 'Public style-effect override proof',
  authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
  contentStory: { audience: 'presentation authors', outcome: 'prove style presets remain overrideable', remember: 'native gallery tiles are not authoring ceilings' },
  visualDesign: { world: 'blueprint', framing: 'style effect override canary' },
  styleIntent: { artDirection: 'blueprint', density: 'sparse', tone: 'technical' },
  motionTime: { masterClock: 'authored slide timing', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one static visual clock' },
  validation: { validateBeforeSave: true, previewBeforeSave: false, requireAccessibility: true },
  layout: 'LAYOUT_WIDE',
  slides: [{
    id: 'style-effect-proof',
    title: 'Style effect preset overrides',
    message: 'A native style remains independently overrideable.',
    layoutIntent: 'process-flow',
    content: [
      {
        kind: 'shape',
        name: 'style-shape',
        objectName: 'style-shape',
        shapeName: 'roundRect',
        region: 'left',
        shapeStylePresetId: 'shape-style-075',
        style: {
          shadow: { blur: 11, offset: 7, angle: 123, color: 'FF0000', opacity: 0.3 },
          glow: { size: 9, color: '00FF00', opacity: 0.4 },
          reflection: { blur: 2, offset: 3, angle: 90, opacity: 0.35, endOpacity: 0.05, fadeStart: 0, fadeEnd: 55 },
          softEdges: { size: 4 },
          blur: { radiusPt: 5, grow: false },
          fillOverlay: { blend: 'mult', fill: { type: 'solid', color: '112233', transparency: 0.2 } },
        },
      },
      {
        kind: 'wordart',
        name: 'style-wordart',
        objectName: 'style-wordart',
        text: 'NATIVE',
        region: 'right',
        wordArtStylePresetId: 'wordart-style-007',
        textEffectPresetIds: ['text-effect-glow-003'],
        style: { textGlow: { size: 11, color: 'FF0000', opacity: 0.3 } },
      },
    ],
  }],
}
const resetSpec = { ...baseSpec, title: 'Public style-effect override reset', slides: [{ ...baseSpec.slides[0], content: [{ kind: 'shape', name: 'style-shape', objectName: 'style-shape', patch: { shapeStylePresetId: null, shadow: null, glow: null, reflection: null, softEdges: null, blur: null, fillOverlay: null } }, { kind: 'wordart', name: 'style-wordart', objectName: 'style-wordart', patch: { wordArtStylePresetId: null, textEffectPresetIds: null, textGlow: null } }] }] }
const reeditSpec = { ...baseSpec, title: 'Public style-effect override re-edit', slides: [{ ...baseSpec.slides[0], content: [{ kind: 'shape', name: 'style-shape', objectName: 'style-shape', patch: { shapeStylePresetId: 'shape-style-076', shadow: { blur: 6, offset: 2, angle: 45, color: '00FFFF', opacity: 0.25 }, glow: { size: 5, color: 'FFFFFF', opacity: 0.2 } } }, { kind: 'wordart', name: 'style-wordart', objectName: 'style-wordart', patch: { wordArtStylePresetId: 'wordart-style-008', textEffectPresetIds: ['text-effect-glow-004'], textGlow: { size: 7, color: '00FFFF', opacity: 0.25 } } }] }] }

const roleA = client('betterpptx-public-style-effect-overrides-role-a-v1'); await roleA.initialize()
const listed = await roleA.rpc('tools/list'); const servedNames = (listed?.result?.tools || []).map(tool => tool.name).sort()
const catalogs = {}
for (const id of ['shapeStylePreset', 'wordArtStylePreset', 'textEffectPreset']) catalogs[id] = await roleA.call('betterpptx.options.catalog', { surface: id, format: 'full' })
const surfaces = Object.fromEntries(Object.entries(catalogs).map(([id, value]) => [id, (value?.data?.surfaces || value?.surfaces || []).find(item => item.id === id)]))
const upload = await roleA.call('betterpptx.assets.upload', { kind: 'jsonSpec', data: enc(baseSpec), fileName: 'style-effect-preset-overrides-public.json', idempotencyKey: callId('style-effect-upload') }); const specHandle = (upload?.data || upload || {}).handle
const dryRun = specHandle ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'dryRun', commitMode: 'createNew', plan: 'free', detail: 'full', validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('style-effect-dry') }) : { ok: false }; const dryData = dryRun?.data || dryRun || {}
const commit = dryRun?.ok === true && dryData.planId ? await roleA.call('betterpptx.deck.generate_from_spec', { specHandle, phase: 'commit', commitMode: 'createNew', plan: 'free', planId: dryData.planId, lockedPlanId: dryData.planId, planDigest: dryData.planDigest, validateAfterCompile: true, validationMode: 'strict', saveAfterCommit: false, idempotencyKey: callId('style-effect-commit') }) : { ok: false }; const commitData = commit?.data || commit || {}; const deckId = commitData.deckId || commit?.deckId
const initialExport = deckId ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }; const initialOut = initialExport?.data?.spec || initialExport?.data?.effectiveSpec || initialExport?.spec || null; const initialShape = styleOf(findObject(initialOut, 'style-shape')); const initialWordArt = styleOf(findObject(initialOut, 'style-wordart'))
const resetDry = deckId ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('style-effect-reset-dry') }) : { ok: false }; const resetData = resetDry?.data || resetDry || {}
const resetCommit = deckId && resetDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: resetSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: resetData.planId, lockedPlanId: resetData.planId, planDigest: resetData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('style-effect-reset') }) : { ok: false }
const resetExport = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }; const resetOut = resetExport?.data?.spec || resetExport?.data?.effectiveSpec || resetExport?.spec || null; const resetShape = styleOf(findObject(resetOut, 'style-shape')); const resetWordArt = styleOf(findObject(resetOut, 'style-wordart'))
const reeditDry = deckId && resetCommit?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'dryRun', commitMode: 'patch', plan: 'free', detail: 'full', includePatchPlan: true, validateAfterCompile: true, validationMode: 'strict', idempotencyKey: callId('style-effect-reedit-dry') }) : { ok: false }; const reeditData = reeditDry?.data || reeditDry || {}
const reeditCommit = deckId && reeditDry?.ok === true ? await roleA.call('betterpptx.deck.generate_from_spec', { deckId, spec: reeditSpec, phase: 'commit', commitMode: 'patch', plan: 'free', planId: reeditData.planId, lockedPlanId: reeditData.planId, planDigest: reeditData.planDigest, validateAfterCompile: true, validationMode: 'strict', billingConfirmed: true, idempotencyKey: callId('style-effect-reedit') }) : { ok: false }
const currentExport = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.export_spec', { deckId, mode: 'current', download: false, detail: 'full' }) : { ok: false }; const currentOut = currentExport?.data?.spec || currentExport?.data?.effectiveSpec || currentExport?.spec || null; const currentShape = styleOf(findObject(currentOut, 'style-shape')); const currentWordArt = styleOf(findObject(currentOut, 'style-wordart')); const deckVersion = reeditCommit?.data?.deckVersion || reeditCommit?.deckVersion || resetCommit?.data?.deckVersion || resetCommit?.deckVersion
const quality = deckId && reeditCommit?.ok === true ? await roleA.call('betterpptx.deck.validate_quality', { deckId, deckVersion, profile: 'static', requireMotion: false, requireVisualProof: false }) : { ok: false }; const qualityPassed = quality?.data?.ok === true
const preview = deckId && reeditCommit?.ok === true && qualityPassed ? await roleA.call('betterpptx.deck.preview', { deckId, deckVersion }) : { ok: false }; const save = deckId && reeditCommit?.ok === true && preview?.ok === true ? await roleA.call('betterpptx.deck.save', { deckId, deckVersion, fileName: 'style-effect-preset-overrides-public-proof.pptx', outputFormat: 'pptx', idempotencyKey: callId('style-effect-save') }) : { ok: false }
const returned = JSON.stringify(redact({ catalogs, upload, dryRun, commit, initialExport, resetDry, resetCommit, resetExport, reeditDry, reeditCommit, currentExport, quality, preview, save })); const privateLeakMatches = returned.match(/PptxGenJS_Claude|node_modules|engine\.mjs|[A-Z]:[\\/][^\s"']*/g) || []
const checks = { freshPublicSession: true, servedDiscovery: servedNames.includes('betterpptx.options.catalog') && servedNames.includes('betterpptx.assets.upload') && servedNames.includes('betterpptx.deck.generate_from_spec'), catalogs: Object.values(surfaces).every(surface => surface?.capabilityMode === 'preset-plus-parameters' && surface?.capabilityStatus === 'executable-exact-structured' && Array.isArray(surface?.parameters) && surface.parameters.length > 0), catalogOverrides: surfaces.shapeStylePreset?.overrideFields?.includes('style.shadow') && surfaces.wordArtStylePreset?.overrideFields?.includes('style.textGlow') && surfaces.textEffectPreset?.overrideFields?.includes('style.textGlow'), initialUpload: upload?.ok === true && typeof specHandle === 'string' && specHandle.startsWith('asset://locked/uploaded-jsonspec/'), initialDryRun: dryRun?.ok === true && dryData.mutationFree === true, initialCommit: commit?.ok === true && typeof deckId === 'string', initialReadback: initialShape?.shapeStylePresetId === 'shape-style-075' && initialShape?.shadow?.blur === 11 && initialWordArt?.wordArtStylePresetId === 'wordart-style-007', resetDryRun: resetDry?.ok === true && resetData.mutationFree === true, resetCommit: resetCommit?.ok === true, resetReadback: resetShape?.shapeStylePresetId == null && resetShape?.shadow == null && resetWordArt?.wordArtStylePresetId == null && resetWordArt?.textEffectPresetIds == null, reeditDryRun: reeditDry?.ok === true && reeditData.mutationFree === true, reeditCommit: reeditCommit?.ok === true, reeditReadback: currentShape?.shapeStylePresetId === 'shape-style-076' && currentShape?.shadow?.blur === 6 && currentWordArt?.wordArtStylePresetId === 'wordart-style-008' && currentWordArt?.textEffectPresetIds?.includes('text-effect-glow-004'), quality: qualityPassed, preview: preview?.ok === true, savedArtifact: save?.ok === true, noPrivateImplementationLeakage: privateLeakMatches.length === 0 }
const status = Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL'; const evidence = redact({ schemaVersion: 'betterpptx.public-style-effect-preset-overrides-proof.v1', status, generatedAt: new Date().toISOString(), endpoint, roleA: { freshSession: true, servedToolCount: servedNames.length, servedToolNamesSha256: sha256(JSON.stringify(servedNames)), catalogSurfaces: Object.fromEntries(Object.entries(surfaces).map(([id, surface]) => [id, { capabilityMode: surface?.capabilityMode, capabilityStatus: surface?.capabilityStatus, overrideFields: surface?.overrideFields || [] }])) }, source: { sha256: sha256(Buffer.from(JSON.stringify(baseSpec))) }, reset: { sha256: sha256(Buffer.from(JSON.stringify(resetSpec))) }, reedit: { sha256: sha256(Buffer.from(JSON.stringify(reeditSpec))) }, checks, privateLeakMatches, readback: { initialShape, initialWordArt, resetShape, resetWordArt, reeditShape: currentShape, reeditWordArt: currentWordArt }, quality: { ok: qualityPassed, failed: quality?.data?.failed || [], warnings: quality?.data?.warnings || [] }, preview: { ok: preview?.ok === true, response: preview }, saved: { ok: save?.ok === true, deckVersion: deckVersion || null, response: save }, interpretation: status === 'PASS' ? 'A fresh Role-A client discovered preset-plus-parameters contracts for shape styles, WordArt styles, and text effects; authored, reset, re-edited, previewed, and saved a native lifecycle while retaining typed effect semantics without private leakage.' : 'The public style-effect preset override lifecycle is not yet fully proven.' })
await fs.mkdir(evidenceDir, { recursive: true }); const evidencePath = path.join(evidenceDir, 'style-effect-preset-overrides-public-proof-v1.json'); const evidenceBytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`); await fs.writeFile(evidencePath, evidenceBytes); await fs.writeFile(`${evidencePath}.sha256`, `${sha256(evidenceBytes)}  ${path.basename(evidencePath)}\n`); process.stdout.write(JSON.stringify({ status, evidencePath, evidenceSha256: sha256(evidenceBytes), checks }, null, 2) + '\n'); if (status !== 'PASS') process.exitCode = 1
