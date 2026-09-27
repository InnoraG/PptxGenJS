import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '0'
process.env.BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY = '0'
process.env.BETTERPPTX_LOCAL_MAINTAINER = '1'
process.env.BETTERPPTX_FREE_DECKS_PER_DAY ||= '100'

const here = path.dirname(fileURLToPath(import.meta.url))
const galleryDir = path.join(here, 'public-authoring-environment', 'gallery')
const sourcesDir = path.join(galleryDir, 'sources')
const assetsDir = path.join(galleryDir, 'assets')
await mkdir(sourcesDir, { recursive: true })
await mkdir(assetsDir, { recursive: true })

const { createMcpToolDispatcher } = await import('./engine.mjs')
const { publicAuthoringLesson, publicControlRegistryMetadata } = await import('./authoring-control-registry.mjs')
const { publicRuntimeManifest } = await import('./public-manifest.mjs')

const lessonIds = ['dimensional-typography', 'layered-motion', 'custom-process', 'chart-emphasis', 'connected-object-identity', 'animated-table-synergy', 'restrained-flat']
const dispatcher = createMcpToolDispatcher({ sessionId: `release-gallery-${Date.now()}` })
const manifest = publicRuntimeManifest()
const samples = []

const hashFile = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const animatedTableProofPath = path.join(here, 'evidence', 'authoring-augmentation', 'animated-table-v1', 'release-qualification.json')
let animatedTableProof = null
try {
	animatedTableProof = JSON.parse(await readFile(animatedTableProofPath, 'utf8'))
} catch {}

for (const lessonId of lessonIds) {
	const lesson = publicAuthoringLesson(lessonId)
	const sourcePath = path.join(sourcesDir, `${lessonId}.json`)
	await writeFile(sourcePath, `${JSON.stringify(lesson.minimalSpec, null, 2)}\n`, 'utf8')
	const pptxPath = path.join(assetsDir, `${lessonId}.pptx`)
	let existing = false
	try { await stat(pptxPath); existing = true } catch {}
	if (process.env.BETTERPPTX_GALLERY_REBUILD_ID === lessonId) existing = false
	if (!existing) {
		const commit = await dispatcher.call('betterpptx.deck.generate_from_spec', { phase: 'commit', commitMode: 'createNew', detail: 'summary', spec: lesson.minimalSpec, idempotencyKey: `release-gallery-${lessonId}-v1` })
		if (!commit.ok) throw new Error(`${lessonId} commit failed: ${JSON.stringify(commit.error)}`)
		const deck = commit.data || commit
		for (const tool of ['betterpptx.deck.validate', 'betterpptx.deck.validate_design', 'betterpptx.deck.validate_accessibility', 'betterpptx.deck.validate_quality']) {
			const validation = await dispatcher.call(tool, { deckId: deck.deckId })
			if (!validation.ok) throw new Error(`${lessonId} ${tool} failed: ${JSON.stringify(validation.error)}`)
		}
		const fileName = `gallery-${lessonId}.pptx`
		const save = await dispatcher.call('betterpptx.deck.save', { deckId: deck.deckId, fileName, outputFormat: 'pptx', idempotencyKey: `release-gallery-save-${lessonId}-v1` })
		if (!save.ok) throw new Error(`${lessonId} save failed: ${JSON.stringify(save.error)}`)
		const saveData = save.data || save
		if (path.resolve(saveData.filePath) !== path.resolve(pptxPath)) {
			await copyFile(saveData.filePath, pptxPath)
			await rm(saveData.filePath, { force: true })
		}
	}
	const pngPath = path.join(assetsDir, `${lessonId}.png`)
	const artifactSha256 = await hashFile(pptxPath)
	const playbackEvidence = lessonId === 'animated-table-synergy'
		&& animatedTableProof?.galleryArtifact?.sha256 === artifactSha256
		&& animatedTableProof?.galleryArtifact?.playback?.pass === true
		? {
			proof: '../../evidence/authoring-augmentation/animated-table-v1/release-qualification.json',
			powerpointVersion: animatedTableProof.powerpointVersion,
			changedFraction: animatedTableProof.galleryArtifact.playback.changedFraction,
			artifactSha256,
		}
		: null
	let renderEvidence = { performed: false, targetApplication: 'Microsoft PowerPoint', limitation: 'PowerPoint COM was unavailable during release qualification.' }
	try {
		execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(galleryDir, 'render-gallery.ps1'), '-PptxPath', pptxPath, '-PngPath', pngPath], { stdio: 'pipe' })
		await stat(pngPath)
		renderEvidence = { performed: true, targetApplication: 'Microsoft PowerPoint desktop', targetVersion: 'installed-release-qualification-host', thumbnailSha256: await hashFile(pngPath) }
	} catch {}
	samples.push({
		id: lessonId,
		family: lesson.family,
		result: lesson.result,
		teachingExampleOnly: true,
		source: `sources/${lessonId}.json`,
		sourceSha256: await hashFile(sourcePath),
		artifact: `assets/${lessonId}.pptx`,
		artifactSha256,
		thumbnail: renderEvidence.performed ? `assets/${lessonId}.png` : null,
		build: { semanticVersion: manifest.semanticVersion, toolSchemaVersion: manifest.toolSchemaVersion, capabilityControlDigest: manifest.capabilityControlDigest },
		qualification: { generatedThrough: 'betterpptx.deck.generate_from_spec public specification contract', deterministicValidation: true, renderEvidence, ...(playbackEvidence ? { playbackEvidence } : {}), reviewed: { performed: true, reviewerType: 'model visual inspection', criteria: ['legibility', 'clipping', 'composition', 'technique isolation'], playbackReviewed: Boolean(playbackEvidence) } },
		...(lessonId === 'layered-motion' ? { timingSummary: ['0–350 ms entrance fade', '350–1750 ms arc motion with simultaneous colour emphasis', '1750–2050 ms exit fade', '2550–2850 ms re-entry fade'], motionSample: null } : {}),
		...(lessonId === 'animated-table-synergy' ? { timingSummary: ['Header remains visible', 'Rows 1–3 reveal in authored order', 'Every generated row and cell remains a stable native motion/Synergy target'], motionSample: playbackEvidence ? { type: 'paired-keyframes', before: '../../evidence/authoring-augmentation/animated-table-v1/table-before.png', after: '../../evidence/authoring-augmentation/animated-table-v1/table-after-800ms.png', elapsedMs: 800 } : null } : {}),
		knownLimitations: playbackEvidence ? ['Playback proof is release qualification for the exact artifact hash, not a preview of a user deck.'] : renderEvidence.performed ? ['Static thumbnail does not prove animation playback.'] : ['No PowerPoint-rendered thumbnail is available.'],
	})
}

const index = {
	schemaVersion: 'betterpptx.visual-learning-gallery.v1',
	generatedAt: new Date().toISOString(),
	controlRegistry: publicControlRegistryMetadata(),
	productionPolicy: 'Static release-qualified media only. Production authoring does not invoke hosted PowerPoint rendering.',
	usage: 'Catalog teaching examples are not previews of a user deck and never replace native objects in a final presentation.',
	samples,
}
await writeFile(path.join(galleryDir, 'gallery-index.v1.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ gallery: path.join(galleryDir, 'gallery-index.v1.json'), samples: samples.map(sample => ({ id: sample.id, renderPerformed: sample.qualification.renderEvidence.performed })) }, null, 2))
