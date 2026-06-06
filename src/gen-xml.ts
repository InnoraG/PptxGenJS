/**
 * PptxGenJS: XML Generation
 */

import {
	BULLET_TYPES,
	CRLF,
	DEF_BULLET_MARGIN,
	DEF_CELL_MARGIN_IN,
	DEF_PRES_LAYOUT_NAME,
	DEF_TEXT_GLOW,
	DEF_TEXT_SHADOW,
	EMU,
	LAYOUT_IDX_SERIES_BASE,
	PLACEHOLDER_TYPES,
	SLDNUMFLDID,
	SLIDE_OBJECT_TYPES,
} from './core-enums'
import {
	IPresentationProps,
	ISlideObject,
	ISlideRel,
	ISlideRelChart,
	ISlideRelMedia,
	ObjectOptions,
	PresSlide,
	ShadowProps,
	SlideLayout,
	TableCell,
	TableCellProps,
	TextProps,
	TextPropsOptions,
} from './core-interfaces'
import {
	convertRotationDegrees,
	createColorElement,
	createGlowElement,
	createReflectionElement,
	createShadowElement,
	create3DElements,
	createText3DElements,
	encodeXmlEntities,
	genXmlColorSelection,
	getSmartParseNumber,
	getUuid,
	inch2Emu,
	normalizeWordArtTransform,
	valToPts,
} from './gen-utils'
import { genXmlTransition } from './gen-transitions'
import { genXmlAnimations } from './gen-animations'
import { genXmlModel3D } from './gen-model3d'
import { genXmlEquation } from './gen-equations'
import { genXmlNativeSmartArt } from './gen-smartart'

function normalizePresetShapeName(shape: string): string {
	return shape === 'folderCorner' ? 'foldedCorner' : shape
}

function normalizeTableStyleId(styleId: unknown): string {
	const value = String(styleId || '').trim()
	if (!value) return ''
	if (value.charAt(0) === '{' && value.charAt(value.length - 1) === '}') return value
	return `{${value}}`
}

function genXmlTableProperties(options: any): string {
	const attrPairs: Array<[string, unknown]> = [
		['firstRow', options.headerRow ?? options.firstRow],
		['lastRow', options.totalRow ?? options.lastRow],
		['firstCol', options.firstColumn ?? options.firstCol],
		['lastCol', options.lastColumn ?? options.lastCol],
		['bandRow', options.bandedRows ?? options.bandRow],
		['bandCol', options.bandedColumns ?? options.bandCol],
	]
	const attrs = attrPairs
		.filter(([, value]) => typeof value === 'boolean')
		.map(([name, value]) => `${name}="${value ? 1 : 0}"`)
		.join(' ')
	const attrXml = attrs ? ` ${attrs}` : ''
	const styleId = normalizeTableStyleId(options.tableStyleId)
	const styleXml = styleId ? `<a:tableStyleId>${encodeXmlEntities(styleId)}</a:tableStyleId>` : ''
	return styleXml ? `<a:tblPr${attrXml}>${styleXml}</a:tblPr>` : `<a:tblPr${attrXml}/>`
}

const ImageSizingXml = {
	cover: function (imgSize: { w: number, h: number }, boxDim: { w: number, h: number, x: number, y: number }) {
		const imgRatio = imgSize.h / imgSize.w
		const boxRatio = boxDim.h / boxDim.w
		const isBoxBased = boxRatio > imgRatio
		const width = isBoxBased ? boxDim.h / imgRatio : boxDim.w
		const height = isBoxBased ? boxDim.h : boxDim.w * imgRatio
		const hzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.w / width))
		const vzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.h / height))
		return `<a:srcRect l="${hzPerc}" r="${hzPerc}" t="${vzPerc}" b="${vzPerc}"/><a:stretch/>`
	},
	contain: function (imgSize: { w: number, h: number }, boxDim: { w: number, h: number, x: number, y: number }) {
		const imgRatio = imgSize.h / imgSize.w
		const boxRatio = boxDim.h / boxDim.w
		const widthBased = boxRatio > imgRatio
		const width = widthBased ? boxDim.w : boxDim.h / imgRatio
		const height = widthBased ? boxDim.w * imgRatio : boxDim.h
		const hzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.w / width))
		const vzPerc = Math.round(1e5 * 0.5 * (1 - boxDim.h / height))
		return `<a:srcRect l="${hzPerc}" r="${hzPerc}" t="${vzPerc}" b="${vzPerc}"/><a:stretch/>`
	},
	crop: function (imgSize: { w: number, h: number }, boxDim: { w: number, h: number, x: number, y: number }) {
		const l = boxDim.x
		const r = imgSize.w - (boxDim.x + boxDim.w)
		const t = boxDim.y
		const b = imgSize.h - (boxDim.y + boxDim.h)
		const lPerc = Math.round(1e5 * (l / imgSize.w))
		const rPerc = Math.round(1e5 * (r / imgSize.w))
		const tPerc = Math.round(1e5 * (t / imgSize.h))
		const bPerc = Math.round(1e5 * (b / imgSize.h))
		return `<a:srcRect l="${lPerc}" r="${rPerc}" t="${tPerc}" b="${bPerc}"/><a:stretch/>`
	},
}

function clampPct100000(value: number): number {
	if (!Number.isFinite(value)) return 0
	return Math.max(0, Math.min(100000, Math.round(value)))
}

function shadowLengthToEmu(value: number | string | undefined, defaultPt: number): number {
	const n = Number(value ?? defaultPt)
	if (!Number.isFinite(n)) return valToPts(defaultPt)
	// Serializer calls must be idempotent. Values above this threshold are
	// treated as already-converted OOXML EMUs from an older in-memory mutation.
	return Math.round(Math.abs(n) > 10000 ? n : valToPts(n))
}

function shadowAngleToOoxml(value: number | string | undefined, defaultDeg: number): number {
	const n = Number(value ?? defaultDeg)
	if (!Number.isFinite(n)) return Math.round(defaultDeg * 60000)
	return Math.round(Math.abs(n) > 360 ? n : n * 60000)
}

function shadowOpacityToOoxml(value: number | string | undefined, defaultOpacity: number): number {
	const n = Number(value ?? defaultOpacity)
	if (!Number.isFinite(n)) return clampPct100000(defaultOpacity * 100000)
	return clampPct100000(n > 1 ? n : n * 100000)
}

function createInlineShadowXml(shadow: ShadowProps | undefined): string {
	if (!shadow || shadow.type === 'none') return ''
	const type = shadow.type || 'outer'
	const blur = shadowLengthToEmu(shadow.blur, 8)
	const offset = shadowLengthToEmu(shadow.offset, 4)
	const angle = shadowAngleToOoxml(shadow.angle, 270)
	const opacity = shadowOpacityToOoxml(shadow.opacity, 0.75)
	const color = shadow.color || DEF_TEXT_SHADOW.color

	let xml = `<a:${type}Shdw ${type === 'outer' ? 'sx="100000" sy="100000" kx="0" ky="0" algn="bl" rotWithShape="0"' : ''} blurRad="${blur}" dist="${offset}" dir="${angle}">`
	if (color && typeof color === 'object' && (color as any).type === 'preset') {
		xml += `<a:prstClr val="${(color as any).preset}"><a:alpha val="${opacity}"/></a:prstClr>`
	} else {
		const hex = ({black:'000000',white:'FFFFFF',red:'FF0000',green:'008000',blue:'0000FF',yellow:'FFFF00',cyan:'00FFFF',magenta:'FF00FF',gray:'808080'} as Record<string,string>)[(color as string)?.toLowerCase()] ?? (color as string)?.replace('#','') ?? '000000'
		xml += `<a:srgbClr val="${hex.toUpperCase()}"><a:alpha val="${opacity}"/></a:srgbClr>`
	}
	xml += `</a:${type}Shdw>`
	return xml
}

/**
 * Transforms a slide or slideLayout to resulting XML string - Creates `ppt/slide*.xml`
 * @param {PresSlide|SlideLayout} slideObject - slide object created within createSlideObject
 * @return {string} XML string with <p:cSld> as the root
 */
