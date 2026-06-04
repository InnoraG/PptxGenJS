/**
 * Build Blinds animation (presetID=3)
 *
 * Blinds is a filter-based entrance/exit animation using animEffect.
 *
 * Structure:
 * - Entrance: set (visibility=visible) + animEffect (transition="in")
 * - Exit: animEffect (transition="out") + set (visibility=hidden, delay=duration-1)
 *
 * Direction mappings:
 * - horizontal (5): filter="blinds(horizontal)"
 * - vertical (10): filter="blinds(vertical)"
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH1_MANUALLYFROZEN.pptx slide8
 */
import { getNodeTypeFromTrigger } from './utils';
import { getNextAnimationId } from '../gen-animations-ids';
export function buildBlindsAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, directionConfig, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 10; // default to vertical
    // Determine filter direction based on presetSubtype
    // CRITICAL: presetSubtype 10 = horizontal filter, presetSubtype 5 = vertical filter
    // This is counter-intuitive but verified from frozen reference
    const filterDirection = presetSubtype === 10 ? 'horizontal' : 'vertical';
    const filter = `blinds(${filterDirection})`;
    const transition = isEntrance ? 'in' : 'out';
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for sub-elements
    const setId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Build visibility setter element
    const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${isEntrance ? 0 : duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    // Build animEffect element
    const animEffectElement = `
				<p:animEffect transition="${transition}" filter="${filter}">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
    // CRITICAL: Element order differs for entrance vs exit
    // Entrance: set + animEffect
    // Exit: animEffect + set
    const childElements = isEntrance ? (setElement + animEffectElement) : (animEffectElement + setElement);
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildBlindsAnimation.js.map