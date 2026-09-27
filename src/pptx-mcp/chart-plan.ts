import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import JSZip from 'jszip'
import { DOMParser, XMLSerializer } from '@xmldom/xmldom'

import { chartGalleryTilePresetById, chartStylePresetById, chartPresetById, normalizeNativeChartType, type ChartGalleryTilePreset } from './chart-presets.js'
import { CHART_GALLERY } from '../chart-gallery.js'
import { CHART_TYPE_REGISTRY } from './chart-type-registry.js'
import { chartTreatmentPresetById } from './chart-treatment-runtime.js'

export interface ChartPlanRequest {
	chartPresetId?: string
	chartType?: string
	chartGalleryTilePresetId?: string
	chartStylePresetId?: string
	chartGalleryVariant?: number
	chartStyleId?: number
	chartStyleModernId?: number
	chartColorStyleId?: number
	chartLayoutPresetId?: string
	chartTreatmentPresetId?: string
	chartTreatmentPresetIds?: string[]
}

export interface ResolvedChartPlan {
	chartPresetId?: string
	chartType?: string
	chartGalleryTilePresetId?: string
	chartStylePresetId?: string
	chartGalleryVariant?: number
	chartStyleId?: number
	chartStyleModernId?: number
	chartColorStyleId?: number
	chartLayoutPresetId?: string
	chartTreatmentPresetId?: string
	chartTreatmentPresetIds?: string[]
	/** Captured native style ids used by generated, data-authoritative charts. */
	showTitle?: boolean
	showLegend?: boolean
	legendPos?: 'b' | 'l' | 'r' | 't' | 'tr'
	showValue?: boolean
	/** Internal package replay fields consumed by the chart serializer only. */
	_rawChartXml?: string
	_rawChartRelsXml?: string
	_rawChartWorkbookBase64?: string
	_rawChartWorkbookName?: string
	_rawChartStyleXml?: string
	_rawChartStyleName?: string
	_rawChartColorsXml?: string
	_rawChartColorsName?: string
	/** Internal visual fallback for ChartEx families whose native renderer is incomplete. */
	_rawChartFallbackImageBase64?: string
	_rawChartFallbackImageContentType?: string
}

export interface ChartPlanResolution {
	plan: ResolvedChartPlan
	tile?: ChartGalleryTilePreset
	mode: 'native-style' | 'native-color' | 'gallery-package-replay' | 'none'
}

function zipPath(value: string): string {
	const normalized = path.posix.normalize(value.replace(/\\/g, '/').replace(/^\/+/, ''))
	return normalized.startsWith('../') ? normalized.slice(3) : normalized
}

function relationshipTarget(xml: string, relationshipType: string): string | null {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	const relationships = document.getElementsByTagName('Relationship')
	for (let index = 0; index < relationships.length; index += 1) {
		const relationship = relationships.item(index)
		if (relationship?.getAttribute('Type') === relationshipType) return relationship.getAttribute('Target') || null
	}
	return null
}

function rewriteRelationshipTarget(xml: string, relationshipType: string, target: string): string {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	const relationships = document.getElementsByTagName('Relationship')
	for (let index = 0; index < relationships.length; index += 1) {
		const relationship = relationships.item(index)
		if (relationship?.getAttribute('Type') === relationshipType) relationship.setAttribute('Target', target)
	}
	return new XMLSerializer().serializeToString(document)
}

function imageContentTypeForPath(value: string): string {
	const ext = path.posix.extname(value).toLowerCase()
	if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
	if (ext === '.gif') return 'image/gif'
	if (ext === '.svg') return 'image/svg+xml'
	return 'image/png'
}

/**
 * ChartEx map captures contain a deterministic picture fallback in the same
 * slide's AlternateContent block.  Keep that visual payload attached to the
 * replay plan so the shared serializer can emit the same governed fallback
 * without exposing package paths or raw internals through the public MCP.
 */
