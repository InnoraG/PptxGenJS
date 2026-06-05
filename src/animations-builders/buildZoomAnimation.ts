import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import { addHashPrefixForEntrance } from './utils';

/**
 * Build Zoom animation (presetID=23)
 * Structure varies by presetSubtype:
 * - presetSubtype 528: 5 elements (1 set + 4 anim)
 * - All others: 3 elements (1 set + 2 anim)
 *
 * CRITICAL: Zoom has different direction mappings for entrance vs exit:
 * Entrance: in(16), inSlightly(272), objectCenter(528), out(32), outSlightly(288), outBottom(36)
 * Exit:     in(16), inSlightly(272), inBottom(20),      out(32), outSlightly(288), slideCenter(544)
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide 25
 */
export function buildZoomAnimation(ctx: AnimationBuildContext): string {
	console.log(`[ZOOM TEMPLATE] Called for spid=${ctx.shapeId}, direction=${ctx.directionConfig?.name}, subtype=${ctx.directionConfig?.presetSubtype}, type=${ctx.type}`);

	const { shapeId, animation, config, directionConfig, type, ids, target, sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 500;
	const delay = animation.delay ?? config.defaultDelay ?? 0

	const isEntrance = type === 'entrance';
	const presetClass = isEntrance ? 'entr' : 'exit';
	const visibilityValue = isEntrance ? 'visible' : 'hidden';

	// CRITICAL FIX: Map direction to correct presetSubtype based on entrance/exit and sequence mode
	// The registry has shared directions, but entrance/exit need different subtypes
	// Additionally, for exit animations with 'inBottom' and 'slideCenter':
	//   - asOneObject uses the special subtype (20 or 544)
	//   - allAtOnce and byParagraph use default subtype 16
	let presetSubtype = directionConfig?.presetSubtype || 16;

	// For exit animations, apply special remapping rules
	if (!isEntrance && directionConfig?.name) {
		const dirName = directionConfig.name.toLowerCase();

		// Exit-specific mappings that differ from entrance:
		// 1. 'objectCenter'/'inCenter' (entrance=528) → always use default 16 for exit (all modes)
		// 2. 'outBottom' (entrance=36) → always use default 16 for exit (all modes)
		// 3. 'inBottom' (20) → use 20 for background/asOneObject, 16 for paragraphs
		// 4. 'slideCenter'/'outCenter' (544) → use 544 for background/asOneObject, 16 for paragraphs
		if (dirName === 'objectcenter' || dirName === 'incenter' || dirName === 'outbottom') {
			presetSubtype = 16; // Exit always uses default for these
			console.log(`[ZOOM FIX] Exit ${dirName}: using default subtype 16`);
		}
		// Removed aggressive paragraph remapping for inbottom/slidecenter/outcenter to allow native subtypes 20/544 to pass through
		/* else if ((dirName === 'inbottom' || dirName === 'slidecenter' || dirName === 'outcenter') && target?.type === 'paragraph') {
			// For paragraph animations in sequence mode, use default instead of special subtype
			// Background/asOneObject keeps the special subtype (20 or 544)
			presetSubtype = 16;
			console.log(`[ZOOM FIX] Exit ${dirName} paragraph: using default subtype 16 instead of ${directionConfig.presetSubtype}`);
		} */
	}

	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}

	// Determine structure based on presetSubtype
	let childElements: string;

	if (presetSubtype === 528 || presetSubtype === 544) {
		// 5 elements: 1 set + 4 anim (for objectCenter/slideCenter variants)
		// CRITICAL: Element order differs for entrance vs exit
		// CRITICAL: Attribute order is ALWAYS: ppt_w, ppt_h, ppt_x, ppt_y (NOT x,y,w,h!)
		// Entrance (528): set, anim(w), anim(h), anim(x), anim(y) - all with fill="hold"
		// Exit (544): anim(w), anim(h), anim(x), anim(y), set - anims WITHOUT fill="hold"
		// Formulas: entrance 0/0.5 → #ppt, exit ppt → 0/0.5
		const setId = getNextAnimationId();
		const animWId = getNextAnimationId();
		const animHId = getNextAnimationId();
		const animXId = getNextAnimationId();
		const animYId = getNextAnimationId();

		// Build visibility setter
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

		// Helper to generate correct value element
		const genVal = (val: string) => {
			// Use fltVal for numeric literals (0, 0.5), strVal for formulas
			if (val === '0' || val === '0.5') {
				return `<p:fltVal val="${val}"/>`;
			}
			return `<p:strVal val="${val}"/>`;
		};

		// CRITICAL: Exit anims do NOT have fill="hold", entrance anims DO
		const animFill = isEntrance ? ' fill="hold"' : '';

		// CRITICAL: Order is w, h, x, y (not x, y, w, h!)
		const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(isEntrance ? '0' : 'ppt_w')}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(isEntrance ? '#ppt_w' : '0')}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animHId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_h</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(isEntrance ? '0' : 'ppt_h')}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(isEntrance ? '#ppt_h' : '0')}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(isEntrance ? '0.5' : 'ppt_x')}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(isEntrance ? '#ppt_x' : '0.5')}</p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}"${animFill}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val>${genVal(isEntrance ? '0.5' : 'ppt_y')}</p:val></p:tav>
						<p:tav tm="100000"><p:val>${genVal(isEntrance ? '#ppt_y' : '0.5')}</p:val></p:tav>
					</p:tavLst>
				</p:anim>`;

		// Combine in correct order
		if (isEntrance) {
			childElements = setElement + animElements;
		} else {
			childElements = animElements + setElement;
		}
	} else if (presetSubtype === 36) {
		// 5 elements: 1 set + 4 anim (for outBottom entrance variant)
		// CRITICAL: This subtype uses COMPLEX formulas different from 528/544
		// Entrance (36): set, anim(w), anim(h), anim(x), anim(y)
		// Complex formula: (6*min(max(#ppt_w*#ppt_h,.3),1)-7.4)/-.7*#ppt_w
		const setId = getNextAnimationId();
		const animWId = getNextAnimationId();
		const animHId = getNextAnimationId();
		const animXId = getNextAnimationId();
		const animYId = getNextAnimationId();

		// Complex formulas for outBottom entrance
		const complexW = '(6*min(max(#ppt_w*#ppt_h,.3),1)-7.4)/-.7*#ppt_w';
		const complexH = '(6*min(max(#ppt_w*#ppt_h,.3),1)-7.4)/-.7*#ppt_h';
		const complexY = '1+(6*min(max(#ppt_w*#ppt_h,.3),1)-7.4)/-.7*#ppt_h/2';

		// Build visibility setter
		const setElement = `
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
					<p:to><p:strVal val="visible"/></p:to>
				</p:set>`;

		// CRITICAL: Order is w, h, x, y
		const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_w</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${complexW}"/></p:val></p:tav>
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
						<p:tav tm="0"><p:val><p:strVal val="${complexH}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_h"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:fltVal val="0.5"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${complexY}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="#ppt_y"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;

		// Entrance: set first
		childElements = setElement + animElements;
	} else if (presetSubtype === 20) {
		// 4 elements: 1 set + 3 anim (for inBottom exit variant)
		// Exit (20): anim(w), anim(h), anim(y), set
		const setId = getNextAnimationId();
		const animWId = getNextAnimationId();
		const animHId = getNextAnimationId();
		const animYId = getNextAnimationId();

		// Build visibility setter
		const setElement = `
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

		// Build 3 anim elements (w, h, y)
		const animElements = `
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
						<p:tav tm="100000"><p:val><p:strVal val="(6*min(max(ppt_w*ppt_h,.3),1)-7.4)/-.7*ppt_w"/></p:val></p:tav>
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
						<p:tav tm="100000"><p:val><p:strVal val="(6*min(max(ppt_w*ppt_h,.3),1)-7.4)/-.7*ppt_h"/></p:val></p:tav>
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
						<p:tav tm="100000"><p:val><p:strVal val="1+(6*min(max(ppt_w*ppt_h,.3),1)-7.4)/-.7*ppt_h/2"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;

		// Always: anim, anim, anim, set (exit only)
		childElements = animElements + setElement;
	} else {
		// 3 elements: 1 set + 2 anim (standard Zoom variants)
		// CRITICAL: Element order differs for entrance vs exit
		// Entrance: set, anim, anim
		// Exit: anim, anim, set
		const setId = getNextAnimationId();
		const animWId = getNextAnimationId();
		const animHId = getNextAnimationId();

		// Build visibility setter
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

		// Build width and height animations based on subtype
		// CRITICAL: Formulas differ by BOTH subtype AND entrance/exit!
		// 
		// Subtype 16 (in):
		//   Entrance: 0 → #ppt_w/h (grow from nothing)
		//   Exit: ppt_w/h → 4*ppt_w/h (grow huge then disappear)
		// 
		// Subtype 32 (out):
		//   Entrance: 4*#ppt_w/h → #ppt_w/h (shrink from huge)
		//   Exit: ppt_w/h → 0 (shrink to nothing)
		// 
		// Subtype 272 (inSlightly):
		//   Entrance: 2/3*#ppt_w/h → #ppt_w/h (grow slightly)
		//   Exit: ppt_w/h → 4/3*ppt_w/h (grow slightly then disappear)
		// 
		// Subtype 288 (outSlightly):
		//   Entrance: 4/3*#ppt_w/h → #ppt_w/h (shrink slightly)
		//   Exit: ppt_w/h → 2/3*ppt_w/h (shrink slightly then disappear)

		let wFrom: string, wTo: string, hFrom: string, hTo: string;

		if (isEntrance) {
			// Entrance formulas use # prefix
			switch (presetSubtype) {
				case 16: // in
					wFrom = '0'; wTo = '#ppt_w';
					hFrom = '0'; hTo = '#ppt_h';
					break;
				case 32: // out
					wFrom = '4*#ppt_w'; wTo = '#ppt_w';
					hFrom = '4*#ppt_h'; hTo = '#ppt_h';
					break;
				case 272: // inSlightly
					wFrom = '2/3*#ppt_w'; wTo = '#ppt_w';
					hFrom = '2/3*#ppt_h'; hTo = '#ppt_h';
					break;
				case 288: // outSlightly
					wFrom = '4/3*#ppt_w'; wTo = '#ppt_w';
					hFrom = '4/3*#ppt_h'; hTo = '#ppt_h';
					break;
				default:
					// Default to subtype 16 behavior
					wFrom = '0'; wTo = '#ppt_w';
					hFrom = '0'; hTo = '#ppt_h';
			}
		} else {
			// Exit formulas do NOT use # prefix
			switch (presetSubtype) {
				case 16: // in
					wFrom = 'ppt_w'; wTo = '4*ppt_w';
					hFrom = 'ppt_h'; hTo = '4*ppt_h';
					break;
				case 32: // out
					wFrom = 'ppt_w'; wTo = '0';
					hFrom = 'ppt_h'; hTo = '0';
					break;
				case 272: // inSlightly
					wFrom = 'ppt_w'; wTo = '4/3*ppt_w';
					hFrom = 'ppt_h'; hTo = '4/3*ppt_h';
					break;
				case 288: // outSlightly
					wFrom = 'ppt_w'; wTo = '2/3*ppt_w';
					hFrom = 'ppt_h'; hTo = '2/3*ppt_h';
					break;
				default:
					// Default to subtype 16 behavior
					wFrom = 'ppt_w'; wTo = '4*ppt_w';
					hFrom = 'ppt_h'; hTo = '4*ppt_h';
			}
		}

		// Helper to generate correct value element (fltVal for '0', strVal for formulas)
		const genVal = (val: string) => {
			return val === '0' ? `<p:fltVal val="0"/>` : `<p:strVal val="${val}"/>`;
		};

		// CRITICAL: Exit anims do NOT have fill="hold", entrance anims DO
		const animFill = isEntrance ? ' fill="hold"' : '';

		const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animWId}" dur="${duration}"${animFill}/>
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
						<p:cTn id="${animHId}" dur="${duration}"${animFill}/>
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

		// Combine in correct order
		if (isEntrance) {
			childElements = setElement + animElements;
		} else {
			childElements = animElements + setElement;
		}
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

	const childCount = (result.match(/<p:set|<p:anim/g) || []).length;
	const expectedCount = (presetSubtype === 528 || presetSubtype === 36 || presetSubtype === 544) ? 5 : (presetSubtype === 20 ? 4 : 3);
	console.log(`[ZOOM TEMPLATE] Returning XML with ${childCount} sub-elements (subtype ${presetSubtype} expects ${expectedCount})`);

	return result;
}
