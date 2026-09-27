/**
 * PptxGenJS: Animation Engine V2 - CORRECTED
 *
 * This version uses templates extracted EXACTLY from the legacy engine.
 * Every detail matches the working output.
 */
import { getNextAnimationId } from './gen-animations-ids';
// REMOVED: gen-animations-templates-v2 was deleted (contained hardcoded templates with #ppt_ bug)
// import { 
// 	APPEAR_ENTRANCE_LEGACY, 
// 	APPEAR_EXIT_LEGACY,
// 	getFlyDirectionData
// } from './gen-animations-templates-v2';
// Stub implementations to fix build (V2 engine not used in production - only in legacy backup)
const APPEAR_ENTRANCE_LEGACY = '';
const APPEAR_EXIT_LEGACY = '';
function getFlyDirectionData(direction) {
    console.warn('V2 engine getFlyDirectionData stub called - V2 engine deprecated');
    return null;
}
/**
 * Simple template interpolation
 */
function interpolate(template, params) {
    let result = template;
    for (const [key, value] of Object.entries(params)) {
        const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
        result = result.replace(placeholder, String(value));
    }
    return result;
}
/**
 * Direction to presetSubtype mapping (from legacy engine line 433-440)
 */
function getPresetSubtype(direction) {
    const map = {
        'fromBottom': 1, 'toBottom': 1,
        'fromRight': 2, 'toRight': 2,
        'fromTop': 3, 'toTop': 3,
        'fromLeft': 4, 'toLeft': 4,
        'fromTopLeft': 6, 'toTopLeft': 6,
        'fromTopRight': 12, 'toTopRight': 12,
        'fromBottomRight': 8, 'toBottomRight': 8,
        'fromBottomLeft': 9, 'toBottomLeft': 9
    };
    return map[direction] || 0;
}
/**
 * Generate Appear animation
 */
export function generateAppearAnimation(shape, animation, shapeId) {
    const isEntrance = animation.type === 'entrance';
    const template = isEntrance ? APPEAR_ENTRANCE_LEGACY : APPEAR_EXIT_LEGACY;
    const params = {
        id: getNextAnimationId(),
        childId: getNextAnimationId(),
        delay: animation.delay || 0,
        shapeId: shapeId.toString()
    };
    return interpolate(template, params);
}
/**
 * Generate Fly animation
 * EXACT refactoring from legacy gen-animations.ts lines 437-543
 */
export function generateFlyAnimation(shape, animation, shapeId) {
    const type = animation.type === 'entrance' ? 'entrance' : 'exit';
    const direction = animation.direction || 'fromBottom';
    const duration = animation.duration || 700;
    const delay = animation.delay || 0;
    console.log(`DEBUG V2 Fly: shapeId=${shapeId} type=${type} direction=${direction}`);
    const id = getNextAnimationId();
    const presetClass = type === 'entrance' ? 'entr' : 'exit';
    const visibilityValue = type === 'entrance' ? 'visible' : 'hidden';
    // Get direction data EXACTLY as legacy does
    const dir = getFlyDirectionData(direction);
    if (!dir) {
        console.warn(`Fly animation: Unknown direction "${direction}"`);
        return '';
    }
    console.log(`DEBUG V2 Fly: directionData found - subtype=${dir.subtype} xTo=${dir.xTo} yTo=${dir.yTo}`);
    const visDelay = type === 'exit' ? duration - 1 : 0;
    // Build XML EXACTLY as legacy function does (lines 488-543)
    let xml = `
		<p:par>
			<p:cTn id="${id}" presetID="2" presetClass="${presetClass}" presetSubtype="${dir.subtype}" fill="hold" grpId="0" nodeType="clickEffect">
				<p:stCondLst>
					<p:cond delay="${delay}"/>
				</p:stCondLst>
				<p:childTnLst>`;
    // Visibility setter for entrance (BEFORE animations)
    if (type === 'entrance') {
        xml += genXmlVisibilitySetterV2(getNextAnimationId(), shapeId, visibilityValue, visDelay);
    }
    // X coordinate animation
    xml += `
					<p:anim calcmode="lin" valueType="num">
						<p:cBhvr additive="base">
							<p:cTn id="${getNextAnimationId()}" dur="${duration}"/>
							<p:tgtEl>
								<p:spTgt spid="${shapeId}"/>
							</p:tgtEl>
							<p:attrNameLst>
								<p:attrName>ppt_x</p:attrName>
							</p:attrNameLst>
						</p:cBhvr>
						<p:tavLst>
							<p:tav tm="0">
								<p:val>
									<p:strVal val="${dir.xFrom}"/>
								</p:val>
							</p:tav>
							<p:tav tm="100000">
								<p:val>
									<p:strVal val="${dir.xTo}"/>
								</p:val>
							</p:tav>
						</p:tavLst>
					</p:anim>`;
    // Y coordinate animation
    xml += `
					<p:anim calcmode="lin" valueType="num">
						<p:cBhvr additive="base">
							<p:cTn id="${getNextAnimationId()}" dur="${duration}"/>
							<p:tgtEl>
								<p:spTgt spid="${shapeId}"/>
							</p:tgtEl>
							<p:attrNameLst>
								<p:attrName>ppt_y</p:attrName>
							</p:attrNameLst>
						</p:cBhvr>
						<p:tavLst>
							<p:tav tm="0">
								<p:val>
									<p:strVal val="${dir.yFrom}"/>
								</p:val>
							</p:tav>
							<p:tav tm="100000">
								<p:val>
									<p:strVal val="${dir.yTo}"/>
								</p:val>
							</p:tav>
						</p:tavLst>
					</p:anim>`;
    // Visibility setter for exit (AFTER animations)
    if (type === 'exit') {
        xml += genXmlVisibilitySetterV2(getNextAnimationId(), shapeId, visibilityValue, visDelay);
    }
    xml += `
				</p:childTnLst>
			</p:cTn>
		</p:par>`;
    return xml;
}
/**
 * Generate visibility setter XML
 * EXACT refactoring from legacy gen-animations.ts lines 390-405
 */
