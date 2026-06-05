import * as fs from 'fs'
import * as path from 'path'

import { proceduralAssetTemplates } from './procedural-assets.js'

export interface AssetCatalogItem {
	handle: string
	category: 'stock' | 'icons' | 'models3d' | 'audio' | 'video' | 'textures' | 'datasets' | 'shape-scenes'
	src: string
	preview?: string
	altText?: string
	tags?: string[]
	usage?: string
	source?: string
	sourceKey?: string
	sourceLabel?: string
	sourceCategory?: string
	sourcePriority?: number
	bytes?: number
	sizeMiB?: number
	sizeTier?: 'tiny' | 'small' | 'standard' | 'balanced' | 'large' | 'oversized'
	license?: string
	sourceUrl?: string
	attribution?: string
	proceduralKind?: string
	metadata?: Record<string, unknown>
}

const PREMIUM_3D_ASSETS: Array<{ id: string; poster: string; altText: string; tags: string[]; usage: string }> = [
	{
		id: 'orbit-torus',
		poster: 'orbit-torus.png',
		altText: 'Glossy 3D torus model with bright studio lighting',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'abstract', 'showcase', 'hero'],
		usage: 'large native 3D hero object, orbit scenes, morph pairs, dashboard accents',
	},
	{
		id: 'ribbon-wave',
		poster: 'ribbon-wave.png',
		altText: 'Glossy 3D ribbon wave model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'abstract', 'motion', 'wordart'],
		usage: 'motion-path scenes, kinetic section openers, creative flow diagrams',
	},
	{
		id: 'curved-cylinder',
		poster: 'curved-cylinder.png',
		altText: 'Curved 3D cylinder segment model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'abstract', 'shape-built'],
		usage: 'custom-shape parity scenes, geometry labs, premium analytical fixtures',
	},
	{
		id: 'magenta-cone',
		poster: 'magenta-cone.png',
		altText: 'Magenta 3D cone segment model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'abstract', 'geometry'],
		usage: '3D shape-style lab, bevel/extrusion reference, dimensional icon scenes',
	},
	{
		id: 'growth-arrow',
		poster: 'growth-arrow.png',
		altText: '3D upward trend arrow model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'dashboard', 'analytics', 'hero'],
		usage: 'executive dashboards, growth narratives, KPI and data-story slides',
	},
	{
		id: 'blue-presenter',
		poster: 'blue-presenter.png',
		altText: 'Blue 3D presenter figure model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'presenter', 'scenario'],
		usage: 'speaker/narration scenes, customer journey, live product walkthrough slides',
	},
	{
		id: 'gold-presenter',
		poster: 'gold-presenter.png',
		altText: 'Gold 3D presenter figure model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'presenter', 'scenario'],
		usage: 'contrast scenes, dual-presenter storyboards, premium service explanation slides',
	},
	{
		id: 'magenta-cylinder',
		poster: 'magenta-cylinder.png',
		altText: 'Magenta 3D cylinder model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'abstract', 'geometry'],
		usage: 'object gallery scenes, dimensional shape labs, 3D material comparison',
	},
	{
		id: 'orange-dome',
		poster: 'orange-dome.png',
		altText: 'Orange 3D dome segment model',
		tags: ['3d', 'glb', 'model', 'premium', 'reference', 'abstract', 'geometry'],
		usage: 'shape-built analytics, gauge/progress scenes, dimensional iconography',
	},
]

