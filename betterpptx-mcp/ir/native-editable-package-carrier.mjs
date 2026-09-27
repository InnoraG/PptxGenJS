// Private strict editable-carrier package projection; never expose this maintainer detail through public tools.
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

const NS = Object.freeze({
  p: 'http://schemas.openxmlformats.org/presentationml/2006/main',
  a: 'http://schemas.openxmlformats.org/drawingml/2006/main',
  r: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
  rel: 'http://schemas.openxmlformats.org/package/2006/relationships',
  ct: 'http://schemas.openxmlformats.org/package/2006/content-types',
  a14: 'http://schemas.microsoft.com/office/drawing/2014/main',
});
const SLIDE_CT = 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml';
const SHA = (b) => createHash('sha256').update(b).digest('hex');
const fail = (code, detail = '') => { throw new Error(`${code}${detail ? `: ${detail}` : ''}`); };
const elements = (n) => Array.from(n?.childNodes ?? []).filter((x) => x.nodeType === 1);
const one = (xs, code) => xs.length === 1 ? xs[0] : fail(code, `count=${xs.length}`);
const el = (n, ns, local) => n?.namespaceURI === ns && n?.localName === local;
const children = (n, ns, local) => elements(n).filter((x) => el(x, ns, local));
const child = (n, ns, local, code) => one(children(n, ns, local), code);
const attr = (n, name) => n?.getAttribute(name);
const relAttr = (n, name) => n?.getAttributeNS(NS.r, name);

function centralNames(bytes) {
  // JSZip stores entries by name and otherwise masks a duplicate central-directory entry.
  const b = Buffer.from(bytes);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50 && i + 22 + b.readUInt16LE(i + 20) === b.length) { eocd = i; break; }
  }
  if (eocd < 0) fail('ZIP_EOCD_MISSING');
  if (b.readUInt16LE(eocd + 4) || b.readUInt16LE(eocd + 6)) fail('ZIP_MULTIDISK_UNSUPPORTED');
  const count = b.readUInt16LE(eocd + 10), size = b.readUInt32LE(eocd + 12), offset = b.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) fail('ZIP64_UNSUPPORTED');
  if (offset + size > eocd) fail('ZIP_CENTRAL_BOUNDS');
  let pos = offset;
  const seen = new Set();
  for (let i = 0; i < count; i++) {
    if (pos + 46 > b.length || b.readUInt32LE(pos) !== 0x02014b50) fail('ZIP_CENTRAL_INVALID');
    const flags = b.readUInt16LE(pos + 8);
    if (flags & 1) fail('ZIP_ENCRYPTED_UNSUPPORTED');
    const n = b.readUInt16LE(pos + 28), extra = b.readUInt16LE(pos + 30), comment = b.readUInt16LE(pos + 32);
    const name = b.subarray(pos + 46, pos + 46 + n).toString('utf8');
    if (!name || name.startsWith('/') || name.includes('\\') || name.split('/').includes('..')) fail('ZIP_PART_NAME_UNSAFE', name);
    if (seen.has(name)) fail('ZIP_DUPLICATE_PART', name);
    seen.add(name);
    pos += 46 + n + extra + comment;
  }
  if (pos !== offset + size) fail('ZIP_CENTRAL_SIZE_MISMATCH');
  return seen;
}

function parseXml(bytes, part) {
  const issues = [];
  const doc = new DOMParser({ errorHandler: { warning: (m) => issues.push(m), error: (m) => issues.push(m), fatalError: (m) => issues.push(m) } })
    .parseFromString(Buffer.from(bytes).toString('utf8'), 'application/xml');
  if (issues.length || !doc?.documentElement || doc.getElementsByTagName('parsererror').length) fail('XML_INVALID', part);
  return doc;
}

