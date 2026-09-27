import * as fs from 'node:fs/promises'
import JSZip from 'jszip'
import { DOMParser } from '@xmldom/xmldom'

const METADATA_PARTS = [
	'docProps/core.xml',
	'docProps/app.xml',
	'docProps/custom.xml',
]

const RELATIONSHIP_TARGET_RE = /\bTarget="([^"]+)"/g

const DISCLOSURE_PATTERNS = [
	{ code: 'LOCAL_WINDOWS_PATH', label: 'local Windows path', pattern: /(?:[A-Za-z]:\\|\\\\[^\\/\s]+\\)/ },
	{ code: 'LOCAL_UNIX_PATH', label: 'local Unix path', pattern: /(?:\/Users\/|\/home\/|\/mnt\/|\/var\/|\/tmp\/|\/workspace\/)/i },
	{ code: 'REPO_WORKSPACE_NAME', label: 'repo/workspace name', pattern: /\b(?:MyDoc|PptxGenJS_Claude|betterpptx-mcp)\b/i },
	{ code: 'SOURCE_LIBRARY_NAME', label: 'source/library implementation name', pattern: /\b(?:PptxGenJS|pptxgenjs|node_modules|\.betterpptx-runtime|src\/|dist\/|out\/)\b/i },
	{ code: 'RUNTIME_DEPENDENCY_NAME', label: 'runtime/dependency name', pattern: /\b(?:Node\.js|nodejs|JSZip|xmldom|svgpath|PowerShell\.exe)\b/i },
	{ code: 'CLOUD_INTERNAL_NAME', label: 'cloud/internal platform name', pattern: /\b(?:Cloud Run|Google Cloud|GCP|Firestore|Secret Manager|Artifact Registry|cloudbuild|service account|us-central1)\b/i },
	{ code: 'PROCESS_METADATA', label: 'process metadata', pattern: /\b(?:pid|execPath|argv|cwd|process\.env|__dirname|__filename)\b/i },
	{ code: 'PRIVATE_ASSET_PATH', label: 'private asset path', pattern: /(?:file:\/\/|localhost|127\.0\.0\.1|169\.254\.169\.254|\.private|private-assets|reference-assets)/i },
]

// These are domain terms that may truthfully occur in exact author/source-owned
// document metadata (for example, a presentation whose subject is GCP).  Path,
// process, repository, dependency, and private-endpoint rules are deliberately
// absent: even trusted author text must not become an escape hatch for those.
const TRUSTED_AUTHOR_CONTENT_CODES = new Set([
	'CLOUD_INTERNAL_NAME',
])

function qualifiedNodeName(node) {
	return String(node?.nodeName || node?.localName || '').trim()
}

function normalizedTrustedMetadataValues(values = []) {
	const byPartAndField = new Map()
	for (const item of Array.isArray(values) ? values : []) {
		const part = String(item?.part || '').trim()
		const field = String(item?.field || '').trim()
		const value = String(item?.value ?? '')
		if (!part || !field || !value) continue
		const allowedDisclosureCodes = new Set((Array.isArray(item?.allowedDisclosureCodes) ? item.allowedDisclosureCodes : [])
			.map(code => String(code || '').trim())
			.filter(code => TRUSTED_AUTHOR_CONTENT_CODES.has(code)))
		byPartAndField.set(`${part}\u0000${field}`, { value, allowedDisclosureCodes })
	}
	return byPartAndField
}

function trustedPolicyForValue(trustedValues, part, field, value) {
	const policy = trustedValues.get(`${part}\u0000${field}`)
	if (!policy || String(value ?? '') !== policy.value) return null
	return policy
}

function addDisclosureIssues(issues, part, scope, text, { field = null, trustedPolicy = null } = {}) {
	const value = String(text || '')
	if (!value) return
	for (const item of DISCLOSURE_PATTERNS) {
		if (!item.pattern.test(value)) continue
		if (trustedPolicy?.allowedDisclosureCodes?.has(item.code)) continue
		issues.push({
			code: `PUBLIC_METADATA_${item.code}`,
			part,
			scope,
			...(field ? { field } : {}),
			message: `Saved package ${scope} contains ${item.label}.`,
		})
	}
}

function scanMetadataXml(issues, part, xml, trustedValues) {
	const parseErrors = []
	let doc
	try {
		doc = new DOMParser({
			errorHandler: {
				warning: () => {},
				error: message => parseErrors.push(String(message || 'XML parse error')),
				fatalError: message => parseErrors.push(String(message || 'XML parse error')),
			},
		}).parseFromString(String(xml || ''), 'application/xml')
	} catch (error) {
		parseErrors.push(String(error?.message || error || 'XML parse error'))
	}
	if (!doc?.documentElement || parseErrors.length > 0 || doc.getElementsByTagName('parsererror').length > 0) {
		// Malformed metadata is rejected elsewhere by package validation.  Preserve
		// the old fail-closed disclosure behavior here rather than accidentally
		// treating an unparsable part as safe.
		addDisclosureIssues(issues, part, 'metadata', xml, { field: 'unparsed-xml' })
		return
	}

	const visit = node => {
		if (!node) return
		if (node.nodeType === 1) {
			const field = qualifiedNodeName(node)
			for (const attr of Array.from(node.attributes || [])) {
				addDisclosureIssues(issues, part, 'metadata', attr.value, {
					field: `${field}@${qualifiedNodeName(attr)}`,
				})
			}
			for (const child of Array.from(node.childNodes || [])) visit(child)
			return
		}
		if (node.nodeType !== 3 && node.nodeType !== 4) return
		const parent = node.parentNode
		const field = qualifiedNodeName(parent) || 'text'
		const value = String(node.nodeValue ?? '')
		const trustedPolicy = trustedPolicyForValue(
			trustedValues,
			part,
			field,
			String(parent?.textContent ?? value),
		)
		addDisclosureIssues(issues, part, 'metadata', value, { field, trustedPolicy })
	}
	visit(doc.documentElement)
}

export async function validatePackageMetadataLeaksFromZip(zip, options = {}) {
	const includeRelationshipTargets = options.includeRelationshipTargets !== false
	const trustedValues = normalizedTrustedMetadataValues(options.trustedMetadataValues)
	const issues = []
	const inspectedParts = []
	for (const part of METADATA_PARTS) {
		const file = zip.file(part)
		if (!file || file.dir) continue
		inspectedParts.push(part)
		scanMetadataXml(issues, part, await file.async('string'), trustedValues)
	}
	if (includeRelationshipTargets) {
		for (const part of Object.keys(zip.files).sort()) {
			const file = zip.files[part]
			if (file.dir || !part.endsWith('.rels')) continue
			const xml = await file.async('string')
			for (const match of xml.matchAll(RELATIONSHIP_TARGET_RE)) {
				addDisclosureIssues(issues, part, 'relationship target', match[1], { field: 'Target' })
			}
		}
	}
	return {
		ok: issues.length === 0,
		issueCount: issues.length,
		inspectedParts,
		relationshipTargetsChecked: includeRelationshipTargets,
		issues,
	}
}

export async function validatePackageMetadataLeaksFromFile(filePath, options = {}) {
	const zip = await JSZip.loadAsync(await fs.readFile(filePath))
	return validatePackageMetadataLeaksFromZip(zip, options)
}
