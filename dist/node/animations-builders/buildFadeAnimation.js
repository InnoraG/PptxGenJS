import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Fade animation (presetID=10)
 * Structure: set (visibility) + animEffect (fade transition)
 * Reference: Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide4.xml
 */
export function buildFadeAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    console.log(`[FADE DEBUG] shapeId=${shapeId} type=${type} nodeType=${nodeType} ctx.nodeType=${ctx.nodeType} isEntrance=${type === 'entrance'} dur=${animation.duration} delay=${animation.delay}`);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const transition = isEntrance ? 'in' : 'out';
    // Build target XML based on sequence mode
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
    // Calculate set delay: entrance shows immediately (0), exit hides at end (duration - 1)
    const setDelay = isEntrance ? 0 : Math.max(0, duration - 1);
    // Build individual elements
    // NOTE: Reference uses duration="1" for set element
    const setElement = `<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="${setDelay}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`;
    const animEffectElement = `<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
    // Element order: Reference uses set -> animEffect for Entrance, but animEffect -> set for Exit
    const elements = isEntrance
        ? `
				${setElement}
				${animEffectElement}`
        : `
				${animEffectElement}
				${setElement}`;
    const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${elements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
    if (nodeType === 'withEffect') {
        console.log(`[FADE XML DEBUG] Returning XML with withEffect: ${result.substring(0, 150)}...`);
    }
    return result;
}
//# sourceMappingURL=buildFadeAnimation.js.map