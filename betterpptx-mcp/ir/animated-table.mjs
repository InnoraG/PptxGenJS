// First-class animated-table authoring contract.
//
// PowerPoint cannot animate individual cells inside one native p:tbl carrier.
// This module therefore lowers an explicit animated-table request to an
// editable native group whose named row/cell descendants remain independent
// animation and Synergy targets. The representation is never reported as a
// native table and no raster fallback is used.

export const ANIMATED_TABLE_SCHEMA_VERSION = 'betterpptx.animated-table.v1'
export const ANIMATED_TABLE_REPRESENTATION = 'editable-shape-built-animated-table'

const REVEAL_BY = new Set(['row', 'column', 'cell'])
const REVEAL_ORDER = new Set(['forward', 'reverse', 'row-major', 'column-major'])
const REVEAL_TRIGGER = new Set(['withPrevious', 'afterPrevious'])
const ANIMATED_TABLE_KINDS = new Set(['animated-table', 'animatedtable', 'progressive-table', 'row-reveal-table'])
const REVEAL_FIELDS = new Set(['enabled', 'by', 'mode', 'order', 'includeHeader', 'effect', 'trigger', 'startMs', 'staggerMs', 'durationMs'])
const APPEARANCE_FIELDS = new Set(['headerFill', 'rowFill', 'alternateRowFill', 'headerTextColor', 'textColor', 'borderColor', 'fontFace', 'fontSize', 'headerFontSize', 'borderWidth', 'cellMargin'])
const CELL_FIELDS = new Set(['text', 'value', 'label', 'style', 'options'])
const CELL_STYLE_FIELDS = new Set(['fill', 'backgroundColor', 'color', 'fontFace', 'fontSize', 'bold', 'align', 'valign', 'margin', 'fit', 'rowSpan', 'rowspan', 'colSpan', 'colspan'])

function rejectUnknown(value, allowed, path) {
	for (const key of Object.keys(value || {})) if (!allowed.has(key)) throw new Error(`${path}.${key} is not supported by animated-table v1.`)
}

function finite(value, fallback) {
	const number = Number(value)
	return Number.isFinite(number) ? number : fallback
}

