import { AnimationProps } from '../core-interfaces'

export function getAnimationVariantRgb(animation: AnimationProps, blueValue = '0000FF'): string {
	const explicit = (animation as any).color
	if (typeof explicit === 'string' && explicit.trim()) {
		return explicit.replace(/^#/, '').toUpperCase()
	}

	const direction = String(animation.direction || '').toLowerCase()
	if (direction.includes('red')) return 'FF0000'
	if (direction.includes('blue')) return blueValue
	return '00FF00'
}

export function animationColorXml(color: string, asSchemeAccent = false): string {
	if (asSchemeAccent) {
		return '<a:schemeClr val="accent2" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>'
	}
	return `<a:srgbClr val="${color}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`
}
