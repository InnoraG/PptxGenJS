// G1 committed leak-fixture gate. These fixtures are intentionally dirty test inputs;
// they prove that the public result/schema/path/sidecar boundaries catch the known leak classes.
// No network, credentials, customer image, or external AI is used.
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..')
Object.assign(process.env, {
	BETTERPPTX_PUBLIC_BLACK_BOX: '1',
	BETTERPPTX_PUBLIC_SPEC_ONLY: '1',
	BETTERPPTX_ASSETS_ROOT: repo,
})

const blackbox = await import('./blackbox.mjs')
const vocab = await import('./blackbox-vocabulary.mjs')
const JSZip = (await import('jszip')).default
const fixture = JSON.parse(await fs.readFile(path.join(here, 'fixtures', 'g1-blackbox-leak-fixtures.json'), 'utf8'))
const banned = /PptxGenJS|node\.js|express|dependenc(?:y|ies)|source code|cwd|pid|execPath|argv|local filesystem|filesystem path|server filesystem|trellis|unirig|flux[-.\s]?(?:1|2|schnell)|klein\s*4b|black-forest-labs|huggingface|modal\s+l40s|\bl40s\b|workers\s+ai|gen:\/\/(?:trellis|flux)\//i

let pass = 0
let fail = 0
const ok = (name, condition, detail = '') => {
	if (condition) { pass++; console.log(`  ok   ${name}`) }
	else { fail++; console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}
const json = value => JSON.stringify(value)

console.log('G1 COMMITTED BLACK-BOX LEAK FIXTURES:')
ok('fixture schema is the committed v3 multi-asset/version corpus', fixture.schemaVersion === 'betterpptx.g1-blackbox-leak-fixtures.v3')
ok('fixture includes all dirty boundary classes', Boolean(fixture.result && fixture.tool && fixture.pathArgs && fixture.sidecarPayload && fixture.corpus))

const sanitized = blackbox.sanitizePublicResult(fixture.result)
ok('dirty result fixture is sanitized without implementation vocabulary', !banned.test(json(sanitized)), json(sanitized))
ok('opaque generation handle survives result sanitation', sanitized.handle === fixture.result.handle)

const listed = blackbox.publicToolList([fixture.tool])
const listedTool = listed.find(tool => tool.name === fixture.tool.name)
ok('dirty tool fixture remains on the public allowlist', Boolean(listedTool))
const publicProperties = Object.keys(listedTool?.inputSchema?.properties || {})
ok('dirty tool fixture strips provider/model/path schema and description terms', listedTool && !banned.test(json(listedTool)) && !publicProperties.some(key => /^(provider|model|sourcePath|outputDir)$/i.test(key)), json(listedTool))

let pathRejected = false
try { blackbox.assertNoPublicLocalPathArgs(fixture.pathArgs) } catch { pathRejected = true }
ok('dirty path fixture fails closed', pathRejected)

let variantPathRejected = false
try { blackbox.assertNoPublicLocalPathArgs(fixture.pathArgs) } catch { variantPathRejected = true }
ok('case and underscore path variants also fail closed', variantPathRejected)

const variantSanitized = blackbox.sanitizePublicResult(fixture.caseVariantResult)
ok('case and underscore result keys cannot expose private provenance', !/(private-provider|private-model|engine\.mjs|L40S|secret-revision|compute service)/i.test(json(variantSanitized)) && variantSanitized.handle === fixture.caseVariantResult.handle, json(variantSanitized))

const variantTools = blackbox.publicToolList([fixture.caseVariantTool])
const variantGeneration = variantTools.find(tool => tool.name === fixture.caseVariantTool.name)
const variantProperties = Object.keys(variantGeneration?.inputSchema?.properties || {})
ok('case and underscore schema keys are removed', variantGeneration && !variantProperties.some(key => /provider|model|source.?path/i.test(key)), json(variantGeneration))

const nestedSanitized = blackbox.sanitizePublicResult(fixture.corpus.nestedResult)
ok('nested corpus result is scrubbed across arrays, metadata, filenames, and avatar diagnostics',
	!banned.test(json(nestedSanitized)) &&
	!/ProviderName|model_revision|localPath|X-Pipeline|pipeline|private-provider|private-model-revision|worker\.mjs/i.test(json(nestedSanitized)) &&
	nestedSanitized.result?.[0]?.artifact?.download === 'gen://video/avatar123', json(nestedSanitized))

const nestedTools = blackbox.publicToolList([fixture.corpus.nestedTool])
const nestedTool = nestedTools.find(tool => tool.name === fixture.corpus.nestedTool.name)
ok('nested corpus schema is scrubbed across renamed runtime/provider/path fields',
	nestedTool && !/providerName|model_revision|localPath|gpu_type|privateAssetPath/i.test(json(nestedTool)), json(nestedTool))

const packageProbe = new JSZip()
packageProbe.file('ppt/slides/slide1.xml', fixture.corpus.packageText.slide)
packageProbe.file('ppt/notesSlides/notesSlide1.xml', fixture.corpus.packageText.notes)
packageProbe.file('ppt/charts/chart1.xml', fixture.corpus.packageText.chart)
const packageBefore = await vocab.validatePublicAvatarDiagnosticsFromZip(packageProbe)
const packageScrubHits = await vocab.scrubPublicAvatarDiagnostics(packageProbe)
const packageAfter = await vocab.validatePublicAvatarDiagnosticsFromZip(packageProbe)
ok('committed package corpus is detected, scrubbed, and revalidated across slide/notes/chart parts',
	!packageBefore.ok && packageBefore.issueCount >= 3 && Object.keys(packageScrubHits).length === 3 && packageAfter.ok,
	JSON.stringify({ before: packageBefore.issueCount, scrubbed: packageScrubHits, after: packageAfter.issueCount }))

const downloadSanitized = blackbox.sanitizePublicResult({
	artifact: { fileName: 'liveportrait-musetalk-restoreformer++-canary.pptx', downloadName: 'gen://video/avatar123' },
	metadata: { providerExecutionId: 'private-execution-id', headers: { 'X-Pipeline': 'liveportrait-musetalk-commercial' } },
})
ok('download metadata corpus preserves opaque handles but removes private execution fields',
	!banned.test(json(downloadSanitized)) &&
	!/providerExecutionId|X-Pipeline|pipeline|private-execution-id/i.test(json(downloadSanitized)) &&
	downloadSanitized.artifact?.downloadName === 'gen://video/avatar123', json(downloadSanitized))

const matrixSanitized = blackbox.sanitizePublicResult(fixture.corpus.assetVersionMatrix)
const safeHandles = fixture.corpus.assetVersionMatrix.safeHandles
const providerBearingHandles = fixture.corpus.assetVersionMatrix.providerBearingHandles
ok('multi-asset/version corpus preserves safe opaque handles and revisions',
	safeHandles.every(handle => matrixSanitized.safeHandles?.includes(handle)) &&
	matrixSanitized.revisions?.length === fixture.corpus.assetVersionMatrix.revisions.length &&
	matrixSanitized.revisions.every(item => /^asset-revision:\/\//.test(item.assetRevision)), json(matrixSanitized))
ok('provider-bearing handle schemes are rewritten in every asset/version variant',
	!banned.test(json(matrixSanitized)) && providerBearingHandles.every(handle => !json(matrixSanitized).includes(handle)) &&
	!json(matrixSanitized).includes('gen://trellis/') && !json(matrixSanitized).includes('gen://flux/'), json(matrixSanitized))

const dirtyPayload = JSON.stringify(fixture.sidecarPayload)
const directHits = vocab.findTechStackInText(dirtyPayload)
ok('dirty sidecar fixture is recognized by the structural vocabulary scanner', directHits.length >= 3, directHits)

const zip = new JSZip()
const encoded = zlib.deflateRawSync(Buffer.from(dirtyPayload)).toString('base64')
zip.file('ppt/betterpptx-edition.xml', `<?xml version="1.0"?><betterpptxEdition xmlns="urn:betterpptx" enc="dfl.b64">${encoded}</betterpptxEdition>`)
const scan = await vocab.validateTechStackVocabularyFromZip(zip)
ok('dirty encoded sidecar fixture is caught after decode', scan.ok === false && scan.issues.some(issue => issue.scope === 'decoded sidecar payload'), scan.issues)

const cleanZip = new JSZip()
cleanZip.file('ppt/betterpptx-edition.xml', '<betterpptxEdition xmlns="urn:betterpptx" enc="dfl.b64"></betterpptxEdition>')
const cleanScan = await vocab.validateTechStackVocabularyFromZip(cleanZip)
ok('empty clean sidecar control remains certifiable', cleanScan.ok === true)

const report = {
	schemaVersion: 'betterpptx.g1-blackbox-fixtures.v3',
	fixturePath: 'betterpptx-mcp/fixtures/g1-blackbox-leak-fixtures.json',
	publicMode: true,
	network: false,
	customerImages: false,
	externalAi: false,
	checks: pass,
	failures: fail,
}
await fs.mkdir(path.join(here, 'outputs'), { recursive: true })
await fs.writeFile(path.join(here, 'outputs', 'g1-blackbox-fixtures-report.json'), JSON.stringify(report, null, 2) + '\n')
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
