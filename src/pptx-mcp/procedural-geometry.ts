import * as fs from 'fs'
import * as path from 'path'

export const PROCEDURAL_GEOMETRY_KINDS = [
	'world-map',
	'country-map',
	'region-highlight',
	'river-path',
	'deforestation-mask',
	'canopy-layer',
	'contour',
	'organic-blob',
] as const

export type ProceduralGeometryKind = typeof PROCEDURAL_GEOMETRY_KINDS[number]

export interface ProceduralGeometryResult {
	brand: string
	kind: ProceduralGeometryKind
	source: 'generated'
	license: string
	objects: any[]
	specimenMap: Array<{ featureId: string; objectName: string; geometryKind: string; coverage: string[] }>
	metadata: Record<string, unknown>
}

const BRAND = 'betterpptx-mcp'
const LICENSE = 'Generated geometry using an offline public-domain style fixture suitable for deterministic MCP tests.'

interface PolygonFeature {
	id: string
	name: string
	category: string
	polygons: number[][][]
}

const FALLBACK_FEATURES: PolygonFeature[] = [
	{
		id: 'south-america',
		name: 'South America',
		category: 'continent',
		polygons: [[[-82, 12], [-67, 9], [-50, 4], [-35, -8], [-42, -22], [-54, -55], [-70, -52], [-79, -24], [-82, 12]]],
	},
	{
		id: 'africa',
		name: 'Africa',
		category: 'continent',
		polygons: [[[-18, 35], [12, 37], [35, 28], [51, 9], [43, -25], [19, -35], [-5, -28], [-17, -2], [-18, 35]]],
	},
	{
		id: 'southeast-asia',
		name: 'Southeast Asia',
		category: 'continent',
		polygons: [[[92, 24], [112, 22], [125, 12], [121, -9], [103, -10], [95, 4], [92, 24]]],
	},
	{
		id: 'north-america',
		name: 'North America',
		category: 'continent',
		polygons: [[[-168, 70], [-100, 72], [-52, 52], [-77, 22], [-112, 16], [-138, 44], [-168, 70]]],
	},
	{
		id: 'eurasia',
		name: 'Eurasia',
		category: 'continent',
		polygons: [[[-10, 72], [52, 72], [145, 56], [162, 22], [108, 8], [44, 20], [4, 36], [-10, 72]]],
	},
	{
		id: 'australia',
		name: 'Australia',
		category: 'continent',
		polygons: [[[112, -12], [154, -18], [150, -40], [118, -42], [112, -12]]],
	},
	{
		id: 'south-america-focus',
		name: 'South America focus belt',
		category: 'focus-region',
		polygons: [[[-75, 6], [-50, 6], [-45, -12], [-62, -18], [-74, -7], [-75, 6]]],
	},
	{
		id: 'central-africa-focus',
		name: 'Central Africa focus belt',
		category: 'focus-region',
		polygons: [[[10, 7], [31, 6], [30, -8], [15, -10], [8, -2], [10, 7]]],
	},
	{
		id: 'southeast-asia-focus',
		name: 'Southeast Asia focus belt',
		category: 'focus-region',
		polygons: [[[96, 8], [122, 8], [125, -8], [104, -9], [96, 8]]],
	},
]

function safeId(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'geometry'
}

function normalizeKind(kind: unknown): ProceduralGeometryKind {
	const normalized = safeId(String(kind || 'organic-blob'))
	const found = PROCEDURAL_GEOMETRY_KINDS.find(item => safeId(item) === normalized)
	return found || 'organic-blob'
}

function loadFeatures(repoRoot: string): PolygonFeature[] {
	const filePath = path.join(repoRoot, 'demos', 'betterpptx-mcp-data', 'natural-earth', 'world-focus-110m.geojson')
	if (!fs.existsSync(filePath)) return FALLBACK_FEATURES
	try {
		const json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
		const features = Array.isArray(json?.features) ? json.features : []
		const parsed: PolygonFeature[] = []
		for (const feature of features) {
			const props = feature.properties || {}
			const geometry = feature.geometry || {}
			const polygons: number[][][] = geometry.type === 'Polygon'
				? geometry.coordinates
				: geometry.type === 'MultiPolygon'
					? geometry.coordinates.flat()
					: []
			if (polygons.length) {
				parsed.push({
					id: safeId(String(props.id || props.name || parsed.length)),
					name: String(props.name || props.id || 'Region'),
					category: String(props.category || 'continent'),
					polygons,
				})
			}
		}
		return parsed.length ? parsed : FALLBACK_FEATURES
	} catch {
		return FALLBACK_FEATURES
	}
}

function project(lon: number, lat: number, w: number, h: number): { x: number; y: number } {
	return {
		x: ((lon + 180) / 360) * w,
		y: ((90 - lat) / 180) * h,
	}
}

