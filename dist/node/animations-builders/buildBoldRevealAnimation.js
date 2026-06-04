import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Bold Reveal animation (presetID=15)
 * Structure: 1 set (style.fontWeight → "bold")
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide12.xml
 */
export function buildBoldRevealAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    // Duration depends on sequence mode and target type:
    // - asOneObject: dur="1000"
    // - allAtOnce (background): dur="1000" 
    // - allAtOnce (paragraphs): dur="1000"
    // - byParagraph (all paragraphs): dur="indefinite"
    // Note: For byParagraph, sequence mode is passed via animation object
    const isParagraph = (target === null || target === void 0 ? void 0 : target.type) === 'paragraph';
    const isByParagraph = animation.sequence === 'byParagraph';
    const duration = (isByParagraph && isParagraph) ? 'indefinite' : 1000;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if (isParagraph && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs
    const mainId = getNextAnimationId();
    const setId = getNextAnimationId();
    // Bold Reveal uses <p:iterate> for character-by-character reveal
    return `<p:par>
		<p:cTn id="${mainId}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:iterate type="lt">
				<p:tmAbs val="25"/>
			</p:iterate>
			<p:childTnLst>
				<p:set>
					<p:cBhvr override="childStyle">
						<p:cTn id="${setId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.fontWeight</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="bold"/>
					</p:to>
				</p:set>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildBoldRevealAnimation.js.map