function slideObjectToXml(slide: PresSlide | SlideLayout): string {
	let strSlideXml: string = slide._name ? '<p:cSld name="' + slide._name + '">' : '<p:cSld>'
	let intTableNum = 1

	// STEP 1: Add background color/image (ensure only a single `<p:bg>` tag is created, ex: when master-baskground has both `color` and `path`)
	const rawBgXml = (slide.background as any)?._rawBgXml
	if (rawBgXml) {
		strSlideXml += rawBgXml
	} else if (slide._bkgdImgRid) {
		strSlideXml += `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="rId${slide._bkgdImgRid}"><a:lum/></a:blip><a:srcRect/><a:stretch><a:fillRect/></a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>`
	} else if (slide.background?.color || slide.background?.type === 'gradient') {
		strSlideXml += `<p:bg><p:bgPr>${genXmlColorSelection(slide.background)}<a:effectLst/></p:bgPr></p:bg>`
	} else if (!slide.bkgd && slide._name && slide._name === DEF_PRES_LAYOUT_NAME) {
		// NOTE: Default [white] background is needed on slideMaster1.xml to avoid gray background in Keynote (and Finder previews)
		strSlideXml += '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>'
	}

	// STEP 2: Continue slide by starting spTree node
	strSlideXml += '<p:spTree>'
	strSlideXml += '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
	strSlideXml += '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
	strSlideXml += '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'

	// STEP 3: Loop over all Slide.data objects and add them to this slide
	slide._slideObjects.forEach((slideItemObj: ISlideObject, idx: number) => {
		let x = 0
		let y = 0
		let cx = getSmartParseNumber('75%', 'X', slide._presLayout)
		let cy = 0
		let placeholderObj: ISlideObject
		let locationAttr = ''
		let arrTabRows: TableCell[][] = null
		let objTabOpts: ObjectOptions = null
		let intColCnt = 0
		let intColW = 0
		let cellOpts: TableCellProps = null
		let strXml: string = null
		const sizing: ObjectOptions['sizing'] = slideItemObj.options?.sizing
		const rounding = slideItemObj.options?.rounding

		if (
			(slide as PresSlide)._slideLayout !== undefined &&
			(slide as PresSlide)._slideLayout._slideObjects !== undefined &&
			slideItemObj.options &&
			slideItemObj.options.placeholder
		) {
			placeholderObj = (slide as PresSlide)._slideLayout._slideObjects.filter(
				(object: ISlideObject) => object.options.placeholder === slideItemObj.options.placeholder
			)[0]
		}

		// A: Set option vars
		slideItemObj.options = slideItemObj.options || {}

		if (typeof slideItemObj.options.x !== 'undefined') x = getSmartParseNumber(slideItemObj.options.x, 'X', slide._presLayout)
		if (typeof slideItemObj.options.y !== 'undefined') y = getSmartParseNumber(slideItemObj.options.y, 'Y', slide._presLayout)
		if (typeof slideItemObj.options.w !== 'undefined') cx = getSmartParseNumber(slideItemObj.options.w, 'X', slide._presLayout)
		if (typeof slideItemObj.options.h !== 'undefined') cy = getSmartParseNumber(slideItemObj.options.h, 'Y', slide._presLayout)

		// Set w/h now that smart parse is done
		let imgWidth = cx
		let imgHeight = cy

		// If using a placeholder then inherit it's position
		if (placeholderObj) {
			if (placeholderObj.options.x || placeholderObj.options.x === 0) x = getSmartParseNumber(placeholderObj.options.x, 'X', slide._presLayout)
			if (placeholderObj.options.y || placeholderObj.options.y === 0) y = getSmartParseNumber(placeholderObj.options.y, 'Y', slide._presLayout)
			if (placeholderObj.options.w || placeholderObj.options.w === 0) cx = getSmartParseNumber(placeholderObj.options.w, 'X', slide._presLayout)
			if (placeholderObj.options.h || placeholderObj.options.h === 0) cy = getSmartParseNumber(placeholderObj.options.h, 'Y', slide._presLayout)
		}
		//
		let flipH = !!slideItemObj.options.flipH
		let flipV = !!slideItemObj.options.flipV
		if (cx < 0) {
			x += cx
			cx = Math.abs(cx)
			imgWidth = cx
			flipH = !flipH
		}
		if (cy < 0) {
			y += cy
			cy = Math.abs(cy)
			imgHeight = cy
			flipV = !flipV
		}
		if (flipH) locationAttr += ' flipH="1"'
		if (flipV) locationAttr += ' flipV="1"'
		if (slideItemObj.options.rotate) locationAttr += ` rot="${convertRotationDegrees(slideItemObj.options.rotate)}"`

		// B: Add OBJECT to the current Slide
		switch (slideItemObj._type) {
			case SLIDE_OBJECT_TYPES.smartart: {
				const smartArtShapeId = (slideItemObj.options as any).spid || (idx + 2)
				const smartArtCreationId = (slide._slideNum * 10000) + Number(smartArtShapeId)
				strSlideXml += genXmlNativeSmartArt(slideItemObj, {
					shapeId: smartArtShapeId,
					creationId: smartArtCreationId,
					x,
					y,
					cx: cx || getSmartParseNumber('75%', 'X', slide._presLayout),
					cy: cy || getSmartParseNumber('45%', 'Y', slide._presLayout),
					locationAttr,
				})
				break
			}

			case SLIDE_OBJECT_TYPES.equation: {
				const equationShapeId = (slideItemObj.options as any).spid || (idx + 2)
				const equationCreationId = (slide._slideNum * 10000) + Number(equationShapeId)
				strSlideXml += genXmlEquation(slideItemObj, {
					shapeId: equationShapeId,
					creationId: equationCreationId,
					x,
					y,
					cx: cx || getSmartParseNumber('75%', 'X', slide._presLayout),
					cy: cy || EMU * 0.35,
					locationAttr,
				})
				break
			}

			case SLIDE_OBJECT_TYPES.table:
				arrTabRows = slideItemObj.arrTabRows
				objTabOpts = slideItemObj.options
				intColCnt = 0
				intColW = 0

				// Calc number of columns
				// NOTE: Cells may have a colspan, so merely taking the length of the [0] (or any other) row is not
				// ....: sufficient to determine column count. Therefore, check each cell for a colspan and total cols as reqd
				arrTabRows[0].forEach(cell => {
					cellOpts = cell.options || null
					intColCnt += cellOpts?.colspan ? Number(cellOpts.colspan) : 1
				})

				// STEP 1: Start Table XML
				// NOTE: Non-numeric cNvPr id values will trigger "presentation needs repair" type warning in MS-PPT-2013
				// eslint-disable-next-line @typescript-eslint/no-explicit-any

				const tableShapeId = (slideItemObj.options as any).spid || (idx + 2)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const tableRawGraphicFrameNvXml = (slideItemObj.options as any)._rawGraphicFrameNvXml

				strXml = '<p:graphicFrame>'
				if (tableRawGraphicFrameNvXml) {
					strXml += tableRawGraphicFrameNvXml
				} else {
					strXml += `<p:nvGraphicFramePr><p:cNvPr id="${tableShapeId}" name="${slideItemObj.options.objectName}"/>`
					strXml +=
						'<p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr>' +
						'  <p:nvPr><p:extLst><p:ext uri="{D42A27DB-BD31-4B8C-83A1-F6EECF244321}"><p14:modId val="1579011935"/></p:ext></p:extLst></p:nvPr>' +
						'</p:nvGraphicFramePr>'
				}
				strXml += `<p:xfrm><a:off x="${x || (x === 0 ? 0 : EMU)}" y="${y || (y === 0 ? 0 : EMU)}"/><a:ext cx="${cx || (cx === 0 ? 0 : EMU)}" cy="${cy || EMU
					}"/></p:xfrm>`
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawTblPrXml = (slideItemObj.options as any)._rawTblPrXml
				strXml += '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl>' + (_rawTblPrXml || genXmlTableProperties(slideItemObj.options))

				// STEP 2: Set column widths
				// Evenly distribute cols/rows across size provided when applicable (calc them if only overall dimensions were provided)
				// A: Col widths provided?
				// B: Table Width provided without colW? Then distribute cols
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawGridColXmls = (slideItemObj.options as any)._rawGridColXmls
				if (Array.isArray(_rawGridColXmls) && _rawGridColXmls.length > 0) {
					strXml += '<a:tblGrid>' + _rawGridColXmls.join('') + '</a:tblGrid>'
				} else if (Array.isArray(objTabOpts.colW)) {
					strXml += '<a:tblGrid>'
					for (let col = 0; col < intColCnt; col++) {
						let w = inch2Emu(objTabOpts.colW[col])
						if (w == null || isNaN(w)) {
							w = (typeof slideItemObj.options.w === 'number' ? slideItemObj.options.w : 1) / intColCnt
						}
						strXml += `<a:gridCol w="${Math.round(w)}"/>`
					}
					strXml += '</a:tblGrid>'
				} else {
					intColW = objTabOpts.colW ? objTabOpts.colW : EMU
					if (slideItemObj.options.w && !objTabOpts.colW) intColW = Math.round((typeof slideItemObj.options.w === 'number' ? slideItemObj.options.w : 1) / intColCnt)
					strXml += '<a:tblGrid>'
					for (let colw = 0; colw < intColCnt; colw++) {
						strXml += `<a:gridCol w="${intColW}"/>`
					}
					strXml += '</a:tblGrid>'
				}

				// STEP 3: Build our row arrays into an actual grid to match the XML we will be building next (ISSUE #36)
				// Note row arrays can arrive "lopsided" as in row1:[1,2,3] row2:[3] when first two cols rowspan!,
				// so a simple loop below in XML building wont suffice to build table correctly.
				// We have to build an actual grid now
				/*
					EX: (A0:rowspan=3, B1:rowspan=2, C1:colspan=2)

					/------|------|------|------\
					|  A0  |  B0  |  C0  |  D0  |
					|      |  B1  |  C1  |      |
					|      |      |  C2  |  D2  |
					\------|------|------|------/
				*/
				// A: add _hmerge cell for colspan. should reserve rowspan
				arrTabRows.forEach(cells => {
					for (let cIdx = 0; cIdx < cells.length;) {
						const cell = cells[cIdx]
						const colspan = cell.options?.colspan
						const rowspan = cell.options?.rowspan
						if (colspan && colspan > 1) {
							const vMergeCells = new Array(colspan - 1).fill(undefined).map(() => {
								return { _type: SLIDE_OBJECT_TYPES.tablecell, options: { rowspan }, _hmerge: true } as const
							})
							cells.splice(cIdx + 1, 0, ...vMergeCells)
							cIdx += colspan
						} else {
							cIdx += 1
						}
					}
				})
				// B: add _vmerge cell for rowspan. should reserve colspan/_hmerge
				arrTabRows.forEach((cells, rIdx) => {
					const nextRow = arrTabRows[rIdx + 1]
					if (!nextRow) return
					cells.forEach((cell, cIdx) => {
						const rowspan = cell._rowContinue || cell.options?.rowspan
						const colspan = cell.options?.colspan
						const _hmerge = cell._hmerge
						if (rowspan && rowspan > 1) {
							const hMergeCell = { _type: SLIDE_OBJECT_TYPES.tablecell, options: { colspan }, _rowContinue: rowspan - 1, _vmerge: true, _hmerge } as const
							nextRow.splice(cIdx, 0, hMergeCell)
						}
					})
				})

				// STEP 4: Build table rows/cells
				arrTabRows.forEach((cells, rIdx) => {
					// A: Table Height provided without rowH? Then distribute rows
					let intRowH = 0 // IMPORTANT: Default must be zero for auto-sizing to work
					if (Array.isArray(objTabOpts.rowH) && objTabOpts.rowH[rIdx]) intRowH = inch2Emu(Number(objTabOpts.rowH[rIdx]))
					else if (objTabOpts.rowH && !isNaN(Number(objTabOpts.rowH))) intRowH = inch2Emu(Number(objTabOpts.rowH))
					else if (slideItemObj.options.cy || slideItemObj.options.h) {
						intRowH = Math.round(
							(slideItemObj.options.h ? inch2Emu(slideItemObj.options.h) : typeof slideItemObj.options.cy === 'number' ? slideItemObj.options.cy : 1) /
							arrTabRows.length
						)
					}

					// B: Start row
					strXml += `<a:tr h="${intRowH}">`

					// C: Loop over each CELL
					cells.forEach(cellObj => {
						const cell: TableCell = cellObj

						const cellSpanAttrs = {
							rowSpan: cell.options?.rowspan > 1 ? cell.options.rowspan : undefined,
							gridSpan: cell.options?.colspan > 1 ? cell.options.colspan : undefined,
							vMerge: cell._vmerge ? 1 : undefined,
							hMerge: cell._hmerge ? 1 : undefined,
						}
						let cellSpanAttrStr = Object.keys(cellSpanAttrs)
							.map(k => [k, cellSpanAttrs[k]])
							.filter(([, v]) => !!v)
							.map(([k, v]) => `${String(k)}="${String(v)}"`)
							.join(' ')
						if (cellSpanAttrStr) cellSpanAttrStr = ' ' + cellSpanAttrStr

						// 1: COLSPAN/ROWSPAN: Add dummy cells for any active colspan/rowspan
						if (cell._hmerge || cell._vmerge) {
							strXml += `<a:tc${cellSpanAttrStr}><a:tcPr/></a:tc>`
							return
						}

						// 2: OPTIONS: Build/set cell options
						const cellOpts = cell.options || {}
						cell.options = cellOpts

							// B: Inherit some options from table when cell options dont exist
							// @see: http://officeopenxml.com/drwTableCellProperties-alignment.php
							;['align', 'bold', 'border', 'color', 'fill', 'fontFace', 'fontSize', 'margin', 'textDirection', 'underline', 'valign'].forEach(name => {
								if (objTabOpts[name] && !cellOpts[name] && cellOpts[name] !== 0) cellOpts[name] = objTabOpts[name]
							})

						const cellValign = cellOpts.valign
							? ` anchor="${cellOpts.valign.replace(/^c$/i, 'ctr').replace(/^m$/i, 'ctr').replace('center', 'ctr').replace('middle', 'ctr').replace('top', 't').replace('btm', 'b').replace('bottom', 'b')}"`
							: ''
						const cellTextDir = (cellOpts.textDirection && cellOpts.textDirection !== 'horz') ? ` vert="${cellOpts.textDirection}"` : ''

						let fillColor =
							cell._optImp?.fill?.color
								? cell._optImp.fill.color
								: cell._optImp?.fill && typeof cell._optImp.fill === 'string'
									? cell._optImp.fill
									: ''
						fillColor = fillColor || cellOpts.fill ? cellOpts.fill : ''
						const cellFill = fillColor ? genXmlColorSelection(fillColor) : ''

						let cellMargin = cellOpts.margin === 0 || cellOpts.margin ? cellOpts.margin : DEF_CELL_MARGIN_IN
						if (!Array.isArray(cellMargin) && typeof cellMargin === 'number') cellMargin = [cellMargin, cellMargin, cellMargin, cellMargin]
						/** FUTURE: DEPRECATED:
						 * - Backwards-Compat: Oops! Discovered we were still using points for cell margin before v3.8.0 (UGH!)
						 * - We cant introduce a breaking change before v4.0, so...
						 */
						let cellMarginXml = ''
						if (cellMargin[0] >= 1) {
							cellMarginXml = ` marL="${valToPts(cellMargin[3])}" marR="${valToPts(cellMargin[1])}" marT="${valToPts(cellMargin[0])}" marB="${valToPts(
								cellMargin[2]
							)}"`
						} else {
							cellMarginXml = ` marL="${inch2Emu(cellMargin[3])}" marR="${inch2Emu(cellMargin[1])}" marT="${inch2Emu(cellMargin[0])}" marB="${inch2Emu(
								cellMargin[2]
							)}"`
						}

						// FUTURE: Cell NOWRAP property (textwrap: add to a:tcPr (horzOverflow="overflow" or whatever options exist)

						// 4: Set CELL content and properties ==================================
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const _rawTxBodyXml = (cellOpts as any)._rawTxBodyXml
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const _rawTcPrAttrs = (cellOpts as any)._rawTcPrAttrs || ''
						strXml += `<a:tc${cellSpanAttrStr}>${_rawTxBodyXml || genXmlTextBody(cell)}<a:tcPr${_rawTcPrAttrs || (cellMarginXml + cellValign + cellTextDir)}>`
						// strXml += `<a:tc${cellColspan}${cellRowspan}>${genXmlTextBody(cell)}<a:tcPr${cellMarginXml}${cellValign}${cellTextDir}>`
						// FIXME: 20200525: ^^^
						// <a:tcPr marL="38100" marR="38100" marT="38100" marB="38100" vert="vert270">

						// 5: Borders: Add any borders
						if (cellOpts.border && Array.isArray(cellOpts.border)) {
							// NOTE: *** IMPORTANT! *** LRTB order matters! (Reorder a line below to watch the borders go wonky in MS-PPT-2013!!)
							[
								{ idx: 3, name: 'lnL' },
								{ idx: 1, name: 'lnR' },
								{ idx: 0, name: 'lnT' },
								{ idx: 2, name: 'lnB' },
							].forEach(obj => {
								// eslint-disable-next-line @typescript-eslint/no-explicit-any
								const borderSide = cellOpts.border[obj.idx] as any
								const nativeBorder = !!borderSide._nativeTableBorder
								if (borderSide.type !== 'none') {
									const lineW = borderSide._lnW || valToPts(borderSide.pt)
									let lineAttrs = `w="${lineW}"`
									if (nativeBorder) {
										if (borderSide._lnCap) lineAttrs += ` cap="${borderSide._lnCap}"`
										if (borderSide._lnCmpd) lineAttrs += ` cmpd="${borderSide._lnCmpd}"`
										if (borderSide._lnAlgn) lineAttrs += ` algn="${borderSide._lnAlgn}"`
									} else {
										lineAttrs += ' cap="flat" cmpd="sng" algn="ctr"'
									}
									strXml += `<a:${obj.name} ${lineAttrs}>`
									const borderAlphaXml = (borderSide.transparency !== undefined && borderSide.transparency !== null)
										? `<a:alpha val="${Math.round((100 - borderSide.transparency) * 1000)}"/>`
										: ''
									strXml += `<a:solidFill>${createColorElement(borderSide.color, borderAlphaXml)}</a:solidFill>`
									strXml += `<a:prstDash val="${borderSide._prstDash || (borderSide.type === 'dash' ? 'sysDash' : 'solid')}"/>`
									if (!nativeBorder || borderSide._hasRound) strXml += '<a:round/>'
									if (nativeBorder) {
										if (borderSide._headEndType) strXml += `<a:headEnd type="${borderSide._headEndType}"${borderSide._headEndW ? ` w="${borderSide._headEndW}"` : ''}${borderSide._headEndLen ? ` len="${borderSide._headEndLen}"` : ''}/>`
										if (borderSide._tailEndType) strXml += `<a:tailEnd type="${borderSide._tailEndType}"${borderSide._tailEndW ? ` w="${borderSide._tailEndW}"` : ''}${borderSide._tailEndLen ? ` len="${borderSide._tailEndLen}"` : ''}/>`
									} else {
										strXml += '<a:headEnd type="none" w="med" len="med"/><a:tailEnd type="none" w="med" len="med"/>'
									}
									strXml += `</a:${obj.name}>`
								} else if (!nativeBorder || borderSide._hasLineElement !== false) {
									const lineW = borderSide._lnW || '0'
									let lineAttrs = `w="${lineW}"`
									if (nativeBorder) {
										if (borderSide._lnCap) lineAttrs += ` cap="${borderSide._lnCap}"`
										if (borderSide._lnCmpd) lineAttrs += ` cmpd="${borderSide._lnCmpd}"`
										if (borderSide._lnAlgn) lineAttrs += ` algn="${borderSide._lnAlgn}"`
									} else {
										lineAttrs += ' cap="flat" cmpd="sng" algn="ctr"'
									}
									strXml += `<a:${obj.name} ${lineAttrs}><a:noFill/></a:${obj.name}>`
								}
							})
						}

						// 6: Close cell Properties & Cell
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const _rawTcPrChildXml = (cellOpts as any)._rawTcPrChildXml
						if (_rawTcPrChildXml) {
							let tcChildXml = _rawTcPrChildXml
							// eslint-disable-next-line @typescript-eslint/no-explicit-any
							const ridMap = ((slideItemObj.options as any)._rawTableRidMap || {}) as Record<string, number>
							Object.keys(ridMap).forEach(origRid => {
								tcChildXml = tcChildXml.replace(new RegExp(`__RAWRID_${origRid}__`, 'g'), `rId${ridMap[origRid]}`)
							})
							strXml += tcChildXml
						} else {
							strXml += cellFill
						}
						strXml += '  </a:tcPr>'
						strXml += ' </a:tc>'
					})

					// D: Complete row
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawRowExtLstXmls = (slideItemObj.options as any)._rawRowExtLstXmls
					if (Array.isArray(_rawRowExtLstXmls) && _rawRowExtLstXmls[rIdx]) strXml += _rawRowExtLstXmls[rIdx]
					strXml += '</a:tr>'
				})

				// STEP 5: Complete table
				strXml += '      </a:tbl>'
				strXml += '    </a:graphicData>'
				strXml += '  </a:graphic>'
				strXml += '</p:graphicFrame>'

				// STEP 6: Set table XML
				strSlideXml += strXml

				// LAST: Increment counter
				intTableNum++
				break

			case SLIDE_OBJECT_TYPES.shape:
			case SLIDE_OBJECT_TYPES.text:
			case SLIDE_OBJECT_TYPES.placeholder:
				// Lines can have zero cy, but text should not
				if (!slideItemObj.options.line && cy === 0) cy = EMU * 0.3

				// Margin/Padding/Inset for textboxes (skip for pure shapes)
				if (slideItemObj._type !== SLIDE_OBJECT_TYPES.shape) {
					if (!slideItemObj.options._bodyProp) slideItemObj.options._bodyProp = {}
					if (slideItemObj.options.margin && Array.isArray(slideItemObj.options.margin)) {
						// margin order is [top, right, bottom, left]
						slideItemObj.options._bodyProp.tIns = valToPts(slideItemObj.options.margin[0] || 0)
						slideItemObj.options._bodyProp.rIns = valToPts(slideItemObj.options.margin[1] || 0)
						slideItemObj.options._bodyProp.bIns = valToPts(slideItemObj.options.margin[2] || 0)
						slideItemObj.options._bodyProp.lIns = valToPts(slideItemObj.options.margin[3] || 0)
					} else if (typeof slideItemObj.options.margin === 'number') {
						slideItemObj.options._bodyProp.lIns = valToPts(slideItemObj.options.margin)
						slideItemObj.options._bodyProp.rIns = valToPts(slideItemObj.options.margin)
						slideItemObj.options._bodyProp.bIns = valToPts(slideItemObj.options.margin)
						slideItemObj.options._bodyProp.tIns = valToPts(slideItemObj.options.margin)
					}
				}

				// A: Start SHAPE =======================================================
				strSlideXml += '<p:sp>'

				// B: The addition of the "txBox" attribute is the sole determiner of if an object is a shape or textbox
				// Generate creationId (unique per object, starts from a large number to avoid conflicts)
				const creationId = (slide._slideNum * 10000) + (idx + 2)
				// Use options.spid if provided (decyphered shapes preserve original PowerPoint IDs for comparator matching).
				// When spid is set, use it directly. Otherwise use sequential idx+2, but skip any IDs already
				// claimed by passthrough shapes (via addPassthroughXml) to prevent duplicate shape IDs (0x80070570).
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const explicitSpid = (slideItemObj.options as any).spid
				let seqId = idx + 2
				if (!explicitSpid) {
					// Collect IDs used by passthrough shapes to avoid collision
					const passthroughIds = new Set<number>()
					slide._slideObjects.forEach(obj => {
						if (obj._type === SLIDE_OBJECT_TYPES.passthrough && obj.passthrough?.xml) {
							const ptIdMatches = obj.passthrough.xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)
							for (const m of ptIdMatches) passthroughIds.add(parseInt(m[1]))
						}
					})
					// Skip sequential IDs that would collide with passthrough shape IDs
					while (passthroughIds.has(seqId)) seqId++
				}
				const shapeId = explicitSpid || seqId
				strSlideXml += `<p:nvSpPr><p:cNvPr id="${shapeId}" name="${slideItemObj.options.objectName}" creationId="${creationId}">`
				// <Hyperlink>
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawShapeHlinkClickXml = (slideItemObj.options as any)._rawShapeHlinkClickXml
				if (_rawShapeHlinkClickXml) {
					strSlideXml += _rawShapeHlinkClickXml
				} else {
					if (slideItemObj.options.hyperlink?.url) {
						strSlideXml += `<a:hlinkClick r:id="rId${slideItemObj.options.hyperlink._rId}" tooltip="${slideItemObj.options.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.options.hyperlink.tooltip) : ''}"/>`
					}
					if (slideItemObj.options.hyperlink?.slide) {
						strSlideXml += `<a:hlinkClick r:id="rId${slideItemObj.options.hyperlink._rId}" tooltip="${slideItemObj.options.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.options.hyperlink.tooltip) : ''}" action="ppaction://hlinksldjump"/>`
					}
				}
				// </Hyperlink>
				strSlideXml += '</p:cNvPr>'
				// Emit spLocks if _spLocks option is set (decyphered native placeholder shapes have noGrp="1")
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const spLocksAttr = (slideItemObj.options as any)._spLocks
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const hasSpLocks = Object.prototype.hasOwnProperty.call(slideItemObj.options as any, '_spLocks')
				const spLocksXml = spLocksAttr ? `<a:spLocks ${spLocksAttr}/>` : '<a:spLocks/>'
				if (slideItemObj.options?.isTextBox) {
					strSlideXml += hasSpLocks ? `<p:cNvSpPr txBox="1">${spLocksXml}</p:cNvSpPr>` : '<p:cNvSpPr txBox="1"/>'
				} else if (hasSpLocks) {
					strSlideXml += `<p:cNvSpPr>${spLocksXml}</p:cNvSpPr>`
				} else {
					strSlideXml += '<p:cNvSpPr/>'
				}
				// Emit ph placeholder element if phType/_phType/placeholder is set (decyphered native placeholder shapes)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const phType = (slideItemObj.options as any).phType || (slideItemObj.options as any)._phType
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const phIdx = (slideItemObj.options as any).phIdx || (slideItemObj.options as any)._phIdx
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const phSz = (slideItemObj.options as any).phSz || (slideItemObj.options as any)._phSz
				// Also check options.placeholder - decypher tool sets this when phType is detected
				// If placeholder is set but no slide layout found (placeholderObj is null), emit ph directly
				const placeholderProp = slideItemObj.options.placeholder
				let nvPrContent = ''
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const hasBarePh = (slideItemObj.options as any).hasBarePh || (slideItemObj.options as any)._barePlaceholder
				if (phType) {
					nvPrContent = (phIdx !== undefined && phIdx !== null)
						? `<p:ph type="${phType}"${phSz ? ` sz="${phSz}"` : ''} idx="${phIdx}"/>`
						: `<p:ph type="${phType}"${phSz ? ` sz="${phSz}"` : ''}/>`
				} else if (phIdx !== undefined && phIdx !== null) {
					nvPrContent = `<p:ph${phSz ? ` sz="${phSz}"` : ''} idx="${phIdx}"/>`
				} else if (hasBarePh) {
					nvPrContent = `<p:ph/>`
				} else if (slideItemObj._type === 'placeholder') {
					nvPrContent = genXmlPlaceholder(slideItemObj)
				} else if (placeholderProp && !placeholderObj) {
					// placeholder set but no layout object found - emit ph type directly (decypher mode)
					nvPrContent = `<p:ph type="${placeholderProp}"/>`
				} else {
					nvPrContent = genXmlPlaceholder(placeholderObj)
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const rawNvPrChildXml = (slideItemObj.options as any)._rawNvPrChildXml
				if (rawNvPrChildXml) nvPrContent += rawNvPrChildXml
				strSlideXml += `<p:nvPr>${nvPrContent}</p:nvPr>`
				strSlideXml += '</p:nvSpPr><p:spPr>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const emptySpPr = (slideItemObj.options as any)._emptySpPr
				if (!emptySpPr) {
					strSlideXml += `<a:xfrm${locationAttr}>`
					strSlideXml += `<a:off x="${x}" y="${y}"/>`
					strSlideXml += `<a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`

					if (slideItemObj.shape === 'custGeom') {
						strSlideXml += '<a:custGeom><a:avLst />'
						strSlideXml += '<a:gdLst>'
						strSlideXml += '</a:gdLst>'
						strSlideXml += '<a:ahLst />'
						strSlideXml += '<a:cxnLst>'
						strSlideXml += '</a:cxnLst>'
						strSlideXml += '<a:rect l="l" t="t" r="r" b="b" />'

					strSlideXml += '<a:pathLst>'
					strSlideXml += `<a:path w="${cx}" h="${cy}">`

					slideItemObj.options.points?.forEach((point, i) => {
						if ('curve' in point) {
							switch (point.curve.type) {
								case 'arc':
									strSlideXml += `<a:arcTo hR="${getSmartParseNumber(point.curve.hR, 'Y', slide._presLayout)}" wR="${getSmartParseNumber(
										point.curve.wR,
										'X',
										slide._presLayout
									)}" stAng="${convertRotationDegrees(point.curve.stAng)}" swAng="${convertRotationDegrees(point.curve.swAng)}" />`
									break
								case 'cubic':
									strSlideXml += `<a:cubicBezTo>
									<a:pt x="${getSmartParseNumber(point.curve.x1, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y1, 'Y', slide._presLayout)}" />
									<a:pt x="${getSmartParseNumber(point.curve.x2, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y2, 'Y', slide._presLayout)}" />
									<a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}" />
									</a:cubicBezTo>`
									break
								case 'quadratic':
									strSlideXml += `<a:quadBezTo>
									<a:pt x="${getSmartParseNumber(point.curve.x1, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.curve.y1, 'Y', slide._presLayout)}" />
									<a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(point.y, 'Y', slide._presLayout)}" />
									</a:quadBezTo>`
									break
								default:
									break
							}
						} else if ('close' in point) {
							strSlideXml += '<a:close />'
						} else if (point.moveTo || i === 0) {
							strSlideXml += `<a:moveTo><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(
								point.y,
								'Y',
								slide._presLayout
							)}" /></a:moveTo>`
						} else {
							strSlideXml += `<a:lnTo><a:pt x="${getSmartParseNumber(point.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(
								point.y,
								'Y',
								slide._presLayout
							)}" /></a:lnTo>`
						}
					})

					strSlideXml += '</a:path>'
						strSlideXml += '</a:pathLst>'
						strSlideXml += '</a:custGeom>'
					} else {
						strSlideXml += '<a:prstGeom prst="' + normalizePresetShapeName(slideItemObj.shape) + '"><a:avLst>'
					if (slideItemObj.options.rectRadius) {
						strSlideXml += `<a:gd name="adj" fmla="val ${Math.round((slideItemObj.options.rectRadius * EMU * 100000) / Math.min(cx, cy))}"/>`
					} else if (slideItemObj.options.angleRange) {
						for (let i = 0; i < 2; i++) {
							const angle = slideItemObj.options.angleRange[i]
							strSlideXml += `<a:gd name="adj${i + 1}" fmla="val ${convertRotationDegrees(angle)}" />`
						}

						if (slideItemObj.options.arcThicknessRatio) {
							strSlideXml += `<a:gd name="adj3" fmla="val ${Math.round(slideItemObj.options.arcThicknessRatio * 50000)}" />`
						}
					}
						strSlideXml += '</a:avLst></a:prstGeom>'
					}

					// Option: FILL
					// Native shapes (_nativeMinimal) from decyphered PPTX files inherit fill from slide master/layout.
					// Do NOT emit <a:noFill/> for these shapes - they should get fill from inheritance.
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const rawFillXml = (slideItemObj.options as any)._rawFillXml
					if (rawFillXml) {
						// _rawFillXml: passthrough raw fill XML (used for schemeClr fills that can't go through color API)
						strSlideXml += rawFillXml
					} else if (slideItemObj.options.fill) {
						strSlideXml += genXmlColorSelection(slideItemObj.options.fill)
					} else if (!slideItemObj.options._nativeMinimal) {
						strSlideXml += '<a:noFill/>'
					}

					// shape Type: LINE: line color
					// _rawLineXml: passthrough raw line XML (used for explicit noFill borders, schemeClr line colors etc.)
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const rawLineXml = (slideItemObj.options as any)._rawLineXml
					if (rawLineXml) {
						strSlideXml += rawLineXml
					}
					// Add PowerPoint default line attributes: cap="flat" cmpd="sng" algn="ctr"
					// Native shapes (_nativeMinimal) inherit line from slide master:
					//   - Skip if no line set at all
					//   - Skip if line.type === 'none' (explicit no-line - inherit from master instead)
					//   - Emit only when a real line color/width is specified
					if (!rawLineXml && slideItemObj.options.line && !slideItemObj.options._nativeMinimal) {
						const lineWidth = slideItemObj.options.line.width ? valToPts(slideItemObj.options.line.width) : valToPts(1)
						strSlideXml += `<a:ln w="${lineWidth}" cap="flat" cmpd="sng" algn="ctr">`
						const lineHasColor = !!slideItemObj.options.line.color
						if (lineHasColor) {
							strSlideXml += genXmlColorSelection(slideItemObj.options.line)
						} else {
							strSlideXml += '<a:noFill/>'
						}
						// Add miter join: for non-native shapes (library-generated), or when explicitly non-native
						// Native shapes (_nativeMinimal=true) from PPTX files don't need these extra tags
						if (!slideItemObj.options._nativeMinimal) strSlideXml += '<a:miter lim="800000"/>'
						// Add dash pattern: always when explicitly set; for non-native shapes add default
						if (slideItemObj.options.line.dashType) {
							strSlideXml += `<a:prstDash val="${slideItemObj.options.line.dashType}"/>`
						} else if (!slideItemObj.options._nativeMinimal) {
							strSlideXml += '<a:prstDash val="solid"/>'
						}
						if (slideItemObj.options.line.beginArrowType) strSlideXml += `<a:headEnd type="${slideItemObj.options.line.beginArrowType}"/>`
						if (slideItemObj.options.line.endArrowType) strSlideXml += `<a:tailEnd type="${slideItemObj.options.line.endArrowType}"/>`
						// FUTURE: `endArrowSize` < a: headEnd type = "arrow" w = "lg" len = "lg" /> 'sm' | 'med' | 'lg'(values are 1 - 9, making a 3x3 grid of w / len possibilities)
						strSlideXml += '</a:ln>'
					}

				// EFFECTS: Shadow, Glow, Reflection, Soft Edges
				// REF: @see http://officeopenxml.com/drwSp-effects.php
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawEffectLstXml = (slideItemObj.options as any)._rawEffectLstXml
				if (_rawEffectLstXml) {
					// Passthrough: emit raw effectLst XML (e.g. reflection+shadow from native PP shapes)
					strSlideXml += _rawEffectLstXml
				} else {
					const hasEffects = slideItemObj.options.shadow || slideItemObj.options.glow || slideItemObj.options.reflection || slideItemObj.options.softEdges
					if (hasEffects) {
						strSlideXml += '<a:effectLst>'

						// GLOW: Must come before shadow in effectLst
						if (slideItemObj.options.glow) {
							strSlideXml += createGlowElement(slideItemObj.options.glow, { size: 8, color: '00FFFF', opacity: 0.75 })
						}

						// SHADOW
						if (slideItemObj.options.shadow && slideItemObj.options.shadow.type !== 'none') {
							strSlideXml += createInlineShadowXml(slideItemObj.options.shadow)
						}

						// REFLECTION
						if (slideItemObj.options.reflection) {
							strSlideXml += createReflectionElement(slideItemObj.options.reflection)
						}

						// SOFT EDGES
						if (slideItemObj.options.softEdges) {
							const softEdgeSize = valToPts(slideItemObj.options.softEdges.size || 0)
							if (softEdgeSize > 0) {
								strSlideXml += `<a:softEdge rad="${softEdgeSize}"/>`
							}
						}

						strSlideXml += '</a:effectLst>'
					} else if (!slideItemObj.options._nativeMinimal) {
						// PowerPoint includes empty effectLst tag even when no effects
						// Skip when _nativeMinimal is set (native PowerPoint files don't include this)
						strSlideXml += '<a:effectLst/>'
					}
				}

				// 3D EFFECTS: Add scene3d and sp3d for 3D effects on shapes
				// NOTE: effect3D is for shape-level 3D (applied here in <p:spPr>)
				// NOTE: text3D is for text-level 3D (applied in <a:bodyPr>, not here)
				// CRITICAL: 3D MUST come BEFORE effectLst for PowerPoint to render it!
				// Passthrough: emit raw scene3d/sp3d XML from p:spPr (for native PP 3D shapes)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawSpPrScene3dXml = (slideItemObj.options as any)._rawSpPrScene3dXml
				if (slideItemObj.options.effect3D && !_rawSpPrScene3dXml) {
					strSlideXml += create3DElements(slideItemObj.options.effect3D)
				}
				if (_rawSpPrScene3dXml) {
					strSlideXml += _rawSpPrScene3dXml
				}

				// PowerPoint Office 2014+ extension: hiddenFill and hiddenLine
				// These are cosmetic tags that PowerPoint adds for compatibility.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawSpPrExtLstXml = (slideItemObj.options as any)._rawSpPrExtLstXml
				if (_rawSpPrExtLstXml) {
					strSlideXml += _rawSpPrExtLstXml
				} else if (!slideItemObj.options._nativeMinimal) {
					strSlideXml += '<a:extLst>'
					strSlideXml += '<a:ext uri="{C183D7F6-B498-43B3-948B-1728B52AA6E4}"><a14:hiddenLine xmlns:a14="http://schemas.microsoft.com/office/drawing/2014/main"/></a:ext>'
					strSlideXml += '<a:ext uri="{909E8E84-426E-40DD-AFC4-6F175D3DCCD1}"><a14:hiddenFill xmlns:a14="http://schemas.microsoft.com/office/drawing/2014/main"/></a:ext>'
					strSlideXml += '</a:extLst>'
				}
				}

				/* TODO: FUTURE: Text wrapping (copied from MS-PPTX export)
					// Commented out b/c i'm not even sure this works - current code produces text that wraps in shapes and textboxes, so...
					if ( slideItemObj.options.textWrap ) {
						strSlideXml += '<a:extLst>'
									+ '<a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}">'
									+ '<ma14:wrappingTextBoxFlag xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main" val="1"/>'
									+ '</a:ext>'
									+ '</a:extLst>';
					}
				*/

				// B: Close shape Properties
				strSlideXml += '</p:spPr>'

				// Native PowerPoint shapes can rely on this sibling style block for theme
				// fill/effect references even when their spPr is otherwise minimal.
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawShapeStyleXml = (slideItemObj.options as any)._rawShapeStyleXml
				if (_rawShapeStyleXml) strSlideXml += _rawShapeStyleXml

				// C: Add formatted text (text body "bodyPr") - skip for pure shapes
				if (slideItemObj._type !== SLIDE_OBJECT_TYPES.shape) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawTxBodyXml = (slideItemObj.options as any)._rawTxBodyXml
					if (slideItemObj._type === SLIDE_OBJECT_TYPES.text && slideItemObj.options._nativeMinimal && _rawTxBodyXml) strSlideXml += _rawTxBodyXml
					else strSlideXml += genXmlTextBody(slideItemObj)
				}

				// LAST: Close SHAPE =======================================================
				strSlideXml += '</p:sp>'
				break

			case SLIDE_OBJECT_TYPES.image:
				strSlideXml += '<p:pic>'
				strSlideXml += '  <p:nvPicPr>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const imgShapeId = (slideItemObj.options as any).spid ? (slideItemObj.options as any).spid : idx + 2
								const imgCreationId = (slide._slideNum * 10000) + (idx + 2)
				strSlideXml += `<p:cNvPr id="${imgShapeId}" name="${slideItemObj.options.objectName}" creationId="${imgCreationId}" descr="${encodeXmlEntities(
					slideItemObj.options.altText || slideItemObj.image
				)}">`
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawHlinkClickXml = (slideItemObj.options as any)._rawHlinkClickXml
				if (_rawHlinkClickXml) {
					strSlideXml += _rawHlinkClickXml
				} else {
					if (slideItemObj.hyperlink?.url) {
						strSlideXml += `<a:hlinkClick r:id="rId${slideItemObj.hyperlink._rId}" tooltip="${slideItemObj.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.hyperlink.tooltip) : ''
							}"/>`
					}
					if (slideItemObj.hyperlink?.slide) {
						strSlideXml += `<a:hlinkClick r:id="rId${slideItemObj.hyperlink._rId}" tooltip="${slideItemObj.hyperlink.tooltip ? encodeXmlEntities(slideItemObj.hyperlink.tooltip) : ''
							}" action="ppaction://hlinksldjump"/>`
					}
				}
				strSlideXml += '    </p:cNvPr>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawCNvPicPrXml = (slideItemObj.options as any)._rawCNvPicPrXml
				if (_rawCNvPicPrXml) strSlideXml += '    ' + _rawCNvPicPrXml
				else strSlideXml += '    <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const imgPhType = (slideItemObj.options as any).phType || (slideItemObj.options as any)._phType
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const imgPhIdx = (slideItemObj.options as any).phIdx || (slideItemObj.options as any)._phIdx
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const imgPhSz = (slideItemObj.options as any).phSz || (slideItemObj.options as any)._phSz
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const imgHasBarePh = (slideItemObj.options as any).hasBarePh || (slideItemObj.options as any)._barePlaceholder
				let imgNvPrContent = ''
				if (imgPhType) {
					imgNvPrContent = (imgPhIdx !== undefined && imgPhIdx !== null) ? `<p:ph type="${imgPhType}"${imgPhSz ? ` sz="${imgPhSz}"` : ''} idx="${imgPhIdx}"/>` : `<p:ph type="${imgPhType}"${imgPhSz ? ` sz="${imgPhSz}"` : ''}/>`
				} else if (imgPhIdx !== undefined && imgPhIdx !== null) {
					imgNvPrContent = `<p:ph${imgPhSz ? ` sz="${imgPhSz}"` : ''} idx="${imgPhIdx}"/>`
				} else if (imgHasBarePh) {
					imgNvPrContent = `<p:ph/>`
				} else {
					imgNvPrContent = genXmlPlaceholder(placeholderObj)
				}
				strSlideXml += '    <p:nvPr>' + imgNvPrContent + '</p:nvPr>'
				strSlideXml += '  </p:nvPicPr>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawBlipFillAttrs = Object.prototype.hasOwnProperty.call(slideItemObj.options as any, '_rawBlipFillAttrs') ? (slideItemObj.options as any)._rawBlipFillAttrs : ' rotWithShape="1"'
				strSlideXml += `<p:blipFill${_rawBlipFillAttrs}>`
				// NOTE: This works for both cases: either `path` or `data` contains the SVG
				if (
					(slide._relsMedia || []).filter(rel => rel.rId === slideItemObj.imageRid)[0] &&
					(slide._relsMedia || []).filter(rel => rel.rId === slideItemObj.imageRid)[0].extn === 'svg'
				) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawSvgBlipAttrs = (slideItemObj.options as any)._rawBlipAttrs || ''
					strSlideXml += `<a:blip r:embed="rId${slideItemObj.imageRid - 1}"${_rawSvgBlipAttrs}>`
					strSlideXml += slideItemObj.options.transparency ? ` <a:alphaModFix amt="${Math.round((100 - slideItemObj.options.transparency) * 1000)}"/>` : ''
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawSvgBlipInnerXml = (slideItemObj.options as any)._rawBlipInnerXml
					if (_rawSvgBlipInnerXml) strSlideXml += _rawSvgBlipInnerXml
					strSlideXml += ' <a:extLst>'
					strSlideXml += '  <a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}">'
					strSlideXml += `   <asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="rId${slideItemObj.imageRid}"/>`
					strSlideXml += '  </a:ext>'
					strSlideXml += ' </a:extLst>'
					strSlideXml += '</a:blip>'
				} else {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawBlipAttrs = (slideItemObj.options as any)._rawBlipAttrs || ''
					strSlideXml += `<a:blip r:embed="rId${slideItemObj.imageRid}"${_rawBlipAttrs}>`
					strSlideXml += slideItemObj.options.transparency ? `<a:alphaModFix amt="${Math.round((100 - slideItemObj.options.transparency) * 1000)}"/>` : ''
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawBlipInnerXml = (slideItemObj.options as any)._rawBlipInnerXml
					if (_rawBlipInnerXml) strSlideXml += _rawBlipInnerXml
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _rawBlipExtLstXml = (slideItemObj.options as any)._rawBlipExtLstXml
					if (_rawBlipExtLstXml) strSlideXml += _rawBlipExtLstXml
					strSlideXml += '</a:blip>'
				}
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawBlipTailXml = (slideItemObj.options as any)._rawBlipTailXml
				if (_rawBlipTailXml) {
					strSlideXml += _rawBlipTailXml
				} else if (sizing?.type) {
					const boxW = sizing.w ? getSmartParseNumber(sizing.w, 'X', slide._presLayout) : cx
					const boxH = sizing.h ? getSmartParseNumber(sizing.h, 'Y', slide._presLayout) : cy
					const boxX = getSmartParseNumber(sizing.x || 0, 'X', slide._presLayout)
					const boxY = getSmartParseNumber(sizing.y || 0, 'Y', slide._presLayout)

					strSlideXml += ImageSizingXml[sizing.type]({ w: imgWidth, h: imgHeight }, { w: boxW, h: boxH, x: boxX, y: boxY })
					imgWidth = boxW
					imgHeight = boxH
				} else {
					strSlideXml += '  <a:stretch><a:fillRect/></a:stretch>'
				}
				strSlideXml += '</p:blipFill>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const _rawPicSpPrXml = (slideItemObj.options as any)._rawPicSpPrXml
				if (_rawPicSpPrXml) {
					strSlideXml += _rawPicSpPrXml
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				} else if ((slideItemObj.options as any)._emptySpPr) {
					strSlideXml += '<p:spPr/>'
				} else {
					strSlideXml += '<p:spPr>'
					strSlideXml += ' <a:xfrm' + locationAttr + '>'
					strSlideXml += `  <a:off x="${x}" y="${y}"/>`
					strSlideXml += `  <a:ext cx="${imgWidth}" cy="${imgHeight}"/>`
					strSlideXml += ' </a:xfrm>'
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					if (!(slideItemObj.options as any)._omitPicPrstGeom) {
						// eslint-disable-next-line @typescript-eslint/no-explicit-any
						const _picPrstGeom = (slideItemObj.options as any)._picPrstGeom
						strSlideXml += ` <a:prstGeom prst="${_picPrstGeom || (rounding ? 'ellipse' : 'rect')}"><a:avLst/></a:prstGeom>`
					}
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _imgRawFillXml = (slideItemObj.options as any)._rawFillXml
					if (_imgRawFillXml) {
						strSlideXml += _imgRawFillXml
					}
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _imgRawLineXml = (slideItemObj.options as any)._rawLineXml
					if (_imgRawLineXml) {
						strSlideXml += _imgRawLineXml
					}

					// EFFECTS > SHADOW: REF: @see http://officeopenxml.com/drwSp-effects.php
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _imgRawEffectLstXml = (slideItemObj.options as any)._rawEffectLstXml
					if (_imgRawEffectLstXml) {
						strSlideXml += _imgRawEffectLstXml
					} else if (slideItemObj.options.shadow && slideItemObj.options.shadow.type !== 'none') {
						strSlideXml += '<a:effectLst>'
						strSlideXml += createInlineShadowXml(slideItemObj.options.shadow)
						strSlideXml += '</a:effectLst>'
					}
					// scene3d/sp3d passthrough for native PP 3D image effects
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const _imgRawSpPrScene3dXml = (slideItemObj.options as any)._rawSpPrScene3dXml
					if (_imgRawSpPrScene3dXml) {
						strSlideXml += _imgRawSpPrScene3dXml
					}
					strSlideXml += '</p:spPr>'
				}
				strSlideXml += '</p:pic>'
				break

			case SLIDE_OBJECT_TYPES.media:
				const mediaTransparencyXml = slideItemObj.options.transparency ? `<a:alphaModFix amt="${Math.round((100 - slideItemObj.options.transparency) * 1000)}"/>` : ''
				if (slideItemObj.mtype === 'online') {
					strSlideXml += '<p:pic>'
					strSlideXml += ' <p:nvPicPr>'
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const mediaOnlineShapeId = (slideItemObj.options as any).spid || idx + 2
					const mediaOnlineCreationId = (slide._slideNum * 10000) + Number(mediaOnlineShapeId)
					strSlideXml += `<p:cNvPr id="${mediaOnlineShapeId}" name="${slideItemObj.options.objectName}" creationId="${mediaOnlineCreationId}"/>`
					strSlideXml += ' <p:cNvPicPr/>'
					strSlideXml += ' <p:nvPr>'
					strSlideXml += `  <a:videoFile r:link="rId${slideItemObj.mediaRid}"/>`
					strSlideXml += ' </p:nvPr>'
					strSlideXml += ' </p:nvPicPr>'
					// NOTE: `blip` is diferent than videos; also there's no preview "p:extLst" above but exists in videos
					strSlideXml += ` <p:blipFill><a:blip r:embed="rId${slideItemObj.mediaRid + 1}">${mediaTransparencyXml}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` // NOTE: Preview image is required!
					strSlideXml += ' <p:spPr>'
					strSlideXml += `  <a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
					strSlideXml += '  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
					strSlideXml += ' </p:spPr>'
					strSlideXml += '</p:pic>'
				} else {
					strSlideXml += '<p:pic>'
					strSlideXml += ' <p:nvPicPr>'
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const mediaLocalShapeId = (slideItemObj.options as any).spid || idx + 2
					const mediaLocalCreationId = (slide._slideNum * 10000) + Number(mediaLocalShapeId)
					const mediaFileTag = slideItemObj.mtype === 'audio' ? 'audioFile' : 'videoFile'
					strSlideXml += `<p:cNvPr id="${mediaLocalShapeId}" name="${slideItemObj.options.objectName
						}" creationId="${mediaLocalCreationId}"><a:hlinkClick r:id="" action="ppaction://media"/></p:cNvPr>`
					strSlideXml += ' <p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr>'
					strSlideXml += ' <p:nvPr>'
					strSlideXml += `  <a:${mediaFileTag} r:link="rId${slideItemObj.mediaRid}"/>`
					strSlideXml += '  <p:extLst>'
					strSlideXml += '   <p:ext uri="{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}">'
					strSlideXml += `    <p14:media r:embed="rId${slideItemObj.mediaRid + 1}"/>`
					strSlideXml += '   </p:ext>'
					strSlideXml += '  </p:extLst>'
					strSlideXml += ' </p:nvPr>'
					strSlideXml += ' </p:nvPicPr>'
					strSlideXml += ` <p:blipFill><a:blip r:embed="rId${slideItemObj.mediaRid + 2}">${mediaTransparencyXml}</a:blip><a:stretch><a:fillRect/></a:stretch></p:blipFill>` // NOTE: Preview image is required!
					strSlideXml += ' <p:spPr>'
					strSlideXml += `  <a:xfrm${locationAttr}><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
					strSlideXml += '  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>'
					strSlideXml += ' </p:spPr>'
					strSlideXml += '</p:pic>'
				}
				break

			case SLIDE_OBJECT_TYPES.model3d:
				strSlideXml += genXmlModel3D(slideItemObj, idx, slide._slideNum)
				break

			case SLIDE_OBJECT_TYPES.chart:
				strSlideXml += '<p:graphicFrame>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const rawGraphicFrameNvXml = (slideItemObj.options as any)._rawGraphicFrameNvXml
				if (rawGraphicFrameNvXml) {
					strSlideXml += rawGraphicFrameNvXml
				} else {
					strSlideXml += ' <p:nvGraphicFramePr>'
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const chartCreationId = (slide._slideNum * 10000) + (idx + 2)
					const chartShapeId = (slideItemObj.options as any).spid || (idx + 2)
					strSlideXml += `   <p:cNvPr id="${chartShapeId}" name="${slideItemObj.options.objectName}" creationId="${chartCreationId}" descr="${encodeXmlEntities(slideItemObj.options.altText || '')}"/>`
					strSlideXml += '   <p:cNvGraphicFramePr/>'
					strSlideXml += `   <p:nvPr>${genXmlPlaceholder(placeholderObj)}</p:nvPr>`
					strSlideXml += ' </p:nvGraphicFramePr>'
				}
				strSlideXml += ` <p:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></p:xfrm>`
				strSlideXml += ' <a:graphic>'
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const rawChartAttrs = (slideItemObj.options as any)._rawChartAttrs
				if ((slideItemObj.options as any)._chartEx) {
					strSlideXml += '  <a:graphicData uri="http://schemas.microsoft.com/office/drawing/2014/chartex">'
					strSlideXml += `   <cx:chart r:id="rId${slideItemObj.chartRid}" xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/>`
				} else {
					strSlideXml += '  <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">'
					if (rawChartAttrs) strSlideXml += `   <c:chart ${rawChartAttrs} r:id="rId${slideItemObj.chartRid}"/>`
					else strSlideXml += `   <c:chart r:id="rId${slideItemObj.chartRid}" xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart"/>`
				}
				strSlideXml += '  </a:graphicData>'
				strSlideXml += ' </a:graphic>'
				strSlideXml += '</p:graphicFrame>'
				break

			case SLIDE_OBJECT_TYPES.passthrough:
				// Inject raw OOXML directly
				// This allows unsupported elements (tables, complex graphics, etc.) to be preserved as-is
				if (slideItemObj.passthrough && slideItemObj.passthrough.xml) {
					strSlideXml += slideItemObj.passthrough.xml
				}
				break

			default:
				strSlideXml += ''
				break
		}
	})

	// STEP 4: Add slide numbers (if any) last
	if (slide._slideNumberProps) {
		// Set some defaults (done here b/c SlideNumber canbe added to masters or slides and has numerous entry points)
		if (!slide._slideNumberProps.align) slide._slideNumberProps.align = 'left'

		strSlideXml += '<p:sp>'
		strSlideXml += ' <p:nvSpPr>'
		strSlideXml += '  <p:cNvPr id="25" name="Slide Number Placeholder 0"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
		strSlideXml += '  <p:nvPr><p:ph type="sldNum" sz="quarter" idx="4294967295"/></p:nvPr>'
		strSlideXml += ' </p:nvSpPr>'
		strSlideXml += ' <p:spPr>'
		strSlideXml += '<a:xfrm>' +
			`<a:off x="${getSmartParseNumber(slide._slideNumberProps.x, 'X', slide._presLayout)}" y="${getSmartParseNumber(slide._slideNumberProps.y, 'Y', slide._presLayout)}"/>` +
			`<a:ext cx="${slide._slideNumberProps.w ? getSmartParseNumber(slide._slideNumberProps.w, 'X', slide._presLayout) : '800000'}" cy="${slide._slideNumberProps.h ? getSmartParseNumber(slide._slideNumberProps.h, 'Y', slide._presLayout) : '300000'}"/>` +
			'</a:xfrm>' +
			' <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' +
			' <a:extLst><a:ext uri="{C572A759-6A51-4108-AA02-DFA0A04FC94B}"><ma14:wrappingTextBoxFlag val="0" xmlns:ma14="http://schemas.microsoft.com/office/mac/drawingml/2011/main"/></a:ext></a:extLst>' +
			'</p:spPr>'
		strSlideXml += '<p:txBody>'
		strSlideXml += '<a:bodyPr'
		if (slide._slideNumberProps.margin && Array.isArray(slide._slideNumberProps.margin)) {
			strSlideXml += ` lIns="${valToPts(slide._slideNumberProps.margin[3] || 0)}"`
			strSlideXml += ` tIns="${valToPts(slide._slideNumberProps.margin[0] || 0)}"`
			strSlideXml += ` rIns="${valToPts(slide._slideNumberProps.margin[1] || 0)}"`
			strSlideXml += ` bIns="${valToPts(slide._slideNumberProps.margin[2] || 0)}"`
		} else if (typeof slide._slideNumberProps.margin === 'number') {
			strSlideXml += ` lIns="${valToPts(slide._slideNumberProps.margin || 0)}"`
			strSlideXml += ` tIns="${valToPts(slide._slideNumberProps.margin || 0)}"`
			strSlideXml += ` rIns="${valToPts(slide._slideNumberProps.margin || 0)}"`
			strSlideXml += ` bIns="${valToPts(slide._slideNumberProps.margin || 0)}"`
		}
		if (slide._slideNumberProps.valign) {
			strSlideXml += ` anchor="${slide._slideNumberProps.valign.replace('top', 't').replace('middle', 'ctr').replace('bottom', 'b')}"`
		}
		strSlideXml += '/>'
		strSlideXml += '  <a:lstStyle><a:lvl1pPr>'
		if (slide._slideNumberProps.fontFace || slide._slideNumberProps.fontSize || slide._slideNumberProps.color) {
			strSlideXml += `<a:defRPr sz="${Math.round((slide._slideNumberProps.fontSize || 12) * 100)}">`
			if (slide._slideNumberProps.color) strSlideXml += genXmlColorSelection(slide._slideNumberProps.color)
			if (slide._slideNumberProps.fontFace) { strSlideXml += `<a:latin typeface="${slide._slideNumberProps.fontFace}"/><a:ea typeface="${slide._slideNumberProps.fontFace}"/><a:cs typeface="${slide._slideNumberProps.fontFace}"/>` }
			strSlideXml += '</a:defRPr>'
		}
		strSlideXml += '</a:lvl1pPr></a:lstStyle>'
		strSlideXml += '<a:p>'
		if (slide._slideNumberProps.align.startsWith('l')) strSlideXml += '<a:pPr algn="l"/>'
		else if (slide._slideNumberProps.align.startsWith('c')) strSlideXml += '<a:pPr algn="ctr"/>'
		else if (slide._slideNumberProps.align.startsWith('r')) strSlideXml += '<a:pPr algn="r"/>'
		else strSlideXml += '<a:pPr algn="l"/>'
		strSlideXml += `<a:fld id="${SLDNUMFLDID}" type="slidenum"><a:rPr b="${slide._slideNumberProps.bold ? 1 : 0}" lang="en-US"/>`
		strSlideXml += `<a:t>${slide._slideNum}</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p>`
		strSlideXml += '</p:txBody></p:sp>'
	}

	// STEP 5: Close spTree and finalize slide XML
	strSlideXml += '</p:spTree>'
	strSlideXml += (slide as PresSlide & { _rawControlsXml?: string })._rawControlsXml || ''
	strSlideXml += (slide as PresSlide & { _rawCSldExtLstXml?: string })._rawCSldExtLstXml || ''
	strSlideXml += '</p:cSld>'

	// LAST: Return
	return strSlideXml
}

