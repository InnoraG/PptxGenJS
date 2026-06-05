import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';
import { animationColorXml, getAnimationVariantRgb } from './colorVariantUtils';

/**
 * Build BrushColor animation (presetID=16)
 * Structure: 3 set elements (style.color, fillcolor, fill.type) with iterate
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide13.xml
 */
export function buildBrushColorAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	
	// Duration: Only paragraph targets use defaultDuration (500ms for BrushColor)
	// All other targets (asOneObject, background) use 1000ms
	const isParagraph = target?.type === 'paragraph';
	const duration = isParagraph ? (animation.duration || config.defaultDuration || 500) : 1000;
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	const colorXml = animationColorXml(getAnimationVariantRgb(animation), isParagraph);
	
	// Build target XML based on sequence mode
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (isParagraph && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}
	
	// Generate IDs for all 3 set elements
	const setId1 = getNextAnimationId();
	const setId2 = getNextAnimationId();
	const setId3 = getNextAnimationId();
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:iterate type="lt">
				<p:tmPct val="4000"/>
			</p:iterate>
			<p:childTnLst>
				<p:set>
					<p:cBhvr override="childStyle">
						<p:cTn id="${setId1}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.color</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:clrVal>
							${colorXml}
						</p:clrVal>
					</p:to>
				</p:set>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId2}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>fillcolor</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:clrVal>
							${colorXml}
						</p:clrVal>
					</p:to>
				</p:set>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId3}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>fill.type</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="solid"/>
					</p:to>
				</p:set>
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
