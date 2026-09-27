/**
 * PptxGenJS: ArcUp/CurveUp Animation Builder (presetID=52)
 *
 * This animation combines:
 * - Visibility setter (first for entrance, last for exit)
 * - Scale animation (250%→100% entrance, 100%→250% exit)
 * - Motion path (curved arc path)
 * - Fade effect
 *
 * Reference: Batch2 frozen reference slide 5 (Curve Up/Curve Down)
 *
 * Element order:
 * - Entrance: set → animScale → animMotion → animEffect
 * - Exit: animScale → animMotion → animEffect → set
 */
import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
// Motion path data extracted from frozen reference
// Entrance path: curves from bottom-left to center
const ENTRANCE_PATH = 'M -0.46736 0.92887  C -0.37517 0.88508  -0.02552 0.75279  0.0908 0.66613  C  0.20747 0.57948  0.21649 0.50394  0.23177 0.40825  C 0.24705 0.31256  0.22118 0.15964   0.18264 0.09152  C 0.1441 0.02341  0.03802 0.0  0.0 0.0  ';
// Exit path: curves from center to bottom-left (reverse direction)
const EXIT_PATH = 'M 0.0000 0.0000 C 0.03802 0.0 0.1441 0.02341 0.1826 0.0915 C 0.22118 0.15964 0.24705 0.31256 0.2318 0.4083 C 0.21649 0.50394 0.20747 0.57948 0.0908 0.6661 C -0.02552 0.75279 -0.37517 0.88508 -0.4674 0.9289';
/**
 * Build ArcUp/CurveUp animation (presetID=52)
 */
export function buildArcUpAnimation(ctx) {
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
    // Generate unique IDs for all elements
    const setId = getNextAnimationId();
    const scaleId = getNextAnimationId();
    const motionId = getNextAnimationId();
    const effectId = getNextAnimationId();
    // Determine easing: entrance uses decel (ease out), exit uses accel (ease in)
    const easingAttr = isEntrance ? 'decel="50000"' : 'accel="50000"';
    // Scale values
    const scaleFrom = isEntrance ? { x: 250000, y: 250000 } : { x: 100000, y: 100000 };
    const scaleTo = isEntrance ? { x: 100000, y: 100000 } : { x: 250000, y: 250000 };
    // Motion path
    const motionPath = isEntrance ? ENTRANCE_PATH : EXIT_PATH;
    // Visibility setter delay: 0 for entrance, duration-1 for exit
    const visibilityDelay = isEntrance ? 0 : duration - 1;
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    // Build individual elements
    const setElement = `
					<p:set>
						<p:cBhvr>
							<p:cTn id="${setId}" dur="1" fill="hold">
								<p:stCondLst>
									<p:cond delay="${visibilityDelay}"/>
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
							<p:strVal val="${visibilityValue}"/>
						</p:to>
					</p:set>`;
    const scaleElement = `
					<p:animScale>
						<p:cBhvr>
							<p:cTn id="${scaleId}" dur="${duration}" ${easingAttr}>
								<p:stCondLst>
									<p:cond delay="0"/>
								</p:stCondLst>
							</p:cTn>
							<p:tgtEl>
								${targetXml}
							</p:tgtEl>
						</p:cBhvr>
						<p:from x="${scaleFrom.x}" y="${scaleFrom.y}"/>
						<p:to x="${scaleTo.x}" y="${scaleTo.y}"/>
					</p:animScale>`;
    const motionElement = `
					<p:animMotion origin="layout" path="${motionPath}" pathEditMode="relative" ptsTypes="">
						<p:cBhvr>
							<p:cTn id="${motionId}" dur="${duration}" ${easingAttr}>
								<p:stCondLst>
									<p:cond delay="0"/>
								</p:stCondLst>
							</p:cTn>
							<p:tgtEl>
								${targetXml}
							</p:tgtEl>
							<p:attrNameLst>
								<p:attrName>ppt_x</p:attrName>
								<p:attrName>ppt_y</p:attrName>
							</p:attrNameLst>
						</p:cBhvr>
					</p:animMotion>`;
    const effectElement = `
					<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="fade">
						<p:cBhvr>
							<p:cTn id="${effectId}" dur="${duration}"/>
							<p:tgtEl>
								${targetXml}
							</p:tgtEl>
						</p:cBhvr>
					</p:animEffect>`;
    // Assemble in correct order based on entrance/exit
    // Entrance: set → animScale → animMotion → animEffect
    // Exit: animScale → animMotion → animEffect → set
    const childElements = isEntrance
        ? setElement + scaleElement + motionElement + effectElement
        : scaleElement + motionElement + effectElement + setElement;
    return `<p:par>
				<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
					<p:stCondLst>
						<p:cond delay="${delay}"/>
					</p:stCondLst>
					<p:childTnLst>${childElements}
					</p:childTnLst>
				</p:cTn>
			</p:par>`;
}
//# sourceMappingURL=buildArcUpAnimation.js.map