/**
 * Transforms slide relations to XML string.
 * Extra relations that are not dynamic can be passed using the 2nd arg (e.g. theme relation in master file).
 * These relations use rId series that starts with 1-increased maximum of rIds used for dynamic relations.
 * @param {PresSlide | SlideLayout} slide - slide object whose relations are being transformed
 * @param {{ target: string; type: string }[]} defaultRels - array of default relations
 * @return {string} XML
 */
function slideObjectRelationsToXml(slide: PresSlide | SlideLayout, defaultRels: Array<{ target: string, type: string }>): string {
	let lastRid = 0 // stores maximum rId used for dynamic relations
	let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'

	const rawRels = Array.isArray((slide as PresSlide & { _rawRels?: RawRelRef[] })._rawRels)
		? (slide as PresSlide & { _rawRels: RawRelRef[] })._rawRels
		: []
	rawRels.forEach(rel => {
		if (!rel?.id || !rel.type || !rel.target) return
		const ridNum = rel.id.startsWith('rId') ? Number(rel.id.substring(3)) : Number(rel.id)
		if (Number.isFinite(ridNum)) lastRid = Math.max(lastRid, ridNum)
		strXml += `<Relationship Id="${encodeXmlEntities(rel.id)}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"${rel.targetMode ? ` TargetMode="${encodeXmlEntities(rel.targetMode)}"` : ''}/>`
	})

	// STEP 1: Add all rels for this Slide
	slide._rels.forEach((rel: ISlideRel) => {
		lastRid = Math.max(lastRid, rel.rId)
		if (rel.type.toLowerCase().includes('hyperlink')) {
			if (rel.data === 'slide') {
				strXml += `<Relationship Id="rId${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide${rel.Target}.xml"/>`
			} else {
				strXml += `<Relationship Id="rId${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${rel.Target}" TargetMode="External"/>`
			}
		} else if (rel.type.toLowerCase().includes('notesSlide')) {
			strXml += `<Relationship Id="rId${rel.rId}" Target="${rel.Target}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide"/>`
		}
	})
		; (slide._relsChart || []).forEach((rel: ISlideRelChart) => {
			lastRid = Math.max(lastRid, rel.rId)
			const relType = rel.chartFamily === 'chartEx'
				? 'http://schemas.microsoft.com/office/2014/relationships/chartEx'
				: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart'
			strXml += `<Relationship Id="rId${rel.rId}" Type="${relType}" Target="${rel.Target}"/>`
		})
		; (slide._relsMedia || []).forEach((rel: ISlideRelMedia) => {
			const relRid = rel.rId.toString()
			lastRid = Math.max(lastRid, rel.rId)
			if (rel.type === 'model/gltf.binary' || rel.type.toLowerCase().includes('gltf')) {
				// 3D model (GLB) file requires the model3d relationship type
				strXml += `<Relationship Id="rId${relRid}" Type="http://schemas.microsoft.com/office/2017/06/relationships/model3d" Target="${rel.Target}"/>`
			} else if (rel.type.toLowerCase().includes('image')) {
				strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="' + rel.Target + '"/>'
			} else if (rel.type.toLowerCase().includes('audio')) {
				// As media has *TWO* rel entries per item, check for first one, if found add second rel with alt style
				if (strXml.includes(' Target="' + rel.Target + '"')) {
					strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="' + rel.Target + '"/>'
				} else {
					strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/audio" Target="' + rel.Target + '"/>'
				}
			} else if (rel.type.toLowerCase().includes('video')) {
				// As media has *TWO* rel entries per item, check for first one, if found add second rel with alt style
				if (strXml.includes(' Target="' + rel.Target + '"')) {
					strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.microsoft.com/office/2007/relationships/media" Target="' + rel.Target + '"/>'
				} else {
					strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video" Target="' + rel.Target + '"/>'
				}
			} else if (rel.type.toLowerCase().includes('online')) {
				// As media has *TWO* rel entries per item, check for first one, if found add second rel with alt style
				if (strXml.includes(' Target="' + rel.Target + '"')) {
					strXml += '<Relationship Id="rId' + relRid + '" Type="http://schemas.microsoft.com/office/2007/relationships/image" Target="' + rel.Target + '"/>'
				} else {
					strXml += '<Relationship Id="rId' + relRid + '" Target="' + rel.Target + '" TargetMode="External" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/video"/>'
				}
			}
		})

	// STEP 2: Add default rels
	defaultRels.forEach((rel, idx) => {
		strXml += `<Relationship Id="rId${lastRid + idx + 1}" Type="${rel.type}" Target="${rel.target}"/>`
	})

	strXml += '</Relationships>'
	return strXml
}

