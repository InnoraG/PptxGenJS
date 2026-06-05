import type { FeatureBudget } from './types.js'

export type TablePresetMode = 'native-table' | 'visual-adapted' | 'preserve-only'

export interface TableStyleOptions {
	headerRow?: boolean
	totalRow?: boolean
	bandedRows?: boolean
	firstColumn?: boolean
	lastColumn?: boolean
	bandedColumns?: boolean
	tableStyleId?: string
}

export interface TablePreset {
	id: string
	title: string
	powerPointCategory: string
	powerPointPreset: string
	authoringMode: TablePresetMode
	tableIntent: string
	dataShape: string
	requiredStructure: string[]
	useWhen: string[]
	avoidWhen: string[]
	tags: string[]
	tableStyleOptions: TableStyleOptions
	optionDefaults: Record<string, unknown>
	cellStyleRecipe: Record<string, unknown>
	layoutGuardrails: Record<string, unknown>
	sampleRows: unknown[][]
	fidelityNote: string
	rank: number
}

export interface RecommendedTablePreset {
	preset: TablePreset
	score: number
	selectionReason: string[]
}

export const DEFAULT_POWERPOINT_TABLE_STYLE_ID = '{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}'

export const POWERPOINT_TABLE_STYLE_OPTIONS = [
	'headerRow',
	'totalRow',
	'bandedRows',
	'firstColumn',
	'lastColumn',
	'bandedColumns',
]

const SAMPLE_METRICS = [
	['Metric', 'Current', 'Target', 'Status'],
	['Revenue', '$42.8M', '$40.0M', 'Ahead'],
	['Retention', '94%', '92%', 'Ahead'],
	['Pipeline', '$118M', '$125M', 'Watch'],
]

const SAMPLE_FINANCE = [
	['Line Item', 'Plan', 'Actual', 'Variance'],
	['Revenue', '$40.0M', '$42.8M', '+$2.8M'],
	['Gross Margin', '61%', '63%', '+2 pts'],
	['Total', '$24.4M', '$27.0M', '+$2.6M'],
]

const SAMPLE_MATRIX = [
	['Capability', 'Now', 'Next', 'Owner'],
	['Data', 'Strong', 'Expand', 'Platform'],
	['Design', 'Good', 'Automate', 'Product'],
	['Launch', 'Watch', 'Recover', 'GTM'],
]

const STANDARD_SLIDE_GUARDRAILS = {
	safeArea: { x: 0.55, y: 0.95, w: 12.2, h: 5.65 },
	edgePaddingIn: 0.35,
	shadowPaddingIn: 0.12,
	maxTotalVisualWidthIn: 12.0,
	requirePreflight: [
		'Before slide.add_table, ensure table x + w + shadowPaddingIn is <= slideWidth - edgePaddingIn.',
		'If a side panel or labels are added beside the table, reserve that width before computing table w.',
		'Ensure sum(colW) matches table w and no column is below the preset minimum.',
		'Prefer shorter labels or lower fontSize before allowing text to wrap in narrow KPI/status columns.',
	],
}

const NO_FLOATING_OVERLAY_POLICY = {
	overlayPolicy: 'Use overlays only when their x/y/w/h are computed from a named table cell or merged-cell span. Do not place decorative callouts by eye.',
	cellAnchorFormula: 'x = table.x + sum(colW before startCol) + inset; y = table.y + headerRowH + sum(rowH before startRow) + inset; w = sum(spanned colW) - 2*inset; h = sum(spanned rowH) - 2*inset.',
	avoid: ['free-floating badges that appear unrelated to a row or column', 'overlays that duplicate text already inside the table cell'],
}