const MICROSOFT_STOCK3D_SOURCE = 'microsoft-powerpoint-stock-3d'
const ICONSCOUT_SOURCE = 'iconscout-private'
const TOXSAM_SOURCE = 'toxsam-open-source-3d'
const TOXSAM_QUALITY_SOURCE = 'toxsam-open-source-3d-quality'
const BYTES_PER_MIB = 1024 * 1024
const DEMO_ASSET_ROOT_ALIASES: Record<string, string[]> = {
	'betterpptx-mcp-online-assets': ['betterpptx-online-assets'],
	'betterpptx-mcp-private-assets': ['betterpptx-private-assets'],
	'betterpptx-mcp-premium-assets': ['betterpptx-premium-assets'],
	'betterpptx-mcp-reference-assets': ['betterpptx-reference-assets'],
	'betterpptx-online-assets': ['betterpptx-mcp-online-assets'],
	'betterpptx-private-assets': ['betterpptx-mcp-private-assets'],
	'betterpptx-premium-assets': ['betterpptx-mcp-premium-assets'],
	'betterpptx-reference-assets': ['betterpptx-mcp-reference-assets'],
}

function uniqueStrings(values: unknown[]): string[] {
	return [...new Set(values
		.flatMap(value => Array.isArray(value) ? value : [value])
		.map(value => String(value || '').trim())
		.filter(Boolean))]
}

function safeSlug(value: unknown, fallback = 'asset'): string {
	const slug = String(value || fallback)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
	return slug || fallback
}

function readJsonFile(filePath: string): any {
	try {
		return JSON.parse(fs.readFileSync(filePath, 'utf8'))
	} catch {
		return null
	}
}

function resolveDemoAssetRoot(repoRoot: string, preferredName: string, ...rest: string[]): string {
	const names = uniqueStrings([preferredName, DEMO_ASSET_ROOT_ALIASES[preferredName] || []])
	for (const name of names) {
		const candidate = path.join(repoRoot, 'demos', name, ...rest)
		if (fs.existsSync(candidate)) return candidate
	}
	return path.join(repoRoot, 'demos', preferredName, ...rest)
}

function resolveRepoAssetPath(repoRoot: string, filePath: string): string {
	if (path.isAbsolute(filePath)) return filePath
	const primary = path.resolve(repoRoot, filePath)
	if (fs.existsSync(primary)) return primary
	const normalized = filePath.replace(/\\/g, '/')
	const demoRoot = normalized.match(/^demos\/(betterpptx(?:-mcp)?-[^/]+)(\/.*)$/)
	if (demoRoot) {
		const aliases = DEMO_ASSET_ROOT_ALIASES[demoRoot[1]] || []
		for (const alias of aliases) {
			const candidate = path.resolve(repoRoot, 'demos', alias + demoRoot[2])
			if (fs.existsSync(candidate)) return candidate
		}
	}
	return primary
}

function modelSizeTier(bytes: number): AssetCatalogItem['sizeTier'] {
	const mib = bytes / BYTES_PER_MIB
	if (mib <= 1) return 'tiny'
	if (mib <= 5) return 'small'
	if (mib <= 10) return 'standard'
	if (mib <= 15) return 'balanced'
	if (mib <= 25) return 'large'
	return 'oversized'
}

function fileSizeFields(filePath: string): Pick<AssetCatalogItem, 'bytes' | 'sizeMiB' | 'sizeTier'> | undefined {
	try {
		const bytes = fs.statSync(filePath).size
		return {
			bytes,
			sizeMiB: Math.round((bytes / BYTES_PER_MIB) * 100) / 100,
			sizeTier: modelSizeTier(bytes),
		}
	} catch {
		return undefined
	}
}

function withAssetSizeMetadata(item: AssetCatalogItem): AssetCatalogItem {
	const stats = fileSizeFields(item.src)
	if (!stats) return item
	const sizeTags = item.category === 'models3d'
		? [stats.sizeTier, `${stats.sizeTier}-glb`, Number(stats.sizeMiB || 0) <= 10 ? 'deck-size-friendly' : 'large-model']
		: []
	return {
		...item,
		...stats,
		tags: uniqueStrings([item.tags, sizeTags]).map(tag => tag.toLowerCase().replace(/\s+/g, '-')),
		metadata: {
			...(item.metadata || {}),
			bytes: stats.bytes,
			sizeMiB: stats.sizeMiB,
			sizeTier: stats.sizeTier,
		},
	}
}

