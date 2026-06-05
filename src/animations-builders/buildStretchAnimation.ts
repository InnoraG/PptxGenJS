import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import {  addHashPrefixForEntrance } from './utils';

/**
 * Build Stretch animation (presetID=17)
 * Structure: 1 set + 4 anim elements (x, y, w, h)
 * The effect stretches from one edge based on direction
 *
 * NOTE: This is now a wrapper that delegates to the modular version
 */
/**
 * Stretch animation builder (presetID=17)
 * Structure: 1 set + 4 anim elements (x, y, w, h)
 * The effect stretches from one edge based on direction
 */
export function buildStretchAnimation(ctx: AnimationBuildContext): string {
	console.log(`[STRETCH TEMPLATE] Called for spid=${ctx.shapeId}, direction=${ctx.directionConfig?.name}`);

	const { shapeId, animation, config, directionConfig, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 500;
	const delay = animation.delay ?? config.defaultDelay ?? 0

	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';
	const presetSubtype = directionConfig?.presetSubtype || 8; // Default: fromLeft


	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	// Determine animation values based on direction
	// Use addHashPrefixForEntrance() helper to apply # prefix correctly
	let xFrom: string, xTo: string, yFrom: string, yTo: string;
	let wFrom: string, wTo: string, hFrom: string, hTo: string;
	let isAcrossVariant = false;

	if (presetSubtype === 10) { // across - special case: only animates width
		isAcrossVariant = true;
		// Across only animates width (horizontal stretch from center)
		wFrom = isEntrance ? '0' : 'ppt_w';
		wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : '0', isEntrance);
		hFrom = addHashPrefixForEntrance('ppt_h', isEntrance);
		hTo = addHashPrefixForEntrance('ppt_h', isEntrance);
		// x and y not used for across
		xFrom = xTo = yFrom = yTo = '';
	} else if (presetSubtype === 8) { // fromLeft
		xFrom = addHashPrefixForEntrance(isEntrance ? 'ppt_x-ppt_w/2' : 'ppt_x', isEntrance);
		xTo = addHashPrefixForEntrance(isEntrance ? 'ppt_x' : 'ppt_x-ppt_w/2', isEntrance);
		yFrom = addHashPrefixForEntrance('ppt_y', isEntrance);
		yTo = addHashPrefixForEntrance('ppt_y', isEntrance);
		wFrom = isEntrance ? '0' : 'ppt_w';
		wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : '0', isEntrance);
		hFrom = addHashPrefixForEntrance('ppt_h', isEntrance);
		hTo = addHashPrefixForEntrance('ppt_h', isEntrance);
	} else if (presetSubtype === 2) { // fromRight
		xFrom = addHashPrefixForEntrance(isEntrance ? 'ppt_x+ppt_w/2' : 'ppt_x', isEntrance);
		xTo = addHashPrefixForEntrance(isEntrance ? 'ppt_x' : 'ppt_x+ppt_w/2', isEntrance);
		yFrom = addHashPrefixForEntrance('ppt_y', isEntrance);
		yTo = addHashPrefixForEntrance('ppt_y', isEntrance);
		wFrom = isEntrance ? '0' : 'ppt_w';
		wTo = addHashPrefixForEntrance(isEntrance ? 'ppt_w' : '0', isEntrance);
		hFrom = addHashPrefixForEntrance('ppt_h', isEntrance);
		hTo = addHashPrefixForEntrance('ppt_h', isEntrance);
	} else if (presetSubtype === 1) { // fromTop
		xFrom = addHashPrefixForEntrance('ppt_x', isEntrance);
		xTo = addHashPrefixForEntrance('ppt_x', isEntrance);
		yFrom = addHashPrefixForEntrance(isEntrance ? 'ppt_y-ppt_h/2' : 'ppt_y', isEntrance);
		yTo = addHashPrefixForEntrance(isEntrance ? 'ppt_y' : 'ppt_y-ppt_h/2', isEntrance);
		wFrom = addHashPrefixForEntrance('ppt_w', isEntrance);
		wTo = addHashPrefixForEntrance('ppt_w', isEntrance);
		hFrom = isEntrance ? '0' : 'ppt_h';
		hTo = addHashPrefixForEntrance(isEntrance ? 'ppt_h' : '0', isEntrance);
	} else { // fromBottom (4)
		xFrom = addHashPrefixForEntrance('ppt_x', isEntrance);
		xTo = addHashPrefixForEntrance('ppt_x', isEntrance);
		yFrom = addHashPrefixForEntrance(isEntrance ? 'ppt_y+ppt_h/2' : 'ppt_y', isEntrance);
		yTo = addHashPrefixForEntrance(isEntrance ? 'ppt_y' : 'ppt_y+ppt_h/2', isEntrance);
		wFrom = addHashPrefixForEntrance('ppt_w', isEntrance);
		wTo = addHashPrefixForEntrance('ppt_w', isEntrance);
		hFrom = isEntrance ? '0' : 'ppt_h';
		hTo = addHashPrefixForEntrance(isEntrance ? 'ppt_h' : '0', isEntrance);
	}

	// Generate IDs for all 5 sub-elements
	const setId = getNextAnimationId();
	const animXId = getNextAnimationId();
	const animYId = getNextAnimationId();
	const animWId = getNextAnimationId();
	const animHId = getNextAnimationId();

	// Helper function to generate correct value element (fltVal for '0', strVal for formulas)
	const genVal = (val: string) => {
		return val === '0' ? `<p:fltVal val="0"/>` : `<p:strVal val="${val}"/>`;
	};

	// Build the animation
	// ENTRANCE: set + 4 anim (5 elements)
	// EXIT: 4 anim only (NO set) (4 elements)
	let childElements = '';

	if (isEntrance) {
		// Entrance: set comes FIRST
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
				</p:set>`;
	}

	// Anim elements (both entrance and exit)
	// Entrance uses fill="hold", exit does NOT
	const fillAttr = isEntrance ? ' fill="hold"' : '';

	if (isAcrossVariant) {
		// Across variant: only animate width and height (no x/y position)
		childElements += `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(wFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(wTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(hFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(hTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
	} else {
		// Standard directional variants: animate all 4 properties (x, y, w, h)
		childElements += `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(xFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(xTo)}</p:val></p:tav>
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
						<p:tav tm="0"><p:val>${genVal(yFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(yTo)}</p:val></p:tav>
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
						<p:tav tm="0"><p:val>${genVal(wFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(wTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(hFrom)}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(hTo)}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
	}

	if (!isEntrance) {
		// Exit: set comes LAST (after all anim elements)
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
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;

	// DEBUG: Check what we're returning
	const childCount = (result.match(/<p:set|<p:anim/g) || []).length;
	console.log(`[STRETCH TEMPLATE] Returning XML with ${childCount} sub-elements (should be 5)`);

	return result;
}