function genXmlVisibilitySetterV2(id, shapeId, value, delay = 0) {
    return `
					<p:set>
						<p:cBhvr>
							<p:cTn id="${id}" dur="1" fill="hold">
								<p:stCondLst>
									<p:cond delay="${delay}"/>
								</p:stCondLst>
							</p:cTn>
							<p:tgtEl>
								<p:spTgt spid="${shapeId}"/>
							</p:tgtEl>
							<p:attrNameLst>
								<p:attrName>style.visibility</p:attrName>
							</p:attrNameLst>
						</p:cBhvr>
						<p:to>
							<p:strVal val="${value}"/>
						</p:to>
					</p:set>`;
}
/**
 * Check if effect can be generated by this engine
 */
export function canGenerateV2(effect) {
    return effect === 'appear' || effect === 'fly';
}
/**
 * Generate animation using V2 engine
 */
export function generateAnimationV2(shape, animation, shapeId) {
    const effect = (animation.effect || 'appear').toLowerCase();
    if (effect === 'appear') {
        return generateAppearAnimation(shape, animation, shapeId);
    }
    else if (effect === 'fly') {
        return generateFlyAnimation(shape, animation, shapeId);
    }
    return undefined;
}
/**
 * ============================================================================
 * SEQUENCE MODE SUPPORT (allAtOnce, byParagraph)
 * ============================================================================
 */
/**
 * Generate animation XML for text with sequence modes
 * Returns array of animation XML strings
 */
export function generateTextAnimation(shapeId, animation, type, paragraphCount) {
    console.log(`DEBUG V2: generateTextAnimation shapeId=${shapeId} type=${type} sequence=${animation.sequence} paragraphs=${paragraphCount}`);
    const sequence = animation.sequence || 'asOneObject';
    // Handle asOneObject mode (single animation for entire shape)
    if (sequence === 'asOneObject') {
        // Use existing single-shape animation functions
        const effect = animation.effect || 'appear';
        let xml = '';
        if (effect === 'appear') {
            // Create a minimal shape object for the call
            const shape = { options: { _shapeId: shapeId } };
            xml = generateAppearAnimation(shape, animation, shapeId);
        }
        else if (effect === 'fly') {
            const shape = { options: { _shapeId: shapeId } };
            xml = generateFlyAnimation(shape, animation, shapeId);
        }
        return xml ? [xml] : [];
    }
    // Handle allAtOnce and byParagraph modes
    if (sequence === 'allAtOnce' || sequence === 'byParagraph') {
        return generateSequenceAnimation(shapeId, animation, type, paragraphCount, sequence);
    }
    throw new Error(`Unknown sequence mode: "${sequence}"`);
}
/**
 * Generate sequence animation (allAtOnce or byParagraph)
 */