export const TABLE_PRESET_CATALOG: TablePreset[] = [
	{
		id: 'executive-kpi-scorecard',
		title: 'Executive KPI scorecard',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Medium accent with Header Row, First Column, and Banded Rows',
		authoringMode: 'visual-adapted',
		tableIntent: 'executive status summary',
		dataShape: 'metrics with current value, target, and status',
		requiredStructure: ['header row', 'first column labels', 'status column'],
		useWhen: ['Summarize KPIs for an operating review, board update, or leadership dashboard.', 'Use when the table needs to look premium without becoming a chart.'],
		avoidWhen: ['Avoid for raw exports with more than about ten rows.'],
		tags: ['executive', 'dashboard', 'kpi', 'scorecard', 'status', 'premium', 'beautiful', 'bandedRows', 'firstColumn'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, bandedRows: true, firstColumn: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 10, color: '172033', fill: { color: 'F7FAFC' }, border: { type: 'solid', color: 'D6DEE8', pt: 0.6 }, margin: 0.08 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '1E3A5F' } },
			firstColumn: { bold: true, color: '0F172A', fill: { color: 'E6F0FF' } },
			bandedRows: [{ fill: { color: 'FFFFFF' } }, { fill: { color: 'F3F7FB' } }],
			statusGood: { bold: true, color: '0F5132', fill: { color: 'DDF8E8' } },
			statusWatch: { bold: true, color: '7A4B00', fill: { color: 'FFF1C2' } },
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 6,
			maxColumns: 6,
			minColumnWidthIn: 0.95,
			preferredTableBox: { x: 0.7, y: 1.35, w: 11.0, h: 4.25 },
			sidePanelPolicy: 'Avoid a right side panel when the KPI table has 6 columns. Put the signal strip below the table or reduce the table to 4 columns.',
			textFitPolicy: 'Use <= 9 pt body text for 6-column scorecards and keep status labels to one or two words.',
			overflowRisk: ['side panels beside 6-column KPI tables', 'long owner/status labels', 'extra labels placed near the right slide edge'],
		},
		sampleRows: SAMPLE_METRICS,
		fidelityNote: 'Uses native table geometry plus deterministic cell styling. The tableStyleId/conditional flags mirror PowerPoint Table Design options; the recipe adds reliable premium visual fidelity.',
		rank: 1,
	},
	{
		id: 'financial-variance-total',
		title: 'Financial variance table',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Header Row, Total Row, First Column, and Banded Rows',
		authoringMode: 'visual-adapted',
		tableIntent: 'financial plan versus actual variance',
		dataShape: 'numeric rows with subtotal or total row',
		requiredStructure: ['header row', 'numeric columns', 'total row'],
		useWhen: ['Show plan, actual, and variance in finance, sales, or operations reviews.', 'Use when a final total row must be visually anchored.'],
		avoidWhen: ['Avoid when the variance is better shown as a waterfall chart.'],
		tags: ['finance', 'financial', 'variance', 'budget', 'actual', 'totalRow', 'numeric', 'executive', 'premium'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, totalRow: true, bandedRows: true, firstColumn: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 9.5, color: '1F2937', fill: { color: 'FBFCFE' }, border: { type: 'solid', color: 'D9E2EC', pt: 0.55 }, margin: 0.07 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '264653' }, align: 'right' },
			firstColumn: { bold: true, align: 'left', color: '102A43' },
			numeric: { align: 'right' },
			totalRow: { bold: true, color: 'FFFFFF', fill: { color: '2A6F6F' }, border: { type: 'solid', color: '194D4D', pt: 0.8 } },
			positiveVariance: { color: '116149' },
			negativeVariance: { color: 'A61B1B' },
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 8,
			maxColumns: 6,
			minColumnWidthIn: 0.85,
			preferredTableBox: { x: 0.7, y: 1.35, w: 9.0, h: 4.55 },
			sidePanelPolicy: 'A compact variance lens may sit to the right only when the table width is <= 9.2 in.',
			textFitPolicy: 'Right-align numeric columns and keep action labels short; move commentary below the table.',
			overflowRisk: ['currency labels plus action prose in one row', 'wide side panel with more than six table columns'],
		},
		sampleRows: SAMPLE_FINANCE,
		fidelityNote: 'Designed for numbers: right-aligned numeric columns, a strong total row, and subtle banding that survives light backgrounds.',
		rank: 2,
	},
	{
		id: 'roadmap-status-lanes',
		title: 'Roadmap status lanes',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Header Row, First Column, Last Column, and Banded Rows',
		authoringMode: 'visual-adapted',
		tableIntent: 'roadmap or delivery status',
		dataShape: 'workstreams with milestones, dates, owners, and status',
		requiredStructure: ['header row', 'workstream labels', 'owner or status column'],
		useWhen: ['Track product, GTM, migration, or transformation roadmap status.', 'Use when names, dates, and accountable owners matter more than a Gantt chart.'],
		avoidWhen: ['Avoid for precise schedule dependencies; use a timeline or process diagram.'],
		tags: ['roadmap', 'status', 'delivery', 'project', 'owner', 'timeline', 'firstColumn', 'lastColumn', 'bandedRows'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, bandedRows: true, firstColumn: true, lastColumn: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 9.5, color: '253041', fill: { color: 'FFFFFF' }, border: { type: 'solid', color: 'CBD5E1', pt: 0.55 }, margin: 0.07 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '334155' } },
			firstColumn: { bold: true, color: '0F172A', fill: { color: 'E0F2FE' } },
			lastColumn: { bold: true, color: '0F172A', fill: { color: 'FDE68A' } },
			bandedRows: [{ fill: { color: 'FFFFFF' } }, { fill: { color: 'F8FAFC' } }],
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			...NO_FLOATING_OVERLAY_POLICY,
			maxRows: 6,
			maxColumns: 6,
			minColumnWidthIn: 1.05,
			preferredTableBox: { x: 0.65, y: 1.35, w: 12.0, h: 4.35 },
			meaning: 'A lane is one workstream row. Time or phase columns show when work happens. The last column carries the executive status.',
			overlayUse: 'Use a chip only to highlight a specific milestone span, and place it inside that cell/span using the cellAnchorFormula.',
			textFitPolicy: 'If the label needs more than three words, put it in the cell text instead of an overlay chip.',
			overflowRisk: ['chips placed at approximate coordinates', 'decorative badges that are not tied to a lane row or phase column'],
		},
		sampleRows: [
			['Workstream', 'Milestone', 'Date', 'Owner', 'Status'],
			['Platform', 'Pilot ready', 'Jun 18', 'Eng', 'On track'],
			['Sales', 'Enablement', 'Jul 02', 'GTM', 'Watch'],
			['Support', 'Playbooks', 'Jul 12', 'CX', 'On track'],
		],
		fidelityNote: 'Optimized for scanning: emphasized workstream and status columns match the First Column and Last Column ribbon options.',
		rank: 3,
	},
	{
		id: 'feature-comparison-matrix',
		title: 'Feature comparison matrix',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Header Row, First Column, and Banded Columns',
		authoringMode: 'visual-adapted',
		tableIntent: 'side-by-side comparison',
		dataShape: 'features or criteria across products, plans, or options',
		requiredStructure: ['header row', 'first column labels', 'comparable option columns'],
		useWhen: ['Compare vendors, packages, pricing tiers, or feature coverage.', 'Use when columns are the primary comparison axis.'],
		avoidWhen: ['Avoid for long prose; convert to grouped cards or a summary table.'],
		tags: ['comparison', 'matrix', 'feature', 'pricing', 'vendor', 'bandedColumns', 'firstColumn', 'product'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, firstColumn: true, bandedColumns: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 9.5, color: '111827', fill: { color: 'FFFFFF' }, border: { type: 'solid', color: 'D7DEE8', pt: 0.55 }, margin: 0.06 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '3B3F8C' }, align: 'center' },
			firstColumn: { bold: true, color: '111827', fill: { color: 'EEF2FF' } },
			bandedColumns: [{ fill: { color: 'FFFFFF' } }, { fill: { color: 'F5F3FF' } }],
			bestColumn: { bold: true, fill: { color: 'DCFCE7' } },
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 7,
			maxColumns: 5,
			minColumnWidthIn: 1.25,
			preferredTableBox: { x: 0.7, y: 1.35, w: 11.5, h: 4.4 },
			sidePanelPolicy: 'Do not add a side panel; use a highlighted recommended column inside the matrix.',
			textFitPolicy: 'Keep compared option labels short and use symbols or one-word states in body cells.',
			overflowRisk: ['long prose inside comparable option columns', 'extra legend beside a full-width matrix'],
		},
		sampleRows: [
			['Capability', 'Core', 'Pro', 'Enterprise'],
			['Automation', 'Basic', 'Advanced', 'Advanced'],
			['Governance', 'Limited', 'Standard', 'Full'],
			['Support', 'Email', 'Priority', 'Dedicated'],
		],
		fidelityNote: 'Banded columns reflect the PowerPoint ribbon variant and improve comparison across tiers.',
		rank: 4,
	},
	{
		id: 'risk-heatmap-matrix',
		title: 'Risk heatmap matrix',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Header Row and First Column with contextual cell fills',
		authoringMode: 'visual-adapted',
		tableIntent: 'risk, priority, or maturity heatmap',
		dataShape: 'matrix with qualitative or scored cells',
		requiredStructure: ['header row', 'first column labels', 'cell-level scores'],
		useWhen: ['Show risk exposure, maturity, priority, readiness, or coverage by domain.', 'Use when cell color carries meaning.'],
		avoidWhen: ['Avoid when exact values need axes and a legend; use a chart.'],
		tags: ['risk', 'heatmap', 'matrix', 'priority', 'maturity', 'coverage', 'cellFill', 'gradient', 'premium'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, firstColumn: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 9, color: '111827', fill: { color: 'FFFFFF' }, border: { type: 'solid', color: 'FFFFFF', pt: 1.0 }, margin: 0.055 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '111827' }, align: 'center' },
			firstColumn: { bold: true, color: '111827', fill: { color: 'E5E7EB' } },
			low: { bold: true, color: '064E3B', fill: { color: 'BBF7D0' } },
			medium: { bold: true, color: '7C2D12', fill: { color: 'FED7AA' } },
			high: { bold: true, color: '7F1D1D', fill: { color: 'FECACA' } },
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 6,
			maxColumns: 6,
			minColumnWidthIn: 0.9,
			preferredTableBox: { x: 0.75, y: 1.35, w: 8.0, h: 4.35 },
			sidePanelPolicy: 'A legend or policy note may sit to the right because heatmap cells are compact; keep the legend <= 3.4 in wide.',
			textFitPolicy: 'Cells should contain short labels, scores, or initials; explanations belong in a legend or note.',
			overflowRisk: ['long risk descriptions inside heatmap cells', 'legend wider than the remaining slide area'],
		},
		sampleRows: SAMPLE_MATRIX,
		fidelityNote: 'Best built as explicit cell fills rather than relying only on a native table style, because the semantic color scale is content-driven.',
		rank: 5,
	},
	{
		id: 'dark-evidence-grid',
		title: 'Dark evidence grid',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Dark accent with Header Row and Banded Rows',
		authoringMode: 'visual-adapted',
		tableIntent: 'evidence grid on a dark slide',
		dataShape: 'proof points, claims, sources, or experiment results',
		requiredStructure: ['header row', 'short evidence rows'],
		useWhen: ['Place compact proof, benchmarks, or validation evidence on a dark presentation surface.', 'Use with product, security, AI, or technical narratives.'],
		avoidWhen: ['Avoid for dense worksheets; dark tables lose readability at small sizes.'],
		tags: ['dark', 'evidence', 'proof', 'technical', 'benchmark', 'validation', 'bandedRows', 'premium'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, bandedRows: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 9.5, color: 'E5E7EB', fill: { color: '111827' }, border: { type: 'solid', color: '334155', pt: 0.65 }, margin: 0.07 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '0F766E' } },
			bandedRows: [{ fill: { color: '111827' } }, { fill: { color: '1F2937' } }],
			accentCell: { bold: true, color: 'A7F3D0' },
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 6,
			maxColumns: 4,
			minColumnWidthIn: 1.35,
			preferredTableBox: { x: 0.85, y: 1.35, w: 10.4, h: 4.2 },
			sidePanelPolicy: 'Use one short source/proof note below the table rather than a side panel on dark slides.',
			textFitPolicy: 'Avoid body text below 9 pt on dark backgrounds.',
			overflowRisk: ['small dark text', 'dense proof prose inside body cells'],
		},
		sampleRows: [
			['Claim', 'Evidence', 'Confidence'],
			['Repair free', '40/40 slides open', 'High'],
			['Media parity', 'All reference hashes present', 'High'],
			['Style gap', 'Comparator flagged 8 slides', 'Watch'],
		],
		fidelityNote: 'Uses high-contrast fills and restrained borders to avoid muddy dark-slide tables.',
		rank: 6,
	},
	{
		id: 'clean-dense-data-grid',
		title: 'Clean dense data grid',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Light grid with Header Row and Banded Rows',
		authoringMode: 'native-table',
		tableIntent: 'dense but readable tabular data',
		dataShape: 'many rows or columns with short values',
		requiredStructure: ['header row', 'repeatable body rows'],
		useWhen: ['Render operational data, extracts, audit tables, or appendix material.', 'Use when legibility matters more than decorative styling.'],
		avoidWhen: ['Avoid for hero-slide storytelling; use a more expressive preset.'],
		tags: ['clean', 'dense', 'audit', 'appendix', 'data', 'grid', 'bandedRows', 'native'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, bandedRows: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 8.5, color: '1F2937', fill: { color: 'FFFFFF' }, border: { type: 'solid', color: 'E2E8F0', pt: 0.45 }, margin: 0.045 },
		cellStyleRecipe: {
			header: { bold: true, color: '111827', fill: { color: 'E5E7EB' } },
			bandedRows: [{ fill: { color: 'FFFFFF' } }, { fill: { color: 'F8FAFC' } }],
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 14,
			maxColumns: 8,
			minColumnWidthIn: 0.72,
			preferredTableBox: { x: 0.55, y: 1.05, w: 12.2, h: 5.65 },
			sidePanelPolicy: 'Never add a side panel to dense grids; preserve all width for data.',
			textFitPolicy: 'Use 7.5-8.5 pt body text only for appendix/data slides, with short values and no wrapped prose.',
			overflowRisk: ['side notes beside dense grids', 'wrapped prose in body cells', 'too many columns without autoPage'],
		},
		sampleRows: [
			['ID', 'Name', 'Owner', 'Due', 'State'],
			['A-101', 'Schema audit', 'Data', 'Jun 08', 'Open'],
			['A-102', 'Visual check', 'Design', 'Jun 10', 'Open'],
			['A-103', 'Package gate', 'Build', 'Jun 12', 'Done'],
		],
		fidelityNote: 'Closest to a classic PowerPoint light table style while staying deterministic through explicit table and cell options.',
		rank: 7,
	},
	{
		id: 'pricing-tier-matrix',
		title: 'Pricing tier matrix',
		powerPointCategory: 'Table Styles',
		powerPointPreset: 'Header Row, First Column, Last Column, and Banded Columns',
		authoringMode: 'visual-adapted',
		tableIntent: 'pricing or package tier comparison',
		dataShape: 'tier columns with features, limits, and a recommended tier',
		requiredStructure: ['header row', 'feature labels', 'tier columns'],
		useWhen: ['Compare plans, service tiers, or packaging options.', 'Use when the preferred tier should stand out.'],
		avoidWhen: ['Avoid when the pricing story needs customer segments or sliders.'],
		tags: ['pricing', 'tiers', 'packages', 'comparison', 'lastColumn', 'bandedColumns', 'premium'],
		tableStyleOptions: { tableStyleId: DEFAULT_POWERPOINT_TABLE_STYLE_ID, headerRow: true, firstColumn: true, lastColumn: true, bandedColumns: true },
		optionDefaults: { fontFace: 'Aptos', fontSize: 9, color: '111827', fill: { color: 'FFFFFF' }, border: { type: 'solid', color: 'E5E7EB', pt: 0.55 }, margin: 0.06 },
		cellStyleRecipe: {
			header: { bold: true, color: 'FFFFFF', fill: { color: '4C1D95' }, align: 'center' },
			firstColumn: { bold: true, color: '111827', fill: { color: 'F3F4F6' } },
			recommendedColumn: { bold: true, color: '111827', fill: { color: 'FEF3C7' } },
			bandedColumns: [{ fill: { color: 'FFFFFF' } }, { fill: { color: 'F5F3FF' } }],
		},
		layoutGuardrails: {
			...STANDARD_SLIDE_GUARDRAILS,
			maxRows: 8,
			maxColumns: 5,
			minColumnWidthIn: 1.2,
			preferredTableBox: { x: 0.7, y: 1.25, w: 11.7, h: 4.75 },
			sidePanelPolicy: 'Highlight the recommended tier as a column, not as a separate callout competing for width.',
			textFitPolicy: 'Use concise feature labels and one-line tier values.',
			overflowRisk: ['feature descriptions longer than one line', 'separate pricing callouts beside the matrix'],
		},
		sampleRows: [
			['Feature', 'Starter', 'Growth', 'Scale'],
			['Seats', '10', '50', 'Unlimited'],
			['Automation', 'Basic', 'Advanced', 'Full'],
			['Support', 'Email', 'Priority', 'Dedicated'],
		],
		fidelityNote: 'The Last Column ribbon variant and recipe highlight make a recommended tier visible without adding extra shapes.',
		rank: 8,
	},
]