function compactGlbMetadata(metadata: any): Record<string, unknown> | undefined {
	if (!metadata || typeof metadata !== 'object') return undefined
	return Object.fromEntries(Object.entries({
		generator: metadata.asset?.generator,
		version: metadata.asset?.version,
		nodes: metadata.nodes_count,
		meshes: metadata.meshes_count,
		materials: metadata.materials_count,
		textures: metadata.textures_count,
		animations: metadata.animations_count,
		scenes: metadata.scenes_count,
		validGlbHeader: metadata.valid_glb_header,
	}).filter(([, value]) => value !== undefined && value !== null))
}

function microsoftStock3DAssets(repoRoot: string): AssetCatalogItem[] {
	const recordsDir = path.join(repoRoot, 'outputs', 'microsoft_stock3d_library', 'records')
	if (!fs.existsSync(recordsDir)) return []
	const bySha = new Map<string, AssetCatalogItem & { categories?: string[]; aliases?: string[]; duplicateCount?: number }>()
	for (const file of fs.readdirSync(recordsDir).filter(name => name.endsWith('.json')).sort()) {
		const rows = readJsonFile(path.join(recordsDir, file))
		if (!Array.isArray(rows)) continue
		for (const record of rows) {
			const glbPath = path.resolve(String(record?.glb || ''))
			if (!record?.title || !fs.existsSync(glbPath)) continue
			const sha = String(record.sha256 || '').trim()
			const key = sha || glbPath.toLowerCase()
			const title = String(record.title)
			const category = String(record.category || record.category_slug || 'Microsoft Stock 3D')
			const current = bySha.get(key)
			if (current) {
				current.tags = uniqueStrings([current.tags, record?.tags?.tokens, record?.tags?.navigation_tags, title, category]).map(tag => tag.toLowerCase().replace(/\s+/g, '-'))
				current.metadata = {
					...(current.metadata || {}),
					categories: uniqueStrings([current.metadata?.categories as string[] | undefined, category]),
					aliases: uniqueStrings([current.metadata?.aliases as string[] | undefined, title]),
					duplicateCount: Number(current.metadata?.duplicateCount || 1) + 1,
				}
				continue
			}
			const tags = uniqueStrings([
				'3d', 'model', 'glb', 'microsoft', 'powerpoint', 'stock', 'native-powerpoint', 'flagship',
				category,
				record?.category_slug,
				title,
				record?.tags?.tokens,
				record?.tags?.navigation_tags,
				record?.tags?.animated ? ['animated', 'motion'] : ['static'],
				record?.glb_metadata?.nodes_names,
			]).map(tag => tag.toLowerCase().replace(/\s+/g, '-'))
			bySha.set(key, {
				handle: `model3d://microsoft-stock/${sha ? sha.slice(0, 16) : safeSlug(path.basename(glbPath, '.glb'))}/${safeSlug(record.title_slug || title)}`,
				category: 'models3d',
				src: glbPath,
				altText: `${title} Microsoft PowerPoint Stock 3D model`,
				tags,
				usage: `Primary native PowerPoint Stock 3D choice for ${category.toLowerCase()} scenes and model3d embellishment when "${title}" matches the slide context.`,
				source: MICROSOFT_STOCK3D_SOURCE,
				sourceKey: MICROSOFT_STOCK3D_SOURCE,
				sourceLabel: 'Microsoft PowerPoint Stock 3D',
				sourceCategory: category,
				sourcePriority: 100,
				license: String(record.license_scope_note || 'Cached for reuse inside Microsoft 365/PowerPoint files.'),
				attribution: 'Microsoft PowerPoint Stock 3D',
				metadata: {
					title,
					categories: [category],
					aliases: [title],
					sha256: sha || undefined,
					duplicateCount: 1,
					officeUseOnly: record.office_use_only !== false,
					nativePowerPointStock: true,
					animated: !!record?.tags?.animated || Number(record?.glb_metadata?.animations_count || 0) > 0,
					bytes: Number(record.bytes || 0),
					glb: compactGlbMetadata(record.glb_metadata),
					provenance: record.provenance,
				},
			})
		}
	}
	return [...bySha.values()]
}