/**
 * Generate XML Paragraph Properties
 * @param {ISlideObject|TextProps} textObj - text object
 * @param {boolean} isDefault - array of default relations
 * @return {string} XML
 */
function genXmlParagraphProperties(textObj: ISlideObject | TextProps, isDefault: boolean): string {
	let strXmlBullet = ''
	let strXmlLnSpc = ''
	let strXmlParaSpc = ''
	let strXmlTabStops = ''
	const tag = isDefault ? 'a:lvl1pPr' : 'a:pPr'
	let bulletMarL = valToPts(DEF_BULLET_MARGIN)

	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const textOptionsAny = textObj.options as any
	const _rawPPrAttrs: string = textOptionsAny._rawPPrAttrs || ''
	const _pPrMarL = textOptionsAny._pPrMarL
	const _pPrIndent = textOptionsAny._pPrIndent
	const hasPreservedParagraphMargins = _pPrMarL !== undefined || _pPrIndent !== undefined
	const appendPreservedParagraphMargins = () => {
		if (_pPrIndent !== undefined) paragraphPropXml += ` indent="${_pPrIndent}"`
		if (_pPrMarL !== undefined) paragraphPropXml += ` marL="${_pPrMarL}"`
	}
	const appendDefaultBulletMargins = () => {
		if (hasPreservedParagraphMargins) return
		if (textObj.options._nativeMinimal) return
		paragraphPropXml += ` marL="${textObj.options.indentLevel && textObj.options.indentLevel > 0 ? bulletMarL + bulletMarL * textObj.options.indentLevel : bulletMarL}" indent="-${bulletMarL}"`
	}
	let paragraphPropXml = `<${tag}${textObj.options.rtlMode === true ? ' rtl="1" ' : textObj.options.rtlMode === false ? ' rtl="0" ' : ''}${_rawPPrAttrs ? ' ' + _rawPPrAttrs : ''}`

	// A: Build paragraphProperties
	{
		// OPTION: align
		if (textObj.options.align) {
			switch (textObj.options.align) {
				case 'left':
					paragraphPropXml += ' algn="l"'
					break
				case 'right':
					paragraphPropXml += ' algn="r"'
					break
				case 'center':
					paragraphPropXml += ' algn="ctr"'
					break
				case 'justify':
					paragraphPropXml += ' algn="just"'
					break
				default:
					paragraphPropXml += ''
					break
			}
		}
		appendPreservedParagraphMargins()

		if (textObj.options.lineSpacing) {
			strXmlLnSpc = `<a:lnSpc><a:spcPts val="${Math.round(textObj.options.lineSpacing * 100)}"/></a:lnSpc>`
		} else if (textObj.options.lineSpacingMultiple) {
			strXmlLnSpc = `<a:lnSpc><a:spcPct val="${Math.round(textObj.options.lineSpacingMultiple * 100000)}"/></a:lnSpc>`
		}

		// OPTION: indent
		if (textObj.options.indentLevel && !isNaN(Number(textObj.options.indentLevel)) && textObj.options.indentLevel > 0) {
			paragraphPropXml += ` lvl="${textObj.options.indentLevel}"`
		}

		// OPTION: Paragraph Spacing: Before/After
		if (textObj.options.paraSpaceBefore !== undefined && !isNaN(Number(textObj.options.paraSpaceBefore))) {
			strXmlParaSpc += `<a:spcBef><a:spcPts val="${Math.round(textObj.options.paraSpaceBefore * 100)}"/></a:spcBef>`
		} else if ((textObj.options as any).paraSpaceBeforeMultiple !== undefined) {
			strXmlParaSpc += `<a:spcBef><a:spcPct val="${Math.round((textObj.options as any).paraSpaceBeforeMultiple * 100000)}"/></a:spcBef>`
		}
		if (textObj.options.paraSpaceAfter !== undefined && !isNaN(Number(textObj.options.paraSpaceAfter))) {
			strXmlParaSpc += `<a:spcAft><a:spcPts val="${Math.round(textObj.options.paraSpaceAfter * 100)}"/></a:spcAft>`
		} else if ((textObj.options as any).paraSpaceAfterMultiple !== undefined) {
			strXmlParaSpc += `<a:spcAft><a:spcPct val="${Math.round((textObj.options as any).paraSpaceAfterMultiple * 100000)}"/></a:spcAft>`
		}

		// OPTION: bullet
		// NOTE: OOXML uses the unicode character set for Bullets
		// EX: Unicode Character 'BULLET' (U+2022) ==> '<a:buChar char="&#x2022;"/>'
		if (typeof textObj.options.bullet === 'object' && (textObj.options.bullet as unknown as { none?: boolean }).none === true) {
			// bullet.none: true - emit style properties (buClr/buSzPts/buFont) followed by buNone
			// This matches native PPTX / Google Slides pattern where style props accompany buNone
			const b = textObj.options.bullet as unknown as { color?: string; font?: string; fontSize?: number; _rawBuClrXml?: string }
			const bulletColorXml = b._rawBuClrXml ? b._rawBuClrXml : (b.color ? `<a:buClr><a:srgbClr val="${b.color}"/></a:buClr>` : '')
			const bulletSzXml = b.fontSize ? `<a:buSzPts val="${Math.round(b.fontSize * 100)}"/>` : ''
			const bulletFontXml = b.font ? `<a:buFont typeface="${b.font}"/>` : ''
			strXmlBullet = bulletColorXml + bulletSzXml + bulletFontXml + '<a:buNone/>'
		} else if (typeof textObj.options.bullet === 'object') {
			if (textObj?.options?.bullet?.indent) bulletMarL = valToPts(textObj.options.bullet.indent)

			if (textObj.options.bullet.type) {
				if (textObj.options.bullet.type.toString().toLowerCase() === 'number') {
					appendDefaultBulletMargins()
					const bulletStartAt = textObj.options.bullet.numberStartAt || textObj.options.bullet.startAt
					const bulletStartAtAttr = bulletStartAt ? ` startAt="${bulletStartAt}"` : (textObj.options._nativeMinimal ? '' : ' startAt="1"')
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const rawBulletSizePctXml = (textObj.options.bullet as any)?._rawBuSzPctXml || ''
					strXmlBullet = `${rawBulletSizePctXml || (textObj.options._nativeMinimal ? '' : '<a:buSzPct val="100000"/>')}<a:buFont typeface="+mj-lt"/><a:buAutoNum type="${textObj.options.bullet.style || 'arabicPeriod'}"${bulletStartAtAttr}/>`
				}
			} else if (textObj.options.bullet.characterCode) {
				let bulletCode = `&#x${textObj.options.bullet.characterCode};`

				// Check value for hex-ness (s/b 4 char hex)
				if (!/^[0-9A-Fa-f]{4}$/.test(textObj.options.bullet.characterCode)) {
					console.warn('Warning: `bullet.characterCode should be a 4-digit unicode charatcer (ex: 22AB)`!')
					bulletCode = BULLET_TYPES.DEFAULT
				}

				appendDefaultBulletMargins()
				// Build bullet XML with optional color, font, size overrides
				// buClr expects the color element directly (NOT wrapped in solidFill)
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const bulletColorXml = (textObj.options.bullet as any)?._rawBuClrXml ? (textObj.options.bullet as any)._rawBuClrXml : (textObj.options.bullet.color ? `<a:buClr><a:srgbClr val="${textObj.options.bullet.color}"/></a:buClr>` : '')
				const bulletSzXml = textObj.options.bullet.fontSize ? `<a:buSzPts val="${Math.round(textObj.options.bullet.fontSize * 100)}"/>` : ((textObj.options.bullet as any)?._rawBuSzPctXml || (textObj.options._nativeMinimal ? '' : '<a:buSzPct val="100000"/>'))
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const _buFontAttrs = (textObj.options.bullet as any)?._buFontAttrs
			const bulletFontXml = textObj.options.bullet.font
				? (_buFontAttrs ? `<a:buFont typeface="${textObj.options.bullet.font}" ${_buFontAttrs}/>` : `<a:buFont typeface="${textObj.options.bullet.font}"/>`)
				: ''
				strXmlBullet = bulletColorXml + bulletSzXml + bulletFontXml + '<a:buChar char="' + bulletCode + '"/>'
			} else if (textObj.options.bullet.code) {
				// @deprecated `bullet.code` v3.3.0
				let bulletCode = `&#x${textObj.options.bullet.code};`

				// Check value for hex-ness (s/b 4 char hex)
				if (!/^[0-9A-Fa-f]{4}$/.test(textObj.options.bullet.code)) {
					console.warn('Warning: `bullet.code should be a 4-digit hex code (ex: 22AB)`!')
					bulletCode = BULLET_TYPES.DEFAULT
				}

				appendDefaultBulletMargins()
				strXmlBullet = '<a:buSzPct val="100000"/><a:buChar char="' + bulletCode + '"/>'
			} else {
				appendDefaultBulletMargins()
				strXmlBullet = `<a:buSzPct val="100000"/><a:buChar char="${BULLET_TYPES.DEFAULT}"/>`
			}
		} else if (textObj.options.bullet) {
			appendDefaultBulletMargins()
			strXmlBullet = `<a:buSzPct val="100000"/><a:buChar char="${BULLET_TYPES.DEFAULT}"/>`
		} else if (!textObj.options.bullet) {
			// We only add this when the user explicitely asks for no bullet, otherwise, it can override the master defaults!
			// Skip buNone when _nativeMinimal is set (native PowerPoint files don't include this)
			// EXCEPTION: if bullet is explicitly set to false (not just undefined/falsy), always emit buNone
			const explicitBulletFalse = textObj.options.bullet === false
			if (!(textObj.options as ObjectOptions)._nativeMinimal || explicitBulletFalse) {
				if (!hasPreservedParagraphMargins) paragraphPropXml += ' indent="0" marL="0"' // FIX: ISSUE#589 - specify zero indent and marL or default will be hanging paragraph
				strXmlBullet = '<a:buNone/>'
			}
		}

		// OPTION: tabStops
		if (textObj.options.tabStops && Array.isArray(textObj.options.tabStops)) {
			const tabStopsXml = textObj.options.tabStops.map(stop => `<a:tab pos="${inch2Emu(stop.position || 1)}" algn="${stop.alignment || 'l'}"/>`).join('')
			strXmlTabStops = `<a:tabLst>${tabStopsXml}</a:tabLst>`
		}

		// B: Close Paragraph-Properties
		// IMPORTANT: strXmlLnSpc, strXmlParaSpc, and strXmlBullet require strict ordering - anything out of order is ignored. (PPT-Online, PPT for Mac)
		paragraphPropXml += '>' + strXmlLnSpc + strXmlParaSpc + strXmlBullet + strXmlTabStops
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const _rawPPrChildXml: string = (textObj.options as any)._rawPPrChildXml || ''
		if (_rawPPrChildXml) paragraphPropXml += _rawPPrChildXml
		if (isDefault) paragraphPropXml += genXmlTextRunProperties(textObj.options, true)
		paragraphPropXml += '</' + tag + '>'
	}

	return paragraphPropXml
}

/**
 * Generate XML Text Run Properties (`a:rPr`)
 * @param {ObjectOptions|TextPropsOptions} opts - text options
 * @param {boolean} isDefault - whether these are the default text run properties
 * @return {string} XML
 */
