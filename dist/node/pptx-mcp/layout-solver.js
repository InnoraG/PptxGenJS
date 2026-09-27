function num(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function spacing(layout, axis, fallback) {
    if (typeof (layout === null || layout === void 0 ? void 0 : layout.gap) === 'number')
        return layout.gap;
    if ((layout === null || layout === void 0 ? void 0 : layout.gap) && typeof layout.gap === 'object')
        return num(layout.gap[axis], fallback);
    return fallback;
}
export function solveLayout(layout, objects, slideSize, brand) {
    var _a, _b;
    if (!layout)
        return objects.map(object => ({
            x: num(object.x, 0.7),
            y: num(object.y, 0.7),
            w: num(object.w, 4),
            h: num(object.h, 1),
        }));
    const padding = num(layout.padding, (_b = (_a = brand === null || brand === void 0 ? void 0 : brand.spacing) === null || _a === void 0 ? void 0 : _a.unit) !== null && _b !== void 0 ? _b : 0.45);
    const gapX = spacing(layout, 'x', 0.18);
    const gapY = spacing(layout, 'y', 0.18);
    if (layout.kind === 'grid') {
        const cols = Math.max(1, Math.floor(num(layout.cols, 12)));
        const rows = Math.max(1, Math.floor(num(layout.rows, 6)));
        const cellW = (slideSize.width - padding * 2 - gapX * (cols - 1)) / cols;
        const cellH = (slideSize.height - padding * 2 - gapY * (rows - 1)) / rows;
        return objects.map(object => {
            const place = object.place || {};
            const col = Math.max(1, Math.floor(num(place.col, 1)));
            const row = Math.max(1, Math.floor(num(place.row, 1)));
            const colSpan = Math.max(1, Math.floor(num(place.colSpan, place.span || cols)));
            const rowSpan = Math.max(1, Math.floor(num(place.rowSpan, 1)));
            return {
                x: padding + (col - 1) * (cellW + gapX),
                y: padding + (row - 1) * (cellH + gapY),
                w: cellW * colSpan + gapX * (colSpan - 1),
                h: cellH * rowSpan + gapY * (rowSpan - 1),
            };
        });
    }
    if (layout.kind === 'flow') {
        const direction = layout.direction === 'horizontal' ? 'horizontal' : 'vertical';
        let cursor = padding;
        return objects.map(object => {
            const requestedW = num(object.w, direction === 'horizontal' ? 2.6 : slideSize.width - padding * 2);
            const requestedH = num(object.h, direction === 'horizontal' ? slideSize.height - padding * 2 : 1.1);
            const rect = direction === 'horizontal'
                ? { x: cursor, y: padding, w: requestedW, h: requestedH }
                : { x: padding, y: cursor, w: requestedW, h: requestedH };
            cursor += (direction === 'horizontal' ? requestedW + gapX : requestedH + gapY);
            return rect;
        });
    }
    return objects.map(object => ({
        x: num(object.x, 0.7),
        y: num(object.y, 0.7),
        w: num(object.w, 4),
        h: num(object.h, 1),
    }));
}
//# sourceMappingURL=layout-solver.js.map