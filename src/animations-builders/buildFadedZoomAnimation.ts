import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build FadedZoom animation (presetID=53)
 * Structure varies based on presetSubtype:
 * - 4 elements (16/32): set + anim(w) + anim(h) + animEffect
 * - 6 elements (528/544): set + anim(w) + anim(h) + animEffect + anim(x) + anim(y)
 *
 * Used by: FadedZoom entrance (center/bottom), FadedZoom exit (center/bottom)
 */
export function buildFadedZoomAnimation(ctx: AnimationBuildContext): string {

	const { shapeId, animation, config, directionConfig, type, ids, target, sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 700;
	const delay = animation.delay ?? config.defaultDelay ?? 0

	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';

	// The presetSubtype is passed from the registry/engine and determines element structure
	// 528/544 (allAtOnce): 6 elements with position animations (w, h, x, y)
	// 16/32 (asOneObject/byParagraph): 4 elements without position (w, h only)
	const presetSubtype = Number(directionConfig?.presetSubtype) || 16;
	const hasPositionAnimation = presetSubtype === 528 || presetSubtype === 544;

	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	// Generate IDs for sub-elements
	const setId = getNextAnimationId();
	const animWId = getNextAnimationId();
	const animHId = getNextAnimationId();
	const effectId = getNextAnimationId();

	// Determine transition based on entrance/exit
	const transition = isEntrance ? 'in' : 'out';

	// Build the base 4-element animation
	let childElements = '';

	if (isEntrance) {
		// Entrance: set comes FIRST, formulas use # prefix
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
						<p:cTn id="${animWId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_w"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_h"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
	} else {
		// Exit: anim(w,h), animEffect, then position anims if needed, then set LAST
		childElements = `
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
						<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
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
						<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:animEffect transition="${transition}" filter="fade">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`;
	}

	// Add position animations for 6-element variants (subtypes 528/544)
	// For entrance: append at end (after animEffect)
	// For exit: insert before set element
	if (hasPositionAnimation) {
		const animXId = getNextAnimationId();
		const animYId = getNextAnimationId();

		// Entrance uses # prefix for final values, exit does not
		const xVal = isEntrance ? '#ppt_x' : 'ppt_x';
		const yVal = isEntrance ? '#ppt_y' : 'ppt_y';

		const xStart = isEntrance ? '<p:fltVal val="0.5"/>' : '<p:strVal val="ppt_x"/>';
		const xEnd = isEntrance ? `<p:strVal val="${xVal}"/>` : '<p:fltVal val="0.5"/>';
		const yStart = isEntrance ? '<p:fltVal val="0.5"/>' : '<p:strVal val="ppt_y"/>';
		const yEnd = isEntrance ? `<p:strVal val="${yVal}"/>` : '<p:fltVal val="0.5"/>';

		const positionAnims = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${xStart}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${xEnd}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${yStart}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${yEnd}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
		
		childElements += positionAnims;
	}

	// For exit, add set element at the very end
	if (!isEntrance) {
		childElements += `
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

	const result = `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;

	if (nodeType === 'withEffect') {
		console.log(`[FADEDZOOM XML DEBUG] Returning XML with withEffect: ${result.substring(0, 150)}...`);
	}

	return result;
}
