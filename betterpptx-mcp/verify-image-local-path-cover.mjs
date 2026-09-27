// Regression for semantic cover sizing after a stock/remote raster has been
// materialized to a private local path. The source aspect ratio must reach the
// serializer so cover produces a real crop instead of a zero srcRect.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import JSZip from 'jszip'
import sharp from 'sharp'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_ALLOW_PRIMITIVE_TOOLS = '1'
process.env.BETTERPPTX_FREE_PREVIEW_SLIDES = '99'
process.env.BETTERPPTX_BILLING_ENFORCE = '0'

const { createMcpToolDispatcher } = await import('./engine.mjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const outputDir = path.join(here, 'outputs', 'image-local-path-cover')
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bpx-local-cover-'))
const sourcePath = path.join(tempDir, 'source-3x2.png')
const savedPath = path.join(tempDir, 'local-path-cover.pptx')
fs.mkdirSync(outputDir, { recursive: true })

await sharp({ create: { width: 300, height: 200, channels: 4, background: '#176B87' } }).png().toFile(sourcePath)

const spec = {
	schemaVersion: 'betterpptx.deck-spec.v1',
	title: 'Local-path semantic cover regression',
	authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic', coordinateSystem: 'inches', layerModel: 'flat-object-array', objectIdentity: 'stable-names-required' },
	contentStory: { audience: 'maintainers', outcome: 'verify materialized raster sizing', remember: 'cover uses the real source aspect ratio' },
	visualDesign: { world: 'Quiet verification canvas', framing: 'one image proof' },
	motionTime: { masterClock: 'authored slide timeline', timingSource: 'Authoring Excellence Motion/Time plan', syncPolicy: 'one governed clock' },
	layout: 'LAYOUT_WIDE',
	slides: [{
		id: 'local-cover', title: 'Materialized image cover', role: 'evidence', message: 'Cover framing retains source dimensions.', layoutIntent: 'title-body', notes: 'Owned synthetic raster.',
		content: [
			{ kind: 'title', name: 'local-cover-title', text: 'Materialized image cover' },
			{ kind: 'image', name: 'local-cover-image', image: sourcePath, region: 'body', imageOptions: { sizing: { type: 'cover' } }, altText: 'Owned synthetic three-by-two raster cropped into the engine-owned body region.' },
		],
	}],
}

const dispatcher = createMcpToolDispatcher({ __skipDurableOperationLedger: true })
const context = { __skipDurableOperationLedger: true, clientInfo: { name: 'image-local-path-cover-proof' } }
const unwrap = (label, result) => {
	if (!result?.ok) throw new Error(`${label} failed: ${JSON.stringify(result)}`)
	return result.data || result
}

const generated = unwrap('generate_from_spec', await dispatcher.call('betterpptx.deck.generate_from_spec', { spec, phase: 'commit', commitMode: 'createNew', plan: 'free', detail: 'summary' }, context))
unwrap('deck.validate', await dispatcher.call('betterpptx.deck.validate', { deckId: generated.deckId }, context))
unwrap('deck.validate_accessibility', await dispatcher.call('betterpptx.deck.validate_accessibility', { deckId: generated.deckId }, context))
unwrap('deck.validate_quality', await dispatcher.call('betterpptx.deck.validate_quality', { deckId: generated.deckId }, context))
unwrap('deck.save', await dispatcher.call('betterpptx.deck.save', { deckId: generated.deckId, fileName: path.basename(savedPath), outputDir: tempDir }, context))
const zip = await JSZip.loadAsync(fs.readFileSync(savedPath), { checkCRC32: true })
const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string') || ''
const srcRect = slideXml.match(/<a:srcRect\s+([^>]+)\/>/)?.[1] || ''
const crop = Object.fromEntries(['l', 'r', 't', 'b'].map(key => [key, Number(srcRect.match(new RegExp(`\\b${key}="(-?\\d+)"`))?.[1] || 0)]))

assert(srcRect, 'Semantic cover did not serialize a source crop rectangle.')
assert(Object.values(crop).some(value => Math.abs(value) > 0), `Materialized local path produced a zero crop: ${JSON.stringify(crop)}`)
assert(crop.t > 0 && crop.b > 0, `Three-by-two source should crop vertically into the wide body region: ${JSON.stringify(crop)}`)

const artifact = path.join(outputDir, 'local-path-cover.pptx')
fs.copyFileSync(savedPath, artifact)
fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify({ status: 'PASS', source: { width: 300, height: 200 }, crop, artifact }, null, 2) + '\n')
try { await dispatcher.call('betterpptx.deck.dispose', { deckId: generated.deckId }, context) } catch {}
fs.rmSync(tempDir, { recursive: true, force: true })
console.log(JSON.stringify({ status: 'PASS', crop, artifact }, null, 2))
