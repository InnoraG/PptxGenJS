/**
 * Build Thread animation (presetID=39)
 *
 * Thread animation uses 4 anim elements for h, w, x, y with specific keyframe patterns.
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH1_MANUALLYFROZEN.pptx slide15
 *
 * Key characteristics:
 * - Entrance: accel="100000", presetSubtype="0"
 * - Exit: decel="100000", presetSubtype="0"
 * - 4 anim elements: ppt_h, ppt_w, ppt_x, ppt_y
 * - Entrance: h/w/x have 3 keyframes (0%, 50%, 100%), y has 2 keyframes
 * - Exit: similar but with decel instead of accel
 */
import { getNodeTypeFromTrigger } from './utils';
import { getNextAnimationId } from '../gen-animations-ids';
export function buildThreadAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    // Entrance uses accel="100000", Exit uses decel="100000"
    const timingAttr = isEntrance ? 'accel="100000"' : 'decel="100000"';
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
    const animHId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animXId = getNextAnimationId();
    const animYId = getNextAnimationId();
    // CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
    const fillAttr = isEntrance ? ' fill="hold"' : '';
    let childElements;
    if (isEntrance) {
        // ENTRANCE: set + 4 anim (h, w, x, y)
        // Formulas from frozen reference:
        // h: #ppt_h/20 → #ppt_h/20 → #ppt_h
        // w: #ppt_w+.3 → #ppt_w+.3 → #ppt_w
        // x: #ppt_x-.3 → #ppt_x → #ppt_x
        // y: #ppt_y → #ppt_y
        childElements = `
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
						<p:cTn id="${animHId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_h/20"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="#ppt_h/20"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_h"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_w+.3"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="#ppt_w+.3"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_w"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_x-.3"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
    }
    else {
        // EXIT: 4 anim (h, w, x, y) + set
        // Reverse formulas from entrance
        childElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_h"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="ppt_h/20"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_h/20"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_w"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="ppt_w+.3"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_w+.3"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
						<p:tav tm="50000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_x-.3"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${duration - 1}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    }
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" ${timingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildThreadAnimation.js.map