function genXmlTextRunProperties(opts: ObjectOptions | TextPropsOptions, isDefault: boolean): string {
	let runProps = ''
	const runPropsTag = isDefault ? 'a:defRPr' : 'a:rPr'
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const optsAny = opts as any
	const isNativeMinimal = !!optsAny._nativeMinimal

	// BEGIN runProperties (ex: `<a:rPr lang="en-US" sz="1600" b="1" dirty="0">`)
	runProps += '<' + runPropsTag + ' lang="' + (opts.lang ? opts.lang : 'en-US') + '"'
	if (optsAny._rPrAltLang !== undefined) runProps += ` altLang="${optsAny._rPrAltLang}"`
	else if (opts.lang && !isNativeMinimal) runProps += ' altLang="en-US"'
	runProps += opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '' // NOTE: Use round so sizes like '7.5' wont cause corrupt presentations
	// Preserve uncommon native rPr attrs verbatim when provided by decypher
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if (optsAny._rawRprAttrs) runProps += optsAny._rawRprAttrs
	if (opts?.bold) runProps += ' b="1"'
	else if (optsAny._rPrB !== undefined) runProps += ` b="${optsAny._rPrB}"`
	// Emit i="1" when italic=true, i="0" when explicitly italic=false (PowerPoint sometimes sets this explicitly)
	if (opts?.italic === true) runProps += ' i="1"'
	else if (opts?.italic === false) runProps += ' i="0"'

	// Emit strike when set; strike=false emits noStrike (PowerPoint sometimes sets explicitly)
	if (opts?.strike === false) runProps += ' strike="noStrike"'
	else if (opts?.strike) runProps += ` strike="${typeof opts.strike === 'string' ? opts.strike : 'sngStrike'}"`
	const rawRprAttrs = ((opts as any)._rawRprAttrs || '') as string
	const hasExplicitUnderlineAttr = /\su="[^"]*"/.test(rawRprAttrs)
	if (optsAny._rPrU !== undefined) {
		runProps += ` u="${optsAny._rPrU}"`
	} else if (typeof opts.underline === 'object' && opts.underline?.style) {
		runProps += ` u="${opts.underline.style}"`
	} else if (typeof opts.underline === 'string') {
		// DEPRECATED: opts.underline is an object as of v3.5.0
		runProps += ` u="${String(opts.underline)}"`
	} else if (opts.hyperlink && !optsAny._suppressHyperlinkUnderline && !hasExplicitUnderlineAttr && !((opts as any)._rawRprXml || (opts as any)._rawRprAttrs)) {
		runProps += ' u="sng"'
	}
	if (opts.baseline) {
		runProps += ` baseline="${Math.round(opts.baseline * 50)}"`
	} else if (opts.subscript) {
		runProps += ' baseline="-40000"'
	} else if (opts.superscript) {
		runProps += ' baseline="30000"'
	}
	runProps += opts.charSpacing ? ` spc="${Math.round(opts.charSpacing * 100)}" kern="0"` : '' // IMPORTANT: Also disable kerning; otherwise text won't actually expand
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((opts as any)?.rtl === true) runProps += ' rtl="1"'
	if (optsAny._rPrErr !== undefined) runProps += ` err="${optsAny._rPrErr}"`
	if (optsAny._rPrDirty !== undefined) runProps += ` dirty="${optsAny._rPrDirty}"`
	else if (!isNativeMinimal) runProps += ' dirty="0"'
	runProps += '>'
	// Color / Font / Highlight / Outline are children of <a:rPr>, so add them now before closing the runProperties tag
	if (optsAny._rawRprChildXmlExact) {
		runProps += optsAny._rawRprChildXmlExact
	} else if (opts.color || opts.fontFace || opts.outline || (typeof opts.underline === 'object' && opts.underline.color) || optsAny._rawRprXml) {
		if (opts.outline && typeof opts.outline === 'object') {
			runProps += `<a:ln w="${valToPts(opts.outline.size || 0.75)}">${genXmlColorSelection(opts.outline.color || 'FFFFFF')}</a:ln>`
		}
		// For native decyphered shapes (_nativeMinimal), skip emitting default black (000000) text color
		// as it's inherited from the slide master/theme and would create spurious <a:solidFill> tags
		const _skipDefaultColor = opts._nativeMinimal && (opts.color === '000000' || opts.color === '000000'.toLowerCase())
		if (opts.color && !_skipDefaultColor) {
			runProps += genXmlColorSelection({ color: opts.color, transparency: opts.transparency })
		}
		const rawRprXml = optsAny._rawRprXml || ''
		const rawRprHasFontChildren = rawRprXml.includes('<a:ea') || rawRprXml.includes('<a:cs') || rawRprXml.includes('<a:sym')
		const rawRprHasNonFontChildren =
			rawRprXml.includes('<a:u') ||
			rawRprXml.includes('<a:ln') ||
			rawRprXml.includes('<a:effect') ||
			rawRprXml.includes('<a:hlink') ||
			rawRprXml.includes('<a:highlight')
		const emitLatinBeforeRawFonts = !!(opts.fontFace && rawRprHasFontChildren && !rawRprHasNonFontChildren)
		if (emitLatinBeforeRawFonts) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const _lattrA = (opts as any)._latinAttrs
			runProps += _lattrA
				? `<a:latin typeface="${opts.fontFace}" ${_lattrA}/>`
				: `<a:latin typeface="${opts.fontFace}"/>`
		}
		// Inject raw rPr XML (e.g. <a:cs typeface="..."/> <a:sym typeface="..."/>) from decyphered shapes
		if (rawRprXml) runProps += rawRprXml
		if (opts.highlight) runProps += `<a:highlight>${createColorElement(opts.highlight)}</a:highlight>`
		if (typeof opts.underline === 'object' && opts.underline.color) runProps += `<a:uFill>${genXmlColorSelection(opts.underline.color)}</a:uFill>`
		// Text effects (shadow, glow, reflection) - combined in effectLst
		// NOTE: textShadow/textGlow/textReflection apply ONLY to text characters
		// NOTE: shadow/glow/reflection apply to shape (and glow/reflection also to text)
		if (opts.textShadow || opts.textGlow || opts.glow || opts.textReflection || opts.reflection) {
			runProps += '<a:effectLst>'
			if (opts.textShadow) runProps += createShadowElement(opts.textShadow)
			if (opts.textGlow) runProps += createGlowElement(opts.textGlow, DEF_TEXT_GLOW)
			else if (opts.glow) runProps += createGlowElement(opts.glow, DEF_TEXT_GLOW)
			if (opts.textReflection) runProps += createReflectionElement(opts.textReflection)
			else if (opts.reflection) runProps += createReflectionElement(opts.reflection)
			runProps += '</a:effectLst>'
		}
		if (opts.fontFace && !emitLatinBeforeRawFonts) {
			// NOTE: 'cs' = Complex Script, 'ea' = East Asian (use "-120" instead of "0" - per Issue #174); ea must come first (Issue #174)
			// Use _latinAttrs from decyphered shapes (panose/pitchFamily/charset extracted from source)
			// Otherwise use default pitchFamily/charset attributes
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const _lattrA = (opts as any)._latinAttrs
			const _latStr = _lattrA
				? `<a:latin typeface="${opts.fontFace}" ${_lattrA}/>`
				: `<a:latin typeface="${opts.fontFace}"/>`
			// Only emit ea/cs when no _rawRprXml (otherwise cs/sym are already in _rawRprXml)
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const _hasRawRpr = !!(opts as any)._rawRprXml
			const _eacsStr = _hasRawRpr
				? ''
				: `<a:ea typeface="${opts.fontFace}" pitchFamily="34" charset="-122"/><a:cs typeface="${opts.fontFace}" pitchFamily="34" charset="-120"/>`
			runProps += _latStr + _eacsStr
		}
	}

	// Hyperlink support
	if (opts.hyperlink) {
		if (typeof opts.hyperlink !== 'object') throw new Error('ERROR: text `hyperlink` option should be an object. Ex: `hyperlink:{url:\'https://github.com\'}` ')
		else if (!opts.hyperlink.url && !opts.hyperlink.slide) throw new Error('ERROR: \'hyperlink requires either `url` or `slide`\'')
		else if (optsAny._preserveRawHlinkClick) {
			const rawHlinkAttrs = optsAny._rawHlinkClickAttrs || ''
			const rawHlinkChildXml = optsAny._rawHlinkClickChildXml || ''
			if (rawHlinkChildXml) {
				runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}"${rawHlinkAttrs}>${rawHlinkChildXml}</a:hlinkClick>`
			} else {
				runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}"${rawHlinkAttrs}/>`
			}
		} else if (opts.hyperlink.url) {
			// runProps += '<a:uFill>'+ genXmlColorSelection('0000FF') +'</a:uFill>'; // Breaks PPT2010! (Issue#74)
			runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}" invalidUrl="" action="" tgtFrame="" tooltip="${opts.hyperlink.tooltip ? encodeXmlEntities(opts.hyperlink.tooltip) : ''
				}" history="1" highlightClick="0" endSnd="0"${opts.color ? '>' : '/>'}`
		} else if (opts.hyperlink.slide) {
			runProps += `<a:hlinkClick r:id="rId${opts.hyperlink._rId}" action="ppaction://hlinksldjump" tooltip="${opts.hyperlink.tooltip ? encodeXmlEntities(opts.hyperlink.tooltip) : ''
				}"${opts.color ? '>' : '/>'}`
		}
		if (opts.color && !optsAny._preserveRawHlinkClick) {
			runProps += ' <a:extLst>'
			runProps += '  <a:ext uri="{A12FA001-AC4F-418D-AE19-62706E023703}">'
			runProps += '   <ahyp:hlinkClr xmlns:ahyp="http://schemas.microsoft.com/office/drawing/2018/hyperlinkcolor" val="tx"/>'
			runProps += '  </a:ext>'
			runProps += ' </a:extLst>'
			runProps += '</a:hlinkClick>'
		}
	}

	// END runProperties
	runProps += `</${runPropsTag}>`

	return runProps
}

/**
 * Build textBody text runs [`<a:r></a:r>`] for paragraphs [`<a:p>`]
 * @param {TextProps} textObj - Text object
 * @return {string} XML string
 */
function genXmlTextRun(textObj: TextProps): string {
	// NOTE: Dont create full rPr runProps for empty [lineBreak] runs
	// Why? The size of the lineBreak wont match (eg: below it will be 18px instead of the correct 36px)
	// Do this:
	/*
		<a:p>
			<a:pPr algn="r"/>
			<a:endParaRPr lang="en-US" sz="3600" dirty="0"/>
		</a:p>
	*/
	// NOT this:
	/*
		<a:p>
			<a:pPr algn="r"/>
			<a:r>
				<a:rPr lang="en-US" sz="3600" dirty="0">
					<a:solidFill>
						<a:schemeClr val="accent5"/>
					</a:solidFill>
					<a:latin typeface="Times" pitchFamily="34" charset="0"/>
					<a:ea typeface="Times" pitchFamily="34" charset="-122"/>
					<a:cs typeface="Times" pitchFamily="34" charset="-120"/>
				</a:rPr>
				<a:t></a:t>
			</a:r>
			<a:endParaRPr lang="en-US" dirty="0"/>
		</a:p>
	*/

	// Return paragraph with text run
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const optsAny = textObj.options as any
	if (textObj.text && optsAny?._omitRPr) return `<a:r><a:t>${encodeXmlEntities(textObj.text)}</a:t></a:r>`
	return textObj.text ? `<a:r>${genXmlTextRunProperties(textObj.options, false)}<a:t>${encodeXmlEntities(textObj.text)}</a:t></a:r>` : ''
}

/**
 * Builds `<a:bodyPr></a:bodyPr>` tag for "genXmlTextBody()"
 * @param {ISlideObject | TableCell} slideObject - various options
 * @return {string} XML string
 */
function genXmlBodyProperties(slideObject: ISlideObject | TableCell): string {
	let bodyProperties = '<a:bodyPr'

	if (slideObject && slideObject._type === SLIDE_OBJECT_TYPES.text && slideObject.options._bodyProp) {
		// PPT-2019 EX: <a:bodyPr wrap="square" lIns="1270" tIns="1270" rIns="1270" bIns="1270" rtlCol="0" anchor="ctr"/>


		// A: Enable or disable text wrapping only when explicitly needed.
		const bodyProp = slideObject.options._bodyProp
		const isNativeMinimal = !!slideObject.options._nativeMinimal
		if (bodyProp.wrap === false) bodyProperties += ' wrap="none"'
		else if (bodyProp.wrap) bodyProperties += ' wrap="square"'

		// B: Textbox margins [padding]. When decypher supplies explicit zero insets,
		// they are source XML, not invented defaults.
		if (bodyProp.lIns || bodyProp.lIns === 0) bodyProperties += ` lIns="${bodyProp.lIns}"`
		if (bodyProp.tIns || bodyProp.tIns === 0) bodyProperties += ` tIns="${bodyProp.tIns}"`
		if (bodyProp.rIns || bodyProp.rIns === 0) bodyProperties += ` rIns="${bodyProp.rIns}"`
		if (bodyProp.bIns || bodyProp.bIns === 0) bodyProperties += ` bIns="${bodyProp.bIns}"`

		// Extra passthrough attributes from decypher tool
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const _extraBodyPrAttr = (slideObject.options as any)._extraBodyPrAttr
		if (_extraBodyPrAttr) bodyProperties += ` ${_extraBodyPrAttr}`
		if ((bodyProp as any).rtlCol !== undefined && !String(_extraBodyPrAttr || '').includes('rtlCol=')) bodyProperties += ` rtlCol="${(bodyProp as any).rtlCol}"`
		else if (!isNativeMinimal) bodyProperties += ' rtlCol="0"'

		// D: Add anchorPoints
		if (slideObject.options._bodyProp.anchor) bodyProperties += ' anchor="' + slideObject.options._bodyProp.anchor + '"' // VALS: [t,ctr,b]
		if (slideObject.options._bodyProp.vert && !String(_extraBodyPrAttr || '').includes('vert=')) bodyProperties += ' vert="' + slideObject.options._bodyProp.vert + '"' // VALS: [eaVert,horz,mongolianVert,vert,vert270,wordArtVert,wordArtVertRtl]

		// E: Close <a:bodyPr element
		bodyProperties += '>'
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const _rawBodyPrChildXml = (slideObject.options as any)._rawBodyPrChildXml
		const hasRawAutofit =
			!!_rawBodyPrChildXml &&
			(_rawBodyPrChildXml.includes('<a:spAutoFit') ||
				_rawBodyPrChildXml.includes('<a:normAutofit') ||
				_rawBodyPrChildXml.includes('<a:noAutofit'))

		/**
		 * F: Text Fit/AutoFit/Shrink option
		 * @see: http://officeopenxml.com/drwSp-text-bodyPr-fit.php
		 * @see: http://www.datypic.com/sc/ooxml/g-a_EG_TextAutofit.html
		 */
		if (slideObject.options.fit && !hasRawAutofit) {
			// NOTE: Use of '<a:noAutofit/>' instead of '' causes issues in PPT-2013!
			// Exception: native shapes (_nativeMinimal=true) from decyphered PPTX files DO need <a:noAutofit/>
			// because the reference XML explicitly contains it and we must match it exactly.
			if (slideObject.options.fit === 'none') bodyProperties += slideObject.options._nativeMinimal ? '<a:noAutofit/>' : ''
			// NOTE: Shrink does not work automatically - PowerPoint calculates the `fontScale` value dynamically upon resize
			// else if (slideObject.options.fit === 'shrink') bodyProperties += '<a:normAutofit fontScale="85000" lnSpcReduction="20000"/>' // MS-PPT > Format shape > Text Options: "Shrink text on overflow"
			else if (slideObject.options.fit === 'shrink') bodyProperties += '<a:normAutofit/>'
			else if (slideObject.options.fit === 'resize') bodyProperties += '<a:spAutoFit/>'
		}
		//
		// DEPRECATED: below (@deprecated v3.3.0)
		if (slideObject.options.shrinkText && !hasRawAutofit) bodyProperties += '<a:normAutofit/>' // MS-PPT > Format shape > Text Options: "Shrink text on overflow"
		/* DEPRECATED: below (@deprecated v3.3.0)
		 * MS-PPT > Format shape > Text Options: "Resize shape to fit text" [spAutoFit]
		 * NOTE: Use of '<a:noAutofit/>' in lieu of '' below causes issues in PPT-2013
		 */
		bodyProperties += slideObject.options._bodyProp.autoFit && !hasRawAutofit ? '<a:spAutoFit/>' : ''

		// F: Add WordArt transform if specified
		if (slideObject.options.wordArt?.transform) {
			const transform = normalizeWordArtTransform(slideObject.options.wordArt.transform)
			bodyProperties += `<a:prstTxWarp prst="${transform}">`
			bodyProperties += '<a:avLst>'
			if (slideObject.options.wordArt.adjustments?.length) {
				slideObject.options.wordArt.adjustments.forEach((adj, idx) => {
					bodyProperties += `<a:gd name="adj${idx > 0 ? idx : ''}" fmla="val ${adj}"/>`
				})
			}
			bodyProperties += '</a:avLst>'
			bodyProperties += '</a:prstTxWarp>'
		}

		// G: Add text-specific 3D effects (scene3d + sp3d inside bodyPr)
		// This is different from shape-level 3D - affects text characters directly.
		if (slideObject.options.text3D && !_rawBodyPrChildXml) {
			bodyProperties += createText3DElements(slideObject.options.text3D)
		}

		if (_rawBodyPrChildXml) {
			bodyProperties += _rawBodyPrChildXml
		}

		// LAST: Close _bodyProp
		bodyProperties += '</a:bodyPr>'
	} else {
		// DEFAULT:
		bodyProperties += ' wrap="square" rtlCol="0">'
		// Add WordArt transform if specified (for non-text objects with wordArt)
		if ((slideObject as ISlideObject).options?.wordArt?.transform) {
			const wordArt = (slideObject as ISlideObject).options.wordArt
			const transform = normalizeWordArtTransform(wordArt.transform)
			bodyProperties += `<a:prstTxWarp prst="${transform}">`
			bodyProperties += '<a:avLst>'
			if (wordArt.adjustments?.length) {
				wordArt.adjustments.forEach((adj, idx) => {
					bodyProperties += `<a:gd name="adj${idx > 0 ? idx : ''}" fmla="val ${adj}"/>`
				})
			}
			bodyProperties += '</a:avLst>'
			bodyProperties += '</a:prstTxWarp>'
		}
		// Add raw bodyPr child XML (scene3d/sp3d from decyphered shapes)
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const _rawBodyPrChildXml2 = (slideObject as any).options?._rawBodyPrChildXml
		// Add text-specific 3D effects for non-text objects
		if ((slideObject as ISlideObject).options?.text3D && !_rawBodyPrChildXml2) {
			bodyProperties += createText3DElements((slideObject as ISlideObject).options.text3D)
		}
		if (_rawBodyPrChildXml2) {
			bodyProperties += _rawBodyPrChildXml2
		}
		bodyProperties += '</a:bodyPr>'
	}

	// LAST: Return Close _bodyProp
	return slideObject._type === SLIDE_OBJECT_TYPES.tablecell ? '<a:bodyPr/>' : bodyProperties
}

/**
 * Generate the XML for text and its options (bold, bullet, etc) including text runs (word-level formatting)
 * @param {ISlideObject|TableCell} slideObj - slideObj or tableCell
 * @note PPT text lines [lines followed by line-breaks] are created using <p>-aragraph's
 * @note Bullets are a paragragh-level formatting device
 * @template
 *    <p:txBody>
 *        <a:bodyPr wrap="square" rtlCol="0">
 *            <a:spAutoFit/>
 *        </a:bodyPr>
 *        <a:lstStyle/>
 *        <a:p>
 *            <a:pPr algn="ctr"/>
 *            <a:r>
 *                <a:rPr lang="en-US" dirty="0" err="1"/>
 *                <a:t>textbox text</a:t>
 *            </a:r>
 *            <a:endParaRPr lang="en-US" dirty="0"/>
 *        </a:p>
 *    </p:txBody>
 * @returns XML containing the param object's text and formatting
 */
