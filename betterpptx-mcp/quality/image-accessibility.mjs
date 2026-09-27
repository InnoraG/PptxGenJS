import { createHash } from 'node:crypto'

function clean(value, max = 180) {
	return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Build provider-free accessibility metadata for a generated image wrapper. */
export function buildImageAccessibilityMetadata(plan = {}) {
	const id = clean(plan.id, 40)
	const concept = clean(plan.concept || plan.purpose || 'contextual presentation visual')
	const role = clean(plan.context?.slideRole || plan.purpose || 'presentation visual')
	const altText = clean(`Illustration for ${role}: ${concept}`, 240)
	const digest = createHash('sha256').update(JSON.stringify({ id, altText })).digest('hex').slice(0, 16)
	return {
		schemaVersion: 'betterpptx.image-accessibility.v1',
		decorative: false,
		altText,
		objectName: `generated-visual-${id || digest}`,
		readingOrder: 'after-slide-title-before-supporting-copy',
		editableFallback: 'native-image-wrapper',
		pptxOnly: true,
	}
}

export function validateImageAccessibilityPlan(plan = {}) {
	const metadata = plan.accessibility || buildImageAccessibilityMetadata(plan)
	const altText = clean(metadata.altText, 240)
	const validName = /^generated-visual-[A-Za-z0-9_-]+$/.test(clean(metadata.objectName, 80))
	const safe = !/modal|provider|filesystem|node_modules|[A-Z]:\\|\/tmp\//i.test(JSON.stringify(metadata))
	const checks = {
		altText: altText.length >= 12 && !/^(image|visual)\.?$/i.test(altText),
		stableObjectName: validName,
		readingOrder: metadata.readingOrder === 'after-slide-title-before-supporting-copy',
		editableFallback: metadata.editableFallback === 'native-image-wrapper',
		pptxOnly: metadata.pptxOnly === true,
		blackBoxMetadata: safe,
	}
	return { schemaVersion: 'betterpptx.image-accessibility-result.v1', status: Object.values(checks).every(Boolean) ? 'pass' : 'fail', checks, metadata, deterministic: true }
}