function importedReferenceAssets(repoRoot: string): AssetCatalogItem[] {
	const root = resolveDemoAssetRoot(repoRoot, 'betterpptx-reference-assets', '3d-gradient-style-agency')
	const manifestPath = path.join(root, 'manifest.json')
	if (!fs.existsSync(manifestPath)) return []
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
		const license = String(manifest?.source?.license || 'Imported local reference asset. Verify redistribution rights before public SaaS packaging.')
		const modelAssets: AssetCatalogItem[] = Array.isArray(manifest?.models)
			? manifest.models.map((asset: any) => ({
				handle: String(asset.handle),
				category: 'models3d' as const,
				src: path.join(root, String(asset.file || '')),
				preview: asset.preview ? path.join(root, String(asset.preview)) : undefined,
				altText: String(asset.altText || asset.handle),
				tags: Array.isArray(asset.tags) ? asset.tags.map(String) : ['3d', 'model', 'agency-reference'],
				usage: String(asset.usage || 'Imported native 3D model for Path A expressive decks.'),
				source: 'imported' as const,
				license,
			}))
			: []
		const imageAssets: AssetCatalogItem[] = Array.isArray(manifest?.images)
			? manifest.images.map((asset: any) => ({
				handle: String(asset.handle),
				category: 'stock' as const,
				src: path.join(root, String(asset.file || '')),
				preview: path.join(root, String(asset.file || '')),
				altText: String(asset.altText || asset.handle),
				tags: Array.isArray(asset.tags) ? asset.tags.map(String) : ['image', 'agency-reference'],
				usage: String(asset.usage || 'Imported image/poster/texture for Path A expressive decks.'),
				source: 'imported' as const,
				license,
			}))
			: []
		const sceneAssets: AssetCatalogItem[] = Array.isArray(manifest?.shapeScenes)
			? manifest.shapeScenes.map((asset: any) => ({
				handle: String(asset.handle),
				category: 'shape-scenes' as const,
				src: path.join(root, String(asset.file || '')),
				preview: asset.preview ? path.join(root, String(asset.preview)) : undefined,
				altText: String(asset.title || asset.handle),
				tags: Array.isArray(asset.tags) ? asset.tags.map(String) : ['shape-scene', 'agency-reference'],
				usage: String(asset.usage || 'Imported scene metadata and custom-geometry specimens for Path A expressive decks.'),
				source: 'imported' as const,
				license,
			}))
			: []
		return [...modelAssets, ...imageAssets, ...sceneAssets]
			.filter(asset => asset.handle && fs.existsSync(asset.src))
	} catch {
		return []
	}
}