export function genXmlTextBody(slideObj: ISlideObject | TableCell): string {
	const opts: ObjectOptions = slideObj.options || {}
	let tmpTextObjects: TextProps[] = []
	const arrTextObjects: TextProps[] = []

	// FIRST: Shapes without text, etc. may be sent here during build, but have no text to render so return an empty string
	if (opts && slideObj._type !== SLIDE_OBJECT_TYPES.tablecell && (typeof slideObj.text === 'undefined' || slideObj.text === null)) return ''

	// STEP 1: Start textBody
	let strSlideXml = slideObj._type === SLIDE_OBJECT_TYPES.tablecell ? '<a:txBody>' : '<p:txBody>'

	// STEP 2: Add bodyProperties
	{
		// A: 'bodyPr'
		strSlideXml += genXmlBodyProperties(slideObj)

		// B: 'lstStyle'
		// NOTE: shape type 'LINE' has different text align needs (a lstStyle.lvl1pPr between bodyPr and p)
		// FIXME: LINE horiz-align doesnt work (text is always to the left inside line) (FYI: the PPT code diff is substantial!)
		if (opts.h === 0 && opts.line && opts.align) strSlideXml += '<a:lstStyle><a:lvl1pPr algn="l"/></a:lstStyle>'
		else if (slideObj._type === 'placeholder') strSlideXml += `<a:lstStyle>${genXmlParagraphProperties(slideObj, true)}</a:lstStyle>`
		else strSlideXml += '<a:lstStyle/>'
	}

	/* STEP 3: Modify slideObj.text to array
		CASES:
		addText( 'string' ) // string
		addText( 'line1\n line2' ) // string with lineBreak
		addText( {text:'word1'} ) // TextProps object
		addText( ['barry','allen'] ) // array of strings
		addText( [{text:'word1'}, {text:'word2'}] ) // TextProps object array
		addText( [{text:'line1\n line2'}, {text:'end word'}] ) // TextProps object array with lineBreak
	*/
	if (typeof slideObj.text === 'string' || typeof slideObj.text === 'number') {
		// Handle cases 1,2
		tmpTextObjects.push({ text: slideObj.text.toString(), options: opts || {} })
	} else if (slideObj.text && !Array.isArray(slideObj.text) && typeof slideObj.text === 'object' && Object.keys(slideObj.text).includes('text')) {
		// } else if (!Array.isArray(slideObj.text) && slideObj.text!.hasOwnProperty('text')) { // 20210706: replaced with below as ts compiler rejected it
		// Handle case 3
		tmpTextObjects.push({ text: slideObj.text || '', options: slideObj.options || {} })
	} else if (Array.isArray(slideObj.text)) {
		// Handle cases 4,5,6
		// NOTE: use cast as text is TextProps[]|TableCell[] and their `options` dont overlap (they share the same TextBaseProps though)
		tmpTextObjects = (slideObj.text as TextProps[]).map(item => ({ text: item.text, options: item.options }))
	}

	// STEP 4: Iterate over text objects, set text/options, break into pieces if '\n'/breakLine found
	tmpTextObjects.forEach((itext, idx) => {
		if (!itext.text) itext.text = ''

		// A: Set options
		itext.options = itext.options || opts || {}
		if (idx === 0 && itext.options && !itext.options.bullet && opts.bullet) itext.options.bullet = opts.bullet
		// Propagate _nativeMinimal from parent shape options to each text item
		if (opts._nativeMinimal && itext.options !== opts) itext.options._nativeMinimal = true

		// B: Cast to text-object and fix line-breaks (if needed)
		if (typeof itext.text === 'string' || typeof itext.text === 'number') {
			// 1: Convert "\n" or any variation into CRLF
			itext.text = itext.text.toString().replace(/\r*\n/g, CRLF)
		}

		// C: If text string has line-breaks, then create a separate text-object for each (much easier than dealing with split inside a loop below)
		// NOTE: Filter for trailing lineBreak prevents the creation of an empty textObj as the last item
		if (itext.text.includes(CRLF) && itext.text.match(/\n$/g) === null) {
			itext.text.split(CRLF).forEach(line => {
				itext.options.breakLine = true
				arrTextObjects.push({ text: line, options: itext.options })
			})
		} else {
			arrTextObjects.push(itext)
		}
	})

	// STEP 5: Group textObj into lines by checking for lineBreak, bullets, alignment change, etc.
	const arrLines: TextProps[][] = []
	let arrTexts: TextProps[] = []
	arrTextObjects.forEach((textObj, idx) => {
		// A: Align or Bullet trigger new line
		if (arrTexts.length > 0 && (textObj.options.align || opts.align)) {
			// Only start a new paragraph when align *changes*
			if (textObj.options.align !== arrTextObjects[idx - 1].options.align) {
				arrLines.push(arrTexts)
				arrTexts = []
			}
		} else if (arrTexts.length > 0 && textObj.options.bullet && arrTexts.length > 0) {
			arrLines.push(arrTexts)
			arrTexts = []
			textObj.options.breakLine = false // For cases with both `bullet` and `brekaLine` - prevent double lineBreak
		}

		// B: Add this text to current line
		arrTexts.push(textObj)

		// C: BreakLine begins new line **after** adding current text
		if (arrTexts.length > 0 && textObj.options.breakLine) {
			// Avoid starting a para right as loop is exhausted
			if (idx + 1 < arrTextObjects.length) {
				arrLines.push(arrTexts)
				arrTexts = []
			}
		}

		// D: Flush buffer
		if (idx + 1 === arrTextObjects.length) arrLines.push(arrTexts)
	})

	// STEP 6: Loop over each line and create paragraph props, text run, etc.
	arrLines.forEach((line, lineIdx) => {
		let reqsClosingFontSize = false
		const isLastLine = lineIdx === arrLines.length - 1

		// A: Start paragraph, add paraProps
		strSlideXml += '<a:p>'
		// NOTE: `rtlMode` is like other opts, its propagated up to each text:options, so just check the 1st one
		const _rtlMode0 = line[0].options?.rtlMode
		let paragraphPropXml = `<a:pPr ${_rtlMode0 === true ? ' rtl="1" ' : _rtlMode0 === false ? ' rtl="0" ' : ''}`
		let closingFontSize = 0

		// B: Start paragraph, loop over lines and add text runs
		line.forEach((textObj, idx) => {
			// A: Set line index
			textObj.options._lineIdx = idx

			// A.1: Add soft break. If the break-run carries raw rPr payload, emit full <a:br><a:rPr.../></a:br>.
			if ((idx > 0 && textObj.options.softBreakBefore) || textObj.options.standaloneBreakParagraph) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const brOptionsAny = textObj.options as any
				const _rawBrRprXml = brOptionsAny._rawRprChildXmlExact || brOptionsAny._rawRprXml || ''
				const hasBrRpr = !!(_rawBrRprXml || textObj.options.lang || textObj.options.fontSize || brOptionsAny._rawRprAttrs || brOptionsAny._rPrAltLang !== undefined || brOptionsAny._rPrB !== undefined || brOptionsAny._rPrU !== undefined || brOptionsAny._rPrErr !== undefined || brOptionsAny._rPrDirty !== undefined)
				if (hasBrRpr) {
					const _brLang = textObj.options.lang ? ` lang="${textObj.options.lang}"` : ''
					const _brSz = textObj.options.fontSize ? ` sz="${Math.round(textObj.options.fontSize * 100)}"` : ''
					const _rawBrRprAttrs = brOptionsAny._rawRprAttrs || ''
					const _brAltLang = brOptionsAny._rPrAltLang !== undefined ? ` altLang="${brOptionsAny._rPrAltLang}"` : ''
					const _brB = brOptionsAny._rPrB !== undefined ? ` b="${brOptionsAny._rPrB}"` : ''
					const _brU = brOptionsAny._rPrU !== undefined ? ` u="${brOptionsAny._rPrU}"` : ''
					const _brErr = brOptionsAny._rPrErr !== undefined ? ` err="${brOptionsAny._rPrErr}"` : ''
					const _brDirty = brOptionsAny._rPrDirty !== undefined ? ` dirty="${brOptionsAny._rPrDirty}"` : (!brOptionsAny._nativeMinimal ? ' dirty="0"' : '')
					const _brAttrs = `${_brLang}${_brAltLang}${_brSz}${_rawBrRprAttrs}${_brB}${_brU}${_brErr}${_brDirty}`
					strSlideXml += _rawBrRprXml ? `<a:br><a:rPr${_brAttrs}>${_rawBrRprXml}</a:rPr></a:br>` : `<a:br><a:rPr${_brAttrs}/></a:br>`
				} else {
					strSlideXml += '<a:br/>'
				}
			}

			// B: Inherit pPr-type options from parent shape's `options`
			textObj.options.align = textObj.options.align || opts.align
			textObj.options.lineSpacing = textObj.options.lineSpacing || opts.lineSpacing
			textObj.options.lineSpacingMultiple = textObj.options.lineSpacingMultiple || opts.lineSpacingMultiple
			textObj.options.indentLevel = textObj.options.indentLevel || opts.indentLevel
			textObj.options.paraSpaceBefore = textObj.options.paraSpaceBefore !== undefined ? textObj.options.paraSpaceBefore : opts.paraSpaceBefore
			textObj.options.paraSpaceAfter = textObj.options.paraSpaceAfter !== undefined ? textObj.options.paraSpaceAfter : opts.paraSpaceAfter
			
			// Paragraph properties are only valid as the first child of a:p.
			if (idx === 0) {
				// Propagate _nativeMinimal before calling genXmlParagraphProperties (needed for buNone suppression)
				if (opts._nativeMinimal && !textObj.options._nativeMinimal) textObj.options._nativeMinimal = true
				paragraphPropXml = genXmlParagraphProperties(textObj, false)
				strSlideXml += paragraphPropXml.replace('<a:pPr></a:pPr>', '') // IMPORTANT: Empty "pPr" blocks will generate needs-repair/corrupt msg
			}
			// C: Inherit any main options (color, fontSize, etc.)
			// NOTE: We only pass the text.options to genXmlTextRun (not the Slide.options),
			// so the run building function cant just fallback to Slide.color, therefore, we need to do that here before passing options below.
			// FILTER RULE: Hyperlinks should not inherit `color` from main options (let PPT default to local color, eg: blue on MacOS)
			Object.entries(opts).filter(([key]) => !(textObj.options.hyperlink && key === 'color')).forEach(([key, val]) => {
				// if (textObj.options.hyperlink && key === 'color') null
				// NOTE: This loop will pick up unecessary keys (`x`, etc.), but it doesnt hurt anything
				if (opts._nativeMinimal && key === 'fontSize') return
				if (key !== 'bullet' && !textObj.options[key]) textObj.options[key] = val
			})

			// D: Add formatted textrun
			strSlideXml += genXmlTextRun(textObj)

			// E: Flag close fontSize for empty [lineBreak] elements
			if ((!textObj.text && opts.fontSize)) {
				reqsClosingFontSize = true
				closingFontSize = Math.max(closingFontSize, opts.fontSize || 0)
			} else if (textObj.options.fontSize) {
				reqsClosingFontSize = true
				opts.fontSize = opts.fontSize || textObj.options.fontSize
				closingFontSize = Math.max(closingFontSize, textObj.options.fontSize)
			}
		})

		/* C: Append 'endParaRPr' (when needed) and close current open paragraph
		 * NOTE: (ISSUE#20, ISSUE#193): Add 'endParaRPr' with font/size props or PPT default (Arial/18pt en-us) is used making row "too tall"/not honoring options
		 */
		if (slideObj._type === SLIDE_OBJECT_TYPES.tablecell && (opts.fontSize || opts.fontFace)) {
						if (!opts._nativeMinimal || opts.color || isLastLine) {
				if (opts.fontFace) {
					strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}"` + (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '') + ' dirty="0">'
					strSlideXml += `<a:latin typeface="${opts.fontFace}" charset="0"/>`
					strSlideXml += `<a:ea typeface="${opts.fontFace}" charset="0"/>`
					strSlideXml += `<a:cs typeface="${opts.fontFace}" charset="0"/>`
					strSlideXml += '</a:endParaRPr>'
				} else {
					strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}"` + (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '') + ' dirty="0"/>'
				}
			}
		} else if (line.length > 0 && (((line[line.length - 1].options as any)._rawEndParaRprXml) || ((line[line.length - 1].options as any)._forceEndParaRpr))) {
			// Passthrough: emit endParaRPr with preserved attrs and optional raw child XML
			const endParaOptionsAny = line[line.length - 1].options as any
			const _rawEndParaRprXml = endParaOptionsAny._rawEndParaRprXml || ''
			const _rawEndParaRprAttrs = endParaOptionsAny._rawEndParaRprAttrs
			const hasRawEndParaRprAttrs = Object.prototype.hasOwnProperty.call(endParaOptionsAny, '_rawEndParaRprAttrs')
			const _endParaLang = endParaOptionsAny._endParaLang
			const _endParaLangAttr = _endParaLang ? ` lang="${_endParaLang}"` : ''
			const _endParaFontSize = endParaOptionsAny._endParaFontSize
			const _endParaSz = _endParaFontSize ? ` sz="${Math.round(_endParaFontSize * 100)}"` : (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '')
			const _endParaAttrs = hasRawEndParaRprAttrs ? _rawEndParaRprAttrs : `${_endParaLangAttr}${_endParaSz} dirty="0"`
			if (_rawEndParaRprXml) {
				strSlideXml += `<a:endParaRPr${_endParaAttrs}>${_rawEndParaRprXml}</a:endParaRPr>`
			} else {
				strSlideXml += `<a:endParaRPr${_endParaAttrs}/>`
			}
		} else if (reqsClosingFontSize && !opts._nativeMinimal) {
			// Empty [lineBreak] lines should not contain runProp, however, they need to specify fontSize in `endParaRPr`
			strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}"` + (opts.fontSize ? ` sz="${Math.round(opts.fontSize * 100)}"` : '') + ' dirty="0"/>'
		} else if (!opts._nativeMinimal || (opts.color && opts.color !== '000000')) {
			// Skip plain endParaRPr for native decyphered shapes unless it is carrying explicit visual state.
			// This avoids inventing default endParaRPr nodes that are absent in the reference PPTX.
			strSlideXml += `<a:endParaRPr lang="${opts.lang || 'en-US'}" dirty="0"/>` // Added 20180101 to address PPT-2007 issues
		}

		// D: End paragraph
		strSlideXml += '</a:p>'
	})

	// IMPORTANT: An empty txBody will cause "needs repair" error! Add <p> content if missing.
	// [FIXED in v3.13.0]: This fixes issue with table auto-paging where some cells w/b empty on subsequent pages.
	/*
		<a:txBody>
			<a:bodyPr/>
			<a:lstStyle/>
		</a:txBody>
	*/
	if (strSlideXml.indexOf('<a:p>') === -1) {
		strSlideXml += '<a:p><a:endParaRPr/></a:p>'
	}

	// STEP 7: Close the textBody
	strSlideXml += slideObj._type === SLIDE_OBJECT_TYPES.tablecell ? '</a:txBody>' : '</p:txBody>'

	// LAST: Return XML
	return strSlideXml
}

/**
 * Generate an XML Placeholder
 * @param {ISlideObject} placeholderObj
 * @returns XML
 */
export function genXmlPlaceholder(placeholderObj: ISlideObject): string {
	if (!placeholderObj) return ''

	const placeholderIdx = placeholderObj.options?._placeholderIdx ? placeholderObj.options._placeholderIdx : ''
	const placeholderTyp = placeholderObj.options?._placeholderType ? placeholderObj.options._placeholderType : ''
	const placeholderType: string = placeholderTyp && PLACEHOLDER_TYPES[placeholderTyp] ? (PLACEHOLDER_TYPES[placeholderTyp]).toString() : ''
	const placeholderText = (placeholderObj.text || []).map(textRun => textRun?.text || '').join('')

	return `<p:ph
		${placeholderIdx ? ' idx="' + placeholderIdx.toString() + '"' : ''}
		${placeholderType && PLACEHOLDER_TYPES[placeholderType] ? ` type="${placeholderType}"` : ''}
		${placeholderText.length > 0 ? ' hasCustomPrompt="1"' : ''}
		/>`
}

// XML-GEN: First 6 functions create the base /ppt files

/**
 * Generate XML ContentType
 * @param {PresSlide[]} slides - slides
 * @param {SlideLayout[]} slideLayouts - slide layouts
 * @param {PresSlide} masterSlide - master slide
 * @returns XML
 */