const INTENT_TAG_RULES: Array<{ pattern: RegExp, tags: string[], reason: string }> = [
	{ pattern: /\b(kpi|metric|scorecard|executive|dashboard|board|operating review)\b/i, tags: ['kpi', 'scorecard', 'executive', 'dashboard'], reason: 'executive scorecard language' },
	{ pattern: /\b(finance|financial|budget|actual|variance|plan|forecast|revenue|margin|total)\b/i, tags: ['finance', 'variance', 'totalRow', 'numeric'], reason: 'financial table language' },
	{ pattern: /\b(roadmap|status|owner|workstream|milestone|delivery|project|timeline)\b/i, tags: ['roadmap', 'status', 'owner'], reason: 'roadmap/status language' },
	{ pattern: /\b(compare|comparison|matrix|vendor|feature|pricing|tier|package|plan)\b/i, tags: ['comparison', 'matrix', 'pricing'], reason: 'comparison matrix language' },
	{ pattern: /\b(risk|heatmap|priority|maturity|coverage|readiness|score)\b/i, tags: ['risk', 'heatmap', 'maturity'], reason: 'heatmap/matrix language' },
	{ pattern: /\b(dark|technical|evidence|proof|benchmark|validation|security|ai)\b/i, tags: ['dark', 'evidence', 'technical'], reason: 'dark evidence-table language' },
	{ pattern: /\b(dense|appendix|audit|raw|extract|rows|worksheet|data grid)\b/i, tags: ['dense', 'audit', 'grid'], reason: 'dense data-grid language' },
]

