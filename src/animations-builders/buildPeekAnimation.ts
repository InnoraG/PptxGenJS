/**
 * PptxGenJS: Peek Animation Builder
 * 
 * Structure: 1 set + 1 anim (position) + 1 animEffect (wipe filter)
 * 
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide7.xml
 * 
 * Peek uses directional motion with offset formulas:
 * - fromLeft (subtype 8):   ppt_x from #ppt_x-#ppt_w*1.125 to #ppt_x, filter=wipe(right)
 * - fromRight (subtype 2):  ppt_x from #ppt_x+#ppt_w*1.125 to #ppt_x, filter=wipe(left)
 * - fromTop (subtype 1):    ppt_y from #ppt_y-#ppt_h*1.125 to #ppt_y, filter=wipe(down)
 * - fromBottom (subtype 4): ppt_y from #ppt_y+#ppt_h*1.125 to #ppt_y, filter=wipe(up)
 * 
 * Exit reverses the formulas and filters.
 */

import { getNextAnimationId } from '../gen-animations-ids'
import type { AnimationBuildContext } from './types'
import { addHashPrefixForEntrance, getNodeTypeFromTrigger } from './utils'

export function buildPeekAnimation(ctx: AnimationBuildContext): string {
	const { shapeId, animation, config, directionConfig, type, ids, target } = ctx
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger)
	const duration = animation.duration || config.defaultDuration || 500
	const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0)

	const isEntrance = type === 'entrance'
	const presetClass = isEntrance ? 'entr' : 'exit'
	const visibilityValue = isEntrance ? 'visible' : 'hidden'
	const presetSubtype = directionConfig?.presetSubtype || 0

	// Build target XML
	let targetXml = `<p:spTgt spid="${shapeId}"/>`
	if (target?.type === 'background') {
		targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`
	} else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
		const idx = target.paragraphIndex
		targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`
	}

	// Determine attribute, formulas, and filter based on direction
	let attrName: string
	let fromFormula: string
	let toFormula: string
	let filterDirection: string

	// Map presetSubtype to direction configuration
	// Reference shows: subtype 8=fromLeft, 2=fromRight, 1=fromTop, 4=fromBottom
	// CRITICAL: Exit reverses from/to compared to entrance (FROM=#ppt_x, TO=offset)
	switch (presetSubtype) {
		case 8: // fromLeft
			attrName = 'ppt_x'
			if (isEntrance) {
				fromFormula = '#ppt_x-#ppt_w*1.125000'
				toFormula = '#ppt_x'
				filterDirection = 'right'
			} else {
				fromFormula = '#ppt_x'
				toFormula = '#ppt_x-#ppt_w*1.125000'
				filterDirection = 'left'
			}
			break
		case 2: // fromRight
			attrName = 'ppt_x'
			if (isEntrance) {
				fromFormula = '#ppt_x+#ppt_w*1.125000'
				toFormula = '#ppt_x'
				filterDirection = 'left'
			} else {
				fromFormula = '#ppt_x'
				toFormula = '#ppt_x+#ppt_w*1.125000'
				filterDirection = 'right'
			}
			break
		case 1: // fromTop
			attrName = 'ppt_y'
			if (isEntrance) {
				fromFormula = '#ppt_y-#ppt_h*1.125000'
				toFormula = '#ppt_y'
				filterDirection = 'down'
			} else {
				fromFormula = '#ppt_y'
				toFormula = '#ppt_y-#ppt_h*1.125000'
				filterDirection = 'up'
			}
			break
		case 4: // fromBottom
		default:
			attrName = 'ppt_y'
			if (isEntrance) {
				fromFormula = '#ppt_y+#ppt_h*1.125000'
				toFormula = '#ppt_y'
				filterDirection = 'up'
			} else {
				fromFormula = '#ppt_y'
				toFormula = '#ppt_y+#ppt_h*1.125000'
				filterDirection = 'down'
			}
			break
	}

	// Generate IDs for sub-elements
	const setId = getNextAnimationId()
	const animId = getNextAnimationId()
	const effectId = getNextAnimationId()

	// Build child elements in correct order
	// CRITICAL: Entrance: set, anim, animEffect
	//           Exit: anim, animEffect, set (with delay=duration-1)
	let childElements = ''

	if (isEntrance) {
		// Entrance: visibility setter first
		childElements += `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="0"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`
	}

	// Position animation (both entrance and exit)
	childElements += `
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr additive="base">
						<p:cTn id="${animId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>${attrName}</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						<p:tav tm="0">
							<p:val>
								<p:strVal val="${fromFormula}"/>
							</p:val>
						</p:tav>
						<p:tav tm="100000">
							<p:val>
								<p:strVal val="${toFormula}"/>
							</p:val>
						</p:tav>
					</p:tavLst>
				</p:anim>`

	// Wipe effect (both entrance and exit)
	childElements += `
				<p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="wipe(${filterDirection})">
					<p:cBhvr>
						<p:cTn id="${effectId}" dur="${duration}"/>
						<p:tgtEl>${targetXml}</p:tgtEl>
					</p:cBhvr>
				</p:animEffect>`

	if (!isEntrance) {
		// Exit: visibility setter last with delay=duration-1
		childElements += `
				<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst>
								<p:cond delay="${duration - 1}"/>
							</p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst>
							<p:attrName>style.visibility</p:attrName>
						</p:attrNameLst>
					</p:cBhvr>
					<p:to>
						<p:strVal val="${visibilityValue}"/>
					</p:to>
				</p:set>`
	}

	// Build the animation XML
	return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst>
				<p:cond delay="${delay}"/>
			</p:stCondLst>
			<p:childTnLst>${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`
}