function polygonObject(feature: PolygonFeature, polygon: number[][], index: number, opts: {
	x: number
	y: number
	w: number
	h: number
	fill: string
	line: string
	transparency: number
	namePrefix: string
	geometryKind: string
}): any {
	const coverageCategory = feature.category === 'rainforest' ? 'focus-region' : feature.category
	const points = polygon.map((coord, pointIndex) => ({
		...project(Number(coord[0]), Number(coord[1]), opts.w, opts.h),
		...(pointIndex === 0 ? { moveTo: true } : {}),
	}))
	return {
		kind: 'shape',
		name: `${opts.namePrefix}-${feature.id}-${index}`,
		shapeType: 'custGeom',
		x: opts.x,
		y: opts.y,
		w: opts.w,
		h: opts.h,
		fill: { color: opts.fill, transparency: opts.transparency },
		line: { color: opts.line, transparency: 18, width: 0.75 },
		points: [...points, { close: true }],
		shadow: { type: 'outer', color: '000000', opacity: 0.15, blur: 3, offset: 0.5, angle: 45 },
		geometryKind: opts.geometryKind,
		coverageTags: ['customGeometry', 'worldMap', opts.geometryKind, coverageCategory],
	}
}

function organicBlob(name: string, x: number, y: number, w: number, h: number, color = '22C55E'): any {
	return {
		kind: 'shape',
		name,
		shapeType: 'custGeom',
		x,
		y,
		w,
		h,
		fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 30, gradientStops: [{ position: 0, color, transparency: 4 }, { position: 100, color: '0F766E', transparency: 15 }] },
		line: { color: 'D9F99D', transparency: 24, width: 1.1 },
		points: [
			{ x: 0.08, y: 0.42, moveTo: true },
			{ x: w * 0.32, y: 0.08, curve: { type: 'quadratic', x1: w * 0.15, y1: -0.16 } },
			{ x: w * 0.82, y: 0.2, curve: { type: 'cubic', x1: w * 0.5, y1: 0.02, x2: w * 0.72, y2: -0.06 } },
			{ x: w * 0.9, y: h * 0.58, curve: { type: 'quadratic', x1: w * 1.05, y1: h * 0.34 } },
			{ x: w * 0.52, y: h * 0.92, curve: { type: 'cubic', x1: w * 0.82, y1: h * 0.98, x2: w * 0.62, y2: h * 1.08 } },
			{ x: w * 0.1, y: h * 0.72, curve: { type: 'quadratic', x1: -w * 0.08, y1: h * 0.94 } },
			{ close: true },
		],
		shadow: { type: 'outer', color: '000000', opacity: 0.22, blur: 6, offset: 1, angle: 45 },
		geometryKind: 'organic-blob',
		coverageTags: ['customGeometry', 'organic-blob'],
	}
}

function addSpecimen(result: ProceduralGeometryResult, object: any, featureId: string, coverage: string[]): void {
	result.specimenMap.push({
		featureId,
		objectName: String(object.name || object.objectName || featureId),
		geometryKind: String(object.geometryKind || result.kind),
		coverage,
	})
}