function normalizeText(value: unknown): string {
	return String(value || '').toLowerCase()
}

function presetHaystack(preset: TablePreset): string {
	return [
		preset.id,
		preset.title,
		preset.powerPointCategory,
		preset.powerPointPreset,
		preset.authoringMode,
		preset.tableIntent,
		preset.dataShape,
		...preset.requiredStructure,
		...preset.useWhen,
		...preset.tags,
		...Object.keys(preset.tableStyleOptions).filter(key => Boolean((preset.tableStyleOptions as any)[key])),
	].join(' ').toLowerCase()
}

function queryTerms(query: string): string[] {
	const stop = new Set(['and', 'with', 'for', 'the', 'that', 'this', 'into', 'from', 'showing', 'show', 'table', 'tables'])
	return normalizeText(query).split(/[^a-z0-9+-]+/).filter(term => term.length > 2 && !stop.has(term))
}

function inferredTags(query: string): Array<{ tag: string, reason: string }> {
	const out: Array<{ tag: string, reason: string }> = []
	for (const rule of INTENT_TAG_RULES) {
		if (rule.pattern.test(query)) {
			for (const tag of rule.tags) out.push({ tag, reason: rule.reason })
		}
	}
	return out
}

function budgetTags(budget?: Partial<FeatureBudget>): Array<{ tag: string, reason: string }> {
	const tags: Array<{ tag: string, reason: string }> = []
	if (budget?.visualQuality === 'premium' || budget?.visualQuality === 'cinematic' || budget?.visualQuality === 'luxury') {
		tags.push({ tag: 'premium', reason: `${budget.visualQuality} visual quality requested` })
	}
	if (budget?.featureDepth === 'basic' || budget?.visualQuality === 'standard') {
		tags.push({ tag: 'clean', reason: 'simple readable table requested' })
	}
	for (const feature of budget?.requireFeatures || []) {
		const normalized = normalizeText(feature)
		if (normalized.includes('table')) tags.push({ tag: 'premium', reason: `required feature: ${feature}` })
		if (normalized.includes('audit')) tags.push({ tag: 'audit', reason: `required feature: ${feature}` })
	}
	return tags
}