function generateSequenceAnimation(shapeId, animation, type, paragraphCount, sequence) {
    const effect = animation.effect || 'appear';
    const delay = animation.delay || 0;
    const isAllAtOnce = sequence === 'allAtOnce';
    console.log(`DEBUG V2 Sequence: shapeId=${shapeId} effect=${effect} sequence=${sequence} isAllAtOnce=${isAllAtOnce}`);
    // For allAtOnce: all paragraphs share the same animation IDs
    // For byParagraph: each paragraph gets unique IDs
    let sharedIds = null;
    if (isAllAtOnce) {
        sharedIds = allocateSharedIds(effect);
    }
    // Generate core animations for all paragraphs
    const coreAnimations = [];
    // 1. Background animation (Entrance Only - goes first)
    if (type === 'entrance') {
        coreAnimations.push(generateSequenceCore(shapeId, animation, type, 0, true, isAllAtOnce, sharedIds));
    }
    // 2. Paragraph animations (Both Entrance & Exit)
    for (let i = 0; i < paragraphCount; i++) {
        coreAnimations.push(generateSequenceCore(shapeId, animation, type, i, false, isAllAtOnce, sharedIds));
    }
    // 3. Background animation (Exit Only - goes last)
    if (type === 'exit') {
        coreAnimations.push(generateSequenceCore(shapeId, animation, type, 0, true, isAllAtOnce, sharedIds));
    }
    // Wrap based on sequence mode
    return wrapSequenceAnimations(coreAnimations, isAllAtOnce);
}
function allocateSharedIds(effect) {
    const ids = {
        animId: getNextAnimationId()
    };
    if (effect === 'fly') {
        ids.visSetId = getNextAnimationId();
        ids.animXId = getNextAnimationId();
        ids.animYId = getNextAnimationId();
    }
    else {
        ids.setId = getNextAnimationId();
    }
    return ids;
}
/**
 * Generate a single core animation XML (without outer wrapper)
 */
function generateSequenceCore(shapeId, animation, type, paragraphIndex, isBackground, isAllAtOnce, sharedIds) {
    const effect = animation.effect || 'appear';
    const delay = animation.delay || 0;
    const duration = animation.duration || 700;
    // Determine nodeType
    const nodeType = (isAllAtOnce && !isBackground) ? 'withEffect' : 'clickEffect';
    // Get or allocate IDs
    const ids = sharedIds || allocateSharedIds(effect);
    if (effect === 'fly') {
        return generateFlySequenceCore(shapeId, animation, type, paragraphIndex, isBackground, nodeType, delay, duration, ids);
    }
    else {
        return generateNonFlySequenceCore(shapeId, animation, type, paragraphIndex, isBackground, nodeType, delay, ids);
    }
}
/**
 * Generate Fly effect core animation for sequence mode
 */
