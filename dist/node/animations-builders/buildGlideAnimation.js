import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Glide animation (presetID=54)
 * Structure: set + anim(ppt_w) + anim(ppt_h) + anim(ppt_x) + anim(ppt_y) + animEffect(fade)
 * Total: 6 elements
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx slide 6
 */
export function buildGlideAnimation(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const isEntrance = type === 'entrance';
    // CRITICAL: Exit mode ALWAYS uses defaultDelay (150) for outer cTn
    // This is hardcoded in PowerPoint's glide exit behavior (see Batch 12 Slide 3 reference)
    // The inner set uses duration-1, but the outer cTn MUST be 150
    const delay = isEntrance
        ? (animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0))
        : 150; // Exit always uses 150, ignoring animation.delay
    const transition = type === 'entrance' ? 'in' : 'out';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    // Formula prefix pattern (from enhanced comparator v2e analysis):
    // Entrance: WITH # prefix
    // Exit: NO # prefix
    const prefix = isEntrance ? '#' : '';
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for all 6 sub-elements
    const setId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const animXId = getNextAnimationId();
    const animYId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Entrance: set FIRST (delay=0), with fill="hold" on inner anim cTn
    // Exit: set LAST (delay=duration-1), NO fill="hold" on inner anim cTn, reversed formulas
    const innerFill = isEntrance ? ' fill="hold"' : '';
    const setDelay = isEntrance ? 0 : duration - 1;
    // Formulas differ between entrance and exit:
    // Entrance: small->full (0.05->1), offset->center (x-.2->x)
    // Exit: full->small (1->0.05), center->offset (x->x-.2)
    const wFrom = isEntrance ? `${prefix}ppt_w*0.05` : `${prefix}ppt_w`;
    const wTo = isEntrance ? `${prefix}ppt_w` : `${prefix}ppt_w*0.05`;
    const xFrom = isEntrance ? `${prefix}ppt_x-.2` : `${prefix}ppt_x`;
    const xTo = isEntrance ? `${prefix}ppt_x` : `${prefix}ppt_x-.2`;
    // Build animation elements (different order for entrance vs exit)
    const setElement = `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${setDelay}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${innerFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${wFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${wTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${innerFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefix}ppt_h"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefix}ppt_h"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${innerFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${xFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${xTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${innerFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${prefix}ppt_y"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${prefix}ppt_y"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
    // Order: Entrance = set + anims + effect, Exit = anims + effect + set
    const childElements = isEntrance
        ? setElement + animElements
        : animElements + setElement;
    // Use accel for entrance, decel for exit (easing direction)
    const timingAttr = isEntrance ? 'accel="100000"' : 'decel="100000"';
    // Always wrap in <p:par> (like Spinner and CenterRevolve do)
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" ${timingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildGlideAnimation.js.map