export function tablePresetById(id: string): TablePreset | undefined {
	return TABLE_PRESET_CATALOG.find(preset => preset.id === id)
}

export function listTablePresets(args: any = {}): TablePreset[] {
	const category = normalizeText(args?.category)
	const mode = normalizeText(args?.authoringMode || args?.mode)
	const terms = queryTerms(String(args?.query || ''))
	const limit = Math.max(1, Math.min(Number(args?.limit || TABLE_PRESET_CATALOG.length), TABLE_PRESET_CATALOG.length))
	return TABLE_PRESET_CATALOG
		.filter(preset => !category || normalizeText(preset.powerPointCategory) === category || preset.tags.includes(category))
		.filter(preset => !mode || preset.authoringMode === mode)
		.map(preset => ({ preset, text: presetHaystack(preset) }))
		.filter(item => !terms.length || terms.some(term => item.text.includes(term)))
		.sort((a, b) => a.preset.rank - b.preset.rank || a.preset.id.localeCompare(b.preset.id))
		.map(item => item.preset)
		.slice(0, limit)
}

export function recommendTablePresets(query = '', budget: Partial<FeatureBudget> = {}, args: any = {}): RecommendedTablePreset[] {
	const combinedQuery = [
		query,
		args?.tableIntent,
		args?.intent,
		args?.dataShape,
		args?.category,
		Array.isArray(args?.requireFeatures) ? args.requireFeatures.join(' ') : '',
	].filter(Boolean).join(' ')
	const terms = queryTerms(combinedQuery)
	const tagHints = [...inferredTags(combinedQuery), ...budgetTags(budget)]
	const explicitPreset = args?.tablePresetId ? tablePresetById(String(args.tablePresetId)) : undefined
	const explicitCategory = normalizeText(args?.category)
	const explicitMode = normalizeText(args?.authoringMode || args?.mode)
	const dataShape = normalizeText(args?.dataShape)

	return TABLE_PRESET_CATALOG
		.filter(preset => !explicitPreset || preset.id === explicitPreset.id)
		.filter(preset => !explicitCategory || normalizeText(preset.powerPointCategory) === explicitCategory || preset.tags.includes(explicitCategory))
		.filter(preset => !explicitMode || preset.authoringMode === explicitMode)
		.map(preset => {
			const text = presetHaystack(preset)
			const selectionReason: string[] = []
			let score = combinedQuery ? Math.max(0, 9 - Math.floor(preset.rank / 3)) : Math.max(0, 20 - preset.rank)
			for (const term of terms) {
				if (text.includes(term)) {
					score += term.length > 5 ? 3 : 1
					if (selectionReason.length < 4) selectionReason.push(`matched "${term}"`)
				}
			}
			for (const hint of tagHints) {
				if (preset.tags.includes(hint.tag) || text.includes(hint.tag)) {
					score += 6
					if (!selectionReason.includes(hint.reason)) selectionReason.push(hint.reason)
				}
			}
			if (dataShape && text.includes(dataShape)) {
				score += 8
				selectionReason.push(`fits data shape: ${dataShape}`)
			}
			if (!combinedQuery && ['executive-kpi-scorecard', 'financial-variance-total', 'roadmap-status-lanes', 'feature-comparison-matrix'].includes(preset.id)) {
				score += 8
				selectionReason.push('strong general-purpose table default')
			}
			if (!selectionReason.length) selectionReason.push('balanced contextual table preset')
			return { preset, score, selectionReason }
		})
		.filter(item => item.score > (combinedQuery ? 8 : 0))
		.sort((a, b) => b.score - a.score || a.preset.rank - b.preset.rank || a.preset.id.localeCompare(b.preset.id))
}
