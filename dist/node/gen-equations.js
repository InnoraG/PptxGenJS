/**
 * PptxGenJS: Native PowerPoint equation generation
 */
import { encodeXmlEntities, genXmlColorSelection } from './gen-utils';
import { genXmlCNvPr } from './gen-accessibility';
const NS_A14 = 'http://schemas.microsoft.com/office/drawing/2010/main';
const NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
function attr(name, value) {
    return value === undefined || value === null || value === '' ? '' : ` ${name}="${encodeXmlEntities(String(value))}"`;
}
function mathJc(align) {
    if (align === 'left')
        return 'left';
    if (align === 'right')
        return 'right';
    return 'centerGroup';
}
function mathRunProps(opts, overrides = {}) {
    const lang = opts.lang || 'en-US';
    const fontFace = opts.fontFace || 'Cambria Math';
    const fontSize = opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '';
    const italicValue = overrides.italic === undefined ? opts.italic : overrides.italic;
    const italic = italicValue === false ? ' i="0"' : ' i="1"';
    const colorXml = opts.color ? genXmlColorSelection({ color: opts.color }) : '';
    return `<a:rPr lang="${encodeXmlEntities(lang)}"${fontSize}${italic} smtClean="0">${colorXml}<a:latin typeface="${encodeXmlEntities(fontFace)}" panose="02040503050406030204" pitchFamily="18" charset="0"/></a:rPr>`;
}
function mathText(text, opts, overrides = {}) {
    const value = text === undefined || text === null ? '' : String(text);
    const preserveSpace = value !== value.trim() || value.includes('  ');
    return `<m:r>${mathRunProps(opts, overrides)}<m:t${preserveSpace ? ' xml:space="preserve"' : ''}>${encodeXmlEntities(value)}</m:t></m:r>`;
}
function firstSlot(node, names) {
    for (const name of names) {
        if (node[name] !== undefined)
            return node[name];
        if (node.slots && node.slots[name] !== undefined)
            return node.slots[name];
    }
    return undefined;
}
function renderSlot(value, opts) {
    if (Array.isArray(value))
        return value.map(item => renderTemplate(item, opts)).join('');
    return renderTemplate(value, opts);
}
function renderElementSlot(value, opts) {
    const xml = renderSlot(value, opts);
    return xml || mathText('', opts);
}
function renderDelimitedItems(node, opts) {
    const items = firstSlot(node, ['items', 'children', 'body', 'expression']);
    if (Array.isArray(items))
        return items.map(item => `<m:e>${renderElementSlot(item, opts)}</m:e>`).join('');
    return `<m:e>${renderElementSlot(items, opts)}</m:e>`;
}
function renderEquationArray(items, opts) {
    const rows = Array.isArray(items) ? items : [];
    const rowXml = rows.map(row => `<m:e>${renderElementSlot(row, opts)}</m:e>`).join('');
    return `<m:eqArr><m:eqArrPr/>${rowXml || '<m:e/>'}</m:eqArr>`;
}
function renderTemplate(template, opts) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (template === undefined || template === null)
        return '';
    if (typeof template === 'string')
        return mathText(template, opts);
    const node = template;
    const kind = String(node.kind || 'text');
    switch (kind) {
        case 'row':
        case 'group':
            return renderSlot(firstSlot(node, ['items', 'children']), opts);
        case 'fraction':
        case 'frac': {
            const requestedType = String(node.fractionType || node.type || 'bar');
            const fractionType = ['bar', 'skw', 'lin', 'noBar'].includes(requestedType) ? requestedType : 'bar';
            return `<m:f><m:fPr><m:type m:val="${fractionType}"/></m:fPr>` +
                `<m:num>${renderElementSlot(firstSlot(node, ['numerator', 'num']), opts)}</m:num>` +
                `<m:den>${renderElementSlot(firstSlot(node, ['denominator', 'den']), opts)}</m:den>` +
                '</m:f>';
        }
        case 'superscript':
        case 'sup':
            return '<m:sSup>' +
                `<m:e>${renderElementSlot(firstSlot(node, ['base', 'expression', 'body']), opts)}</m:e>` +
                `<m:sup>${renderElementSlot(firstSlot(node, ['exponent', 'sup', 'upper']), opts)}</m:sup>` +
                '</m:sSup>';
        case 'subscript':
        case 'sub':
            return '<m:sSub>' +
                `<m:e>${renderElementSlot(firstSlot(node, ['base', 'expression', 'body']), opts)}</m:e>` +
                `<m:sub>${renderElementSlot(firstSlot(node, ['subscript', 'sub', 'lower']), opts)}</m:sub>` +
                '</m:sSub>';
        case 'subsup':
            return '<m:sSubSup>' +
                `<m:e>${renderElementSlot(firstSlot(node, ['base', 'expression', 'body']), opts)}</m:e>` +
                `<m:sub>${renderElementSlot(firstSlot(node, ['subscript', 'sub', 'lower']), opts)}</m:sub>` +
                `<m:sup>${renderElementSlot(firstSlot(node, ['exponent', 'sup', 'upper']), opts)}</m:sup>` +
                '</m:sSubSup>';
        case 'presubsup':
        case 'preSubSup':
            return '<m:sPre><m:sPrePr/>' +
                `<m:sub>${renderElementSlot(firstSlot(node, ['subscript', 'sub', 'lower']), opts)}</m:sub>` +
                `<m:sup>${renderElementSlot(firstSlot(node, ['exponent', 'sup', 'upper']), opts)}</m:sup>` +
                `<m:e>${renderElementSlot(firstSlot(node, ['base', 'expression', 'body']), opts)}</m:e>` +
                '</m:sPre>';
        case 'radical':
        case 'sqrt': {
            const degree = firstSlot(node, ['degree']);
            const radPr = degree === undefined ? '<m:radPr><m:degHide m:val="1"/></m:radPr>' : '<m:radPr/>';
            return `<m:rad>${radPr}<m:deg>${renderSlot(degree, opts)}</m:deg><m:e>${renderElementSlot(firstSlot(node, ['radicand', 'body', 'expression']), opts)}</m:e></m:rad>`;
        }
        case 'nary':
        case 'summation':
        case 'sum':
        case 'integral':
        case 'operator': {
            const symbol = node.symbol || (kind === 'integral' ? '∫' : '∑');
            const limitLocation = node.limitLocation === 'subSup' ? 'subSup' : 'undOvr';
            const grow = node.grow === undefined ? '' : `<m:grow m:val="${node.grow ? '1' : '0'}"/>`;
            const hideSub = node.hideSub === undefined ? '' : `<m:subHide m:val="${node.hideSub ? '1' : '0'}"/>`;
            const hideSup = node.hideSup === undefined ? '' : `<m:supHide m:val="${node.hideSup ? '1' : '0'}"/>`;
            return '<m:nary>' +
                `<m:naryPr><m:chr m:val="${encodeXmlEntities(String(symbol))}"/>${grow}<m:limLoc m:val="${limitLocation}"/>${hideSub}${hideSup}</m:naryPr>` +
                `<m:sub>${renderSlot(firstSlot(node, ['lower', 'subscript', 'sub']), opts)}</m:sub>` +
                `<m:sup>${renderSlot(firstSlot(node, ['upper', 'exponent', 'sup']), opts)}</m:sup>` +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                '</m:nary>';
        }
        case 'bracket':
        case 'delimiter': {
            const left = node.left === undefined ? '(' : String(node.left);
            const right = node.right === undefined ? ')' : String(node.right);
            const sep = node.separator === undefined ? '' : `<m:sepChr m:val="${encodeXmlEntities(String(node.separator))}"/>`;
            const grow = node.grow === undefined ? '' : `<m:grow m:val="${node.grow ? '1' : '0'}"/>`;
            return '<m:d>' +
                `<m:dPr><m:begChr m:val="${encodeXmlEntities(left)}"/><m:endChr m:val="${encodeXmlEntities(right)}"/>${sep}${grow}</m:dPr>` +
                renderDelimitedItems(node, opts) +
                '</m:d>';
        }
        case 'cases': {
            const rows = firstSlot(node, ['rows', 'items', 'children', 'body']);
            return '<m:d><m:dPr><m:begChr m:val="{"/><m:endChr m:val=""/></m:dPr><m:e>' +
                renderEquationArray(rows, opts) +
                '</m:e></m:d>';
        }
        case 'eqArr':
            return renderEquationArray(firstSlot(node, ['rows', 'items', 'children', 'body']), opts);
        case 'function':
        case 'func':
        case 'log': {
            const name = (_b = (_a = node.functionName) !== null && _a !== void 0 ? _a : node.name) !== null && _b !== void 0 ? _b : (kind === 'log' ? 'log' : 'f');
            return '<m:func>' +
                `<m:fName>${typeof name === 'string' ? mathText(name, opts, { italic: false }) : renderElementSlot(name, opts)}</m:fName>` +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                '</m:func>';
        }
        case 'accent': {
            const chr = (_d = (_c = node.accentChar) !== null && _c !== void 0 ? _c : node.symbol) !== null && _d !== void 0 ? _d : '̂';
            return '<m:acc>' +
                `<m:accPr><m:chr m:val="${encodeXmlEntities(String(chr))}"/></m:accPr>` +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                '</m:acc>';
        }
        case 'bar':
        case 'overbar':
        case 'underbar': {
            const pos = node.position || (kind === 'underbar' ? 'bottom' : 'top');
            const val = pos === 'bottom' ? 'bot' : 'top';
            return '<m:bar>' +
                `<m:barPr><m:pos m:val="${val}"/></m:barPr>` +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                '</m:bar>';
        }
        case 'box':
        case 'boxed':
            return `<m:borderBox><m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e></m:borderBox>`;
        case 'limit':
        case 'limlow':
            return '<m:limLow>' +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                `<m:lim>${renderElementSlot(firstSlot(node, ['lower', 'subscript', 'sub']), opts)}</m:lim>` +
                '</m:limLow>';
        case 'limitUpper':
        case 'limupp':
            return '<m:limUpp>' +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                `<m:lim>${renderElementSlot(firstSlot(node, ['upper', 'exponent', 'sup']), opts)}</m:lim>` +
                '</m:limUpp>';
        case 'groupChar':
        case 'groupchr': {
            const chr = (_f = (_e = node.groupChar) !== null && _e !== void 0 ? _e : node.symbol) !== null && _f !== void 0 ? _f : '⏞';
            const pos = node.position === 'bottom' ? 'bot' : 'top';
            const verticalJustification = node.verticalJustification === 'bottom' ? 'bot' : 'top';
            return '<m:groupChr>' +
                `<m:groupChrPr><m:chr m:val="${encodeXmlEntities(String(chr))}"/><m:pos m:val="${pos}"/><m:vertJc m:val="${verticalJustification}"/></m:groupChrPr>` +
                `<m:e>${renderElementSlot(firstSlot(node, ['body', 'expression', 'base']), opts)}</m:e>` +
                '</m:groupChr>';
        }
        case 'matrix': {
            const rows = firstSlot(node, ['rows', 'cells']);
            const matrixRows = Array.isArray(rows) ? rows : [];
            const rowXml = matrixRows.map(row => `<m:mr>${(Array.isArray(row) ? row : [row]).map(cell => `<m:e>${renderElementSlot(cell, opts)}</m:e>`).join('')}</m:mr>`).join('');
            return `<m:m><m:mPr/>${rowXml || '<m:mr><m:e/></m:mr>'}</m:m>`;
        }
        case 'text':
        default:
            return mathText((_h = (_g = node.text) !== null && _g !== void 0 ? _g : node.value) !== null && _h !== void 0 ? _h : '', opts, { italic: node.italic });
    }
}
function wrapOMathPara(oMathXml, opts) {
    return `<m:oMathPara xmlns:m="${NS_M}"><m:oMathParaPr><m:jc m:val="${mathJc(opts.align)}"/></m:oMathParaPr>${oMathXml}</m:oMathPara>`;
}
function equationOmml(opts) {
    var _a;
    const sourceFormat = opts.sourceFormat || (typeof opts.source === 'object' ? 'template' : 'plain');
    if (sourceFormat === 'omml') {
        if (typeof opts.source !== 'string')
            throw new Error('addEquation() sourceFormat "omml" requires a string source.');
        const omml = opts.source.trim();
        if (omml.startsWith('<m:oMathPara'))
            return omml;
        if (omml.startsWith('<m:oMath'))
            return wrapOMathPara(omml, opts);
        return wrapOMathPara(`<m:oMath>${omml}</m:oMath>`, opts);
    }
    if (sourceFormat === 'template') {
        return wrapOMathPara(`<m:oMath>${renderTemplate(opts.source, opts)}</m:oMath>`, opts);
    }
    return wrapOMathPara(`<m:oMath>${mathText(String((_a = opts.source) !== null && _a !== void 0 ? _a : ''), opts)}</m:oMath>`, opts);
}
function nativeShapeXml(slideItemObj, ctx, omml) {
    var _a;
    const opts = slideItemObj.equation || slideItemObj.options;
    const name = ((_a = slideItemObj.options) === null || _a === void 0 ? void 0 : _a.objectName) || 'Equation';
    return '<p:sp>' +
        '<p:nvSpPr>' +
        genXmlCNvPr({ id: ctx.shapeId, name, creationId: ctx.creationId, options: opts }) +
        '<p:cNvSpPr txBox="1"/><p:nvPr/>' +
        '</p:nvSpPr>' +
        '<p:spPr>' +
        `<a:xfrm${ctx.locationAttr}><a:off x="${ctx.x}" y="${ctx.y}"/><a:ext cx="${ctx.cx}" cy="${ctx.cy}"/></a:xfrm>` +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/>' +
        '</p:spPr>' +
        '<p:txBody>' +
        '<a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0"><a:spAutoFit/></a:bodyPr><a:lstStyle/>' +
        `<a:p><a14:m>${omml}</a14:m><a:endParaRPr lang="${encodeXmlEntities(opts.lang || 'en-US')}" dirty="0"/></a:p>` +
        '</p:txBody>' +
        '</p:sp>';
}
function fallbackShapeXml(slideItemObj, ctx) {
    var _a;
    if (!slideItemObj.fallbackRid)
        return '';
    const opts = slideItemObj.equation || slideItemObj.options;
    const name = ((_a = slideItemObj.options) === null || _a === void 0 ? void 0 : _a.objectName) || 'Equation';
    return '<mc:Fallback>' +
        '<p:sp>' +
        '<p:nvSpPr>' +
        genXmlCNvPr({ id: ctx.shapeId, name, creationId: ctx.creationId, options: opts }) +
        '<p:cNvSpPr txBox="1"><a:spLocks noRot="1" noChangeAspect="1" noMove="1" noResize="1" noEditPoints="1" noAdjustHandles="1" noChangeArrowheads="1" noChangeShapeType="1" noTextEdit="1"/></p:cNvSpPr><p:nvPr/>' +
        '</p:nvSpPr>' +
        '<p:spPr>' +
        `<a:xfrm${ctx.locationAttr}><a:off x="${ctx.x}" y="${ctx.y}"/><a:ext cx="${ctx.cx}" cy="${ctx.cy}"/></a:xfrm>` +
        '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
        `<a:blipFill><a:blip r:embed="rId${slideItemObj.fallbackRid}"/><a:stretch><a:fillRect/></a:stretch></a:blipFill>` +
        '</p:spPr>' +
        '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"><a:noFill/></a:rPr><a:t>&#160;</a:t></a:r></a:p></p:txBody>' +
        '</p:sp>' +
        '</mc:Fallback>';
}
export function genXmlEquation(slideItemObj, ctx) {
    const opts = slideItemObj.equation || slideItemObj.options;
    if (!opts || opts.source === undefined || opts.source === null)
        throw new Error('addEquation() requires `source`.');
    const omml = equationOmml(opts);
    return `<mc:AlternateContent xmlns:mc="${NS_MC}"><mc:Choice xmlns:a14="${NS_A14}" Requires="a14">${nativeShapeXml(slideItemObj, ctx, omml)}</mc:Choice>${fallbackShapeXml(slideItemObj, ctx)}</mc:AlternateContent>`;
}
//# sourceMappingURL=gen-equations.js.map