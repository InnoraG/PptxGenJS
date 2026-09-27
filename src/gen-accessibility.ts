/**
 * Native non-visual accessibility metadata shared by every slide object.
 *
 * PowerPoint stores the accessible title/description directly on p:cNvPr and
 * stores the Reading Order "decorative" state in one Office 2017 extension.
 * Keep this generator narrow so hyperlink/media-action children can be passed
 * through unchanged and the decorative extension is always emitted last.
 */

import { encodeXmlEntities } from './gen-utils'

export const ACCESSIBILITY_DECORATIVE_EXT_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}'
export const ACCESSIBILITY_DECORATIVE_NS = 'http://schemas.microsoft.com/office/drawing/2017/decorative'

export interface NonVisualAccessibilityProps {
	/** Accessible title written to p:cNvPr/@title. */
	accessibilityTitle?: string | null
	/** Accessible description written to p:cNvPr/@descr. */
	altText?: string | null
	/** Explicit Reading Order inclusion state. False remains an authored value. */
	isDecorative?: boolean | null
	/** @internal Structured PowerPoint Action Settings lowered by the semantic compiler. */
	interactiveActions?: InteractiveActionSetLike | InteractiveActionEndpointLike | null
}

interface InteractiveActionSoundLike {
	name?: string
	_soundRid?: number
}

interface InteractiveActionEndpointLike {
	type: 'url' | 'slide' | 'jump' | 'endShow' | 'customShow' | 'none'
	jump?: 'firstSlide' | 'lastSlide' | 'lastSlideViewed' | 'nextSlide' | 'previousSlide'
	customShowId?: number
	showAndReturn?: true
	tooltip?: string | null
	history?: boolean | null
	highlightClick?: boolean | null
	endSound?: boolean | null
	sound?: InteractiveActionSoundLike | null
	_rId?: number
}

interface InteractiveActionSetLike {
	click?: InteractiveActionEndpointLike | null
	hover?: InteractiveActionEndpointLike | null
}

export interface CNvPrProps {
	id: string | number
	name: unknown
	creationId?: string | number | null
	options?: NonVisualAccessibilityProps | null
	children?: string
	extensionChildren?: string
	extraAttributes?: Record<string, string | number | boolean | null | undefined>
}

function meaningfulString(value: unknown): string | null {
	return typeof value === 'string' && value.length > 0 ? value : null
}

export function genXmlAccessibilityAttributes(options: NonVisualAccessibilityProps | null | undefined): string {
	// PowerPoint clears title/description when an object becomes decorative. The
	// public compiler rejects this contradictory combination; the library also
	// fails safe for direct callers by never serializing meaningful metadata on a
	// decorative carrier.
	if (options?.isDecorative === true) return ''
	const title = meaningfulString(options?.accessibilityTitle)
	const description = meaningfulString(options?.altText)
	return `${title ? ` title="${encodeXmlEntities(title)}"` : ''}${description ? ` descr="${encodeXmlEntities(description)}"` : ''}`
}

export function genXmlAccessibilityExtensionEntry(options: NonVisualAccessibilityProps | null | undefined): string {
	if (typeof options?.isDecorative !== 'boolean') return ''
	return `<a:ext uri="${ACCESSIBILITY_DECORATIVE_EXT_URI}"><adec:decorative xmlns:adec="${ACCESSIBILITY_DECORATIVE_NS}" val="${options.isDecorative ? 1 : 0}"/></a:ext>`

}

export function genXmlAccessibilityExtension(options: NonVisualAccessibilityProps | null | undefined): string {
	const entry = genXmlAccessibilityExtensionEntry(options)
	return entry ? `<a:extLst>${entry}</a:extLst>` : ''
}

const ACTION_URIS: Record<string, string> = {
	slide: 'ppaction://hlinksldjump',
	firstSlide: 'ppaction://hlinkshowjump?jump=firstslide',
	lastSlide: 'ppaction://hlinkshowjump?jump=lastslide',
	lastSlideViewed: 'ppaction://hlinkshowjump?jump=lastslideviewed',
	nextSlide: 'ppaction://hlinkshowjump?jump=nextslide',
	previousSlide: 'ppaction://hlinkshowjump?jump=previousslide',
	endShow: 'ppaction://hlinkshowjump?jump=endshow',
	none: 'ppaction://noaction',
}