async function slideFallbackImage(zip: JSZip, chartPath: string, chartType: string): Promise<{ base64: string, contentType: string } | null> {
	if (chartType !== 'regionMap') return null
	const slideRels = Object.keys(zip.files).filter(name => /^ppt\/slides\/_rels\/slide\d+\.xml\.rels$/i.test(name))
	for (const relsPath of slideRels) {
		const relsXml = await zip.file(relsPath)?.async('string')
		if (!relsXml) continue
		const document = new DOMParser().parseFromString(relsXml, 'application/xml')
		const relationships = document.getElementsByTagName('Relationship')
		let ownsChart = false
		for (let index = 0; index < relationships.length; index += 1) {
			const relationship = relationships.item(index)
			if (!relationship) continue
			const type = relationship.getAttribute('Type') || ''
			const target = relationship.getAttribute('Target') || ''
			if (!type.toLowerCase().includes('/chart') && !type.toLowerCase().includes('chartex')) continue
			const resolvedTarget = zipPath(path.posix.join('ppt/slides', target))
			if (resolvedTarget === chartPath) {
				ownsChart = true
				break
			}
		}
		if (!ownsChart) continue
		for (let index = 0; index < relationships.length; index += 1) {
			const relationship = relationships.item(index)
			if (!relationship) continue
			const type = relationship.getAttribute('Type') || ''
			if (!type.toLowerCase().endsWith('/image')) continue
			const target = relationship.getAttribute('Target') || ''
			const imagePath = zipPath(path.posix.join('ppt/slides', target))
			const imageEntry = zip.file(imagePath)
			if (!imageEntry) continue
			return {
				base64: await imageEntry.async('base64'),
				contentType: imageContentTypeForPath(imagePath),
			}
		}
	}
	return null
}

function chartXmlMatchesType(xml: string, chartType: string): boolean {
	const document = new DOMParser().parseFromString(xml, 'application/xml')
	const legacyTags: Record<string, string> = {
		area: 'c:areaChart', area3D: 'c:area3DChart', bar: 'c:barChart', bar3D: 'c:bar3DChart', bubble: 'c:bubbleChart', bubble3D: 'c:bubbleChart',
		line: 'c:lineChart', line3D: 'c:line3DChart', pie: 'c:pieChart', pie3D: 'c:pie3DChart', ofPie: 'c:ofPieChart', doughnut: 'c:doughnutChart', radar: 'c:radarChart', scatter: 'c:scatterChart', combo: 'c:barChart', stock: 'c:stockChart', surface: 'c:surfaceChart', surface3D: 'c:surface3DChart',
	}
	const legacyTag = legacyTags[chartType]
	if (legacyTag && document.getElementsByTagName(legacyTag).length > 0) return true
	// Some Office surface gallery captures are emitted as a 3-D surface chart
	// even when the semantic catalog entry is the surface family. Accept that
	// native tag for the surface semantic while keeping surface3D explicit.
	if (chartType === 'surface' && document.getElementsByTagName('c:surface3DChart').length > 0) return true
	// ChartEx families do not expose legacy c:* chart tags.  Their native
	// layout is carried by cx:series/layoutPr (and a few families use a
	// family-specific child under layoutPr).  Keep this matcher semantic so
	// package replay can select the correct chartEx part from a multi-chart
	// capture bundle without relying on private part names.
	const chartExMarkers: Record<string, string[]> = {
		treemap: ['treemap'],
		sunburst: ['sunburst'],
		histogram: ['binning'],
		pareto: ['paretoLine'],
		boxWhisker: ['boxWhisker', 'statistics'],
		waterfall: ['waterfall'],
		funnel: ['funnel'],
		regionMap: ['regionMap', 'geography'],
	}
	const markers = chartExMarkers[chartType] || []
	if (markers.some(marker => document.getElementsByTagName(`cx:${marker}`).length > 0)) return true
	const layoutIds = document.getElementsByTagName('cx:series')
	const chartExLayoutIds: Record<string, string[]> = {
		histogram: ['histogram', 'clusteredColumn'],
		pareto: ['pareto', 'paretoLine'],
		boxWhisker: ['boxWhisker'],
		waterfall: ['waterfall'],
		funnel: ['funnel'],
		regionMap: ['regionMap'],
		treemap: ['treemap'],
		sunburst: ['sunburst'],
	}
	const acceptedLayoutIds = (chartExLayoutIds[chartType] || [chartType]).map(value => value.toLowerCase())
	for (let index = 0; index < layoutIds.length; index += 1) {
		const layoutId = layoutIds.item(index)?.getAttribute('layoutId')
		if (layoutId && acceptedLayoutIds.includes(layoutId.toLowerCase())) return true
	}
	return false
}

