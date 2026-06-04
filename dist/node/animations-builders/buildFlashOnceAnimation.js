import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build FlashOnce animation (presetID=11)
 *
 * Entrance: Single p:set element (visibility setter)
 * Exit: p:anim (discrete keyframes) + p:set (final hide)
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide5.xml
 */
export function buildFlashOnceAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
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
    const animId = getNextAnimationId();
    const setId = getNextAnimationId();
    let childElements = '';
    if (isEntrance) {
        // Entrance: Simple set element
        childElements = `<p:set>
			<p:cBhvr>
				<p:cTn id="${setId}" dur="${duration}">
					<p:stCondLst>
						<p:cond delay="0"/>
					</p:stCondLst>
				</p:cTn>
				<p:tgtEl>
					${targetXml}
				</p:tgtEl>
				<p:attrNameLst>
					<p:attrName>style.visibility</p:attrName>
				</p:attrNameLst>
			</p:cBhvr>
			<p:to>
				<p:strVal val="visible"/>
			</p:to>
		</p:set>`;
    }
    else {
        // Exit: anim (discrete keyframes) + set (final hide)
        childElements = `<p:anim calcmode="discrete" valueType="str">
			<p:cBhvr>
				<p:cTn id="${animId}" dur="${duration}"/>
				<p:tgtEl>
					${targetXml}
				</p:tgtEl>
				<p:attrNameLst>
					<p:attrName>style.visibility</p:attrName>
				</p:attrNameLst>
			</p:cBhvr>
			<p:tavLst>
				<p:tav tm="0">
					<p:val>
						<p:strVal val="hidden"/>
					</p:val>
				</p:tav>
				<p:tav tm="50000">
					<p:val>
						<p:strVal val="visible"/>
					</p:val>
				</p:tav>
			</p:tavLst>
		</p:anim>
		<p:set>
			<p:cBhvr>
				<p:cTn id="${setId}" dur="1" fill="hold">
					<p:stCondLst>
						<p:cond delay="${duration - 1}"/>
					</p:stCondLst>
				</p:cTn>
				<p:tgtEl>
					${targetXml}
				</p:tgtEl>
				<p:attrNameLst>
					<p:attrName>style.visibility</p:attrName>
				</p:attrNameLst>
			</p:cBhvr>
			<p:to>
				<p:strVal val="hidden"/>
			</p:to>
		</p:set>`;
    }
    // Main animation wrapper
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildFlashOnceAnimation.js.map