function endpointActionUri(endpoint: InteractiveActionEndpointLike): string | null {
	if (endpoint.type === 'url') return null
	if (endpoint.type === 'slide') return ACTION_URIS.slide
	if (endpoint.type === 'jump' && endpoint.jump) return ACTION_URIS[endpoint.jump] || null
	if (endpoint.type === 'endShow') return ACTION_URIS.endShow
	if (endpoint.type === 'none') return ACTION_URIS.none
	if (endpoint.type === 'customShow' && Number.isInteger(endpoint.customShowId) && endpoint.showAndReturn === true) {
		return `ppaction://customshow?id=${endpoint.customShowId}&return=true`
	}
	return null
}

function actionEndpointXml(tag: 'hlinkClick' | 'hlinkHover', endpoint: InteractiveActionEndpointLike | null | undefined): string {
	if (!endpoint) return ''
	const uri = endpointActionUri(endpoint)
	if (endpoint.type !== 'url' && !uri) throw new Error(`Unsupported structured PowerPoint action type: ${endpoint.type}`)
	const attributes = [
		`r:id="${endpoint._rId ? `rId${endpoint._rId}` : ''}"`,
		uri ? `action="${encodeXmlEntities(uri)}"` : '',
		typeof endpoint.tooltip === 'string' && endpoint.tooltip.length ? `tooltip="${encodeXmlEntities(endpoint.tooltip)}"` : '',
		typeof endpoint.history === 'boolean' ? `history="${endpoint.history ? 1 : 0}"` : '',
		typeof endpoint.highlightClick === 'boolean' ? `highlightClick="${endpoint.highlightClick ? 1 : 0}"` : '',
		typeof endpoint.endSound === 'boolean' ? `endSnd="${endpoint.endSound ? 1 : 0}"` : '',
	].filter(Boolean).join(' ')
	const soundRid = endpoint.sound?._soundRid
	const sound = soundRid
		? `<a:snd r:embed="rId${soundRid}" name="${encodeXmlEntities(endpoint.sound?.name || 'sound.wav')}"/>`
		: ''
	return sound ? `<a:${tag} ${attributes}>${sound}</a:${tag}>` : `<a:${tag} ${attributes}/>`
}

function genXmlInteractiveActions(options: NonVisualAccessibilityProps | null | undefined): string {
	const value = options?.interactiveActions
	if (!value || typeof value !== 'object') return ''
	const actions: InteractiveActionSetLike = 'type' in value ? { click: value as InteractiveActionEndpointLike } : value as InteractiveActionSetLike
	return actionEndpointXml('hlinkClick', actions.click) + actionEndpointXml('hlinkHover', actions.hover)
}

/** Generate one complete p:cNvPr while preserving caller-owned child XML. */
export function genXmlCNvPr(props: CNvPrProps): string {
	const attributes = [
		`id="${encodeXmlEntities(String(props.id))}"`,
		`name="${encodeXmlEntities(String(props.name ?? ''))}"`,
		props.creationId === undefined || props.creationId === null ? '' : `creationId="${encodeXmlEntities(String(props.creationId))}"`,
		...Object.entries(props.extraAttributes || {}).map(([key, value]) => value === undefined || value === null ? '' : `${key}="${encodeXmlEntities(String(value))}"`),
	].filter(Boolean).join(' ')
	const metadataAttributes = genXmlAccessibilityAttributes(props.options)
	const extensionEntries = `${props.extensionChildren || ''}${genXmlAccessibilityExtensionEntry(props.options)}`
	const actionChildren = genXmlInteractiveActions(props.options)
	if (actionChildren.includes('<a:hlinkClick') && String(props.children || '').includes('<a:hlinkClick')) {
		throw new Error('Structured click action conflicts with caller-owned click hyperlink XML.')
	}
	if (actionChildren.includes('<a:hlinkHover') && String(props.children || '').includes('<a:hlinkHover')) {
		throw new Error('Structured hover action conflicts with caller-owned hover hyperlink XML.')
	}
	const body = `${props.children || ''}${actionChildren}${extensionEntries ? `<a:extLst>${extensionEntries}</a:extLst>` : ''}`
	return body
		? `<p:cNvPr ${attributes}${metadataAttributes}>${body}</p:cNvPr>`
		: `<p:cNvPr ${attributes}${metadataAttributes}/>`
}
