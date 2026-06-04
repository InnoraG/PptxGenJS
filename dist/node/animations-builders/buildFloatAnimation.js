import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
import { addHashPrefixForEntrance } from './utils';
/**
 * Build complex 6-8 element animations - Generic templates
 */
// 6 elements (presetID 38,41): Various patterns
/**
 * Build Float animation (presetID=30)
 * Structure: set + animEffect(fade) + 5 anim (rotation, x, y, w, h)
 * Total: 7 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide 13
 */
export function buildFloatAnimation(ctx) {
    var _a, _b, _c;
    console.log(`[FLOAT TEMPLATE] Called for spid=${ctx.shapeId}, direction=${(_a = ctx.directionConfig) === null || _a === void 0 ? void 0 : _a.name}`);
    const { shapeId, animation, config, directionConfig, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 560;
    const delay = (_c = (_b = animation.delay) !== null && _b !== void 0 ? _b : config.defaultDelay) !== null && _c !== void 0 ? _c : 0;
    const transition = type === 'entrance' ? 'in' : 'out';
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const presetSubtype = (directionConfig === null || directionConfig === void 0 ? void 0 : directionConfig.presetSubtype) || 0;
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for all 7 sub-elements
    const setId = getNextAnimationId();
    const animRotId = getNextAnimationId();
    const animXId = getNextAnimationId();
    const animYId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Build the 7-element animation: set + 5 anim + animEffect
    const childElements = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animRotId}" dur="${duration}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.rotation</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="-90"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${addHashPrefixForEntrance('ppt_y', isEntrance)}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${addHashPrefixForEntrance('ppt_y', isEntrance)}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${addHashPrefixForEntrance('ppt_w', isEntrance)}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${addHashPrefixForEntrance('ppt_w', isEntrance)}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}" decel="100000" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${addHashPrefixForEntrance('ppt_h', isEntrance)}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${addHashPrefixForEntrance('ppt_h', isEntrance)}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}" decel="100000"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
    const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
    // DEBUG: Check what we're returning
    const childCount = (result.match(/<p:set|<p:anim|<p:animEffect/g) || []).length;
    console.log(`[FLOAT TEMPLATE] Returning XML with ${childCount} sub-elements (should be 7)`);
    return result;
}
//# sourceMappingURL=buildFloatAnimation.js.map