export function makeXmlContTypes(
	slides: PresSlide[],
	slideLayouts: SlideLayout[],
	masterSlide?: PresSlide,
	rawPackageParts?: Array<{ path?: string; contentType?: string; defaultContentType?: string }>,
	rawPresentationContentType?: string
): string {
	let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF
	strXml += '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
	strXml += '<Default Extension="xml" ContentType="application/xml"/>'
	strXml += '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'

	// STEP 1: Collect all media types actually used in Presentation
	const usedExtensions = new Set<string>()
	const allMedia: { extn: string; type: string }[] = []
	
	// Gather media from all slides
	slides.forEach(slide => {
		(slide._relsMedia || []).forEach(rel => {
			if (rel.extn && rel.type) {
				allMedia.push({ extn: rel.extn, type: rel.type })
				usedExtensions.add(rel.extn.toLowerCase())
			}
		})
	})
	// Gather media from master slide
	;(masterSlide?._relsMedia || []).forEach(rel => {
		if (rel.extn && rel.type) {
			allMedia.push({ extn: rel.extn, type: rel.type })
			usedExtensions.add(rel.extn.toLowerCase())
		}
	})
	;(rawPackageParts || []).forEach(part => {
		const partPath = part?.path || ''
		const fileName = partPath.split('/').pop() || ''
		const dotIdx = fileName.lastIndexOf('.')
		if (dotIdx > -1) usedExtensions.add(fileName.substring(dotIdx + 1).toLowerCase())
	})
	
	// Only add media type declarations for extensions actually used
	if (usedExtensions.has('jpeg') || usedExtensions.has('jpg')) {
		strXml += '<Default Extension="jpeg" ContentType="image/jpeg"/>'
		strXml += '<Default Extension="jpg" ContentType="image/jpeg"/>'
	}
	if (usedExtensions.has('png')) {
		strXml += '<Default Extension="png" ContentType="image/png"/>'
	}
	if (usedExtensions.has('gif')) {
		strXml += '<Default Extension="gif" ContentType="image/gif"/>'
	}
	if (usedExtensions.has('svg')) {
		strXml += '<Default Extension="svg" ContentType="image/svg+xml"/>'
	}
	if (usedExtensions.has('m4v')) {
		strXml += '<Default Extension="m4v" ContentType="video/mp4"/>'
	}
	if (usedExtensions.has('m4a')) {
		strXml += '<Default Extension="m4a" ContentType="audio/mp4"/>'
	}
	if (usedExtensions.has('mp4')) {
		strXml += '<Default Extension="mp4" ContentType="video/mp4"/>'
	}
	if (usedExtensions.has('glb')) {
		strXml += '<Default Extension="glb" ContentType="model/gltf.binary"/>'
	}
	if (usedExtensions.has('fntdata')) {
		strXml += '<Default Extension="fntdata" ContentType="application/x-fontdata"/>'
	}
	;(rawPackageParts || []).forEach(part => {
		const partPath = part?.path || ''
		const fileName = partPath.split('/').pop() || ''
		const dotIdx = fileName.lastIndexOf('.')
		const ext = dotIdx > -1 ? fileName.substring(dotIdx + 1).toLowerCase() : ''
		if (!ext || !part?.defaultContentType) return
		if (!strXml.includes(`Extension="${ext}"`)) {
			strXml += `<Default Extension="${encodeXmlEntities(ext)}" ContentType="${encodeXmlEntities(part.defaultContentType)}"/>`
		}
	})
	
	// Check if any charts exist (charts require xlsx for embedded Excel data)
	const hasCharts = slides.some(slide => slide._relsChart && slide._relsChart.length > 0) ||
		slideLayouts.some(layout => layout._relsChart && layout._relsChart.length > 0) ||
		(masterSlide?._relsChart && masterSlide._relsChart.length > 0)
	if (hasCharts) {
		strXml += '<Default Extension="xlsx" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"/>'
	}
	
	// Add any other custom media types
	allMedia.forEach(rel => {
		if (rel.type !== 'image' && rel.type !== 'online' && rel.type !== 'chart' && !strXml.includes(`Extension="${rel.extn}"`)) {
			strXml += '<Default Extension="' + rel.extn + '" ContentType="' + rel.type + '"/>'
		}
	})

	const overridePartNames = new Set<string>()
	const addContentTypeOverride = (partName: string, contentType: string) => {
		if (!partName || !contentType) return
		const normalizedPartName = partName.startsWith('/') ? partName : `/${partName}`
		if (overridePartNames.has(normalizedPartName)) return
		overridePartNames.add(normalizedPartName)
		strXml += `<Override PartName="${encodeXmlEntities(normalizedPartName)}" ContentType="${encodeXmlEntities(contentType)}"/>`
	}

	// STEP 2: Add presentation and slide master(s)/slide(s)
	strXml += `<Override PartName="/ppt/presentation.xml" ContentType="${encodeXmlEntities(rawPresentationContentType || 'application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml')}"/>`
	overridePartNames.add('/ppt/presentation.xml')
	strXml += '<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>'
	overridePartNames.add('/ppt/notesMasters/notesMaster1.xml')
	// Add slide master(s) - typically just 1 master, not one per slide
	strXml += '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
	overridePartNames.add('/ppt/slideMasters/slideMaster1.xml')
	// Add each slide
	slides.forEach((slide, idx) => {
		addContentTypeOverride(`/ppt/slides/slide${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
		// Add charts if any
		slide._relsChart.forEach(rel => {
			const chartPartName = rel.Target.startsWith('../charts/') ? `/ppt/charts/${rel.Target.substring('../charts/'.length)}` : rel.Target
			const chartContentType = rel.chartFamily === 'chartEx'
				? 'application/vnd.ms-office.chartex+xml'
				: 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
			addContentTypeOverride(chartPartName, chartContentType)
			const rawOpts = rel.opts as any
			const chartStyleName = rawOpts._rawChartStyleName || (rel.chartFamily === 'chartEx' ? `style${rel.globalId}.xml` : null)
			const chartColorsName = rawOpts._rawChartColorsName || (rel.chartFamily === 'chartEx' ? `colors${rel.globalId}.xml` : null)
			if (chartStyleName) addContentTypeOverride(`/ppt/charts/${chartStyleName}`, 'application/vnd.ms-office.chartstyle+xml')
			if (chartColorsName) addContentTypeOverride(`/ppt/charts/${chartColorsName}`, 'application/vnd.ms-office.chartcolorstyle+xml')
		})
	})

	// STEP 3: Core PPT
	strXml += '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
	strXml += '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>'
	strXml += '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
	strXml += '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'

	// STEP 4: Add Slide Layouts
slideLayouts.forEach((layout, idx) => {
addContentTypeOverride(`/ppt/slideLayouts/slideLayout${idx + 1}.xml`, 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml')
; (layout._relsChart || []).forEach(rel => {
const chartPartName = rel.Target.startsWith('../charts/') ? `/ppt/charts/${rel.Target.substring('../charts/'.length)}` : rel.Target
const chartContentType = rel.chartFamily === 'chartEx' ? 'application/vnd.ms-office.chartex+xml' : 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
addContentTypeOverride(chartPartName, chartContentType)
const rawOpts = rel.opts as any
const chartStyleName = rawOpts._rawChartStyleName || (rel.chartFamily === 'chartEx' ? `style${rel.globalId}.xml` : null)
const chartColorsName = rawOpts._rawChartColorsName || (rel.chartFamily === 'chartEx' ? `colors${rel.globalId}.xml` : null)
if (chartStyleName) addContentTypeOverride('/ppt/charts/' + chartStyleName, 'application/vnd.ms-office.chartstyle+xml')
if (chartColorsName) addContentTypeOverride('/ppt/charts/' + chartColorsName, 'application/vnd.ms-office.chartcolorstyle+xml')
})
})

	// STEP 5: Add notes slide(s)
	slides.forEach((_slide, idx) => {
		strXml += `<Override PartName="/ppt/notesSlides/notesSlide${idx + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`
	})

	// STEP 6: Add master slide charts (media already handled in STEP 1)
	;(masterSlide?._relsChart || []).forEach(rel => {
		const chartPartName = rel.Target.startsWith('../charts/') ? `/ppt/charts/${rel.Target.substring('../charts/'.length)}` : rel.Target
		const chartContentType = rel.chartFamily === 'chartEx' ? 'application/vnd.ms-office.chartex+xml' : 'application/vnd.openxmlformats-officedocument.drawingml.chart+xml'
		addContentTypeOverride(chartPartName, chartContentType)
		const rawOpts = rel.opts as any
		const chartStyleName = rawOpts._rawChartStyleName || (rel.chartFamily === 'chartEx' ? `style${rel.globalId}.xml` : null)
		const chartColorsName = rawOpts._rawChartColorsName || (rel.chartFamily === 'chartEx' ? `colors${rel.globalId}.xml` : null)
		if (chartStyleName) addContentTypeOverride('/ppt/charts/' + chartStyleName, 'application/vnd.ms-office.chartstyle+xml')
		if (chartColorsName) addContentTypeOverride('/ppt/charts/' + chartColorsName, 'application/vnd.ms-office.chartcolorstyle+xml')
	})

	// STEP 7: Add raw package passthrough overrides for decyphered template infrastructure.
	const addOverride = (partPath: string, contentType: string) => {
		let normalizedPath = partPath
		while (normalizedPath.startsWith('/')) normalizedPath = normalizedPath.substring(1)
		addContentTypeOverride('/' + normalizedPath, contentType)
	}
	;(rawPackageParts || []).forEach(part => {
		let partPath = part?.path || ''
		while (partPath.startsWith('/')) partPath = partPath.substring(1)
		if (!partPath || partPath.includes('/_rels/') || partPath.endsWith('.rels')) return
		if (part.contentType) {
			addOverride(partPath, part.contentType)
		} else if (!partPath.endsWith('.xml')) {
			return
		} else if (partPath.startsWith('ppt/slideLayouts/')) {
			addOverride(partPath, 'application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml')
		} else if (partPath.startsWith('ppt/slideMasters/')) {
			addOverride(partPath, 'application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml')
		} else if (partPath.startsWith('ppt/theme/')) {
			addOverride(partPath, 'application/vnd.openxmlformats-officedocument.theme+xml')
		} else if (partPath.startsWith('ppt/drawings/')) {
			addOverride(partPath, 'application/vnd.openxmlformats-officedocument.drawingml.chartshapes+xml')
		} else if (partPath === 'ppt/authors.xml') {
			addOverride(partPath, 'application/vnd.ms-powerpoint.authors+xml')
		}
	})

	// LAST: Finish XML (Resume core)
	strXml += ' <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
	strXml += ' <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
	strXml += '</Types>'

	return strXml
}

/**
 * Creates `_rels/.rels`
 * @returns XML
 */
export function makeXmlRootRels(rawRootExtraRels?: RawRelRef[]): string {
	let strXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
		<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
		<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>`
	let nextRid = 4
	;(rawRootExtraRels || []).forEach(rel => {
		if (!rel?.type || !rel?.target) return
		strXml += `<Relationship Id="rId${nextRid++}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"${rel.targetMode ? ` TargetMode="${encodeXmlEntities(rel.targetMode)}"` : ''}/>`
	})
	strXml += '</Relationships>'
	return strXml
}

/**
 * Creates `docProps/app.xml`
 * @param {PresSlide[]} slides - Presenation Slides
 * @param {string} company - "Company" metadata
 * @returns XML
 */
export function makeXmlApp(slides: PresSlide[], company: string): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
	<TotalTime>0</TotalTime>
	<Words>0</Words>
	<Application>Microsoft Office PowerPoint</Application>
	<PresentationFormat>On-screen Show (16:9)</PresentationFormat>
	<Paragraphs>0</Paragraphs>
	<Slides>${slides.length}</Slides>
	<Notes>${slides.length}</Notes>
	<HiddenSlides>0</HiddenSlides>
	<MMClips>0</MMClips>
	<ScaleCrop>false</ScaleCrop>
	<HeadingPairs>
		<vt:vector size="6" baseType="variant">
			<vt:variant><vt:lpstr>Fonts Used</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>2</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Theme</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>1</vt:i4></vt:variant>
			<vt:variant><vt:lpstr>Slide Titles</vt:lpstr></vt:variant>
			<vt:variant><vt:i4>${slides.length}</vt:i4></vt:variant>
		</vt:vector>
	</HeadingPairs>
	<TitlesOfParts>
		<vt:vector size="${slides.length + 1 + 2}" baseType="lpstr">
			<vt:lpstr>Arial</vt:lpstr>
			<vt:lpstr>Calibri</vt:lpstr>
			<vt:lpstr>Office Theme</vt:lpstr>
			${slides.map((_slideObj, idx) => `<vt:lpstr>Slide ${idx + 1}</vt:lpstr>`).join('')}
		</vt:vector>
	</TitlesOfParts>
	<Company>${company}</Company>
	<LinksUpToDate>false</LinksUpToDate>
	<SharedDoc>false</SharedDoc>
	<HyperlinksChanged>false</HyperlinksChanged>
	<AppVersion>16.0000</AppVersion>
	</Properties>`
}

/**
 * Creates `docProps/core.xml`
 * @param {string} title - metadata data
 * @param {string} subject - metadata data
 * @param {string} author - metadata value
 * @param {string} revision - metadata value
 * @returns XML
 */
export function makeXmlCore(title: string, subject: string, author: string, revision: string): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
	<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
		<dc:title>${encodeXmlEntities(title)}</dc:title>
		<dc:subject>${encodeXmlEntities(subject)}</dc:subject>
		<dc:creator>${encodeXmlEntities(author)}</dc:creator>
		<cp:lastModifiedBy>${encodeXmlEntities(author)}</cp:lastModifiedBy>
		<cp:revision>${revision}</cp:revision>
		<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d\d\dZ/, 'Z')}</dcterms:created>
		<dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d\d\dZ/, 'Z')}</dcterms:modified>
	</cp:coreProperties>`
}

type RawSlideMasterRef = {
	id?: string | number
	target?: string
}

type RawPresentationFont = {
	typeface?: string
	regular?: string
	bold?: string
	italic?: string
	boldItalic?: string
}

type RawRelRef = {
	id?: string
	type?: string
	target?: string
	targetMode?: string
}

function normalizeRawSlideMasterRefs(rawSlideMasters?: RawSlideMasterRef[]): RawSlideMasterRef[] {
	const seenTargets = new Set<string>()
	return (rawSlideMasters || [])
		.filter(master => getSlideMasterNumberFromTarget(master?.target) > 0)
		.sort((a, b) => getSlideMasterNumberFromTarget(a.target) - getSlideMasterNumberFromTarget(b.target))
		.filter(master => {
			const target = master.target as string
			if (seenTargets.has(target)) return false
			seenTargets.add(target)
			return true
		})
}

function getSlideMasterNumberFromTarget(target?: string): number {
	if (!target || !target.startsWith('slideMasters/slideMaster') || !target.endsWith('.xml')) return 0
	const numPart = target.substring('slideMasters/slideMaster'.length, target.length - '.xml'.length)
	const parsed = Number(numPart)
	return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

function getAdditionalRawSlideMasterRid(slideCount: number, additionalIndex: number): number {
	return slideCount + 7 + additionalIndex
}

function normalizeRawPresentationFonts(rawPresentationFonts?: RawPresentationFont[]): RawPresentationFont[] {
	return (rawPresentationFonts || []).filter(font => !!font?.typeface && !!(font.regular || font.bold || font.italic || font.boldItalic))
}

function getRawPresentationFontRelations(
	slideCount: number,
	rawSlideMasters?: RawSlideMasterRef[],
	rawPresentationFonts?: RawPresentationFont[]
): Array<{ target: string; rId: string }> {
	const additionalMasterCount = normalizeRawSlideMasterRefs(rawSlideMasters).filter(master => master.target !== 'slideMasters/slideMaster1.xml').length
	let nextRawRelId = slideCount + 7 + additionalMasterCount
	const seenTargets = new Set<string>()
	const rels: Array<{ target: string; rId: string }> = []
	normalizeRawPresentationFonts(rawPresentationFonts).forEach(font => {
		;['regular', 'bold', 'italic', 'boldItalic'].forEach(style => {
			const target = font[style as keyof RawPresentationFont]
			if (!target || seenTargets.has(target)) return
			if (!target.startsWith('fonts/') || !target.endsWith('.fntdata')) return
			seenTargets.add(target)
			rels.push({ target, rId: `rId${nextRawRelId++}` })
		})
	})
	return rels
}

/**
 * Creates `ppt/_rels/presentation.xml.rels`
 * @param {PresSlide[]} slides - Presenation Slides
 * @returns XML
 */
export function makeXmlPresentationRels(slides: PresSlide[], rawSlideMasters?: RawSlideMasterRef[], rawPresentationFonts?: RawPresentationFont[], rawPresentationExtraRels?: RawRelRef[]): string {
	const masters = normalizeRawSlideMasterRefs(rawSlideMasters)
	const additionalMasters = masters.filter(master => master.target !== 'slideMasters/slideMaster1.xml')
	let intRelNum = 1
	let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF
	strXml += '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
	strXml += '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
	for (let idx = 1; idx <= slides.length; idx++) {
		strXml += `<Relationship Id="rId${++intRelNum}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${idx}.xml"/>`
	}
	intRelNum++
	strXml +=
		`<Relationship Id="rId${intRelNum + 0}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>` +
		`<Relationship Id="rId${intRelNum + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>` +
		`<Relationship Id="rId${intRelNum + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>` +
		`<Relationship Id="rId${intRelNum + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>` +
		`<Relationship Id="rId${intRelNum + 4}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>`

	additionalMasters
		.forEach((master, idx) => {
			strXml += `<Relationship Id="rId${getAdditionalRawSlideMasterRid(slides.length, idx)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="${master.target}"/>`
		})

	const fontRelations = getRawPresentationFontRelations(slides.length, rawSlideMasters, rawPresentationFonts)
	fontRelations.forEach(rel => {
		strXml += `<Relationship Id="${rel.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/font" Target="${rel.target}"/>`
	})
	const extraStart = fontRelations.reduce((maxId, rel) => {
		const n = rel.rId.startsWith('rId') ? Number(rel.rId.substring(3)) : 0
		return Math.max(maxId, n)
	}, intRelNum + 4)
	let nextExtraRid = extraStart + 1
	;(rawPresentationExtraRels || []).forEach(rel => {
		if (!rel?.type || !rel?.target) return
		strXml += `<Relationship Id="rId${nextExtraRid++}" Type="${encodeXmlEntities(rel.type)}" Target="${encodeXmlEntities(rel.target)}"${rel.targetMode ? ` TargetMode="${encodeXmlEntities(rel.targetMode)}"` : ''}/>`
	})
	strXml += '</Relationships>'

	return strXml
}

// XML-GEN: Functions that run 1-N times (once for each Slide)

/**
 * Generates XML for the slide file (`ppt/slides/slide1.xml`)
 * @param {PresSlide} slide - the slide object to transform into XML
 * @return {string} XML
 */
export function makeXmlSlide(slide: PresSlide): string {
	// Generate animation XML using the centralized function
	const animationXml = genXmlAnimations(slide)

	// Only include am3d/a16 namespaces if slide has model3d content
	const hasModel3D = slide._slideObjects?.some(obj => obj._type === SLIDE_OBJECT_TYPES.model3d) ?? false
	const model3dNs = hasModel3D
		? 'xmlns:am3d="http://schemas.microsoft.com/office/drawing/2017/model3d" xmlns:a16="http://schemas.microsoft.com/office/drawing/2014/main" '
		: ''

	return (
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}` +
		'<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
		'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ' +
		'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" ' +
		`${model3dNs}` +
		'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" ' +
		'xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"' +
		`${slide?.hidden ? ' show="0"' : ''}>` +
		`${slideObjectToXml(slide)}` +
		'<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
		`${(slide as PresSlide & { _rawTransitionXml?: string })._rawTransitionXml || (slide.transition ? genXmlTransition(slide.transition) : '')}` +
		`${animationXml}` +
		'</p:sld>'
	)
}

/**
 * Get text content of Notes from Slide
 * @param {PresSlide} slide - the slide object to transform into XML
 * @return {string} notes text
 */
export function getNotesFromSlide(slide: PresSlide): string {
	let notesText = ''

	slide._slideObjects.forEach(data => {
		if (data._type === SLIDE_OBJECT_TYPES.notes) notesText += data?.text && data.text[0] ? data.text[0].text : ''
	})

	return notesText.replace(/\r*\n/g, CRLF)
}

/**
 * Generate XML for Notes Master (notesMaster1.xml)
 * @returns {string} XML
 */
export function makeXmlNotesMaster(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:notesMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Header Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="hdr" sz="quarter"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Date Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="dt" idx="1"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="0"/><a:ext cx="2971800" cy="458788"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{5282F153-3F37-0F45-9E97-73ACFA13230C}" type="datetimeFigureOut"><a:rPr lang="en-US"/><a:t>7/23/19</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Image Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg" idx="2"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="1143000"/><a:ext cx="5486400" cy="3086100"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln w="12700"><a:solidFill><a:prstClr val="black"/></a:solidFill></a:ln></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="ctr"/><a:lstStyle/><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="5" name="Notes Placeholder 4"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" sz="quarter" idx="3"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="685800" y="4400550"/><a:ext cx="5486400" cy="3600450"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0"/><a:lstStyle/><a:p><a:pPr lvl="0"/><a:r><a:rPr lang="en-US"/><a:t>Click to edit Master text styles</a:t></a:r></a:p><a:p><a:pPr lvl="1"/><a:r><a:rPr lang="en-US"/><a:t>Second level</a:t></a:r></a:p><a:p><a:pPr lvl="2"/><a:r><a:rPr lang="en-US"/><a:t>Third level</a:t></a:r></a:p><a:p><a:pPr lvl="3"/><a:r><a:rPr lang="en-US"/><a:t>Fourth level</a:t></a:r></a:p><a:p><a:pPr lvl="4"/><a:r><a:rPr lang="en-US"/><a:t>Fifth level</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="6" name="Footer Placeholder 5"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="ftr" sz="quarter" idx="4"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="0" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"/><a:lstStyle><a:lvl1pPr algn="l"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="7" name="Slide Number Placeholder 6"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="5"/></p:nvPr></p:nvSpPr><p:spPr><a:xfrm><a:off x="3884613" y="8685213"/><a:ext cx="2971800" cy="458787"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr vert="horz" lIns="91440" tIns="45720" rIns="91440" bIns="45720" rtlCol="0" anchor="b"/><a:lstStyle><a:lvl1pPr algn="r"><a:defRPr sz="1200"/></a:lvl1pPr></a:lstStyle><a:p><a:fld id="{CE5E9CC1-C706-0F49-92D6-E571CC5EEA8F}" type="slidenum"><a:rPr lang="en-US"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId val="1024086991"/></p:ext></p:extLst></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr><a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr><a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr><a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr><a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr><a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr><a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr><a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr><a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr></p:notesStyle></p:notesMaster>`
}

/**
 * Creates Notes Slide (`ppt/notesSlides/notesSlide1.xml`)
 * @param {PresSlide} slide - the slide object to transform into XML
 * @return {string} XML
 */
export function makeXmlNotesSlide(slide: PresSlide): string {
	return (
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:sp><p:nvSpPr><p:cNvPr id="2" name="Slide Image Placeholder 1"/><p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldImg"/></p:nvPr></p:nvSpPr><p:spPr/></p:sp><p:sp><p:nvSpPr><p:cNvPr id="3" name="Notes Placeholder 2"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${encodeXmlEntities(getNotesFromSlide(slide))}</a:t></a:r><a:endParaRPr lang="en-US" dirty="0"/></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="4" name="Slide Number Placeholder 3"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr><p:ph type="sldNum" sz="quarter" idx="10"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:fld id="${SLDNUMFLDID}" type="slidenum"><a:rPr lang="en-US"/><a:t>${slide._slideNum}</a:t></a:fld><a:endParaRPr lang="en-US"/></a:p></p:txBody></p:sp></p:spTree><p:extLst><p:ext uri="{BB962C8B-B14F-4D97-AF65-F5344CB8AC3E}"><p14:creationId val="1024086991"/></p:ext></p:extLst></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`
	)
}

/**
 * Generates the XML layout resource from a layout object
 * @param {SlideLayout} layout - slide layout (master)
 * @return {string} XML
 */
