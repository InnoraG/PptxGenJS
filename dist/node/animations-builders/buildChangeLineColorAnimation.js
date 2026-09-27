import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
import { animationColorXml, getAnimationVariantRgb } from './colorVariantUtils';
/**
 * Build ChangeLineColor emphasis animation (presetID=7, presetSubtype=2)
 * Structure: 1 animClr (stroke.color) + 1 set (stroke.on = true)
 *
 * Reference: tmp_autonomous_test/Focused_Emphasis_Showcase_BATCH4_BASE.pptx slide7.xml
 */
export function buildChangeLineColorAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, ids, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 1000;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const colorXml = animationColorXml(getAnimationVariantRgb(animation));
    // Build target XML (emphasis animations use bare targeting)
    const targetXml = `<p:spTgt spid="${shapeId}"/>`;
    // Generate IDs for sub-elements
    const animClrId = getNextAnimationId();
    const setId = getNextAnimationId();
    // Build the complete animation
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="2" fill="hold" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:animClr clrSpc="rgb" dir="cw">
					<p:cBhvr>
						<p:cTn id="${animClrId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>stroke.color</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						${colorXml}
					</p:to>
				</p:animClr>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>stroke.on</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="true"/>
					</p:to>
				</p:set>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildChangeLineColorAnimation.js.map