function onlineFetchedAssets(repoRoot: string): AssetCatalogItem[] {
	const root = resolveDemoAssetRoot(repoRoot, 'betterpptx-online-assets')
	const manifestPath = path.join(root, 'manifest.json')
	if (!fs.existsSync(manifestPath)) return []
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
		if (!Array.isArray(manifest?.assets)) return []
		return manifest.assets.map((asset: any) => {
			const manifestSource = String(asset.sourceKey || 'online')
			const source = manifestSource === 'open-source-3d-assets'
				? TOXSAM_SOURCE
				: manifestSource === 'open-source-3d-quality'
					? TOXSAM_QUALITY_SOURCE
					: 'online'
			return {
				handle: String(asset.handle),
				category: String(asset.category || 'stock') as AssetCatalogItem['category'],
				src: path.join(root, String(asset.file || '')),
				preview: asset.preview ? path.join(root, String(asset.preview)) : undefined,
				altText: String(asset.altText || asset.title || asset.handle),
				tags: Array.isArray(asset.tags) ? asset.tags.map(String) : ['online'],
				usage: String(asset.usage || 'Online-fetched betterpptx-mcp asset.'),
				source,
				sourceKey: manifestSource,
				sourceLabel: source === TOXSAM_SOURCE ? 'ToxSam open-source 3D assets' : source === TOXSAM_QUALITY_SOURCE ? 'ToxSam open-source 3D quality derivative' : 'Online fetched assets',
				sourceCategory: asset.projectName || asset.projectId || undefined,
				sourcePriority: source === TOXSAM_QUALITY_SOURCE ? 58 : source === TOXSAM_SOURCE ? 46 : 35,
				license: String(asset.license || 'See local online asset manifest.'),
				sourceUrl: asset.sourceUrl ? String(asset.sourceUrl) : undefined,
				attribution: asset.attribution ? String(asset.attribution) : undefined,
				metadata: {
					projectId: asset.projectId,
					projectName: asset.projectName,
					upstreamAssetName: asset.upstreamAssetName,
					sourceKey: manifestSource,
				},
			}
		})
			.filter((asset: AssetCatalogItem) => asset.handle && fs.existsSync(asset.src))
	} catch {
		return []
	}
}

function privateIconScoutAssets(repoRoot: string): AssetCatalogItem[] {
	const root = resolveDemoAssetRoot(repoRoot, 'betterpptx-private-assets', 'iconscout')
	const manifestPath = path.join(root, 'manifest.json')
	if (!fs.existsSync(manifestPath)) return []
	try {
		const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
		if (!Array.isArray(manifest?.assets)) return []
		return manifest.assets.map((asset: any) => ({
			handle: String(asset.handle),
			category: String(asset.category || 'stock') as AssetCatalogItem['category'],
			src: path.join(root, String(asset.file || '')),
			preview: asset.preview ? path.join(root, String(asset.preview)) : undefined,
			altText: String(asset.altText || asset.title || asset.handle),
			tags: Array.isArray(asset.tags) ? asset.tags.map(String) : ['iconscout', 'private'],
			usage: String(asset.usage || 'Private IconScout asset cache entry. Verify license rights before redistribution.'),
			source: ICONSCOUT_SOURCE,
			sourceKey: ICONSCOUT_SOURCE,
			sourceLabel: 'Private IconScout cache',
			sourceCategory: asset.category === 'models3d' ? 'IconScout 3D' : 'IconScout icons',
			sourcePriority: asset.category === 'models3d' ? 82 : 78,
			license: String(asset.license || 'IconScout asset license. Verify item-level rights before redistribution.'),
			sourceUrl: asset.sourceUrl ? String(asset.sourceUrl) : undefined,
			attribution: asset.attribution ? String(asset.attribution) : undefined,
			metadata: {
				asset: asset.asset,
				format: asset.format,
				privateAsset: true,
			},
		}))
			.filter((asset: AssetCatalogItem) => asset.handle && fs.existsSync(asset.src))
	} catch {
		return []
	}
}