function generateFlySequenceCore(shapeId, animation, type, paragraphIndex, isBackground, nodeType, delay, duration, ids) {
    const direction = animation.direction || 'fromRight';
    const directionData = getFlyDirectionData(direction);
    if (!directionData) {
        console.error(`V2 Sequence: Unknown direction "${direction}" for ${type}`);
        // Fallback to default
        const fallback = type === 'entrance' ? 'fromRight' : 'toRight';
        return generateFlySequenceCore(shapeId, Object.assign(Object.assign({}, animation), { direction: fallback }), type, paragraphIndex, isBackground, nodeType, delay, duration, ids);
    }
    const presetClass = type === 'entrance' ? 'entr' : 'exit';
    const visibilityValue = type === 'entrance' ? 'visible' : 'hidden';
    // CRITICAL: For exit, visibility must be delayed until AFTER animation completes
    const visDelay = type === 'exit' ? duration - 1 : 0;
    // Target specification
    let targetXml = '';
    if (isBackground) {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else {
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${paragraphIndex}" end="${paragraphIndex}"/></p:txEl></p:spTgt>`;
    }
    // Build visibility setter XML
    const visibilitySetterXml = `<p:set>
					<p:cBhvr>
						<p:cTn id="${ids.visSetId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${visDelay}"/></p:stCondLst>
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
    // Build animation XMLs
    const animXml = `<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${ids.animXId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0">
							<p:val><p:strVal val="${directionData.xFrom}"/></p:val>
						</p:tav>
						<p:tav tm="100000">
							<p:val><p:strVal val="${directionData.xTo}"/></p:val>
						</p:tav>
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${ids.animYId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0">
							<p:val><p:strVal val="${directionData.yFrom}"/></p:val>
						</p:tav>
						<p:tav tm="100000">
							<p:val><p:strVal val="${directionData.yTo}"/></p:val>
						</p:tav>
					</p:tavLst>
				</p:anim>`;
    // CRITICAL: Order matters!
    // Entrance: visibility BEFORE animations
    // Exit: visibility AFTER animations
    const childXml = type === 'entrance'
        ? visibilitySetterXml + '\n' + animXml
        : animXml + '\n' + visibilitySetterXml;
    return `<p:par>
			<p:cTn id="${ids.animId}" presetID="2" presetClass="${presetClass}" presetSubtype="${directionData.subtype}" fill="hold" grpId="0" nodeType="${nodeType}">
				<p:stCondLst><p:cond delay="${isBackground ? delay : 0}"/></p:stCondLst>
				<p:childTnLst>
				${childXml}
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
}
/**
 * Generate non-Fly effect core animation for sequence mode
 */
function generateNonFlySequenceCore(shapeId, animation, type, paragraphIndex, isBackground, nodeType, delay, ids) {
    const effect = animation.effect || 'appear';
    const presetID = getPresetId(effect);
    const presetClass = type === 'entrance' ? 'entr' : 'exit';
    const visibilityValue = type === 'entrance' ? 'visible' : 'hidden';
    // Generate visibility setter based on target type
    let childXml = '';
    if (isBackground) {
        childXml = genXmlVisibilitySetter(ids.setId, shapeId, visibilityValue, 0, { type: 'background' });
    }
    else {
        childXml = genXmlVisibilitySetter(ids.setId, shapeId, visibilityValue, 0, { type: 'paragraph', paragraphIndex });
    }
    return `<p:par>
			<p:cTn id="${ids.animId}" presetID="${presetID}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
				<p:stCondLst><p:cond delay="${isBackground ? delay : 0}"/></p:stCondLst>
				<p:childTnLst>
					${childXml}
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim();
}
/**
 * Wrap animations based on sequence mode
 */
function wrapSequenceAnimations(coreAnimations, isAllAtOnce) {
    const wrappedAnimations = [];
    if (isAllAtOnce) {
        // allAtOnce: ONE wrapper containing ALL animations
        const wrapperId1 = getNextAnimationId();
        const wrapperId2 = getNextAnimationId();
        const allAnimsXml = coreAnimations.join('\n');
        wrappedAnimations.push(`<p:par>
			<p:cTn id="${wrapperId1}" fill="hold">
				<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${wrapperId2}" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
							<p:childTnLst>${allAnimsXml}</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim());
    }
    else {
        // byParagraph: Each animation gets its OWN wrapper
        for (const coreAnim of coreAnimations) {
            const wrapperId1 = getNextAnimationId();
            const wrapperId2 = getNextAnimationId();
            wrappedAnimations.push(`<p:par>
			<p:cTn id="${wrapperId1}" fill="hold">
				<p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
				<p:childTnLst>
					<p:par>
						<p:cTn id="${wrapperId2}" fill="hold">
							<p:stCondLst><p:cond delay="0"/></p:stCondLst>
							<p:childTnLst>${coreAnim}</p:childTnLst>
						</p:cTn>
					</p:par>
				</p:childTnLst>
			</p:cTn>
		</p:par>`.trim());
        }
    }
    return wrappedAnimations;
}
/**
 * Get preset ID for effect
 */
function getPresetId(effect) {
    const presetMap = {
        'appear': 1,
        'fly': 2,
        'fade': 10
    };
    return presetMap[effect] || 1;
}
/**
 * Generate visibility setter XML (helper for non-Fly effects)
 */
function genXmlVisibilitySetter(setId, shapeId, visibilityValue, delay, target) {
    let targetXml = '';
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph') {
        const idx = target.paragraphIndex || 0;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    else {
        targetXml = `<p:spTgt spid="${shapeId}"/>`;
    }
    return `<p:set>
		<p:cBhvr>
			<p:cTn id="${setId}" dur="1" fill="hold">
				<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
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
}
//# sourceMappingURL=gen-animations-engine-v2.js.map