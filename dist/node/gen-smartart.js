/**
 * PptxGenJS: Native PowerPoint SmartArt generation
 */
import { encodeXmlEntities, getUuid } from './gen-utils';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { SMARTART_COLOR_STYLE_DEFINITIONS, SMARTART_LAYOUT_DEFINITIONS, SMARTART_QUICK_STYLE_DEFINITIONS, } from './smartart-reference';
export const SMARTART_REL_TYPES = {
    data: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramData',
    layout: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramLayout',
    quickStyle: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramQuickStyle',
    colors: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/diagramColors',
    drawing: 'http://schemas.microsoft.com/office/2007/relationships/diagramDrawing',
};
const SMARTART_CONTENT_TYPES = {
    data: 'application/vnd.openxmlformats-officedocument.drawingml.diagramData+xml',
    layout: 'application/vnd.openxmlformats-officedocument.drawingml.diagramLayout+xml',
    quickStyle: 'application/vnd.openxmlformats-officedocument.drawingml.diagramStyle+xml',
    colors: 'application/vnd.openxmlformats-officedocument.drawingml.diagramColors+xml',
    drawing: 'application/vnd.ms-office.drawingml.diagramDrawing+xml',
};
const IMAGE_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';
const BASIC_BLOCK_LIST_LAYOUT_ID = 'urn:microsoft.com/office/officeart/2005/8/layout/default';
const DEFAULT_NATIVE_QUICK_STYLE_ID = 'urn:microsoft.com/office/officeart/2005/8/quickstyle/3d1';
const DEFAULT_NATIVE_COLOR_STYLE_ID = 'urn:microsoft.com/office/officeart/2005/8/colors/colorful1';
const DEFAULT_LAYOUT_BY_CATEGORY = {
    list: 'Basic Block List',
    process: 'Basic Process',
    cycle: 'Basic Cycle',
    hierarchy: 'Organization Chart',
    relationship: 'Basic Radial',
    matrix: 'Basic Matrix',
    pyramid: 'Basic Pyramid',
    picture: 'Picture Caption List',
    timeline: 'Alternating Circle Process',
    team: 'Meet The Team',
    meettheteam: 'Meet The Team',
};
function guid() {
    return `{${getUuid('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx').toUpperCase()}}`;
}
function catalogKey(value) {
    let out = '';
    for (const char of String(value || '').toLowerCase()) {
        if ((char >= 'a' && char <= 'z') || (char >= '0' && char <= '9'))
            out += char;
    }
    return out;
}
function findCatalogEntry(entries, requested, fallbackId) {
    const fallback = entries.find(entry => entry.id === fallbackId) || entries[0];
    if (!requested)
        return fallback;
    const raw = String(requested);
    const key = catalogKey(raw);
    return entries.find(entry => entry.id === raw ||
        catalogKey(entry.id) === key ||
        catalogKey(entry.name) === key ||
        catalogKey(entry.category) === key) || fallback;
}
function resolveLayout(opt) {
    const requested = opt.layoutId || opt.layoutName || opt.layout || BASIC_BLOCK_LIST_LAYOUT_ID;
    const key = catalogKey(requested);
    const defaultByCategory = DEFAULT_LAYOUT_BY_CATEGORY[key];
    if (defaultByCategory)
        return findCatalogEntry(SMARTART_LAYOUT_DEFINITIONS, defaultByCategory, BASIC_BLOCK_LIST_LAYOUT_ID);
    const direct = findCatalogEntry(SMARTART_LAYOUT_DEFINITIONS, requested, BASIC_BLOCK_LIST_LAYOUT_ID);
    if (direct.id === BASIC_BLOCK_LIST_LAYOUT_ID && requested && !['basicblocklist', 'basicblock', 'blocklist', 'list', 'default'].includes(key) && key !== catalogKey(BASIC_BLOCK_LIST_LAYOUT_ID)) {
        const categoryMatch = SMARTART_LAYOUT_DEFINITIONS.find(entry => catalogKey(entry.category) === key);
        if (categoryMatch)
            return categoryMatch;
    }
    return direct;
}
function resolveQuickStyle(opt) {
    const requested = opt.quickStyleId || opt.quickStyleName;
    const key = catalogKey(requested || '');
    if (!requested || ['best', 'default', 'premium', 'polished', '3d'].includes(key)) {
        return findCatalogEntry(SMARTART_QUICK_STYLE_DEFINITIONS, DEFAULT_NATIVE_QUICK_STYLE_ID, DEFAULT_NATIVE_QUICK_STYLE_ID);
    }
    return findCatalogEntry(SMARTART_QUICK_STYLE_DEFINITIONS, requested, DEFAULT_NATIVE_QUICK_STYLE_ID);
}
function resolveColorStyle(opt) {
    const requested = opt.colorStyleId || opt.colorStyleName;
    const key = catalogKey(requested || '');
    if (!requested || ['best', 'default', 'premium', 'colorful'].includes(key)) {
        return findCatalogEntry(SMARTART_COLOR_STYLE_DEFINITIONS, DEFAULT_NATIVE_COLOR_STYLE_ID, DEFAULT_NATIVE_COLOR_STYLE_ID);
    }
    return findCatalogEntry(SMARTART_COLOR_STYLE_DEFINITIONS, requested, DEFAULT_NATIVE_COLOR_STYLE_ID);
}
function resolveNativeSmartArt(opt) {
    return {
        layout: resolveLayout(opt),
        quickStyle: resolveQuickStyle(opt),
        colorStyle: resolveColorStyle(opt),
    };
}
function nodeText(node, index) {
    if (typeof node === 'string')
        return node || `Node ${index + 1}`;
    return node.text || node.title || node.subtitle || `Node ${index + 1}`;
}
function nodeImageSource(node) {
    var _a, _b, _c;
    if (typeof node === 'string')
        return undefined;
    const maybeImage = (_c = (_b = (_a = node.image) !== null && _a !== void 0 ? _a : node.imagePath) !== null && _b !== void 0 ? _b : node.imageData) !== null && _c !== void 0 ? _c : node.imageUrl;
    return typeof maybeImage === 'string' && maybeImage.trim().length > 0 ? maybeImage.trim() : undefined;
}
function normalizeNodes(opt) {
    const source = opt.nodes && opt.nodes.length > 0 ? opt.nodes : ['Node 1', 'Node 2', 'Node 3'];
    return source.map(nodeText).filter(text => text.length > 0);
}
function normalizeNativeNodes(opt) {
    const source = opt.nodes && opt.nodes.length > 0 ? opt.nodes : ['Node 1', 'Node 2', 'Node 3'];
    const out = [];
    const addNode = (node, parentId, level, siblingIndex) => {
        const text = nodeText(node, out.length);
        if (!text)
            return;
        const item = {
            text,
            imageSource: nodeImageSource(node),
            modelId: guid(),
            parentId,
            level,
            siblingIndex,
            parTransId: guid(),
            sibTransId: guid(),
            cxnId: guid(),
            presId: guid(),
            presSibId: guid(),
        };
        out.push(item);
        if (typeof node !== 'string' && node.children && node.children.length > 0) {
            node.children.forEach((child, index) => addNode(child, item.modelId, level + 1, index));
        }
    };
    source.forEach((node, index) => addNode(node, null, 0, index));
    return out;
}
function contentTypeExt(contentType) {
    const lower = contentType.toLowerCase();
    if (lower === 'image/png')
        return 'png';
    if (lower === 'image/jpeg' || lower === 'image/jpg')
        return 'jpg';
    if (lower === 'image/gif')
        return 'gif';
    if (lower === 'image/webp')
        return 'webp';
    if (lower === 'image/svg+xml')
        return 'svg';
    if (lower === 'image/bmp')
        return 'bmp';
    if (lower === 'image/tiff')
        return 'tiff';
    return null;
}
function parseImageDataUri(source, relId, imageIndex) {
    if (!source || !source.startsWith('data:image/'))
        return null;
    const comma = source.indexOf(',');
    if (comma < 0)
        return null;
    const header = source.slice('data:'.length, comma);
    const headerParts = header.split(';').map(part => part.trim().toLowerCase()).filter(Boolean);
    const contentType = headerParts[0] || '';
    if (!contentType.startsWith('image/') || !headerParts.includes('base64'))
        return null;
    const ext = contentTypeExt(contentType);
    if (!ext)
        return null;
    const base64 = source.slice(comma + 1).trim();
    if (!base64)
        return null;
    return {
        relId,
        mediaPath: `ppt/media/smartart${imageIndex}.${ext}`,
        contentType,
        base64,
    };
}
function attachImageParts(nodes, partIndex) {
    const parts = [];
    let imageIndex = 1;
    nodes.forEach(node => {
        const relId = `rIdImg${imageIndex}`;
        const parsed = parseImageDataUri(node.imageSource, relId, (partIndex * 1000) + imageIndex);
        if (!parsed)
            return;
        node.image = parsed;
        node.compPresId = guid();
        node.imagePresId = guid();
        parts.push({
            path: parsed.mediaPath,
            data: parsed.base64,
            encoding: 'base64',
            contentType: parsed.contentType,
            defaultContentType: parsed.contentType,
        });
        imageIndex++;
    });
    return parts;
}
function isPictureLayout(resolved) {
    return catalogKey(`${resolved.layout.category} ${resolved.layout.name} ${resolved.layout.id}`).includes('picture');
}
function isPictureCaptionListLayout(resolved) {
    return catalogKey(resolved.layout.id).includes('layoutplist1') || catalogKey(resolved.layout.name) === 'picturecaptionlist';
}
function elementChildren(el) {
    const out = [];
    for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes.item(i);
        if (child && child.nodeType === 1)
            out.push(child);
    }
    return out;
}
function localName(el) {
    return el.localName || el.nodeName.split(':').pop() || el.nodeName;
}
function directChild(el, name) {
    return elementChildren(el).find(child => localName(child) === name) || null;
}
function directChildren(el, name) {
    return elementChildren(el).filter(child => localName(child) === name);
}
function hasDirectChild(el, name) {
    return directChild(el, name) !== null;
}
function containsAny(value, needles) {
    return needles.some(needle => value.includes(needle));
}
function layoutNodeAlg(el) {
    const alg = directChild(el, 'alg');
    return (alg === null || alg === void 0 ? void 0 : alg.getAttribute('type')) || undefined;
}
function isImageLayoutEntry(name, styleLbl, alg) {
    const key = catalogKey(`${name} ${styleLbl || ''}`);
    if (containsAny(key, ['image', 'img', 'pict', 'picture', 'photo', 'fgimgplace', 'bgimgplace', 'alignimgplace']))
        return true;
    if (alg !== 'sp')
        return false;
    if (containsAny(key, ['sibtrans', 'spacing', 'spacer', 'space', 'conn', 'adorn', 'accent', 'text', 'tx']))
        return false;
    return true;
}
function isTextLayoutEntry(name, styleLbl, alg) {
    if (alg === 'tx')
        return true;
    const key = catalogKey(`${name} ${styleLbl || ''}`);
    return containsAny(key, ['text', 'tx', 'caption', 'title', 'parent', 'child', 'node', 'revtx']);
}
function findFirstLayoutNode(el) {
    const children = elementChildren(el);
    for (const child of children) {
        if (localName(child) === 'layoutNode')
            return child;
        const nested = findFirstLayoutNode(child);
        if (nested)
            return nested;
    }
    return null;
}
function findNodeTemplate(el, allowEmptyPtType = false) {
    const children = elementChildren(el);
    for (const child of children) {
        const childName = localName(child);
        if (childName === 'forEach') {
            const axis = catalogKey(child.getAttribute('axis') || '');
            const ptType = catalogKey(child.getAttribute('ptType') || '');
            if ((axis.includes('ch') || axis.includes('self')) && (ptType.includes('node') || (allowEmptyPtType && ptType.length === 0))) {
                const template = findFirstLayoutNode(child);
                if (template)
                    return template;
            }
        }
        const nested = findNodeTemplate(child, allowEmptyPtType);
        if (nested)
            return nested;
    }
    return null;
}
function collectPictureLayoutEntries(root, parentKey, entries = [], path = 'n') {
    if (localName(root) !== 'layoutNode')
        return entries;
    const name = root.getAttribute('name') || `node${entries.length + 1}`;
    const styleLbl = root.getAttribute('styleLbl') || undefined;
    const alg = layoutNodeAlg(root);
    const key = `${path}:${catalogKey(name) || entries.length}`;
    const isImage = isImageLayoutEntry(name, styleLbl, alg);
    const isText = !isImage && isTextLayoutEntry(name, styleLbl, alg);
    if (hasDirectChild(root, 'presOf') || isImage || isText || directChildren(root, 'layoutNode').length > 0) {
        entries.push({ key, parentKey, name, styleLbl, alg, isImage, isText });
        parentKey = key;
    }
    let childIndex = 0;
    for (const child of elementChildren(root)) {
        if (localName(child) === 'forEach' && catalogKey(child.getAttribute('ptType') || '').includes('sibtrans'))
            continue;
        if (localName(child) === 'layoutNode')
            collectPictureLayoutEntries(child, parentKey, entries, `${path}.${childIndex++}`);
        else {
            for (const nested of directChildren(child, 'layoutNode'))
                collectPictureLayoutEntries(nested, parentKey, entries, `${path}.${childIndex++}`);
        }
    }
    return entries;
}
function collectGlobalPictureEntries(root) {
    const out = [];
    const seen = new Set();
    const visit = (el) => {
        if (localName(el) === 'layoutNode') {
            const name = el.getAttribute('name') || '';
            const styleLbl = el.getAttribute('styleLbl') || undefined;
            const alg = layoutNodeAlg(el);
            if (name && isImageLayoutEntry(name, styleLbl, alg)) {
                const seenKey = `${catalogKey(name)}:${catalogKey(styleLbl || '')}:${catalogKey(alg || '')}`;
                if (!seen.has(seenKey)) {
                    seen.add(seenKey);
                    out.push({
                        key: `g.${out.length}:${catalogKey(name) || 'image'}`,
                        name,
                        styleLbl,
                        alg,
                        isImage: true,
                        isText: false,
                    });
                }
            }
        }
        elementChildren(el).forEach(visit);
    };
    visit(root);
    return out;
}
function createPictureLayoutModel(resolved) {
    if (!isPictureLayout(resolved) || isPictureCaptionListLayout(resolved))
        return null;
    try {
        const doc = new DOMParser().parseFromString(resolved.layout.xml, 'text/xml');
        const root = findFirstLayoutNode(doc);
        if (!root)
            return null;
        const template = findNodeTemplate(root, false) || findNodeTemplate(root, true);
        if (!template)
            return null;
        const entries = collectPictureLayoutEntries(template)
            .filter(entry => entry.name && entry.name !== (root.getAttribute('name') || ''));
        const existingPictureKeys = new Set(entries.map(entry => `${catalogKey(entry.name)}:${catalogKey(entry.styleLbl || '')}:${catalogKey(entry.alg || '')}`));
        const globalImageEntries = collectGlobalPictureEntries(root).filter(entry => {
            const key = `${catalogKey(entry.name)}:${catalogKey(entry.styleLbl || '')}:${catalogKey(entry.alg || '')}`;
            return !existingPictureKeys.has(key);
        });
        const finalEntries = [...entries, ...globalImageEntries];
        const imageCount = finalEntries.filter(entry => entry.isImage).length;
        if (imageCount === 0)
            return null;
        return {
            rootName: root.getAttribute('name') || 'diagram',
            entries: finalEntries,
        };
    }
    catch (_a) {
        return null;
    }
}
function ensurePictureLayoutIds(nodes, model) {
    if (!model)
        return;
    nodes.forEach(node => {
        if (!node.layoutPresIds)
            node.layoutPresIds = {};
        model.entries.forEach(entry => {
            var _a;
            if (!((_a = node.layoutPresIds) === null || _a === void 0 ? void 0 : _a[entry.key]))
                node.layoutPresIds[entry.key] = guid();
        });
    });
}
function firstPictureEntry(model, image) {
    if (!model)
        return null;
    return model.entries.find(entry => image ? entry.isImage : entry.isText) || null;
}
function buildImageRelsXml(nodes) {
    const imageNodes = nodes.filter(node => node.image);
    if (imageNodes.length === 0)
        return null;
    let rels = '';
    imageNodes.forEach(node => {
        const image = node.image;
        if (!image)
            return;
        const target = `../media/${image.mediaPath.split('/').pop()}`;
        rels += `<Relationship Id="${image.relId}" Type="${IMAGE_REL_TYPE}" Target="${encodeXmlEntities(target)}"/>`;
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`;
}
function emptyTextBody() {
    return '<dgm:spPr/><dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t>';
}
function dataTextBody(text, imageRelId) {
    const spPr = imageRelId
        ? `<dgm:spPr><a:blipFill><a:blip r:embed="${imageRelId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dgm:spPr>`
        : '<dgm:spPr/>';
    return `${spPr}<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${encodeXmlEntities(text)}</a:t></a:r></a:p></dgm:t>`;
}
function dataPictureBody(imageRelId) {
    return `<dgm:spPr><a:blipFill><a:blip r:embed="${imageRelId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill></dgm:spPr>` +
        '<dgm:t><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dgm:t>';
}
function drawingTextBody(text, fontSize) {
    const sz = Math.round((fontSize || 24) * 100);
    return '<dsp:txBody>' +
        '<a:bodyPr spcFirstLastPara="0" vert="horz" wrap="square" lIns="152400" tIns="152400" rIns="152400" bIns="152400" numCol="1" spcCol="1270" anchor="ctr" anchorCtr="0"><a:noAutofit/></a:bodyPr>' +
        '<a:lstStyle/><a:p><a:pPr marL="0" lvl="0" indent="0" algn="ctr" defTabSz="1778000"><a:lnSpc><a:spcPct val="90000"/></a:lnSpc><a:spcBef><a:spcPct val="0"/></a:spcBef><a:spcAft><a:spcPct val="35000"/></a:spcAft><a:buNone/></a:pPr>' +
        `<a:r><a:rPr lang="en-US" sz="${sz}" kern="1200"/><a:t>${encodeXmlEntities(text)}</a:t></a:r></a:p>` +
        '</dsp:txBody>';
}
function emptyDrawingTextBody() {
    return '<dsp:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></dsp:txBody>';
}
function buildDataModelXml(opt, resolved, nodes, drawingRid, pictureModel) {
    const docId = guid();
    const presRootId = guid();
    const pictureLayout = isPictureLayout(resolved);
    const pictureCaptionList = isPictureCaptionListLayout(resolved);
    ensurePictureLayoutIds(nodes, pictureModel || null);
    let ptXml = `<dgm:pt modelId="${docId}" type="doc"><dgm:prSet loTypeId="${encodeXmlEntities(resolved.layout.id)}" loCatId="${encodeXmlEntities(resolved.layout.category)}" qsTypeId="${encodeXmlEntities(resolved.quickStyle.id)}" qsCatId="${encodeXmlEntities(resolved.quickStyle.category)}" csTypeId="${encodeXmlEntities(resolved.colorStyle.id)}" csCatId="${encodeXmlEntities(resolved.colorStyle.category)}" phldr="1"/>${emptyTextBody()}</dgm:pt>`;
    nodes.forEach(node => {
        var _a;
        ptXml += `<dgm:pt modelId="${node.modelId}"><dgm:prSet phldrT="[Text]"/>${dataTextBody(node.text, (_a = node.image) === null || _a === void 0 ? void 0 : _a.relId)}</dgm:pt>`;
        ptXml += `<dgm:pt modelId="${node.parTransId}" type="parTrans" cxnId="${node.cxnId}"><dgm:prSet/>${emptyTextBody()}</dgm:pt>`;
        ptXml += `<dgm:pt modelId="${node.sibTransId}" type="sibTrans" cxnId="${node.cxnId}"><dgm:prSet/>${emptyTextBody()}</dgm:pt>`;
    });
    const rootPresName = pictureCaptionList ? 'Name0' : ((pictureModel === null || pictureModel === void 0 ? void 0 : pictureModel.rootName) || 'diagram');
    ptXml += `<dgm:pt modelId="${presRootId}" type="pres"><dgm:prSet presAssocID="${docId}" presName="${encodeXmlEntities(rootPresName)}" presStyleCnt="0"><dgm:presLayoutVars><dgm:dir${opt.rightToLeft ? ' val="rev"' : ''}/><dgm:resizeHandles val="exact"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`;
    nodes.forEach((node, index) => {
        if (pictureCaptionList && node.image && node.compPresId && node.imagePresId) {
            ptXml += `<dgm:pt modelId="${node.compPresId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="compNode" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`;
            ptXml += `<dgm:pt modelId="${node.imagePresId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="pictRect" presStyleLbl="node1" presStyleIdx="${index}" presStyleCnt="${nodes.length}"/>${dataPictureBody(node.image.relId)}</dgm:pt>`;
            ptXml += `<dgm:pt modelId="${node.presId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="textRect" presStyleLbl="revTx" presStyleIdx="${index}" presStyleCnt="${nodes.length}"><dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`;
            ptXml += `<dgm:pt modelId="${node.presSibId}" type="pres"><dgm:prSet presAssocID="${node.sibTransId}" presName="sibTrans" presStyleLbl="sibTrans2D1" presStyleIdx="0" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`;
            return;
        }
        if (pictureModel && node.image && node.layoutPresIds) {
            pictureModel.entries.forEach(entry => {
                var _a;
                const id = (_a = node.layoutPresIds) === null || _a === void 0 ? void 0 : _a[entry.key];
                if (!id)
                    return;
                const styleAttr = entry.styleLbl ? ` presStyleLbl="${encodeXmlEntities(entry.styleLbl)}"` : '';
                const vars = entry.isText ? '<dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars>' : '';
                const body = entry.isImage ? dataPictureBody(node.image.relId) : '<dgm:spPr/>';
                ptXml += `<dgm:pt modelId="${id}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="${encodeXmlEntities(entry.name)}"${styleAttr} presStyleIdx="${index}" presStyleCnt="${nodes.length}">${vars}</dgm:prSet>${body}</dgm:pt>`;
            });
            ptXml += `<dgm:pt modelId="${node.presSibId}" type="pres"><dgm:prSet presAssocID="${node.sibTransId}" presName="sibTrans" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`;
            return;
        }
        const textPresName = pictureLayout && node.image ? 'ParentText' : 'node';
        const textStyleLbl = pictureLayout && node.image ? 'node1' : 'node1';
        ptXml += `<dgm:pt modelId="${node.presId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="${textPresName}" presStyleLbl="${textStyleLbl}" presStyleIdx="${index}" presStyleCnt="${nodes.length}"><dgm:presLayoutVars><dgm:bulletEnabled val="1"/></dgm:presLayoutVars></dgm:prSet><dgm:spPr/></dgm:pt>`;
        if (pictureLayout && node.image && node.imagePresId) {
            ptXml += `<dgm:pt modelId="${node.imagePresId}" type="pres"><dgm:prSet presAssocID="${node.modelId}" presName="Image" presStyleLbl="alignImgPlace1" presStyleIdx="${index}" presStyleCnt="${nodes.length}"/>${dataPictureBody(node.image.relId)}</dgm:pt>`;
        }
        ptXml += `<dgm:pt modelId="${node.presSibId}" type="pres"><dgm:prSet presAssocID="${node.sibTransId}" presName="sibTrans" presStyleCnt="0"/><dgm:spPr/></dgm:pt>`;
    });
    let cxnXml = '';
    cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${docId}" destId="${presRootId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
    nodes.forEach((node, index) => {
        cxnXml += `<dgm:cxn modelId="${node.cxnId}" srcId="${node.parentId || docId}" destId="${node.modelId}" srcOrd="${node.siblingIndex}" destOrd="0" parTransId="${node.parTransId}" sibTransId="${node.sibTransId}"/>`;
        if (pictureCaptionList && node.image && node.compPresId && node.imagePresId) {
            const ordBase = index * 2;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.compPresId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.imagePresId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.presId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.sibTransId}" destId="${node.presSibId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.compPresId}" srcOrd="${ordBase}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${node.compPresId}" destId="${node.imagePresId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${node.compPresId}" destId="${node.presId}" srcOrd="1" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${ordBase + 1}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            return;
        }
        if (pictureModel && node.image && node.layoutPresIds) {
            pictureModel.entries.forEach(entry => {
                var _a;
                const id = (_a = node.layoutPresIds) === null || _a === void 0 ? void 0 : _a[entry.key];
                if (!id)
                    return;
                cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${id}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            });
            const rootOrdBase = index * (pictureModel.entries.length + 1);
            const childOrd = new Map();
            pictureModel.entries.forEach((entry, entryIndex) => {
                var _a, _b;
                const id = (_a = node.layoutPresIds) === null || _a === void 0 ? void 0 : _a[entry.key];
                if (!id)
                    return;
                const parentId = entry.parentKey ? (_b = node.layoutPresIds) === null || _b === void 0 ? void 0 : _b[entry.parentKey] : presRootId;
                if (!parentId)
                    return;
                const currentOrd = childOrd.get(parentId) || 0;
                childOrd.set(parentId, currentOrd + 1);
                const srcOrd = parentId === presRootId ? rootOrdBase + entryIndex : currentOrd;
                cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${parentId}" destId="${id}" srcOrd="${srcOrd}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            });
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.sibTransId}" destId="${node.presSibId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${rootOrdBase + pictureModel.entries.length}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            return;
        }
        cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.presId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
        const ordBase = index * (pictureLayout && node.image && node.imagePresId ? 3 : 2);
        if (pictureLayout && node.image && node.imagePresId) {
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presOf" srcId="${node.modelId}" destId="${node.imagePresId}" srcOrd="0" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.imagePresId}" srcOrd="${ordBase}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presId}" srcOrd="${ordBase + 1}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${ordBase + 2}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
        }
        else {
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presId}" srcOrd="${ordBase}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
            cxnXml += `<dgm:cxn modelId="${guid()}" type="presParOf" srcId="${presRootId}" destId="${node.presSibId}" srcOrd="${ordBase + 1}" destOrd="0" presId="${encodeXmlEntities(resolved.layout.id)}"/>`;
        }
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<dgm:dataModel xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        `<dgm:ptLst>${ptXml}</dgm:ptLst><dgm:cxnLst>${cxnXml}</dgm:cxnLst><dgm:bg/><dgm:whole/>` +
        `<dgm:extLst><a:ext uri="http://schemas.microsoft.com/office/drawing/2008/diagram"><dsp:dataModelExt xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" relId="${drawingRid}" minVer="http://schemas.openxmlformats.org/drawingml/2006/diagram"/></a:ext></dgm:extLst>` +
        '</dgm:dataModel>';
}
function buildDrawingXml(opt, resolved, nodes, pictureModel) {
    const pictureLayout = isPictureLayout(resolved);
    const pictureCaptionList = isPictureCaptionListLayout(resolved);
    ensurePictureLayoutIds(nodes, pictureModel || null);
    const cols = Math.max(1, Math.min(3, Math.ceil(Math.sqrt(nodes.length))));
    const rows = Math.max(1, Math.ceil(nodes.length / cols));
    const canvasW = 6350000;
    const canvasH = 3810000;
    const gapX = 198000;
    const gapY = 235000;
    const boxW = Math.floor((canvasW - (gapX * (cols - 1))) / cols);
    const boxH = Math.floor(Math.min(boxW * 0.6, (canvasH - (gapY * (rows - 1))) / rows));
    const totalH = (boxH * rows) + (gapY * (rows - 1));
    const startY = Math.max(0, Math.floor((canvasH - totalH) / 2));
    const fill = '<a:solidFill><a:schemeClr val="accent1"><a:hueOff val="0"/><a:satOff val="0"/><a:lumOff val="0"/><a:alphaOff val="0"/></a:schemeClr></a:solidFill>';
    const line = '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="lt1"><a:hueOff val="0"/><a:satOff val="0"/><a:lumOff val="0"/><a:alphaOff val="0"/></a:schemeClr></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>';
    const style = '<dsp:style><a:lnRef idx="2"><a:scrgbClr r="0" g="0" b="0"/></a:lnRef><a:fillRef idx="1"><a:scrgbClr r="0" g="0" b="0"/></a:fillRef><a:effectRef idx="0"><a:scrgbClr r="0" g="0" b="0"/></a:effectRef><a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></dsp:style>';
    let shapeXml = '';
    nodes.forEach((node, index) => {
        const col = opt.rightToLeft ? (cols - 1) - (index % cols) : index % cols;
        const row = Math.floor(index / cols);
        const x = Math.floor(col * (boxW + gapX));
        const y = Math.floor(startY + (row * (boxH + gapY)));
        const fillXml = node.image
            ? `<a:blipFill><a:blip r:embed="${node.image.relId}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>`
            : fill;
        if (pictureCaptionList && node.image && node.imagePresId) {
            const imageH = Math.max(1, Math.floor(boxH * 0.72));
            const textY = y + imageH;
            const textH = Math.max(1, boxH - imageH);
            shapeXml += `<dsp:sp modelId="${node.imagePresId}">` +
                '<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
                `<dsp:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${line}<a:effectLst/></dsp:spPr>` +
                style +
                emptyDrawingTextBody() +
                `<dsp:txXfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></dsp:txXfrm>` +
                '</dsp:sp>';
            shapeXml += `<dsp:sp modelId="${node.presId}">` +
                '<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
                `<dsp:spPr><a:xfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${line}<a:effectLst/></dsp:spPr>` +
                style +
                drawingTextBody(node.text, opt.fontSize) +
                `<dsp:txXfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></dsp:txXfrm>` +
                '</dsp:sp>';
            return;
        }
        const modelImageEntry = firstPictureEntry(pictureModel || null, true);
        const modelTextEntry = firstPictureEntry(pictureModel || null, false);
        const modelImageId = modelImageEntry && node.layoutPresIds ? node.layoutPresIds[modelImageEntry.key] : undefined;
        const modelTextId = modelTextEntry && node.layoutPresIds ? node.layoutPresIds[modelTextEntry.key] : undefined;
        if (pictureModel && node.image && modelImageId) {
            const imageH = Math.max(1, Math.floor(boxH * 0.72));
            const textY = y + imageH;
            const textH = Math.max(1, boxH - imageH);
            shapeXml += `<dsp:sp modelId="${modelImageId}">` +
                '<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
                `<dsp:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${line}<a:effectLst/></dsp:spPr>` +
                style +
                emptyDrawingTextBody() +
                `<dsp:txXfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${imageH}"/></dsp:txXfrm>` +
                '</dsp:sp>';
            if (modelTextId) {
                shapeXml += `<dsp:sp modelId="${modelTextId}">` +
                    '<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
                    `<dsp:spPr><a:xfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill}${line}<a:effectLst/></dsp:spPr>` +
                    style +
                    drawingTextBody(node.text, opt.fontSize) +
                    `<dsp:txXfrm><a:off x="${x}" y="${textY}"/><a:ext cx="${boxW}" cy="${textH}"/></dsp:txXfrm>` +
                    '</dsp:sp>';
            }
            return;
        }
        shapeXml += `<dsp:sp modelId="${node.presId}">` +
            '<dsp:nvSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvSpPr/></dsp:nvSpPr>' +
            `<dsp:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${boxH}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}${line}<a:effectLst/></dsp:spPr>` +
            style +
            drawingTextBody(node.text, opt.fontSize) +
            `<dsp:txXfrm><a:off x="${x}" y="${y}"/><a:ext cx="${boxW}" cy="${boxH}"/></dsp:txXfrm>` +
            '</dsp:sp>';
    });
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<dsp:drawing xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:dsp="http://schemas.microsoft.com/office/drawing/2008/diagram" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<dsp:spTree><dsp:nvGrpSpPr><dsp:cNvPr id="0" name=""/><dsp:cNvGrpSpPr/></dsp:nvGrpSpPr><dsp:grpSpPr/>' +
        shapeXml +
        '</dsp:spTree></dsp:drawing>';
}
function rawSmartArtXml(opt, key) {
    const value = opt[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
function retargetSmartArtDataDrawingRelId(rawDataXml, drawingRid) {
    try {
        const doc = new DOMParser().parseFromString(rawDataXml, 'text/xml');
        const all = doc.getElementsByTagName('*');
        for (let i = 0; i < all.length; i++) {
            const el = all.item(i);
            if (el && el.localName === 'dataModelExt')
                el.setAttribute('relId', drawingRid);
        }
        return new XMLSerializer().serializeToString(doc);
    }
    catch (_a) {
        return rawDataXml;
    }
}
export function createNativeSmartArt(opt, ids) {
    const resolved = resolveNativeSmartArt(opt);
    const nodes = normalizeNativeNodes(opt);
    const labels = nodes.map(node => node.text);
    if (nodes.length === 0)
        throw new Error('Native SmartArt requires at least one node.');
    const imageParts = attachImageParts(nodes, ids.partIndex);
    const pictureModel = createPictureLayoutModel(resolved);
    ensurePictureLayoutIds(nodes, pictureModel);
    const generatedImageRelsXml = buildImageRelsXml(nodes);
    const partPaths = {
        data: `ppt/diagrams/data${ids.partIndex}.xml`,
        layout: `ppt/diagrams/layout${ids.partIndex}.xml`,
        quickStyle: `ppt/diagrams/quickStyle${ids.partIndex}.xml`,
        colors: `ppt/diagrams/colors${ids.partIndex}.xml`,
        drawing: `ppt/diagrams/drawing${ids.partIndex}.xml`,
    };
    const info = {
        dataRid: ids.dataRid,
        layoutRid: ids.layoutRid,
        quickStyleRid: ids.quickStyleRid,
        colorStyleRid: ids.colorStyleRid,
        drawingRid: ids.drawingRid,
        layoutId: resolved.layout.id,
        layoutName: resolved.layout.name,
        quickStyleId: resolved.quickStyle.id,
        colorStyleId: resolved.colorStyle.id,
        nodes: labels,
        partPaths,
    };
    const rawDataXml = rawSmartArtXml(opt, '_rawDataXml');
    const rawLayoutXml = rawSmartArtXml(opt, '_rawLayoutXml');
    const rawQuickStyleXml = rawSmartArtXml(opt, '_rawQuickStyleXml');
    const rawColorsXml = rawSmartArtXml(opt, '_rawColorsXml');
    const rawDrawingXml = rawSmartArtXml(opt, '_rawDrawingXml');
    const rawDataRelsXml = rawSmartArtXml(opt, '_rawDataRelsXml');
    const rawDrawingRelsXml = rawSmartArtXml(opt, '_rawDrawingRelsXml');
    const parts = [
        { path: partPaths.data, data: rawDataXml ? retargetSmartArtDataDrawingRelId(rawDataXml, ids.drawingRid) : buildDataModelXml(opt, resolved, nodes, ids.drawingRid, pictureModel), contentType: SMARTART_CONTENT_TYPES.data },
        { path: partPaths.layout, data: rawLayoutXml || resolved.layout.xml, contentType: SMARTART_CONTENT_TYPES.layout },
        { path: partPaths.quickStyle, data: rawQuickStyleXml || resolved.quickStyle.xml, contentType: SMARTART_CONTENT_TYPES.quickStyle },
        { path: partPaths.colors, data: rawColorsXml || resolved.colorStyle.xml, contentType: SMARTART_CONTENT_TYPES.colors },
        { path: partPaths.drawing, data: rawDrawingXml || buildDrawingXml(opt, resolved, nodes, pictureModel), contentType: SMARTART_CONTENT_TYPES.drawing },
        ...imageParts,
    ];
    if (rawDataRelsXml)
        parts.push({ path: `ppt/diagrams/_rels/data${ids.partIndex}.xml.rels`, data: rawDataRelsXml });
    else if (generatedImageRelsXml)
        parts.push({ path: `ppt/diagrams/_rels/data${ids.partIndex}.xml.rels`, data: generatedImageRelsXml });
    if (rawDrawingRelsXml)
        parts.push({ path: `ppt/diagrams/_rels/drawing${ids.partIndex}.xml.rels`, data: rawDrawingRelsXml });
    else if (generatedImageRelsXml)
        parts.push({ path: `ppt/diagrams/_rels/drawing${ids.partIndex}.xml.rels`, data: generatedImageRelsXml });
    return { info, parts };
}
export function genXmlNativeSmartArt(slideItemObj, ctx) {
    var _a;
    const info = slideItemObj.smartArt;
    if (!info)
        throw new Error('Native SmartArt object is missing diagram part metadata.');
    const name = ((_a = slideItemObj.options) === null || _a === void 0 ? void 0 : _a.objectName) || 'Native SmartArt';
    return '<p:graphicFrame>' +
        '<p:nvGraphicFramePr>' +
        `<p:cNvPr id="${ctx.shapeId}" name="${encodeXmlEntities(name)}"/>` +
        '<p:cNvGraphicFramePr/><p:nvPr/>' +
        '</p:nvGraphicFramePr>' +
        `<p:xfrm${ctx.locationAttr}><a:off x="${ctx.x}" y="${ctx.y}"/><a:ext cx="${ctx.cx}" cy="${ctx.cy}"/></p:xfrm>` +
        '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/diagram">' +
        `<dgm:relIds xmlns:dgm="http://schemas.openxmlformats.org/drawingml/2006/diagram" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:dm="${info.dataRid}" r:lo="${info.layoutRid}" r:qs="${info.quickStyleRid}" r:cs="${info.colorStyleRid}"/>` +
        '</a:graphicData></a:graphic>' +
        '</p:graphicFrame>';
}
//# sourceMappingURL=gen-smartart.js.map