export function makeXmlLayout(layout: SlideLayout): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" preserve="1">
		${slideObjectToXml(layout)}
		<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`
}

/**
 * Creates Slide Master 1 (`ppt/slideMasters/slideMaster1.xml`)
 * @param {PresSlide} slide - slide object that represents master slide layout
 * @param {SlideLayout[]} layouts - slide layouts
 * @return {string} XML
 */
export function makeXmlMaster(slide: PresSlide, layouts: SlideLayout[]): string {
	// NOTE: Pass layouts as static rels because they are not referenced any time
	const layoutDefs = layouts.map((_layoutDef, idx) => `<p:sldLayoutId id="${LAYOUT_IDX_SERIES_BASE + idx}" r:id="rId${slide._rels.length + idx + 1}"/>`)

	let strXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + CRLF
	strXml +=
		'<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">'
	strXml += slideObjectToXml(slide)
	strXml +=
		'<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
	strXml += '<p:sldLayoutIdLst>' + layoutDefs.join('') + '</p:sldLayoutIdLst>'
	strXml += '<p:hf sldNum="0" hdr="0" ftr="0" dt="0"/>'
	strXml +=
		'<p:txStyles>' +
		' <p:titleStyle>' +
		'  <a:lvl1pPr algn="ctr" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="0"/></a:spcBef><a:buNone/><a:defRPr sz="4400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mj-lt"/><a:ea typeface="+mj-ea"/><a:cs typeface="+mj-cs"/></a:defRPr></a:lvl1pPr>' +
		' </p:titleStyle>' +
		' <p:bodyStyle>' +
		'  <a:lvl1pPr marL="342900" indent="-342900" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="3200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>' +
		'  <a:lvl2pPr marL="742950" indent="-285750" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="–"/><a:defRPr sz="2800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>' +
		'  <a:lvl3pPr marL="1143000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2400" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>' +
		'  <a:lvl4pPr marL="1600200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="–"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>' +
		'  <a:lvl5pPr marL="2057400" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="»"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>' +
		'  <a:lvl6pPr marL="2514600" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>' +
		'  <a:lvl7pPr marL="2971800" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>' +
		'  <a:lvl8pPr marL="3429000" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>' +
		'  <a:lvl9pPr marL="3886200" indent="-228600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:spcBef><a:spcPct val="20000"/></a:spcBef><a:buFont typeface="Arial" pitchFamily="34" charset="0"/><a:buChar char="•"/><a:defRPr sz="2000" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr>' +
		' </p:bodyStyle>' +
		' <p:otherStyle>' +
		'  <a:defPPr><a:defRPr lang="en-US"/></a:defPPr>' +
		'  <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr>' +
		'  <a:lvl2pPr marL="457200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl2pPr>' +
		'  <a:lvl3pPr marL="914400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl3pPr>' +
		'  <a:lvl4pPr marL="1371600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl4pPr>' +
		'  <a:lvl5pPr marL="1828800" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl5pPr>' +
		'  <a:lvl6pPr marL="2286000" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl6pPr>' +
		'  <a:lvl7pPr marL="2743200" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl7pPr>' +
		'  <a:lvl8pPr marL="3200400" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl8pPr>' +
		'  <a:lvl9pPr marL="3657600" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl9pPr>' +
		' </p:otherStyle>' +
		'</p:txStyles>'
	strXml += '</p:sldMaster>'

	return strXml
}

/**
 * Generates XML string for a slide layout relation file
 * @param {number} layoutNumber - 1-indexed number of a layout that relations are generated for
 * @param {SlideLayout[]} slideLayouts - Slide Layouts
 * @return {string} XML
 */
export function makeXmlSlideLayoutRel(layoutNumber: number, slideLayouts: SlideLayout[]): string {
	return slideObjectRelationsToXml(slideLayouts[layoutNumber - 1], [
		{
			target: '../slideMasters/slideMaster1.xml',
			type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster',
		},
	])
}

/**
 * Creates `ppt/_rels/slide*.xml.rels`
 * @param {PresSlide[]} slides
 * @param {SlideLayout[]} slideLayouts - Slide Layout(s)
 * @param {number} `slideNumber` 1-indexed number of a layout that relations are generated for
 * @return {string} XML
 */
export function makeXmlSlideRel(slides: PresSlide[], slideLayouts: SlideLayout[], slideNumber: number): string {
	return slideObjectRelationsToXml(slides[slideNumber - 1], [
		{
			target: `../slideLayouts/slideLayout${getLayoutIdxForSlide(slides, slideLayouts, slideNumber)}.xml`,
			type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
		},
		{
			target: `../notesSlides/notesSlide${slideNumber}.xml`,
			type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide',
		},
	])
}

/**
 * Generates XML string for a slide relation file.
 * @param {number} slideNumber - 1-indexed number of a layout that relations are generated for
 * @return {string} XML
 */
export function makeXmlNotesSlideRel(slideNumber: number): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
		<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
			<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
			<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideNumber}.xml"/>
		</Relationships>`
}

/**
 * Creates `ppt/slideMasters/_rels/slideMaster1.xml.rels`
 * @param {PresSlide} masterSlide - Slide object
 * @param {SlideLayout[]} slideLayouts - Slide Layouts
 * @return {string} XML
 */
export function makeXmlMasterRel(masterSlide: PresSlide, slideLayouts: SlideLayout[]): string {
	const defaultRels = slideLayouts.map((_layoutDef, idx) => ({
		target: `../slideLayouts/slideLayout${idx + 1}.xml`,
		type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout',
	}))
	defaultRels.push({ target: '../theme/theme1.xml', type: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme' })

	return slideObjectRelationsToXml(masterSlide, defaultRels)
}

/**
 * Creates `ppt/notesMasters/_rels/notesMaster1.xml.rels`
 * @return {string} XML
 */
export function makeXmlNotesMasterRel(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
		<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
		</Relationships>`
}

/**
 * For the passed slide number, resolves name of a layout that is used for.
 * @param {PresSlide[]} slides - srray of slides
 * @param {SlideLayout[]} slideLayouts - array of slideLayouts
 * @param {number} slideNumber
 * @return {number} slide number
 */
function getLayoutIdxForSlide(slides: PresSlide[], slideLayouts: SlideLayout[], slideNumber: number): number {
	const rawSlideLayoutNumber = (slides[slideNumber - 1] as PresSlide & { _rawSlideLayoutNumber?: number })._rawSlideLayoutNumber
	if (rawSlideLayoutNumber && rawSlideLayoutNumber > 0) return rawSlideLayoutNumber

	for (let i = 0; i < slideLayouts.length; i++) {
		if (slideLayouts[i]._name === slides[slideNumber - 1]._slideLayout._name) {
			return i + 1
		}
	}

	// IMPORTANT: Return 1 (for `slideLayout1.xml`) when no def is found
	// So all objects are in Layout1 and every slide that references it uses this layout.
	return 1
}

// XML-GEN: Last 5 functions create root /ppt files

/**
 * Creates `ppt/theme/theme1.xml`
 * @return {string} XML
 */
export function makeXmlTheme(pres: IPresentationProps): string {
	const majorFont = pres.theme?.headFontFace ? `<a:latin typeface="${pres.theme?.headFontFace}"/>` : '<a:latin typeface="Calibri Light" panose="020F0302020204030204"/>'
	const minorFont = pres.theme?.bodyFontFace ? `<a:latin typeface="${pres.theme?.bodyFontFace}"/>` : '<a:latin typeface="Calibri" panose="020F0502020204030204"/>'
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme"><a:themeElements><a:clrScheme name="Office"><a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2><a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2><a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4><a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6><a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink></a:clrScheme><a:fontScheme name="Office"><a:majorFont>${majorFont}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック Light"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="等线 Light"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Times New Roman"/><a:font script="Hebr" typeface="Times New Roman"/><a:font script="Thai" typeface="Angsana New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="MoolBoran"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Times New Roman"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/><a:font script="Armn" typeface="Arial"/><a:font script="Bugi" typeface="Leelawadee UI"/><a:font script="Bopo" typeface="Microsoft JhengHei"/><a:font script="Java" typeface="Javanese Text"/><a:font script="Lisu" typeface="Segoe UI"/><a:font script="Mymr" typeface="Myanmar Text"/><a:font script="Nkoo" typeface="Ebrima"/><a:font script="Olck" typeface="Nirmala UI"/><a:font script="Osma" typeface="Ebrima"/><a:font script="Phag" typeface="Phagspa"/><a:font script="Syrn" typeface="Estrangelo Edessa"/><a:font script="Syrj" typeface="Estrangelo Edessa"/><a:font script="Syre" typeface="Estrangelo Edessa"/><a:font script="Sora" typeface="Nirmala UI"/><a:font script="Tale" typeface="Microsoft Tai Le"/><a:font script="Talu" typeface="Microsoft New Tai Lue"/><a:font script="Tfng" typeface="Ebrima"/></a:majorFont><a:minorFont>${minorFont}<a:ea typeface=""/><a:cs typeface=""/><a:font script="Jpan" typeface="游ゴシック"/><a:font script="Hang" typeface="맑은 고딕"/><a:font script="Hans" typeface="等线"/><a:font script="Hant" typeface="新細明體"/><a:font script="Arab" typeface="Arial"/><a:font script="Hebr" typeface="Arial"/><a:font script="Thai" typeface="Cordia New"/><a:font script="Ethi" typeface="Nyala"/><a:font script="Beng" typeface="Vrinda"/><a:font script="Gujr" typeface="Shruti"/><a:font script="Khmr" typeface="DaunPenh"/><a:font script="Knda" typeface="Tunga"/><a:font script="Guru" typeface="Raavi"/><a:font script="Cans" typeface="Euphemia"/><a:font script="Cher" typeface="Plantagenet Cherokee"/><a:font script="Yiii" typeface="Microsoft Yi Baiti"/><a:font script="Tibt" typeface="Microsoft Himalaya"/><a:font script="Thaa" typeface="MV Boli"/><a:font script="Deva" typeface="Mangal"/><a:font script="Telu" typeface="Gautami"/><a:font script="Taml" typeface="Latha"/><a:font script="Syrc" typeface="Estrangelo Edessa"/><a:font script="Orya" typeface="Kalinga"/><a:font script="Mlym" typeface="Kartika"/><a:font script="Laoo" typeface="DokChampa"/><a:font script="Sinh" typeface="Iskoola Pota"/><a:font script="Mong" typeface="Mongolian Baiti"/><a:font script="Viet" typeface="Arial"/><a:font script="Uigh" typeface="Microsoft Uighur"/><a:font script="Geor" typeface="Sylfaen"/><a:font script="Armn" typeface="Arial"/><a:font script="Bugi" typeface="Leelawadee UI"/><a:font script="Bopo" typeface="Microsoft JhengHei"/><a:font script="Java" typeface="Javanese Text"/><a:font script="Lisu" typeface="Segoe UI"/><a:font script="Mymr" typeface="Myanmar Text"/><a:font script="Nkoo" typeface="Ebrima"/><a:font script="Olck" typeface="Nirmala UI"/><a:font script="Osma" typeface="Ebrima"/><a:font script="Phag" typeface="Phagspa"/><a:font script="Syrn" typeface="Estrangelo Edessa"/><a:font script="Syrj" typeface="Estrangelo Edessa"/><a:font script="Syre" typeface="Estrangelo Edessa"/><a:font script="Sora" typeface="Nirmala UI"/><a:font script="Tale" typeface="Microsoft Tai Le"/><a:font script="Talu" typeface="Microsoft New Tai Lue"/><a:font script="Tfng" typeface="Ebrima"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:lumMod val="110000"/><a:satMod val="105000"/><a:tint val="67000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="103000"/><a:tint val="73000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="105000"/><a:satMod val="109000"/><a:tint val="81000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:satMod val="103000"/><a:lumMod val="102000"/><a:tint val="94000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:satMod val="110000"/><a:lumMod val="100000"/><a:shade val="100000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:lumMod val="99000"/><a:satMod val="120000"/><a:shade val="78000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:fillStyleLst><a:lnStyleLst><a:ln w="6350" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="12700" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln><a:ln w="19050" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/><a:miter lim="800000"/></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst><a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0"><a:srgbClr val="000000"><a:alpha val="63000"/></a:srgbClr></a:outerShdw></a:effectLst></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"><a:tint val="95000"/><a:satMod val="170000"/></a:schemeClr></a:solidFill><a:gradFill rotWithShape="1"><a:gsLst><a:gs pos="0"><a:schemeClr val="phClr"><a:tint val="93000"/><a:satMod val="150000"/><a:shade val="98000"/><a:lumMod val="102000"/></a:schemeClr></a:gs><a:gs pos="50000"><a:schemeClr val="phClr"><a:tint val="98000"/><a:satMod val="130000"/><a:shade val="90000"/><a:lumMod val="103000"/></a:schemeClr></a:gs><a:gs pos="100000"><a:schemeClr val="phClr"><a:shade val="63000"/><a:satMod val="120000"/></a:schemeClr></a:gs></a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/><a:extLst><a:ext uri="{05A4C25C-085E-4340-85A3-A5531E510DB2}"><thm15:themeFamily xmlns:thm15="http://schemas.microsoft.com/office/thememl/2012/main" name="Office Theme" id="{62F939B6-93AF-4DB8-9C6B-D6C7DFDC589F}" vid="{4A3C46E8-61CC-4603-A589-7422A47A8E4A}"/></a:ext></a:extLst></a:theme>`
}

/**
 * Create presentation file (`ppt/presentation.xml`)
 * @see https://docs.microsoft.com/en-us/office/open-xml/structure-of-a-presentationml-document
 * @see http://www.datypic.com/sc/ooxml/t-p_CT_Presentation.html
 * @param {IPresentationProps} pres - presentation
 * @return {string} XML
 */
export function makeXmlPresentation(pres: IPresentationProps): string {
	const masters = normalizeRawSlideMasterRefs((pres as IPresentationProps & { _rawSlideMasters?: RawSlideMasterRef[] })._rawSlideMasters)
	const rawPresentationFonts = normalizeRawPresentationFonts((pres as IPresentationProps & { _rawPresentationFonts?: RawPresentationFont[] })._rawPresentationFonts)
	const rawDefaultTextStyleXml = (pres as IPresentationProps & { _rawDefaultTextStyleXml?: string })._rawDefaultTextStyleXml
	const master1Id = masters.find(master => master.target === 'slideMasters/slideMaster1.xml')?.id || '2147483648'
	let strXml =
		`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}` +
		'<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
		`xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ${pres.rtlMode ? 'rtl="1"' : ''} saveSubsetFonts="1" autoCompressPictures="0">`

	// STEP 1: Add slide master (SPEC: tag 1 under <presentation>)
	strXml += `<p:sldMasterIdLst><p:sldMasterId id="${master1Id}" r:id="rId1"/>`
	masters
		.filter(master => master.target !== 'slideMasters/slideMaster1.xml')
		.forEach((master, idx) => {
			strXml += `<p:sldMasterId id="${master.id || 2147483648 + idx + 1}" r:id="rId${getAdditionalRawSlideMasterRid(pres.slides.length, idx)}"/>`
		})
	strXml += '</p:sldMasterIdLst>'

	// STEP 2: Add all Slides (SPEC: tag 3 under <presentation>)
	strXml += '<p:sldIdLst>'
	pres.slides.forEach(slide => (strXml += `<p:sldId id="${slide._slideId}" r:id="rId${slide._rId}"/>`))
	strXml += '</p:sldIdLst>'

	// STEP 3: Add Notes Master (SPEC: tag 2 under <presentation>)
	// (NOTE: length+2 is from `presentation.xml.rels` func (since we have to match this rId, we just use same logic))
	// IMPORTANT: In this order (matches PPT2019) PPT will give corruption message on open!
	// IMPORTANT: Placing this before `<p:sldIdLst>` causes warning in modern powerpoint!
	// IMPORTANT: Presentations open without warning Without this line, however, the pres isnt preview in Finder anymore or viewable in iOS!
	strXml += `<p:notesMasterIdLst><p:notesMasterId r:id="rId${pres.slides.length + 2}"/></p:notesMasterIdLst>`

	// STEP 4: Add sizes
	strXml += `<p:sldSz cx="${pres.presLayout.width}" cy="${pres.presLayout.height}"/>`
	strXml += `<p:notesSz cx="${pres.presLayout.height}" cy="${pres.presLayout.width}"/>`

	const fontRelByTarget = new Map(getRawPresentationFontRelations(pres.slides.length, masters, rawPresentationFonts).map(rel => [rel.target, rel.rId]))
	if (rawPresentationFonts.length > 0 && fontRelByTarget.size > 0) {
		strXml += '<p:embeddedFontLst>'
		rawPresentationFonts.forEach(font => {
			strXml += `<p:embeddedFont><p:font typeface="${encodeXmlEntities(font.typeface || '')}"/>`
			;[
				['regular', 'regular'],
				['bold', 'bold'],
				['italic', 'italic'],
				['boldItalic', 'boldItalic'],
			].forEach(([style, tagName]) => {
				const target = font[style as keyof RawPresentationFont]
				const rId = target ? fontRelByTarget.get(target) : null
				if (rId) strXml += `<p:${tagName} r:id="${rId}"/>`
			})
			strXml += '</p:embeddedFont>'
		})
		strXml += '</p:embeddedFontLst>'
	}

	// STEP 5: Add text styles
	if (rawDefaultTextStyleXml) {
		strXml += rawDefaultTextStyleXml
	} else {
		strXml += '<p:defaultTextStyle>'
		for (let idy = 1; idy < 10; idy++) {
			strXml +=
				`<a:lvl${idy}pPr marL="${(idy - 1) * 457200}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">` +
				'<a:defRPr sz="1800" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>' +
				`</a:defRPr></a:lvl${idy}pPr>`
		}
		strXml += '</p:defaultTextStyle>'
	}

	// STEP 6: Add Sections (if any)
	if (pres.sections && pres.sections.length > 0) {
		strXml += '<p:extLst><p:ext uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}">'
		strXml += '<p14:sectionLst xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main">'
		pres.sections.forEach(sect => {
			strXml += `<p14:section name="${encodeXmlEntities(sect.title)}" id="{${getUuid('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')}}"><p14:sldIdLst>`
			sect._slides.forEach(slide => (strXml += `<p14:sldId id="${slide._slideId}"/>`))
			strXml += '</p14:sldIdLst></p14:section>'
		})
		strXml += '</p14:sectionLst></p:ext>'
		strXml += '<p:ext uri="{EFAFB233-063F-42B5-8137-9DF3F51BA10A}"><p15:sldGuideLst xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"/></p:ext>'
		strXml += '</p:extLst>'
	}

	// Done
	strXml += '</p:presentation>'
	return strXml
}

/**
 * Create `ppt/presProps.xml`
 * @return {string} XML
 */
export function makeXmlPresProps(pres?: IPresentationProps): string {
	const settings = pres?.showSettings
	if (!settings) {
		return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`
	}

	const attr = [
		settings.showNarration !== undefined ? `showNarration="${settings.showNarration ? 1 : 0}"` : '',
		settings.showAnimation !== undefined ? `showAnimation="${settings.showAnimation ? 1 : 0}"` : '',
		settings.useTimings !== undefined ? `useTimings="${settings.useTimings ? 1 : 0}"` : '',
		settings.loop !== undefined ? `loop="${settings.loop ? 1 : 0}"` : '',
	].filter(Boolean).join(' ')
	const showPrAttr = attr ? ` ${attr}` : ''
	const mode = settings.mode === 'browse'
		? '<p:browse/>'
		: settings.mode === 'kiosk'
			? `<p:kiosk restart="${Math.max(0, Math.round(settings.restartMs || 300000))}"/>`
			: '<p:present/>'
	const mediaControls = settings.showMediaControls === false
		? ''
		: '<p:extLst><p:ext uri="{2FDB2607-1784-4EEB-B798-7EB5836EED8A}"><p14:showMediaCtrls xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main" val="1"/></p:ext></p:extLst>'

	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:presentationPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:showPr${showPrAttr}>${mode}<p:sldAll/>${mediaControls}</p:showPr></p:presentationPr>`
}

/**
 * Create `ppt/tableStyles.xml`
 * @see: http://openxmldeveloper.org/discussions/formats/f/13/p/2398/8107.aspx
 * @return {string} XML
 */
export function makeXmlTableStyles(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`
}

/**
 * Creates `ppt/viewProps.xml`
 * @return {string} XML
 */
export function makeXmlViewProps(): string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${CRLF}<p:viewPr xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:normalViewPr horzBarState="maximized"><p:restoredLeft sz="15611"/><p:restoredTop sz="94610"/></p:normalViewPr><p:slideViewPr><p:cSldViewPr snapToGrid="0" snapToObjects="1"><p:cViewPr varScale="1"><p:scale><a:sx n="136" d="100"/><a:sy n="136" d="100"/></p:scale><p:origin x="216" y="312"/></p:cViewPr><p:guideLst/></p:cSldViewPr></p:slideViewPr><p:notesTextViewPr><p:cViewPr><p:scale><a:sx n="1" d="1"/><a:sy n="1" d="1"/></p:scale><p:origin x="0" y="0"/></p:cViewPr></p:notesTextViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`
}

/**
 * Checks shadow options passed by user and performs corrections if needed.
 * @param {ShadowProps} shadowProps - shadow options
 */
export function correctShadowOptions(shadowProps: ShadowProps): void {
	if (!shadowProps || typeof shadowProps !== 'object') {
		// console.warn("`shadow` options must be an object. Ex: `{shadow: {type:'none'}}`")
		return
	}

	// OPT: `type`
	if (shadowProps.type !== 'outer' && shadowProps.type !== 'inner' && shadowProps.type !== 'none') {
		console.warn('Warning: shadow.type options are `outer`, `inner` or `none`.')
		shadowProps.type = 'outer'
	}

	// OPT: `angle`
	if (shadowProps.angle) {
		// A: REALITY-CHECK
		if (isNaN(Number(shadowProps.angle)) || shadowProps.angle < 0 || shadowProps.angle > 359) {
			console.warn('Warning: shadow.angle can only be 0-359')
			shadowProps.angle = 270
		}

		// B: ROBUST: Cast any type of valid arg to int: '12', 12.3, etc. -> 12
		shadowProps.angle = Math.round(Number(shadowProps.angle))
	}

	// OPT: `opacity`
	if (shadowProps.opacity !== undefined && shadowProps.opacity !== null) {
		const opacity = Number(shadowProps.opacity)
		if (!Number.isFinite(opacity)) {
			console.warn('Warning: shadow.opacity can only be 0-1 or 0-100')
			shadowProps.opacity = 0.75
		} else {
			if (opacity < 0 || opacity > 100) console.warn('Warning: shadow.opacity can only be 0-1 or 0-100. Value was clamped.')
			shadowProps.opacity = Math.max(0, Math.min(1, opacity > 1 ? opacity / 100 : opacity))
		}
	}
}