function color(value, fallback) {
	const normalized = String(value || '').replace(/^#/, '')
	return /^[0-9a-f]{6}$/i.test(normalized) ? normalized.toUpperCase() : fallback
}

function cellText(value) {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string' || typeof value === 'number') return String(value)
	if (Array.isArray(value)) return value
	if (typeof value === 'object') return value.text ?? value.value ?? value.label ?? ''
	return String(value)
}

function cellStyle(value = {}) {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
	return { ...(value.style || {}), ...(value.options || {}) }
}

function ensureAnimatedTable(block, path) {
	if (!block || typeof block !== 'object' || Array.isArray(block)) throw new Error(`${path} must be an object.`)
	const name = String(block.name || block.objectName || '').trim()
	if (!name) throw new Error(`${path}.name is required.`)
	const rows = Array.isArray(block.rows) ? block.rows : []
	const header = Array.isArray(block.header) ? block.header : null
	if (!rows.length) throw new Error(`${path}.rows must contain at least one data row.`)
	if (rows.length > 50) throw new Error(`${path}.rows supports at most 50 data rows.`)
	const allRows = [...(header ? [header] : []), ...rows]
	if (allRows.some(row => !Array.isArray(row))) throw new Error(`${path}.header and every rows[] entry must be arrays.`)
	const columns = Math.max(0, ...allRows.map(row => row.length))
	if (!columns) throw new Error(`${path} must contain at least one cell.`)
	if (columns > 20) throw new Error(`${path} supports at most 20 columns.`)
	for (const [rowIndex, row] of allRows.entries()) {
		for (const [columnIndex, cell] of row.entries()) {
			if (cell && typeof cell === 'object' && !Array.isArray(cell)) {
				rejectUnknown(cell, CELL_FIELDS, `${path}.${header && rowIndex === 0 ? 'header' : `rows[${rowIndex - (header ? 1 : 0)}]`}[${columnIndex}]`)
				if (cell.style && typeof cell.style === 'object') rejectUnknown(cell.style, CELL_STYLE_FIELDS, `${path}.cell.style`)
				if (cell.options && typeof cell.options === 'object') rejectUnknown(cell.options, CELL_STYLE_FIELDS, `${path}.cell.options`)
			}
			const options = cellStyle(cell)
			if (options.rowSpan > 1 || options.rowspan > 1 || options.colSpan > 1 || options.colspan > 1) {
				throw new Error(`${path}.${header && rowIndex === 0 ? 'header' : `rows[${rowIndex - (header ? 1 : 0)}]`}[${columnIndex}] uses a merged cell. animated-table v1 requires one independently editable shape per cell.`)
			}
		}
	}
	const reveal = block.reveal == null ? {} : block.reveal
	if (!reveal || typeof reveal !== 'object' || Array.isArray(reveal)) throw new Error(`${path}.reveal must be an object or null.`)
	rejectUnknown(reveal, REVEAL_FIELDS, `${path}.reveal`)
	if (block.appearance != null) {
		if (!block.appearance || typeof block.appearance !== 'object' || Array.isArray(block.appearance)) throw new Error(`${path}.appearance must be an object or null.`)
		rejectUnknown(block.appearance, APPEARANCE_FIELDS, `${path}.appearance`)
	}
	if (reveal.by != null && reveal.mode != null && String(reveal.by) !== String(reveal.mode)) throw new Error(`${path}.reveal.by and reveal.mode must agree when both are supplied.`)
	const by = String(reveal.by || reveal.mode || 'row')
	const order = String(reveal.order || (by === 'cell' ? 'row-major' : 'forward'))
	const trigger = String(reveal.trigger || 'withPrevious')
	if (!REVEAL_BY.has(by)) throw new Error(`${path}.reveal.by must be row, column, or cell.`)
	if (!REVEAL_ORDER.has(order)) throw new Error(`${path}.reveal.order must be forward, reverse, row-major, or column-major.`)
	if (!REVEAL_TRIGGER.has(trigger)) throw new Error(`${path}.reveal.trigger must be withPrevious or afterPrevious.`)
	for (const [field, min, max] of [['startMs', 0, 86400000], ['staggerMs', 0, 60000], ['durationMs', 1, 60000]]) {
		if (reveal[field] === undefined) continue
		const value = Number(reveal[field])
		if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${path}.reveal.${field} must be a finite number from ${min} to ${max}.`)
	}
	return { name, rows, header, allRows, columns, reveal: { ...reveal, by, order, trigger } }
}

function appearanceFor(block = {}) {
	const source = { ...(block.style || {}), ...(block.appearance || {}) }
	return {
		headerFill: color(source.headerFill, '172554'),
		rowFill: color(source.rowFill || source.fill?.color, 'FFFFFF'),
		alternateRowFill: color(source.alternateRowFill, 'F1F5F9'),
		headerTextColor: color(source.headerTextColor, 'FFFFFF'),
		textColor: color(source.textColor || source.color, '0F172A'),
		borderColor: color(source.borderColor || source.line?.color, 'CBD5E1'),
		fontFace: String(source.fontFace || 'Aptos'),
		fontSize: Math.max(8, Math.min(72, finite(source.fontSize, 14))),
		headerFontSize: Math.max(8, Math.min(72, finite(source.headerFontSize, finite(source.fontSize, 14)))),
		borderWidth: Math.max(0, Math.min(12, finite(source.borderWidth || source.line?.width, 0.75))),
		cellMargin: Math.max(0, Math.min(0.4, finite(source.cellMargin, 0.08))),
	}
}

function rowAndCellNames(name, hasHeader, dataRowCount, columns) {
	const rows = []
	if (hasHeader) rows.push({ name: `${name}.header`, header: true, dataIndex: null })
	for (let index = 0; index < dataRowCount; index += 1) rows.push({ name: `${name}.row-${index + 1}`, header: false, dataIndex: index })
	return rows.map(row => ({ ...row, cells: Array.from({ length: columns }, (_, columnIndex) => `${row.name}.cell-${columnIndex + 1}`) }))
}

function revealSteps(name, rowRecords, reveal) {
	if (reveal.enabled === false) return []
	const includeHeader = reveal.includeHeader === true
	const eligibleRows = rowRecords.filter(row => includeHeader || !row.header)
	let groups
	if (reveal.by === 'row') groups = eligibleRows.map(row => [row.name])
	else if (reveal.by === 'column') groups = Array.from({ length: rowRecords[0]?.cells.length || 0 }, (_, columnIndex) => eligibleRows.map(row => row.cells[columnIndex]))
	else {
		const rowMajor = eligibleRows.flatMap(row => row.cells.map(cell => [cell]))
		const columnMajor = Array.from({ length: rowRecords[0]?.cells.length || 0 }, (_, columnIndex) => eligibleRows.map(row => [row.cells[columnIndex]])).flat()
		groups = reveal.order === 'column-major' ? columnMajor : rowMajor
	}
	if (reveal.order === 'reverse') groups.reverse()
	const startMs = Math.round(finite(reveal.startMs, 0))
	const staggerMs = Math.round(finite(reveal.staggerMs, 180))
	const durationMs = Math.round(finite(reveal.durationMs, 360))
	const effect = String(reveal.effect || 'fade')
	return groups.map((names, index) => ({
		id: `${name}.reveal-${index + 1}`,
		...(names.length === 1 ? { objectName: names[0] } : { objectNames: names }),
		type: 'entrance', effect,
		trigger: reveal.trigger,
		delayMs: reveal.trigger === 'withPrevious' ? startMs + index * staggerMs : (index === 0 ? startMs : staggerMs),
		durationMs,
	}))
}

function lowerAnimatedTable(block, path) {
	const validated = ensureAnimatedTable(block, path)
	const appearance = appearanceFor(block)
	const records = rowAndCellNames(validated.name, Boolean(validated.header), validated.rows.length, validated.columns)
	const sourceRows = validated.allRows.map(row => Array.from({ length: validated.columns }, (_, index) => row[index] ?? ''))
	// Native group descendants use the public inch-based structural contract.
	// A unit-square child coordinate system preserves proportional layout while
	// keeping every value on the normal inch-to-EMU serialization path. Using a
	// 0..1000 grid here is unsafe because the underlying smart coordinate parser
	// intentionally treats numeric values >= 100 as already-serialized EMUs.
	const rowHeight = 1 / sourceRows.length
	const cellWidth = 1 / validated.columns
	const children = sourceRows.map((row, rowIndex) => {
		const record = records[rowIndex]
		return {
			kind: 'group', name: record.name, objectName: record.name,
			x: 0, y: rowIndex * rowHeight, w: 1, h: rowHeight,
			chOff: { x: 0, y: 0, w: 1, h: 1 }, chExt: { x: 0, y: 0, w: 1, h: 1 },
			children: row.map((cell, columnIndex) => {
				const overrides = cellStyle(cell)
				const fill = color(overrides.fill?.color || overrides.fill || overrides.backgroundColor,
					record.header ? appearance.headerFill : (record.dataIndex % 2 ? appearance.alternateRowFill : appearance.rowFill))
				const textColor = color(overrides.color, record.header ? appearance.headerTextColor : appearance.textColor)
				return {
					kind: 'textShape', name: record.cells[columnIndex], objectName: record.cells[columnIndex], shape: 'rect',
					x: columnIndex * cellWidth, y: 0, w: cellWidth, h: 1,
					text: cellText(cell),
					style: {
						fill: { color: fill },
						line: { color: appearance.borderColor, width: appearance.borderWidth },
						color: textColor,
						fontFace: String(overrides.fontFace || appearance.fontFace),
						fontSize: finite(overrides.fontSize, record.header ? appearance.headerFontSize : appearance.fontSize),
						bold: overrides.bold ?? record.header,
						align: overrides.align || (columnIndex === 0 ? 'left' : 'center'),
						valign: overrides.valign || 'mid',
						margin: overrides.margin ?? appearance.cellMargin,
						fit: overrides.fit || 'shrink',
					},
					altText: `${record.header ? 'Header' : `Row ${record.dataIndex + 1}`}, column ${columnIndex + 1}: ${String(cellText(cell))}`,
				}
			}),
			altText: record.header ? 'Animated table header row.' : `Animated table data row ${record.dataIndex + 1}.`,
		}
	})
	const { header: _header, rows: _rows, reveal: _reveal, appearance: _appearance, tableOptions: _tableOptions, ...rest } = block
	const group = {
		...rest,
		kind: 'group', role: 'animated-table',
		name: validated.name, objectName: validated.name,
		chOff: { x: 0, y: 0, w: 1, h: 1 }, chExt: { x: 0, y: 0, w: 1, h: 1 },
		children,
		animatedTable: {
			schemaVersion: ANIMATED_TABLE_SCHEMA_VERSION,
			requestedKind: 'animated-table',
			representation: ANIMATED_TABLE_REPRESENTATION,
			rowCount: validated.rows.length,
			columnCount: validated.columns,
			header: Boolean(validated.header),
			reveal: validated.reveal,
			interactionTargets: records.map(row => ({ row: row.name, cells: row.cells })),
		},
		altText: block.altText || block.summary || `Animated editable table with ${validated.rows.length} data rows and ${validated.columns} columns.`,
	}
	return { group, timeline: revealSteps(validated.name, records, validated.reveal) }
}

export function expandAnimatedTables(spec = {}) {
	if (!spec || typeof spec !== 'object' || !Array.isArray(spec.slides)) return spec
	let changed = false
	const slides = spec.slides.map((slide, slideIndex) => {
		if (!slide || typeof slide !== 'object' || !Array.isArray(slide.content)) return slide
		const generatedTimeline = []
		const content = slide.content.map((block, blockIndex) => {
			if (!ANIMATED_TABLE_KINDS.has(String(block?.kind || '').toLowerCase())) return block
			changed = true
			const lowered = lowerAnimatedTable(block, `slides[${slideIndex}].content[${blockIndex}]`)
			generatedTimeline.push(...lowered.timeline)
			return lowered.group
		})
		return generatedTimeline.length ? { ...slide, content, timeline: [...(Array.isArray(slide.timeline) ? slide.timeline : []), ...generatedTimeline] } : (content === slide.content ? slide : { ...slide, content })
	})
	return changed ? { ...spec, slides } : spec
}
