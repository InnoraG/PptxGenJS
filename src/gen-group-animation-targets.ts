import { GroupChildProps, ISlideObject } from './core-interfaces'

/**
 * One deterministic, slide-local descendant identity plan. Top-level objects
 * keep their existing IDs; descendants follow them in the same depth-first
 * order as native group serialization. Never cache this plan across appends.
 */
export interface NativeGroupAnimationTarget {
	target: ISlideObject
	child: GroupChildProps
	name: string
	shapeId: number
}

export function nativeGroupIdentityPlan(slide: { _slideObjects?: ISlideObject[] }): {
	childIds: Map<GroupChildProps, number>
	targets: NativeGroupAnimationTarget[]
} {
	const objects = slide._slideObjects || []
	let nextId = Math.max(1, ...objects.map((item, index) => Number(item.options?.spid) || index + 2)) + 1
	const childIds = new Map<GroupChildProps, number>()
	const targets: NativeGroupAnimationTarget[] = []
	const visit = (children: GroupChildProps[], parentName: string): void => {
		children.forEach((child, index) => {
			const shapeId = nextId++
			const name = String(child.objectName || `${parentName} child ${index + 1}`)
			childIds.set(child, shapeId)
			if (child._nativeObject) targets.push({ target: child._nativeObject, child, name, shapeId })
			if (child.kind === 'group') visit(child.children || [], name)
		})
	}
	objects.forEach((object, index) => {
		if (object._type !== 'group') return
		const group = object.group || object.options as unknown as { objectName?: string, children?: GroupChildProps[] }
		visit(group?.children || [], String(group?.objectName || `Group ${index + 1}`))
	})
	return { childIds, targets }
}

/** Opaque imported objects may claim hidden child IDs; do not guess them. */
export function assertNativeDescendantAnimationInspectable(slide: { _slideObjects?: ISlideObject[] }): void {
	if ((slide._slideObjects || []).some(object => Boolean(object.passthrough?.xml))) {
		throw new Error('Named descendant animation is unavailable while the slide contains opaque imported objects. Reconstruct the group as native editable objects first.')
	}
}
