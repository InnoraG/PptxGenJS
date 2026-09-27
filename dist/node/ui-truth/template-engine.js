import { UI_TRUTH_TEMPLATES } from '../ui-truth-templates.embedded';
function sanitizeTimingTemplate(t) {
    // Remove UTF-8 BOM if present (can trigger PowerPoint repair warnings)
    let s = t.replace(/^\uFEFF/, '');
    // Templates store a standalone <p:timing> subtree. When injected into slide XML,
    // namespace declarations on the subtree root can cause duplication/repair.
    // The slide already declares the p/a namespaces, so we strip xmlns:* from the timing root.
    s = s.replace(/<p:timing\b[^>]*>/, '<p:timing>');
    return s;
}
export function getTemplate(name) {
    const t = UI_TRUTH_TEMPLATES[name];
    if (!t)
        throw new Error(`UI truth template not found: ${name}`);
    return sanitizeTimingTemplate(t);
}
/**
 * Remap spTgt spid="..." occurrences inside a template timing XML.
 *
 * Note: This is intentionally string-based because the bundle is browser-friendly.
 * It must only operate on the spid attributes.
 */
export function remapSpidsInTimingXml(timingXml, remap) {
    return timingXml.replace(/spid=\"(\d+)\"/g, (m, spid) => {
        const to = remap[String(spid)];
        return to ? `spid=\"${to}\"` : m;
    });
}
//# sourceMappingURL=template-engine.js.map