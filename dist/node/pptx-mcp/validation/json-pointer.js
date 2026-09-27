export function pointerJoin(base, key) {
    const escaped = String(key).replace(/~/g, '~0').replace(/\//g, '~1');
    return `${base || ''}/${escaped}`;
}
export function getByPointer(value, pointer) {
    if (!pointer || pointer === '/')
        return value;
    const parts = pointer.split('/').slice(1).map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    let current = value;
    for (const part of parts) {
        if (current == null)
            return undefined;
        current = current[part];
    }
    return current;
}
//# sourceMappingURL=json-pointer.js.map