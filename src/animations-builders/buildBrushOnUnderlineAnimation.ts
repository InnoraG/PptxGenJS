import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build BrushOnUnderline animation (presetID=18)
 * Structure: 1 set element (style.textDecorationUnderline) with iterate
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide14.xml
 */
export function buildBrushOnUnderlineAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 1000;
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	// Build target XML based on sequence mode
	let targetXml = `<p:spTgt spid="${shapeId}"/>`;
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex;
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
	}
	
	// Generate ID for set element
	const setId = getNextAnimationId();
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
						<p:cTn id="${setId}" dur="${duration}" fill="hold"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.textDecorationUnderline</p:attrName>
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