const REPLAY_RUNTIME_CHART_TYPES: Record<string, string> = {
	area3D: 'area',
	line3D: 'line',
	pie3D: 'pie',
	ofPie: 'pie',
	surface: 'bar',
	surface3D: 'bar',
	stock: 'bar',
	combo: 'bar',
}

function semanticChartType(value: unknown): string | null {
	const raw = String(value ?? '').trim()
	if (!raw) return null
	const normalized = normalizeNativeChartType(raw)
	if (normalized) return normalized
	const record = CHART_TYPE_REGISTRY.find(item => item.semanticType.toLowerCase() === raw.toLowerCase())
	return record?.semanticType || null
}

function runtimeChartType(semanticType: string | null): string | null {
	if (!semanticType) return null
	return REPLAY_RUNTIME_CHART_TYPES[semanticType] || semanticType
}

function requiresPackageReplay(semanticType: string | null): boolean {
	return Boolean(semanticType && ['area3D', 'line3D', 'pie3D', 'ofPie', 'surface', 'surface3D', 'stock'].includes(semanticType))
}

function packageFile(repoRoot: string, packagePath: string): string {
	const resolved = path.isAbsolute(packagePath) ? packagePath : path.resolve(repoRoot, packagePath)
	if (!fs.existsSync(resolved)) throw new Error(`Chart gallery package is unavailable for the selected preset: ${packagePath}`)
	return resolved
}

function integerAttribute(document: Document, tagName: string, attribute = 'val'): number | undefined {
	const raw = document.getElementsByTagName(tagName).item(0)?.getAttribute(attribute)
	if (raw == null || raw === '') return undefined
	const value = Number(raw)
	return Number.isInteger(value) ? value : undefined
}

function generatedChartGalleryState(chartXml: string): Pick<ResolvedChartPlan, 'chartStyleId' | 'chartStyleModernId'> {
	const document = new DOMParser().parseFromString(chartXml, 'application/xml')
	const chartStyleId = integerAttribute(document, 'c:style')
	const chartStyleModernId = integerAttribute(document, 'c14:style')
	return {
		...(chartStyleId !== undefined ? { chartStyleId } : {}),
		...(chartStyleModernId !== undefined ? { chartStyleModernId } : {}),
	}
}

