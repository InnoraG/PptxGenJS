import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const galleryDir = path.join(here, 'public-authoring-environment', 'gallery')
const sampleIds = Object.freeze(['dimensional-typography', 'layered-motion', 'custom-process', 'chart-emphasis', 'connected-object-identity', 'restrained-flat'])

export function publicGalleryResources() {
	return [
		{ uri: 'betterpptx://gallery/index', name: 'visual-learning-gallery', title: 'Visual learning gallery', description: 'Release-qualified teaching samples with exact native source specifications, evidence bindings, descriptions, and limitations.', mimeType: 'application/json' },
		...sampleIds.flatMap(id => [
			{ uri: `betterpptx://gallery/${id}/source`, name: `${id}-source`, title: `${id} native source`, description: 'Exact editable teaching specification used to generate this sample.', mimeType: 'application/json' },
			{ uri: `betterpptx://gallery/${id}/thumbnail`, name: `${id}-thumbnail`, title: `${id} PowerPoint thumbnail`, description: 'Static release-qualification thumbnail; this is a catalog lesson, not a preview of the current user deck.', mimeType: 'image/png' },
		]),
	]
}

export async function readPublicGalleryResource(uri) {
	if (uri === 'betterpptx://gallery/index') return { text: await readFile(path.join(galleryDir, 'gallery-index.v1.json'), 'utf8') }
	const match = /^betterpptx:\/\/gallery\/([a-z0-9-]+)\/(source|thumbnail)$/.exec(String(uri || ''))
	if (!match || !sampleIds.includes(match[1])) return null
	if (match[2] === 'source') return { text: await readFile(path.join(galleryDir, 'sources', `${match[1]}.json`), 'utf8') }
	return { blob: (await readFile(path.join(galleryDir, 'assets', `${match[1]}.png`))).toString('base64') }
}
