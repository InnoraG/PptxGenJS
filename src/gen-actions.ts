/**
 * Repair-safe relationship preparation for native PowerPoint Action Settings.
 *
 * This runs once immediately before media encoding. Keeping allocation here
 * makes action sounds ordinary package media and keeps XML serialization free
 * from package mutation.
 */

import { SLIDE_OBJECT_TYPES } from './core-enums'
import {
	HyperlinkProps,
	InteractiveActionEndpointProps,
	InteractiveActionSetProps,
	ISlideObject,
	ObjectOptions,
	PresSlide,
} from './core-interfaces'
import { getNewRelId } from './gen-utils'

function actionSet(options: ObjectOptions | undefined): InteractiveActionSetProps | null {
	const value = options?.interactiveActions
	if (!value || typeof value !== 'object') return null
	if ('type' in value) return { click: value as InteractiveActionEndpointProps }
	return value as InteractiveActionSetProps
}

function legacyHyperlink(obj: ISlideObject, options: ObjectOptions): HyperlinkProps | undefined {
	return obj.hyperlink || options.hyperlink
}

function endpointAgreesWithHyperlink(endpoint: InteractiveActionEndpointProps, hyperlink: HyperlinkProps): boolean {
	if (endpoint.type === 'url') return Boolean(endpoint.url && endpoint.url === hyperlink.url)
	if (endpoint.type === 'slide') return Boolean(endpoint.targetSlide && endpoint.targetSlide === hyperlink.slide)
	return false
}

function allocateTargetRelationship(slide: PresSlide, endpoint: InteractiveActionEndpointProps): void {
	if (endpoint.type !== 'url' && endpoint.type !== 'slide') return
	if (endpoint._rId && slide._rels.some(rel => rel.rId === endpoint._rId)) return
	if (endpoint.type === 'url' && !endpoint.url) throw new Error('Interactive URL action requires a resolved URL.')
	if (endpoint.type === 'slide' && (!Number.isInteger(endpoint.targetSlide) || Number(endpoint.targetSlide) < 1)) {
		throw new Error('Interactive slide action requires a resolved one-based targetSlide.')
	}
	const rId = getNewRelId(slide)
	slide._rels.push({
		type: SLIDE_OBJECT_TYPES.hyperlink,
		data: endpoint.type === 'slide' ? 'slide' : 'dummy',
		rId,
		Target: endpoint.type === 'slide' ? String(endpoint.targetSlide) : String(endpoint.url),
		_interactiveActionOwned: true,
	})
	endpoint._rId = rId
}

function defaultSoundName(source: string): string {
	if (source.startsWith('data:')) return 'sound.wav'
	const withoutQuery = source.includes('?') ? source.substring(0, source.indexOf('?')) : source
	const slashName = withoutQuery.split('/').pop() || ''
	const name = slashName.split('\\').pop() || ''
	return name.toLocaleLowerCase().endsWith('.wav') ? name : 'sound.wav'
}

function allocateSoundRelationship(slide: PresSlide, endpoint: InteractiveActionEndpointProps): void {
	const sound = endpoint.sound
	if (!sound) return
	if (sound.format !== 'wav' || typeof sound.source !== 'string' || !sound.source.length) {
		throw new Error('Interactive action sounds require a non-empty WAV source.')
	}
	if (sound._soundRid && slide._relsMedia.some(rel => rel.rId === sound._soundRid)) return
	const isInline = sound.source.startsWith('data:')
	if (isInline && (!sound.source.includes(';base64,') || !sound.source.toLocaleLowerCase().startsWith('data:audio/'))) {
		throw new Error('Inline interactive action sound must be a base64 audio data URI.')
	}
	const rId = getNewRelId(slide)
	const existing = slide._relsMedia.find(rel =>
		rel.type === 'audio/x-wav' &&
		((isInline && rel.data === sound.source) || (!isInline && rel.path === sound.source))
	)
	slide._relsMedia.push({
		path: isInline ? 'preencoded.wav' : sound.source,
		data: isInline ? sound.source : '',
		type: 'audio/x-wav',
		extn: 'wav',
		rId,
		isDuplicate: Boolean(existing),
		Target: existing?.Target || `../media/action-sound-${slide._slideNum}-${rId}.wav`,
		mediaRelationshipRole: 'primary',
		_interactiveActionOwned: true,
	})
	sound.name = sound.name || defaultSoundName(sound.source)
	sound._soundRid = rId
}

function prepareEndpoint(slide: PresSlide, endpoint: InteractiveActionEndpointProps | null | undefined): void {
	if (!endpoint) return
	allocateTargetRelationship(slide, endpoint)
	allocateSoundRelationship(slide, endpoint)
}

function prepareOptions(slide: PresSlide, obj: ISlideObject, options: ObjectOptions): void {
	const actions = actionSet(options)
	if (!actions) return
	if (obj._type === SLIDE_OBJECT_TYPES.media) {
		throw new Error('Interactive object actions cannot share the native media playback carrier.')
	}
	const hyperlink = legacyHyperlink(obj, options)
	if (hyperlink && actions.click) {
		if (!endpointAgreesWithHyperlink(actions.click, hyperlink)) {
			throw new Error('Interactive click action conflicts with the object hyperlink target.')
		}
		actions.click._rId = hyperlink._rId
		;(options as ObjectOptions & { _suppressLegacyHyperlinkForInteractiveAction?: boolean })._suppressLegacyHyperlinkForInteractiveAction = true
	}
	prepareEndpoint(slide, actions.click)
	prepareEndpoint(slide, actions.hover)
}

function prepareObject(slide: PresSlide, obj: ISlideObject): void {
	if (obj.options) prepareOptions(slide, obj, obj.options)
	const group = obj.group as unknown as { children?: ObjectOptions[] } | undefined
	if (group?.children) {
		for (const child of group.children) {
			prepareOptions(slide, { _type: SLIDE_OBJECT_TYPES.shape, options: child }, child)
		}
	}
}

function clearEndpointRelationshipRefs(endpoint: InteractiveActionEndpointProps | null | undefined): void {
	if (!endpoint) return
	delete endpoint._rId
	if (endpoint.sound) delete endpoint.sound._soundRid
}

function clearOptionsRelationshipRefs(options: ObjectOptions | undefined): void {
	const actions = actionSet(options)
	if (!actions) return
	clearEndpointRelationshipRefs(actions.click)
	clearEndpointRelationshipRefs(actions.hover)
}

function clearObjectRelationshipRefs(obj: ISlideObject): void {
	clearOptionsRelationshipRefs(obj.options)
	const group = obj.group as unknown as { children?: ObjectOptions[] } | undefined
	for (const child of group?.children || []) clearOptionsRelationshipRefs(child)
}

/** Allocate every URL/slide/WAV relationship needed by structured actions. */
export function prepareInteractiveActionRelations(slide: PresSlide): void {
	// Rebuild only action-owned relationships on every export. This gives replace,
	// reset, delete, and re-edit one deterministic lifecycle and prevents stale
	// action sounds or hyperlinks from surviving after their carrier is cleared.
	for (const obj of slide._slideObjects || []) clearObjectRelationshipRefs(obj)
	slide._rels = (slide._rels || []).filter(rel => !rel._interactiveActionOwned)
	slide._relsMedia = (slide._relsMedia || []).filter(rel => !rel._interactiveActionOwned)
	for (const obj of slide._slideObjects || []) prepareObject(slide, obj)
}
