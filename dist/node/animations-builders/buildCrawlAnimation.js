/**
 * Build Crawl animation (presetID=7)
 *
 * Crawl is a position-based entrance/exit animation that slides the object
 * from off-screen to its final position (entrance) or vice versa (exit).
 *
 * Structure: 1 set + 2 anim (ppt_x, ppt_y)
 *
 * Direction mappings:
 * - fromLeft (8): slides from left edge (x: 0-#ppt_w/2 -> #ppt_x)
 * - fromRight (2): slides from right edge (x: 1+#ppt_w/2 -> #ppt_x)
 * - fromTop (1): slides from top edge (y: 0-#ppt_h/2 -> #ppt_y)
 * - fromBottom (4): slides from bottom edge (y: 1+#ppt_h/2 -> #ppt_y)
 *
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide6.xml
 */
import { getNodeTypeFromTrigger } from './utils';
import { addHashPrefixForEntrance } from './utils';
import { getNextAnimationId } from '../gen-animations-ids';
export function buildCrawlAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, directionConfig, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
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
    // Determine direction and formulas based on presetSubtype
    let xFrom, xTo, yFrom, yTo;
    if (presetSubtype === 8 || presetSubtype === 2) {
        // Horizontal movement (fromLeft=8, fromRight=2)
        if (presetSubtype === 8) {
            // fromLeft
            xFrom = addHashPrefixForEntrance(isEntrance ? '0-ppt_w/2' : 'ppt_x', isEntrance);
            xTo = addHashPrefixForEntrance(isEntrance ? 'ppt_x' : '0-ppt_w/2', isEntrance);
        }
        else {
            // fromRight
            xFrom = addHashPrefixForEntrance(isEntrance ? '1+ppt_w/2' : 'ppt_x', isEntrance);
            xTo = addHashPrefixForEntrance(isEntrance ? 'ppt_x' : '1+ppt_w/2', isEntrance);
        }
        // Y stays constant
        yFrom = addHashPrefixForEntrance('ppt_y', isEntrance);
        yTo = addHashPrefixForEntrance('ppt_y', isEntrance);
    }
    else {
        // Vertical movement (fromTop=1, fromBottom=4)
        // X stays constant
        xFrom = addHashPrefixForEntrance('ppt_x', isEntrance);
        xTo = addHashPrefixForEntrance('ppt_x', isEntrance);
        if (presetSubtype === 1) {
            // fromTop
            yFrom = addHashPrefixForEntrance(isEntrance ? '0-ppt_h/2' : 'ppt_y', isEntrance);
            yTo = addHashPrefixForEntrance(isEntrance ? 'ppt_y' : '0-ppt_h/2', isEntrance);
        }
        else {
            // fromBottom
            yFrom = addHashPrefixForEntrance(isEntrance ? '1+ppt_h/2' : 'ppt_y', isEntrance);
            yTo = addHashPrefixForEntrance(isEntrance ? 'ppt_y' : '1+ppt_h/2', isEntrance);
        }
    }
    // Generate IDs for sub-elements
    const setId = getNextAnimationId();
    const animXId = getNextAnimationId();
    const animYId = getNextAnimationId();
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
    // Build animation elements
    // CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
    const fillAttr = isEntrance ? ' fill="hold"' : '';
    const animElements = `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${animXId}" dur="${duration}"${fillAttr}/>
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
					<p:cBhvr additive="base">
						<p:cTn id="${animYId}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0"><p:val><p:strVal val="${yFrom}"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${yTo}"/></p:val></p:tav>
					</p:tavLst>
				</p:anim>`;
    // CRITICAL: Element order differs for entrance vs exit
    // Entrance: set + anim(x) + anim(y)
    // Exit: anim(x) + anim(y) + set
    const childElements = isEntrance ? (setElement + animElements) : (animElements + setElement);
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
//# sourceMappingURL=buildCrawlAnimation.js.map