const ownerFromRels = (part) => {
  if (part === '_rels/.rels') return '';
  const m = /^(.*)_rels\/([^/]+)\.rels$/.exec(part);
  if (!m) fail('REL_PART_PATH_INVALID', part);
  return `${m[1]}${m[2]}`;
};
function targetPart(owner, target) {
  if (!target || target.includes('\\') || target.includes('#') || target.includes('?') || /%2f|%5c|%2e/i.test(target)) fail('REL_TARGET_UNSAFE', target);
  const decoded = decodeURIComponent(target);
  const p = decoded.startsWith('/') ? decoded.slice(1) : path.posix.normalize(path.posix.join(path.posix.dirname(owner || 'root'), decoded));
  if (!p || p === '.' || p.startsWith('../') || p === '..' || p.startsWith('/')) fail('REL_TARGET_UNSAFE', target);
  return p;
}

async function loadPackage(bytes) {
  const names = centralNames(bytes);
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
  const read = async (name) => names.has(name) && !name.endsWith('/') ? zip.file(name).async('nodebuffer') : fail('PART_MISSING', name);
  for (const p of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'ppt/_rels/presentation.xml.rels']) if (!names.has(p)) fail('PART_MISSING', p);
  const content = parseXml(await read('[Content_Types].xml'), '[Content_Types].xml');
  if (!el(content.documentElement, NS.ct, 'Types')) fail('CONTENT_TYPES_ROOT_INVALID');
  const overrides = new Map(), defaults = new Map();
  for (const n of elements(content.documentElement)) {
    if (el(n, NS.ct, 'Override')) {
      const name = attr(n, 'PartName')?.replace(/^\//, '');
      if (!name || overrides.has(name)) fail('CONTENT_TYPE_DUPLICATE', name);
      overrides.set(name, attr(n, 'ContentType'));
    } else if (el(n, NS.ct, 'Default')) {
      const ext = attr(n, 'Extension');
      if (!ext || defaults.has(ext)) fail('CONTENT_TYPE_DUPLICATE', ext);
      defaults.set(ext, attr(n, 'ContentType'));
    } else fail('CONTENT_TYPE_CHILD_UNSUPPORTED', n.nodeName);
  }
  const contentType = (part) => overrides.get(part) ?? defaults.get(part.split('.').pop());
  if (contentType('ppt/presentation.xml') !== 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml') fail('PRESENTATION_CONTENT_TYPE_INVALID');
  const relationships = new Map();
  for (const name of names) {
    if (!name.endsWith('.rels')) continue;
    const owner = ownerFromRels(name);
    if (owner && !names.has(owner)) fail('REL_OWNER_MISSING', owner);
    const doc = parseXml(await read(name), name);
    if (!el(doc.documentElement, NS.rel, 'Relationships')) fail('REL_ROOT_INVALID', name);
    const ids = new Map();
    for (const r of elements(doc.documentElement)) {
      if (!el(r, NS.rel, 'Relationship')) fail('REL_CHILD_UNSUPPORTED', name);
      const id = attr(r, 'Id'), type = attr(r, 'Type'), mode = attr(r, 'TargetMode') || 'Internal', target = attr(r, 'Target');
      if (!id || !type || !target || ids.has(id)) fail('REL_ID_INVALID_OR_DUPLICATE', name);
      if (mode !== 'Internal' && mode !== 'External') fail('REL_MODE_UNSUPPORTED', mode);
      const resolved = mode === 'Internal' ? targetPart(owner, target) : null;
      if (resolved && (!names.has(resolved) || !contentType(resolved))) fail('REL_TARGET_MISSING_OR_UNTYPED', `${name}:${id}`);
      ids.set(id, { type, mode, target, resolved });
    }
    relationships.set(owner, ids);
  }
  const root = relationships.get('');
  if (!root || !Array.from(root.values()).some((r) => r.type.endsWith('/officeDocument') && r.resolved === 'ppt/presentation.xml')) fail('PRESENTATION_ROOT_REL_MISSING');
  const presentation = parseXml(await read('ppt/presentation.xml'), 'ppt/presentation.xml');
  const lst = child(presentation.documentElement, NS.p, 'sldIdLst', 'SLIDE_ID_LIST_MISSING');
  const presRels = relationships.get('ppt/presentation.xml');
  if (!presRels) fail('PRESENTATION_RELS_MISSING');
  const slides = elements(lst).map((n) => {
    if (!el(n, NS.p, 'sldId')) fail('SLIDE_ID_CHILD_UNSUPPORTED');
    const id = relAttr(n, 'id'), rel = presRels.get(id);
    if (!rel || !rel.type.endsWith('/slide') || contentType(rel.resolved) !== SLIDE_CT) fail('SLIDE_REL_INVALID', id);
    return { slideId: attr(n, 'id'), part: rel.resolved };
  });
  if (new Set(slides.map((x) => x.part)).size !== slides.length) fail('SLIDE_PART_DUPLICATE');
  return { names, read, relationships, slides, contentType };
}

const allowed = new Map(Object.entries({
  'p:nvSpPr': ['p:cNvPr','p:cNvSpPr','p:nvPr'],
  'p:cNvPr': [], 'p:cNvSpPr': ['a:spLocks'], 'p:nvPr': [],
  'p:spPr': ['a:xfrm','a:prstGeom','a:solidFill','a:noFill','a:gradFill','a:ln','a:effectLst','a:extLst'],
  'p:grpSpPr': ['a:xfrm'],
  'a:xfrm': ['a:off','a:ext','a:chOff','a:chExt'],
  'a:off': [], 'a:ext': [], 'a:chOff': [], 'a:chExt': [],
  'a:prstGeom': ['a:avLst'], 'a:avLst': ['a:gd'], 'a:gd': [],
  'a:solidFill': ['a:srgbClr'], 'a:srgbClr': ['a:alpha'], 'a:alpha': [], 'a:noFill': [],
  'a:gradFill': ['a:gsLst','a:lin'], 'a:gsLst': ['a:gs'], 'a:gs': ['a:srgbClr'], 'a:lin': [],
  'a:ln': ['a:solidFill','a:noFill','a:prstDash','a:miter'], 'a:miter': [],
  'a:prstDash': [], 'a:spLocks': [],
  'a:effectLst': ['a:outerShdw'], 'a:outerShdw': ['a:srgbClr'],
  'a:extLst': ['a:ext'], 'a:ext': ['a14:hiddenLine','a14:hiddenFill'],
  'a14:hiddenLine': [], 'a14:hiddenFill': [],
  'p:txBody': ['a:bodyPr','a:lstStyle','a:p'],
  'a:bodyPr': ['a:normAutofit'], 'a:normAutofit': [], 'a:lstStyle': [], 'a:p': ['a:pPr','a:r','a:br','a:endParaRPr'],
  'a:pPr': ['a:buNone'], 'a:buNone': [], 'a:r': ['a:rPr','a:t'], 'a:br': ['a:rPr'],
  'a:rPr': ['a:solidFill','a:latin','a:ea','a:cs'], 'a:endParaRPr': [], 'a:t': [],
  'a:latin': [], 'a:ea': [], 'a:cs': [],
}));
const allowedAttrs = new Map(Object.entries({
  'p:cNvPr': ['id','name','creationId','descr','title','hidden'], 'p:cNvSpPr': ['txBox'],
  'a:spLocks': ['noGrp'], 'a:xfrm': ['rot','flipH','flipV'],
  'a:off': ['x','y'], 'a:ext': ['cx','cy'], 'a:chOff': ['x','y'], 'a:chExt': ['cx','cy'],
  'a:prstGeom': ['prst'], 'a:gd': ['name','fmla'], 'a:srgbClr': ['val'], 'a:alpha': ['val'],
  'a:gradFill': ['rotWithShape','flip'], 'a:gs': ['pos'], 'a:lin': ['ang','scaled'],
  'a:ln': ['w','cap','cmpd','algn'], 'a:miter': ['lim'],
  'a:effectLst': [], 'a:outerShdw': ['sx','sy','kx','ky','algn','bl','rotWithShape','blurRad','dist','dir'],
  'a:ext': ['cx','cy','uri'],
  'a:prstDash': ['val'], 'a:bodyPr': ['wrap','lIns','rIns','tIns','bIns','anchor','anchorCtr','vert','rot','numCol','spcFirstLastPara','rtlCol'],
  'a:pPr': ['algn','marL','marR','indent','lvl','rtl','defTabSz'],
  'a:rPr': ['lang','sz','b','i','u','strike','kern','spc','baseline','dirty'],
  'a:endParaRPr': ['lang','sz','b','i','u','strike','kern','spc','baseline','dirty'],
  'a:latin': ['typeface','pitchFamily','charset'], 'a:ea': ['typeface','pitchFamily','charset'], 'a:cs': ['typeface','pitchFamily','charset'],
}));
function key(n) {
  const prefix = Object.entries(NS).find(([, ns]) => ns === n.namespaceURI)?.[0];
  if (prefix !== 'p' && prefix !== 'a' && prefix !== 'a14') fail('CARRIER_NAMESPACE_UNSUPPORTED', n.nodeName);
  return `${prefix}:${n.localName}`;
}
function canonical(n, { stripTopOffset = false, parentKey = null } = {}) {
  const k = key(n), childAllow = allowed.get(k), attrsAllow = allowedAttrs.get(k) ?? [];
  if (!childAllow) fail('CARRIER_ELEMENT_UNSUPPORTED', k);
  if (k === 'a:ext' && parentKey !== 'a:xfrm' && parentKey !== 'a:extLst') fail('CARRIER_EXT_CONTEXT_UNSUPPORTED');
  if (k === 'a:ext' && parentKey === 'a:extLst') {
    const extension = attr(n,'uri');
    const expected = extension === '{C183D7F6-B498-43B3-948B-1728B52AA6E4}' ? 'hiddenLine' :
      extension === '{909E8E84-426E-40DD-AFC4-6F175D3DCCD1}' ? 'hiddenFill' : null;
    if (!expected || elements(n).length !== 1 || !el(elements(n)[0],NS.a14,expected)) fail('CARRIER_EXTENSION_UNSUPPORTED',extension);
  }
  const attrs = [];
  for (let i = 0; i < n.attributes.length; i++) {
    const a = n.attributes.item(i);
    if (a.name === 'xmlns' || a.prefix === 'xmlns') continue;
    if (a.namespaceURI && a.namespaceURI !== '') fail('CARRIER_ATTRIBUTE_NAMESPACE_UNSUPPORTED', `${k}@${a.name}`);
    if (!attrsAllow.includes(a.name)) fail('CARRIER_ATTRIBUTE_UNSUPPORTED', `${k}@${a.name}`);
    if (k === 'a:ext' && parentKey === 'a:xfrm' && a.name === 'uri' || k === 'a:ext' && parentKey === 'a:extLst' && a.name !== 'uri') fail('CARRIER_EXT_ATTRIBUTE_WRONG_CONTEXT');
    if (k === 'p:cNvPr' && (a.name === 'id' || a.name === 'name')) continue;
    if (k === 'p:cNvPr' && a.name === 'creationId') {
      if (!/^\d+$/.test(a.value)) fail('CARRIER_CREATION_ID_INVALID');
      continue;
    }
    if (stripTopOffset && k === 'a:off' && (a.name === 'x' || a.name === 'y')) continue;
    attrs.push([a.name,a.value]);
  }
  attrs.sort(([a],[b]) => a.localeCompare(b));
  const cs = elements(n).map((c) => {
    if (!childAllow.includes(key(c))) fail('CARRIER_CHILD_UNSUPPORTED', `${k}>${c.nodeName}`);
    if (k === 'a:ext' && parentKey === 'a:xfrm') fail('CARRIER_EXT_CHILD_UNSUPPORTED');
    return canonical(c, { stripTopOffset: stripTopOffset && (k === 'p:spPr' || k === 'p:grpSpPr' && el(c,NS.a,'xfrm') || k === 'a:xfrm' && el(c,NS.a,'off')), parentKey:k });
  });
  const text = Array.from(n.childNodes).filter((x) => x.nodeType === 3 || x.nodeType === 4).map((x) => x.data).join('');
  if (text.trim() && k !== 'a:t') fail('CARRIER_TEXT_UNSUPPORTED', k);
  return [k, attrs, k === 'a:t' ? text : '', cs];
}

function carrierProjection(carrier, kind, { top = true, expectedChildren } = {}) {
  const group = kind === 'group';
  if (group && !el(carrier, NS.p, 'grpSp') || !group && !el(carrier, NS.p, 'sp')) fail('CARRIER_KIND_MISMATCH');
  if (!group) {
    const nv = child(carrier, NS.p, 'nvSpPr', 'SHAPE_NONVISUAL_MISSING');
    const id = child(nv, NS.p, 'cNvPr', 'SHAPE_ID_MISSING');
    child(carrier, NS.p, 'spPr', 'SHAPE_PROPERTIES_MISSING');
    if (kind === 'textShape') {
      const tx = child(carrier, NS.p, 'txBody', 'TEXT_BODY_MISSING');
      if (!tx.getElementsByTagNameNS(NS.a,'t').length) fail('TEXT_RUN_MISSING');
      const txBox = attr(child(nv, NS.p, 'cNvSpPr', 'SHAPE_NONVISUAL_PROPERTIES_MISSING'), 'txBox');
      // Current top-level add_text lowers to a text-bearing p:sp without txBox;
      // grouped add_text uses txBox=1. Both remain native editable text carriers.
      if (txBox && txBox !== '1') fail('TEXTBOX_FLAG_INVALID');
    }
    if (children(carrier,NS.p,'txBody').length > 1) fail('TEXT_BODY_DUPLICATE');
    const items = elements(carrier);
    for (const c of items) if (!['nvSpPr','spPr','txBody'].some((x) => el(c,NS.p,x))) fail('SHAPE_CHILD_UNSUPPORTED', c.nodeName);
    const semantic = items.map((c) => canonical(c, { stripTopOffset: top && el(c,NS.p,'spPr') }));
    return { nativeKind: kind, id: attr(id,'id'), name: attr(id,'name'), semantic };
  }
  const nv = child(carrier, NS.p, 'nvGrpSpPr', 'GROUP_NONVISUAL_MISSING');
  const id = child(nv, NS.p, 'cNvPr', 'GROUP_ID_MISSING');
  const grpPr = child(carrier, NS.p, 'grpSpPr', 'GROUP_PROPERTIES_MISSING');
  const heads = elements(nv);
  if (heads.length !== 3 || !el(heads[0],NS.p,'cNvPr') || !el(heads[1],NS.p,'cNvGrpSpPr') || !el(heads[2],NS.p,'nvPr')) fail('GROUP_NONVISUAL_UNSUPPORTED');
  if (elements(heads[0]).length || elements(heads[1]).length || elements(heads[2]).length) fail('GROUP_NONVISUAL_CHILD_UNSUPPORTED');
  const groupAttrs = Array.from({length: heads[0].attributes.length}, (_,i) => heads[0].attributes.item(i)).filter((a) => a.name !== 'id' && a.name !== 'name' && a.name !== 'creationId' && a.name !== 'xmlns' && a.prefix !== 'xmlns').map((a) => [a.name,a.value]).sort(([a],[b]) => a.localeCompare(b));
  const creationId = attr(heads[0],'creationId');
  if (creationId && !/^\d+$/.test(creationId)) fail('CARRIER_CREATION_ID_INVALID');
  for (const [a] of groupAttrs) if (!['descr','title','hidden'].includes(a)) fail('GROUP_ATTRIBUTE_UNSUPPORTED', a);
  const parts = elements(carrier).filter((x) => ![nv,grpPr].includes(x));
  if (!Array.isArray(expectedChildren)) fail('GROUP_EXPECTED_CHILDREN_REQUIRED');
  if (parts.length !== expectedChildren.length || parts.some((c,i) => attr(child(el(c,NS.p,'sp') ? child(c,NS.p,'nvSpPr','CHILD_NV_MISSING') : child(c,NS.p,'nvGrpSpPr','CHILD_NV_MISSING'),NS.p,'cNvPr','CHILD_ID_MISSING'),'name') !== expectedChildren[i].name)) fail('GROUP_CHILD_IDENTITY_MISMATCH');
  const descendants = parts.map((c,i) => {
    if (!el(c,NS.p,'sp') && !el(c,NS.p,'grpSp')) fail('GROUP_CHILD_UNSUPPORTED', c.nodeName);
    return carrierProjection(c, el(c,NS.p,'grpSp') ? 'group' : 'shape', { top: false, expectedChildren: expectedChildren?.[i]?.children });
  });
  return { nativeKind: 'group', id: attr(id,'id'), name: attr(id,'name'), semantic: [groupAttrs, canonical(grpPr,{stripTopOffset:top}), descendants.map((x) => [x.nativeKind,x.semantic])] };
}

export async function inspectEditableBoundary(packageBytes, { boundaryId, endpoints }) {
  if (!Buffer.isBuffer(packageBytes) || !boundaryId || !Array.isArray(endpoints) || endpoints.length !== 2) fail('PROOF_ARGUMENT_INVALID');
  const pkg = await loadPackage(packageBytes), packageSha256 = SHA(packageBytes);
  const out = [];
  for (const e of endpoints) {
    if (!Number.isInteger(e.slideIndex) || e.slideIndex < 0 || e.slideIndex >= pkg.slides.length || !['shape','textShape','group'].includes(e.nativeKind) || !e.objectName || !e.side) fail('ENDPOINT_ARGUMENT_INVALID');
    const slide = pkg.slides[e.slideIndex];
    const doc = parseXml(await pkg.read(slide.part), slide.part);
    const spTree = child(child(doc.documentElement,NS.p,'cSld','SLIDE_COMMON_MISSING'),NS.p,'spTree','SHAPE_TREE_MISSING');
    const allIds = [], allNames = [];
    function visit(n) {
      if (el(n,NS.p,'sp') || el(n,NS.p,'grpSp') || el(n,NS.p,'pic') || el(n,NS.p,'graphicFrame') || el(n,NS.p,'cxnSp')) {
        const nvKind = el(n,NS.p,'sp') ? 'nvSpPr' : el(n,NS.p,'grpSp') ? 'nvGrpSpPr' : el(n,NS.p,'pic') ? 'nvPicPr' : el(n,NS.p,'cxnSp') ? 'nvCxnSpPr' : 'nvGraphicFramePr';
        const nv = children(n,NS.p,nvKind)[0], cnv = nv && children(nv,NS.p,'cNvPr')[0];
        if (cnv) { allIds.push(attr(cnv,'id')); allNames.push(attr(cnv,'name')); }
      }
      for (const c of elements(n)) visit(c);
    }
    visit(spTree);
    if (new Set(allIds).size !== allIds.length || allIds.some((x) => !x)) fail('SLIDE_DUPLICATE_OR_MISSING_CNVPR_ID', slide.part);
    const direct = elements(spTree).filter((c) => el(c,NS.p,'sp') || el(c,NS.p,'grpSp'));
    const matching = direct.filter((c) => {
      const nv = children(c,NS.p,el(c,NS.p,'sp') ? 'nvSpPr':'nvGrpSpPr')[0];
      return nv && attr(children(nv,NS.p,'cNvPr')[0],'name') === e.objectName;
    });
    const carrier = one(matching,'CARRIER_NOT_UNIQUE');
    if (allNames.filter((n) => n === e.objectName).length !== 1) fail('CARRIER_DESCENDANT_NAME_COLLISION');
    const projection = carrierProjection(carrier,e.nativeKind,{expectedChildren:e.expectedChildren});
    const semanticDigest = SHA(`betterpptx.package-carrier.v1\0${JSON.stringify(projection.semantic)}`);
    out.push({side:e.side,slideIndex:e.slideIndex,slideId:slide.slideId,slidePart:slide.part,nativeKind:e.nativeKind,cNvPrId:projection.id,cNvPrName:projection.name,plannedEditHandle:e.plannedEditHandle ?? null,operationIndex:e.operationIndex ?? null,semanticDigest});
  }
  if (out[0].semanticDigest !== out[1].semanticDigest) fail('PACKAGE_CARRIER_SEMANTIC_MISMATCH');
  return {version:'betterpptx.package-carrier.v1',boundaryId,packageSha256,endpoints:out,endpointEquality:true,authoredEquivalence:false};
}

