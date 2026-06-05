import { getNextAnimationId } from '../gen-animations-ids'
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'

/**
 * Build Shimmer animation (presetID=36)
 * 
 * Structure: animScale + anim(ppt_x) + anim(ppt_y) + animRot
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide15.xml
 * 
 * This is an emphasis effect that creates a shimmering motion with:
 * - Scale animation (80000, 100000) with autoRev
 * - Horizontal movement formula: (#ppt_w*0.10)
 * - Vertical movement formula: (-#ppt_w*0.10)
 * - Rotation: -480000 (with autoRev for oscillation)
 * - Uses <p:iterate> element for repeating effect
 */
export function buildShimmerAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const duration = animation.duration || config.defaultDuration || 350
	const delay = animation.delay ?? config.defaultDelay ?? 0
	
	// Build target XML - emphasis animations typically use bare target
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}
	
	// Generate IDs for all 4 sub-elements
	const scaleId = getNextAnimationId()
	const animXId = getNextAnimationId()
	const animYId = getNextAnimationId()
	const rotId = getNextAnimationId()
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:iterate type="lt">
				<p:tmPct val="10000"/>
			</p:iterate>
			<p:childTnLst>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scaleId}" dur="${duration}" autoRev="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:to x="80000" y="100000"/>
				</p:animScale>
				<p:anim by="(#ppt_w*0.10)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animXId}" dur="${duration}" autoRev="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_x</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:anim by="(-#ppt_w*0.10)" calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${animYId}" dur="${duration}" autoRev="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>ppt_y</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:anim>
				<p:animRot by="-480000">
					<p:cBhvr>
						<p:cTn id="${rotId}" dur="${duration}" autoRev="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>r</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
				</p:animRot>
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
