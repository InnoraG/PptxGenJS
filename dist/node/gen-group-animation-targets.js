export function nativeGroupIdentityPlan(slide) {
    const objects = slide._slideObjects || [];
    let nextId = Math.max(1, ...objects.map((item, index) => { var _a; return Number((_a = item.options) === null || _a === void 0 ? void 0 : _a.spid) || index + 2; })) + 1;
    const childIds = new Map();
    const targets = [];
    const visit = (children, parentName) => {
        children.forEach((child, index) => {
            const shapeId = nextId++;
            const name = String(child.objectName || `${parentName} child ${index + 1}`);
            childIds.set(child, shapeId);
            if (child._nativeObject)
                targets.push({ target: child._nativeObject, child, name, shapeId });
            if (child.kind === 'group')
                visit(child.children || [], name);
        });
    };
    objects.forEach((object, index) => {
        if (object._type !== 'group')
            return;
        const group = object.group || object.options;
        visit((group === null || group === void 0 ? void 0 : group.children) || [], String((group === null || group === void 0 ? void 0 : group.objectName) || `Group ${index + 1}`));
    });
    return { childIds, targets };
}
/** Opaque imported objects may claim hidden child IDs; do not guess them. */
export function assertNativeDescendantAnimationInspectable(slide) {
    if ((slide._slideObjects || []).some(object => { var _a; return Boolean((_a = object.passthrough) === null || _a === void 0 ? void 0 : _a.xml); })) {
        throw new Error('Named descendant animation is unavailable while the slide contains opaque imported objects. Reconstruct the group as native editable objects first.');
    }
}
//# sourceMappingURL=gen-group-animation-targets.js.map