async function loadPackageReplay(tile: ChartGalleryTilePreset, repoRoot: string): Promise<Partial<ResolvedChartPlan> | null> {
	// A screenshot-only Color applicability probe is still executable when the
	// native PowerPoint ChartColor id is present. The engine has the exact
	// native-id colorStyle XML from the frozen Office gallery corpus, so no
	// per-type package copy is needed to serialize the selected color resource.
	if (tile.serializationStatus === 'native-engine' && tile.galleryKind === 'colors' && Number.isInteger(tile.nativeColorId)) {
		const colorXml = CHART_GALLERY.nativeColorCatalog[tile.nativeColorId as keyof typeof CHART_GALLERY.nativeColorCatalog]
		if (colorXml) {
			return {
				_rawChartColorsXml: colorXml,
				_rawChartColorsName: `mcp-chart-colors-native-${tile.nativeColorId}.xml`,
			}
		}
	}
	if (tile.serializationStatus !== 'package-backed' || !tile.packagePath) return null
	const zip = await JSZip.loadAsync(fs.readFileSync(packageFile(repoRoot, tile.packagePath)))
	let chartPath = tile.chartXmlPath ? zipPath(tile.chartXmlPath) : null
	let chartXml = chartPath ? await zip.file(chartPath)?.async('string') : undefined
	if (!chartXml && tile.chartXmlSha256) {
		for (const entryName of Object.keys(zip.files).filter(name => /^ppt\/(?:charts|chartEx)\/chart(?:Ex)?[^/]+\.xml$/i.test(name))) {
			const candidate = await zip.file(entryName)?.async('string')
			if (!candidate) continue
			const hash = createHash('sha256').update(candidate).digest('hex')
			if (hash === tile.chartXmlSha256 && chartXmlMatchesType(candidate, tile.chartType)) {
				chartPath = entryName
				chartXml = candidate
				break
			}
		}
	}
	if (!chartXml) {
		for (const entryName of Object.keys(zip.files).filter(name => /^ppt\/(?:charts|chartEx)\/chart(?:Ex)?[^/]+\.xml$/i.test(name))) {
			const candidate = await zip.file(entryName)?.async('string')
			if (!candidate) continue
			if (chartXmlMatchesType(candidate, tile.chartType)) {
				chartPath = entryName
				chartXml = candidate
				break
			}
		}
	}
	if (!chartPath) throw new Error(`Chart gallery preset ${tile.id} has no executable chart payload`) 
	if (!chartXml) throw new Error(`Chart gallery preset ${tile.id} chart payload is missing`)
	const chartRelPath = zipPath(`${path.posix.dirname(chartPath)}/_rels/${path.posix.basename(chartPath)}.rels`)
	const chartRelsXml = await zip.file(chartRelPath)?.async('string')
	if (!chartRelsXml) throw new Error(`Chart gallery preset ${tile.id} chart relationship payload is missing`)

	const packageDir = path.posix.dirname(chartPath)
	const workbookTarget = relationshipTarget(chartRelsXml, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package')
	const workbookPath = workbookTarget ? zipPath(path.posix.join(packageDir, workbookTarget)) : null
	const workbookEntry = workbookPath ? zip.file(workbookPath) : null
	const workbookBase64 = workbookEntry ? await workbookEntry.async('base64') : undefined
	// Captured bundles commonly reuse PowerPoint's worksheet basename (for
	// example, Worksheet124.xlsx) across different source packages.  A replay
	// atlas combines those packages, so preserving the basename would silently
	// make later charts overwrite an earlier chart's workbook.  Namespace the
	// embedded workbook by the opaque tile id while keeping the payload bytes
	// unchanged.
	const suffix = tile.id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
	const workbookName = workbookPath ? `mcp-chart-data-${suffix}${path.posix.extname(workbookPath) || '.xlsx'}` : undefined

	const styleTarget = relationshipTarget(chartRelsXml, 'http://schemas.microsoft.com/office/2011/relationships/chartStyle')
	const colorsTarget = relationshipTarget(chartRelsXml, 'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle')
	const stylePath = styleTarget ? zipPath(path.posix.join(packageDir, styleTarget)) : null
	const colorsPath = colorsTarget ? zipPath(path.posix.join(packageDir, colorsTarget)) : null
	const styleXml = stylePath ? await zip.file(stylePath)?.async('string') : undefined
	const colorsXml = colorsPath ? await zip.file(colorsPath)?.async('string') : undefined
	const styleName = styleXml ? `mcp-chart-style-${suffix}.xml` : undefined
	const colorsName = colorsXml ? `mcp-chart-colors-${suffix}.xml` : undefined
	let rewrittenRels = chartRelsXml
	if (styleName) rewrittenRels = rewriteRelationshipTarget(rewrittenRels, 'http://schemas.microsoft.com/office/2011/relationships/chartStyle', styleName)
	if (colorsName) rewrittenRels = rewriteRelationshipTarget(rewrittenRels, 'http://schemas.microsoft.com/office/2011/relationships/chartColorStyle', colorsName)
	if (workbookName) rewrittenRels = rewriteRelationshipTarget(rewrittenRels, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/package', `../embeddings/${workbookName}`)
	const fallbackImage = await slideFallbackImage(zip, chartPath, tile.chartType)
	const capturedResources = {
		...(styleXml && styleName ? { _rawChartStyleXml: styleXml, _rawChartStyleName: styleName } : {}),
		...(colorsXml && colorsName ? { _rawChartColorsXml: colorsXml, _rawChartColorsName: colorsName } : {}),
	}
	// An exact Ribbon Style/Color tile is a visual treatment, not a license to
	// replace the author's data with the frozen corpus specimen. For every family
	// the native serializer can author (legacy and ChartEx), keep the caller's
	// data and generated chart XML authoritative, then attach the captured Office
	// style/color resources. Full package replay remains necessary for imported
	// preserve-only families and Filled Map, whose geography/fallback payload is
	// part of the executable object rather than merely its visual treatment.
	const generatedFamily = !requiresPackageReplay(tile.chartType) && tile.chartType !== 'regionMap'
	if (generatedFamily && ['styles', 'colors'].includes(tile.galleryKind)) {
		return {
			...generatedChartGalleryState(chartXml),
			...capturedResources,
		}
	}
	return {
		_rawChartXml: chartXml,
		_rawChartRelsXml: rewrittenRels,
		...(workbookBase64 && workbookName ? { _rawChartWorkbookBase64: workbookBase64, _rawChartWorkbookName: workbookName } : {}),
		...capturedResources,
		...(fallbackImage ? { _rawChartFallbackImageBase64: `data:${fallbackImage.contentType};base64,${fallbackImage.base64}`, _rawChartFallbackImageContentType: fallbackImage.contentType } : {}),
	}
}

/** Resolve the same chart plan for direct-code and MCP authoring. */
export async function resolveChartPlan(request: ChartPlanRequest = {}, repoRoot: string): Promise<ChartPlanResolution> {
	const hasRequestedType = request.chartType != null && String(request.chartType).trim() !== ''
	const requestedSemanticType = semanticChartType(request.chartType)
	if (hasRequestedType && !requestedSemanticType) throw new Error(`Unsupported chart type: ${String(request.chartType)}`)
	const requestedType = requestedSemanticType
	const semanticPreset = request.chartPresetId ? chartPresetById(String(request.chartPresetId)) : undefined
	if (request.chartPresetId && !semanticPreset) throw new Error(`Unknown chartPresetId: ${String(request.chartPresetId)}`)
	if (semanticPreset && !['native', 'native-composite'].includes(semanticPreset.authoringMode)) throw new Error(`Chart preset ${semanticPreset.id} is ${semanticPreset.authoringMode}; use its governed shape/preserve route rather than native chart insertion`)
	const presetTypes = semanticPreset ? [semanticPreset.chartType, ...(semanticPreset.chartTypes || [])].map(type => semanticChartType(type)).filter(Boolean) as string[] : []
	if (requestedType && presetTypes.length && !presetTypes.includes(requestedType)) throw new Error(`Chart preset ${semanticPreset!.id} is not applicable to ${requestedType}`)
	const plan: ResolvedChartPlan = {
		...(semanticPreset ? { chartPresetId: semanticPreset.id, ...(semanticPreset.optionDefaults || {}) } : {}),
		...(requestedType ? { chartType: runtimeChartType(requestedType) || requestedType } : semanticPreset?.chartType ? { chartType: runtimeChartType(semanticChartType(semanticPreset.chartType)) || semanticPreset.chartType } : {}),
	}
	if (requestedType && requiresPackageReplay(requestedType) && !request.chartGalleryTilePresetId && !semanticPreset?.optionDefaults?._rawChartXml) {
		throw new Error(`Chart type ${requestedType} is preserve/replay-backed; select an exact chartGalleryTilePresetId or use its governed preserve/edit route`)
	}
	if (request.chartStylePresetId) {
		const preset = chartStylePresetById(String(request.chartStylePresetId))
		if (!preset) throw new Error(`Unknown chartStylePresetId: ${String(request.chartStylePresetId)}`)
		if (requestedType && !preset.supportedChartTypes.includes(requestedType)) throw new Error(`Chart style preset ${preset.id} is not applicable to ${requestedType}`)
		Object.assign(plan, preset.optionDefaults, { chartStylePresetId: preset.id })
	}
	if (request.chartGalleryVariant != null) plan.chartGalleryVariant = Number(request.chartGalleryVariant)
	if (request.chartStyleId != null) plan.chartStyleId = Number(request.chartStyleId)
	if (request.chartStyleModernId != null) plan.chartStyleModernId = Number(request.chartStyleModernId)
	if (request.chartColorStyleId != null) plan.chartColorStyleId = Number(request.chartColorStyleId)
	if (request.chartLayoutPresetId) plan.chartLayoutPresetId = String(request.chartLayoutPresetId)
	const treatmentIds = [...(request.chartTreatmentPresetIds || []), ...(request.chartTreatmentPresetId ? [request.chartTreatmentPresetId] : [])].map(String)
	if (treatmentIds.length) {
		if (request.chartGalleryTilePresetId) throw new Error('An exact Ribbon tile and a treatment bundle cannot be combined in one chart plan; choose one package-backed state or use the treatment on a native chart preset.')
		for (const id of treatmentIds) {
			const treatment = chartTreatmentPresetById(id)
			if (!treatment) throw new Error(`Unknown chartTreatmentPresetId: ${id}`)
			const treatmentType = semanticChartType(treatment.preset.semanticType)
			if (requestedType && treatmentType && requestedType !== treatmentType) throw new Error(`Chart treatment ${id} is not applicable to ${requestedType}`)
			if (!plan.chartType && treatmentType) plan.chartType = treatmentType
			Object.assign(plan, treatment.optionDefaults)
		}
		plan.chartTreatmentPresetIds = treatmentIds
		if (treatmentIds.length === 1) plan.chartTreatmentPresetId = treatmentIds[0]
	}
	if (!request.chartGalleryTilePresetId) return { plan, mode: Object.keys(plan).length ? 'native-style' : 'none' }
	if (request.chartStylePresetId || request.chartGalleryVariant != null || request.chartStyleId != null || request.chartStyleModernId != null || request.chartColorStyleId != null || request.chartLayoutPresetId || treatmentIds.length) {
		throw new Error('An exact Ribbon tile already contains its captured style, color, and layout state; do not combine it with another exact chart resource or treatment in one chart plan.')
	}
	const tile = chartGalleryTilePresetById(String(request.chartGalleryTilePresetId), { chartType: requestedType || undefined })
	if (!tile) throw new Error(`Unknown or inapplicable chartGalleryTilePresetId: ${String(request.chartGalleryTilePresetId)}`)
	const replay = await loadPackageReplay(tile, repoRoot)
	if (!replay) throw new Error(`Chart gallery preset ${tile.id} has no executable package replay yet`)
	Object.assign(plan, replay, { chartGalleryTilePresetId: tile.id, chartType: runtimeChartType(tile.chartType) || tile.chartType })
	const mode = replay._rawChartXml
		? 'gallery-package-replay'
		: tile.galleryKind === 'colors'
			? 'native-color'
			: 'native-style'
	return { plan, tile, mode }
}
