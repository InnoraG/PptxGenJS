/**
 * Native non-visual accessibility metadata shared by every slide object.
 *
 * PowerPoint stores the accessible title/description directly on p:cNvPr and
 * stores the Reading Order "decorative" state in one Office 2017 extension.
 * Keep this generator narrow so hyperlink/media-action children can be passed
 * through unchanged and the decorative extension is always emitted last.
 */
import { encodeXmlEntities } from './gen-utils';
export const ACCESSIBILITY_DECORATIVE_EXT_URI = '{C183D7F6-B498-43B3-948B-1728B52AA6E4}';
export const ACCESSIBILITY_DECORATIVE_NS = 'http://schemas.microsoft.com/office/drawing/2017/decorative';
function meaningfulString(value) {
    return typeof value === 'string' && value.length > 0 ? value : null;
}
export function genXmlAccessibilityAttributes(options) {
    // PowerPoint clears title/description when an object becomes decorative. The
    // public compiler rejects this contradictory combination; the library also
    // fails safe for direct callers by never serializing meaningful metadata on a
    // decorative carrier.
    if ((options === null || options === void 0 ? void 0 : options.isDecorative) === true)
        return '';
    const title = meaningfulString(options === null || options === void 0 ? void 0 : options.accessibilityTitle);
    const description = meaningfulString(options === null || options === void 0 ? void 0 : options.altText);
    return `${title ? ` title="${encodeXmlEntities(title)}"` : ''}${description ? ` descr="${encodeXmlEntities(description)}"` : ''}`;
}
export function genXmlAccessibilityExtensionEntry(options) {
    if (typeof (options === null || options === void 0 ? void 0 : options.isDecorative) !== 'boolean')
        return '';
    return `<a:ext uri="${ACCESSIBILITY_DECORATIVE_EXT_URI}"><adec:decorative xmlns:adec="${ACCESSIBILITY_DECORATIVE_NS}" val="${options.isDecorative ? 1 : 0}"/></a:ext>`;
}
export function genXmlAccessibilityExtension(options) {
    const entry = genXmlAccessibilityExtensionEntry(options);
    return entry ? `<a:extLst>${entry}</a:extLst>` : '';
}
const ACTION_URIS = {
    slide: 'ppaction://hlinksldjump',
    firstSlide: 'ppaction://hlinkshowjump?jump=firstslide',
    lastSlide: 'ppaction://hlinkshowjump?jump=lastslide',
    lastSlideViewed: 'ppaction://hlinkshowjump?jump=lastslideviewed',
    nextSlide: 'ppaction://hlinkshowjump?jump=nextslide',
    previousSlide: 'ppaction://hlinkshowjump?jump=previousslide',
    endShow: 'ppaction://hlinkshowjump?jump=endshow',
    none: 'ppaction://noaction',
};
function endpointActionUri(endpoint) {
    if (endpoint.type === 'url')
        return null;
    if (endpoint.type === 'slide')
        return ACTION_URIS.slide;
    if (endpoint.type === 'jump' && endpoint.jump)
        return ACTION_URIS[endpoint.jump] || null;
    if (endpoint.type === 'endShow')
        return ACTION_URIS.endShow;
    if (endpoint.type === 'none')
        return ACTION_URIS.none;
    if (endpoint.type === 'customShow' && Number.isInteger(endpoint.customShowId) && endpoint.showAndReturn === true) {
        return `ppaction://customshow?id=${endpoint.customShowId}&return=true`;
    }
    return null;
}
function actionEndpointXml(tag, endpoint) {
    var _a, _b;
    if (!endpoint)
        return '';
    const uri = endpointActionUri(endpoint);
    if (endpoint.type !== 'url' && !uri)
        throw new Error(`Unsupported structured PowerPoint action type: ${endpoint.type}`);
    const attributes = [
        `r:id="${endpoint._rId ? `rId${endpoint._rId}` : ''}"`,
        uri ? `action="${encodeXmlEntities(uri)}"` : '',
        typeof endpoint.tooltip === 'string' && endpoint.tooltip.length ? `tooltip="${encodeXmlEntities(endpoint.tooltip)}"` : '',
        typeof endpoint.history === 'boolean' ? `history="${endpoint.history ? 1 : 0}"` : '',
        typeof endpoint.highlightClick === 'boolean' ? `highlightClick="${endpoint.highlightClick ? 1 : 0}"` : '',
        typeof endpoint.endSound === 'boolean' ? `endSnd="${endpoint.endSound ? 1 : 0}"` : '',
    ].filter(Boolean).join(' ');
    const soundRid = (_a = endpoint.sound) === null || _a === void 0 ? void 0 : _a._soundRid;
    const sound = soundRid
        ? `<a:snd r:embed="rId${soundRid}" name="${encodeXmlEntities(((_b = endpoint.sound) === null || _b === void 0 ? void 0 : _b.name) || 'sound.wav')}"/>`
        : '';
    return sound ? `<a:${tag} ${attributes}>${sound}</a:${tag}>` : `<a:${tag} ${attributes}/>`;
}
function genXmlInteractiveActions(options) {
    const value = options === null || options === void 0 ? void 0 : options.interactiveActions;
    if (!value || typeof value !== 'object')
        return '';
    const actions = 'type' in value ? { click: value } : value;
    return actionEndpointXml('hlinkClick', actions.click) + actionEndpointXml('hlinkHover', actions.hover);
}
/** Generate one complete p:cNvPr while preserving caller-owned child XML. */
export function genXmlCNvPr(props) {
    var _a;
    const attributes = [
        `id="${encodeXmlEntities(String(props.id))}"`,
        `name="${encodeXmlEntities(String((_a = props.name) !== null && _a !== void 0 ? _a : ''))}"`,
        props.creationId === undefined || props.creationId === null ? '' : `creationId="${encodeXmlEntities(String(props.creationId))}"`,
        ...Object.entries(props.extraAttributes || {}).map(([key, value]) => value === undefined || value === null ? '' : `${key}="${encodeXmlEntities(String(value))}"`),
    ].filter(Boolean).join(' ');
    const metadataAttributes = genXmlAccessibilityAttributes(props.options);
    const extensionEntries = `${props.extensionChildren || ''}${genXmlAccessibilityExtensionEntry(props.options)}`;
    const actionChildren = genXmlInteractiveActions(props.options);
    if (actionChildren.includes('<a:hlinkClick') && String(props.children || '').includes('<a:hlinkClick')) {
        throw new Error('Structured click action conflicts with caller-owned click hyperlink XML.');
    }
    if (actionChildren.includes('<a:hlinkHover') && String(props.children || '').includes('<a:hlinkHover')) {
        throw new Error('Structured hover action conflicts with caller-owned hover hyperlink XML.');
    }
    const body = `${props.children || ''}${actionChildren}${extensionEntries ? `<a:extLst>${extensionEntries}</a:extLst>` : ''}`;
    return body
        ? `<p:cNvPr ${attributes}${metadataAttributes}>${body}</p:cNvPr>`
        : `<p:cNvPr ${attributes}${metadataAttributes}/>`;
}
//# sourceMappingURL=gen-accessibility.js.map