export function generateProceduralGeometry(repoRoot: string, args: any = {}): ProceduralGeometryResult {
	const kind = normalizeKind(args?.kind)
	const x = Number(args?.x ?? 0.75)
	const y = Number(args?.y ?? 1.0)
	const w = Number(args?.w ?? 11.8)
	const h = Number(args?.h ?? 4.9)
	const namePrefix = safeId(String(args?.name || kind))
	const result: ProceduralGeometryResult = {
		brand: BRAND,
		kind,
		source: 'generated',
		license: LICENSE,
		objects: [],
		specimenMap: [],
		metadata: {
			seed: String(args?.seed || 'default'),
			style: String(args?.style || 'cinematic'),
			dataset: 'offline-world-focus-110m-fixture',
			supportedKinds: PROCEDURAL_GEOMETRY_KINDS,
		},
	}
	const features = loadFeatures(repoRoot)
	if (kind === 'world-map' || kind === 'country-map') {
		const continents = features.filter(feature => feature.category === 'continent')
		for (const feature of continents) {
			feature.polygons.slice(0, 1).forEach((polygon, index) => {
				const object = polygonObject(feature, polygon, index, {
					x,
					y,
					w,
					h,
					fill: '134E4A',
					line: 'A7F3D0',
					transparency: 4,
					namePrefix,
					geometryKind: kind,
				})
				result.objects.push(object)
				addSpecimen(result, object, `${kind}.${feature.id}`, ['customGeometry', 'worldMap'])
			})
		}
	}
	if (kind === 'region-highlight' || kind === 'world-map') {
		const focusRegions = features.filter(feature => feature.category === 'focus-region' || feature.category === 'rainforest')
		for (const feature of focusRegions) {
			feature.polygons.slice(0, 1).forEach((polygon, index) => {
				const object = polygonObject(feature, polygon, index, {
					x,
					y,
					w,
					h,
					fill: '22C55E',
					line: 'ECFCCB',
					transparency: 12,
					namePrefix: `${namePrefix}-focus`,
					geometryKind: 'region-highlight',
				})
				result.objects.push(object)
				addSpecimen(result, object, `region-highlight.${feature.id}`, ['customGeometry', 'worldMap', 'focus-region'])
			})
		}
	}
	if (kind === 'deforestation-mask') {
		[
			{ x: x + w * 0.29, y: y + h * 0.46, w: 0.7, h: 0.32 },
			{ x: x + w * 0.53, y: y + h * 0.48, w: 0.62, h: 0.3 },
			{ x: x + w * 0.79, y: y + h * 0.5, w: 0.5, h: 0.26 },
		].forEach((box, index) => {
			const object = organicBlob(`${namePrefix}-deforestation-${index}`, box.x, box.y, box.w, box.h, 'F97316')
			object.geometryKind = 'deforestation-mask'
			object.coverageTags = ['customGeometry', 'deforestation-mask']
			result.objects.push(object)
			addSpecimen(result, object, `deforestation-mask.${index + 1}`, ['customGeometry'])
		})
	}
	if (kind === 'river-path') {
		const object = {
			kind: 'shape',
			name: `${namePrefix}-river-ribbon`,
			shapeType: 'custGeom',
			x,
			y,
			w,
			h,
			fill: { color: '38BDF8', transparency: 12 },
			line: { color: 'E0F2FE', transparency: 18, width: 1.1 },
			points: [
				{ x: w * 0.27, y: h * 0.5, moveTo: true },
				{ x: w * 0.36, y: h * 0.48, curve: { type: 'quadratic', x1: w * 0.31, y1: h * 0.42 } },
				{ x: w * 0.43, y: h * 0.55, curve: { type: 'quadratic', x1: w * 0.39, y1: h * 0.62 } },
				{ x: w * 0.5, y: h * 0.51, curve: { type: 'quadratic', x1: w * 0.47, y1: h * 0.44 } },
				{ x: w * 0.54, y: h * 0.57 },
				{ x: w * 0.5, y: h * 0.61 },
				{ x: w * 0.42, y: h * 0.61 },
				{ x: w * 0.34, y: h * 0.55 },
				{ close: true },
			],
			shadow: { type: 'outer', color: '082F49', opacity: 0.25, blur: 5, offset: 0.8, angle: 45 },
			geometryKind: 'river-path',
			coverageTags: ['customGeometry', 'river-path'],
		}
		result.objects.push(object)
		addSpecimen(result, object, 'river-path.primary', ['customGeometry', 'motionPath'])
	}
	if (kind === 'canopy-layer') {
		for (let i = 0; i < 18; i++) {
			const object = {
				kind: 'shape',
				name: `${namePrefix}-canopy-${i}`,
				shapeType: i % 3 === 0 ? 'cloud' : 'ellipse',
				x: x + (i % 6) * (w / 6) + 0.08,
				y: y + 0.4 + Math.floor(i / 6) * 0.78,
				w: 1.05,
				h: 0.52,
				fill: { color: ['166534', '15803D', '22C55E'][i % 3], transparency: 8 },
				line: { color: 'BBF7D0', transparency: 45 },
				shadow: { type: 'outer', color: '000000', opacity: 0.18, blur: 4, offset: 0.7, angle: 45 },
				geometryKind: 'canopy-layer',
				coverageTags: ['shape-built', 'canopy-layer'],
			}
			result.objects.push(object)
			addSpecimen(result, object, `canopy-layer.${i + 1}`, ['shape-built'])
		}
	}
	if (kind === 'contour') {
		for (let i = 0; i < 5; i++) {
			const object = organicBlob(`${namePrefix}-contour-${i}`, x + i * 0.22, y + i * 0.16, w * (0.52 + i * 0.05), h * (0.32 + i * 0.04), '84CC16')
			object.fill = { color: '84CC16', transparency: 100 }
			object.line = { color: 'BEF264', transparency: 18 + i * 8, width: 1 }
			object.geometryKind = 'contour'
			result.objects.push(object)
			addSpecimen(result, object, `contour.${i + 1}`, ['customGeometry'])
		}
	}
	if (kind === 'organic-blob' || !result.objects.length) {
		const object = organicBlob(`${namePrefix}-organic`, x, y, Math.min(4.6, w), Math.min(2.4, h))
		result.objects.push(object)
		addSpecimen(result, object, 'organic-blob', ['customGeometry'])
	}
	return result
}
