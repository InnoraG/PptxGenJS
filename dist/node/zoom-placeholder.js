/**
 * Slide Zoom default thumbnail + constants.
 *
 * PowerPoint stores a captured preview image of the target slide inside the zoom object.
 * The engine cannot render slides to PNG (that needs PowerPoint), so it embeds this neutral
 * light-gray placeholder; PowerPoint refreshes the real preview when the deck is edited.
 * Any valid PNG keeps the file valid (opens without repair).
 *
 * @see plans/zoom-ooxml-ground-truth.md
 */
/** Default zoom frame size in EMU (3048000 x 1714500 = 3.33" x 1.875", 16:9), PowerPoint's default. */
export const ZOOM_DEFAULT_W_EMU = 3048000;
export const ZOOM_DEFAULT_H_EMU = 1714500;
/** Slide-zoom graphicData namespace (Office 2016 slidezoom). */
export const ZOOM_SLIDEZOOM_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/slidezoom';
/** Section-zoom graphicData namespace (Office 2016 sectionzoom). @see plans/section-zoom-ooxml-ground-truth.md */
export const ZOOM_SECTIONZOOM_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/sectionzoom';
/** Summary-zoom graphicData namespace (Office 2016 summaryzoom). @see plans/summary-zoom-ooxml-ground-truth.md */
export const ZOOM_SUMMARYZOOM_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/summaryzoom';
/** Zoom object-properties namespace (Office 2016/6 main). */
export const ZOOM_P166_NS = 'http://schemas.microsoft.com/office/powerpoint/2016/6/main';
/** Engine slide-id base: slide N (1-based) has presentation sldId = ZOOM_SLDID_BASE + N (255 + N). */
export const ZOOM_SLDID_BASE = 255;
/** Neutral 320x180 light-gray (#D9D9D9) PNG, base64. */
const ZOOM_PLACEHOLDER_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAUAAAAC0CAYAAADl5PURAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAJmSURBVHhe7dQxAQAwDICw+ndYNes/C+TIgwBmdx9A0fwBoMIAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsgwQyDJAIMsAgSwDBLIMEMgyQCDLAIEsAwSyDBDIMkAgywCBLAMEsg6KxHilaoT0BgAAAABJRU5ErkJggg==';
/** Default zoom thumbnail as a base64 PNG data URI (engine `data:` input form). */
export const ZOOM_PLACEHOLDER_PNG_DATAURI = 'data:image/png;base64,' + ZOOM_PLACEHOLDER_PNG_B64;
//# sourceMappingURL=zoom-placeholder.js.map