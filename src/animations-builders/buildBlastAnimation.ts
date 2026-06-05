import { getNextAnimationId } from '../gen-animations-ids'
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils'
import { animationColorXml, getAnimationVariantRgb } from './colorVariantUtils'

/**
 * Build Blast animation (presetID=14)
 * Structure: 2 animClr + 2 set + 3 animScale
 * Reference: Focused_Emphasis_Showcase_BATCH4_BASE_MANUALLYFROZEN.pptx slide11.xml
 * 
 * Duration pattern (from frozen reference):
 * - asOneObject/background: animClr=950, set=950, scale1=100, scale2=100, scale3=300
 * - paragraphs: 2× scaling → animClr=1900, set=1900, scale1=200, scale2=200, scale3=600
 */
export function buildBlastAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
	const delay = animation.delay ?? config.defaultDelay ?? 0
	const duration = animation.duration || config.defaultDuration || 700;
	
	// Calculate scaling factor for proportional choreography
	const DEFAULT_DURATION = 700;
	const scaleFactor = duration / DEFAULT_DURATION;
	
	// Paragraph targets use 2× duration scaling
	const isParagraph = target?.type === 'paragraph'
	
	// All timing values scale by both scaleFactor AND paragraph multiplier (2× for paragraphs)
	const delay50 = Math.round((isParagraph ? 100 : 50) * scaleFactor);
	const durAnimClr = Math.round((isParagraph ? 1900 : 950) * scaleFactor)
	const durSet = Math.round((isParagraph ? 1900 : 950) * scaleFactor)
	const durScale1 = Math.round((isParagraph ? 200 : 100) * scaleFactor)
	const durScale2 = Math.round((isParagraph ? 200 : 100) * scaleFactor)
	const durScale3 = Math.round((isParagraph ? 600 : 300) * scaleFactor)
	const delayScale2 = Math.round((isParagraph ? 200 : 100) * scaleFactor)
	const delayScale3 = Math.round((isParagraph ? 1400 : 700) * scaleFactor)
	
	// Build target XML based on sequence mode
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (isParagraph && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}
	
	// Generate IDs for all 7 sub-elements
	const mainId = getNextAnimationId()
	const animClr1Id = getNextAnimationId()
	const animClr2Id = getNextAnimationId()
	const set1Id = getNextAnimationId()
	const set2Id = getNextAnimationId()
	const scale1Id = getNextAnimationId()
	const scale2Id = getNextAnimationId()
	const scale3Id = getNextAnimationId()
	
	const colorXml = animationColorXml(getAnimationVariantRgb(animation), isParagraph)
	
	// Element order: animClr, animClr, set, set, animScale, animScale, animScale
	// Note: Blast (presetID=14) DOES have fill="hold" on preset cTn (unlike some other emphasis effects)
	return `<p:par>
		<p:cTn id="${mainId}" presetID="${config.presetId}" presetClass="emph" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>
				<p:animClr clrSpc="rgb" dir="cw">
					<p:cBhvr override="childStyle">
						<p:cTn id="${animClr1Id}" dur="${durAnimClr}" fill="hold">
							<p:stCondLst>
								<p:cond delay="${delay50}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.color</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						${colorXml}
					</p:to>
				</p:animClr>
				<p:animClr clrSpc="rgb" dir="cw">
					<p:cBhvr>
						<p:cTn id="${animClr2Id}" dur="${durAnimClr}" fill="hold">
							<p:stCondLst>
								<p:cond delay="${delay50}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>fillColor</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						${colorXml}
					</p:to>
				</p:animClr>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${set1Id}" dur="${durSet}" fill="hold">
							<p:stCondLst>
								<p:cond delay="${delay50}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>fill.type</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="solid"/>
					</p:to>
				</p:set>
				<p:set>
					<p:cBhvr>
						<p:cTn id="${set2Id}" dur="${durSet}" fill="hold">
							<p:stCondLst>
								<p:cond delay="${delay50}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>fill.on</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="true"/>
					</p:to>
				</p:set>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale1Id}" dur="${durScale1}" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="100000" y="100000"/>
					<p:to x="100000" y="5000"/>
				</p:animScale>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale2Id}" dur="${durScale2}" fill="hold">
							<p:stCondLst>
								<p:cond delay="${delayScale2}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:from x="100000" y="5000"/>
					<p:to x="120000" y="150000"/>
				</p:animScale>
				<p:animScale>
					<p:cBhvr>
						<p:cTn id="${scale3Id}" dur="${durScale3}" fill="hold">
							<p:stCondLst>
								<p:cond delay="${delayScale3}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
					<p:to x="120000" y="150000"/>
				</p:animScale>
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
