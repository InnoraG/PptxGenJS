// Translate a known private runtime failure into standard presentation findings.
// Do not expose the runtime's object graph, method names, source paths, or brand.
const HEADER = /^(?:PptxGenJS:\s*)?(?:Repair-risk validation|Validation) failed with (\d+) (?:issue\(s\)|off-slide element\(s\)):/i
const MARGIN_RULE = /\.margin must be (?:a |a finite )number or four-number array/i
const TABLE_MARGIN_RULE = /from 0 to 56 in native table-cell margin units/i

export function publicRuntimeValidationError(error) {
	if (!error || typeof error !== 'object') return null
	const message = typeof error.message === 'string' ? error.message : ''
	const header = HEADER.exec(message)
	if (!header) return null
	const issueCount = Number(header[1])
	const issues = []
	for (const line of message.split(/\r?\n/)) {
		const location = /^Slide (\d+)(?: \([^\r\n]*?\))?:\s*(.+)$/.exec(line)
		if (!location) continue
		const slideNumber = Number(location[1])
		if (MARGIN_RULE.test(location[2])) {
			const cell = /\.table\[(\d+)\]\[(\d+)\]\.options\.margin\b/.exec(location[2])
			issues.push({
				code: 'INVALID_MARGIN', severity: 'error', slideIndex: slideNumber - 1, slideNumber,
				objectKind: 'table', field: 'margin',
				...(cell ? { rowIndex: Number(cell[1]), columnIndex: Number(cell[2]) } : {}),
				message: `${cell ? `Table cell at row ${Number(cell[1]) + 1}, column ${Number(cell[2]) + 1}` : 'Table'} margin is invalid for the native table contract. Use a finite number or a four-number [top, right, bottom, left] array.`,
				...(TABLE_MARGIN_RULE.test(location[2]) ? { constraint: { minimum: 0, maximum: 56, arrayLength: 4 } } : {}),
				fix: 'Correct tableOptions.margin or the corresponding cell margin using the public table contract. Table margins and text-box margins do not share the same unit rules. Then rerun dryRun, commit, and quality validation.',
			})
		} else {
			issues.push({ code: 'INVALID_PRESENTATION_VALUE', severity: 'error', slideIndex: slideNumber - 1, slideNumber, message: 'A presentation object has an invalid setting that prevents safe export.', fix: 'Inspect the public specification for this slide, correct invalid native object settings, and rerun dryRun and quality validation.' })
		}
	}
	const allMargins = issues.length > 0 && issues.every(issue => issue.code === 'INVALID_MARGIN')
	return {
		code: 'PRESENTATION_VALIDATION_FAILED',
		message: `Presentation validation failed with ${issueCount} issue(s). ${allMargins ? 'Correct the invalid table margins before exporting.' : 'Correct the invalid presentation settings before exporting.'}`,
		recoverable: true, retry_safe: true, retryable: false, artifact_state: 'not_saved',
		next_actions: [{ type: 'correct_spec', tool: 'betterpptx.deck.generate_from_spec', description: 'Correct the reported settings in the public specification, run dryRun and commit, then run betterpptx.deck.validate_quality again.' }],
		details: { issueCount, reportedIssueCount: issues.length, issues },
		...(typeof error.requestId === 'string' ? { requestId: error.requestId } : {}),
	}
}

export function publicRuntimeValidationMessage(value) {
	return publicRuntimeValidationError({ message: value })?.message || value
}