export function assetCatalog(repoRoot: string): AssetCatalogItem[] {
	const items: AssetCatalogItem[] = [
		{ handle: 'stock://betterpptx-mcp-logo', category: 'stock', src: 'demos/common/images/sample_logo.png', altText: 'betterpptx-mcp sample logo', tags: ['brand', 'logo', 'premium'], usage: 'brand mark, cover image, small media poster' },
		{ handle: 'stock://model-fallback', category: 'stock', src: 'demos/ultimate-showcase/assets/model-fallback.png', altText: '3D model raster fallback preview', tags: ['3d', 'fallback', 'poster', 'showcase'], usage: 'required raster fallback for native model3d objects' },
		{ handle: 'stock://premium-texture-fallback', category: 'textures', src: 'demos/ultimate-showcase/assets/model-fallback.png', altText: 'Premium geometric texture fallback', tags: ['texture', 'gradient', 'premium'], usage: 'deterministic geometric texture for cinematic panels' },
		{ handle: 'texture://agency-depth', category: 'textures', src: 'demos/betterpptx-premium-assets/textures/agency-depth-texture.jpg', altText: 'Premium depth texture for modern slide scenes', tags: ['texture', 'gradient', 'premium', 'reference', 'hero'], usage: 'full-bleed depth texture for cinematic and reference-quality slide backgrounds' },
		{ handle: 'video://sample-mp4', category: 'video', src: 'demos/common/media/sample.mp4', preview: 'demos/common/images/sample_logo.png', altText: 'Sample embedded video', tags: ['media', 'video', 'autoplay', 'showcase'], usage: 'native video playback and media command recipes' },
		{ handle: 'video://sample-hd', category: 'video', src: 'demos/common/media/sample-hd.m4v', preview: 'demos/common/images/sample_logo.png', altText: 'Sample HD embedded video', tags: ['media', 'video', 'premium'], usage: 'larger media-scene fixture when available' },
		{ handle: 'audio://sample-mp3', category: 'audio', src: 'demos/common/media/sample.mp3', altText: 'Sample embedded audio', tags: ['audio', 'voice', 'narration', 'autoplay'], usage: 'voice/audio lab and narration placeholder' },
		{ handle: 'audio://sample-wav', category: 'audio', src: 'demos/common/media/sample.wav', altText: 'Sample WAV embedded audio', tags: ['audio', 'voice', 'narration'], usage: 'alternate narration/audio fixture when available' },
		{ handle: 'model3d://lab-pyramid', category: 'models3d', src: 'demos/ultimate-showcase/assets/lab-pyramid.glb', preview: 'demos/ultimate-showcase/assets/model-fallback.png', altText: 'Native GLB 3D model fixture', tags: ['3d', 'glb', 'model', 'premium', 'showcase'], usage: 'native 3D object scenes with poster fallback, lighting, and motion' },
		...PREMIUM_3D_ASSETS.flatMap(asset => [
			{
				handle: `model3d://premium-${asset.id}`,
				category: 'models3d' as const,
				src: `demos/betterpptx-premium-assets/models/${asset.id}.glb`,
				preview: `demos/betterpptx-premium-assets/posters/${asset.poster}`,
				altText: asset.altText,
				tags: asset.tags,
				usage: asset.usage,
			},
			{
				handle: `stock://premium-3d-${asset.id}-poster`,
				category: 'stock' as const,
				src: `demos/betterpptx-premium-assets/posters/${asset.poster}`,
				altText: `${asset.altText} poster fallback`,
				tags: ['3d', 'poster', 'fallback', ...asset.tags.filter(tag => tag !== 'glb' && tag !== 'model')],
				usage: `raster poster fallback for model3d://premium-${asset.id}`,
			},
		]),
	]
	const generated = proceduralAssetTemplates(repoRoot).map(item => ({
		handle: item.handle,
		category: 'models3d' as const,
		src: item.src,
		preview: item.preview,
		altText: item.altText,
		tags: item.tags,
		usage: item.usage,
		source: item.source,
		license: item.license,
		proceduralKind: item.kind,
	}))
	return [...microsoftStock3DAssets(repoRoot), ...privateIconScoutAssets(repoRoot), ...items.map(item => ({ ...item, source: 'bundled' as const })), ...importedReferenceAssets(repoRoot), ...onlineFetchedAssets(repoRoot), ...generated]
		.map(item => ({ ...item, src: resolveRepoAssetPath(repoRoot, item.src), preview: item.preview ? resolveRepoAssetPath(repoRoot, item.preview) : undefined }))
		.map(withAssetSizeMetadata)
		.filter(item => item.source === 'generated' || fs.existsSync(item.src))
}

export function findAsset(repoRoot: string, handle: string): AssetCatalogItem | undefined {
	return assetCatalog(repoRoot).find(item => item.handle === handle)
}
