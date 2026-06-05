import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Boomerang animation (presetID=25)
 * 
 * Structure: 9 elements total
 * 1. set - visibility (dur 1)
 * 2. anim - style.rotation: -90° → 0° (dur 350, decel 50000)
 * 3. anim - ppt_w: #ppt_w → #ppt_w*.05 (dur 350, decel 50000) - shrinks width
 * 4. anim - ppt_w: #ppt_w*.05 → #ppt_w (dur 350, accel 50000, delay 350) - grows back
 * 5. anim - ppt_h: #ppt_h → #ppt_h (dur 700) - maintains height
 * 6. anim - ppt_x: #ppt_x+.4 → #ppt_x (dur 350, decel 50000) - moves left
 * 7. anim - ppt_y: #ppt_y-.2 → #ppt_y+.1 (dur 350, decel 50000) - moves down
 * 8. anim - ppt_y: #ppt_y+.1 → #ppt_y (dur 350, accel 50000, delay 350) - returns
 * 9. animEffect - fade in (dur 700, decel 50000)
 * 
 * Reference: tmp_autonomous_test/Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide7.xml
 */
export function buildBoomerangAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    
    // Calculate scaling factor for proportional choreography
    // Default Boomerang duration is 700ms - scale all internal timing proportionally
    const DEFAULT_DURATION = 700;
    const scaleFactor = duration / DEFAULT_DURATION;
    
    // Base timing values that will be scaled
    const phaseDur = Math.round(350 * scaleFactor);  // Half of total duration
    const totalDur = Math.round(700 * scaleFactor);  // Full duration
    const setDelayExit = Math.max(0, Math.round((700 - 1) * scaleFactor));  // duration - 1
    const transition = isEntrance ? 'in' : 'out';
    
    // Build target XML
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate unique IDs for all 9 elements
    const setId = getNextAnimationId();
    const rotId = getNextAnimationId();
    const wId1 = getNextAnimationId();
    const wId2 = getNextAnimationId();
    const hId = getNextAnimationId();
    const xId = getNextAnimationId();
    const yId1 = getNextAnimationId();
    const yId2 = getNextAnimationId();
    const effectId = getNextAnimationId();
    
    // Entrance-specific values
    if (isEntrance) {
        return `<p:par>
    <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
        <p:stCondLst>
            <p:cond delay="${delay}"/>
        </p:stCondLst>
        <p:childTnLst>
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
            </p:set>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${rotId}" dur="${phaseDur}" decel="50000" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>style.rotation</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:fltVal val="-90"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:fltVal val="0"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${wId1}" dur="${phaseDur}" decel="50000" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_w</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="#ppt_w"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="#ppt_w*.05"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${wId2}" dur="${phaseDur}" accel="50000" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="${phaseDur}"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_w</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="#ppt_w*.05"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="#ppt_w"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${hId}" dur="${totalDur}" fill="hold"/>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_h</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="#ppt_h"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="#ppt_h"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${xId}" dur="${phaseDur}" decel="50000" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_x</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="#ppt_x+.4"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="#ppt_x"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${yId1}" dur="${phaseDur}" decel="50000" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_y</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="#ppt_y-.2"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="#ppt_y+.1"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${yId2}" dur="${phaseDur}" accel="50000" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="${phaseDur}"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_y</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="#ppt_y+.1"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="#ppt_y"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:animEffect transition="${transition}" filter="fade">
                <p:cBhvr>
                    <p:cTn id="${effectId}" dur="${totalDur}" decel="50000">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                </p:cBhvr>
            </p:animEffect>
        </p:childTnLst>
    </p:cTn>
</p:par>`;
    }
    
    // Exit version - DIFFERENT structure and formulas from entrance!
    // Order: animEffect, yId1, yId2, xId, hId, wId1, wId2, rotId, set
        return `<p:par>
    <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
        <p:stCondLst>
            <p:cond delay="${delay}"/>
        </p:stCondLst>
        <p:childTnLst>
            <p:animEffect transition="${transition}" filter="fade">
                <p:cBhvr>
                    <p:cTn id="${effectId}" dur="${totalDur}" accel="50000">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                </p:cBhvr>
            </p:animEffect>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${yId1}" dur="${phaseDur}" accel="50000">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_y</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="ppt_y"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="ppt_y+.1"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${yId2}" dur="${phaseDur}" decel="50000">
                        <p:stCondLst>
                            <p:cond delay="${phaseDur}"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_y</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="ppt_y"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="ppt_y-.1"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${xId}" dur="${phaseDur}" accel="50000">
                        <p:stCondLst>
                            <p:cond delay="${phaseDur}"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_x</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="ppt_x"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="ppt_x+.4"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${hId}" dur="${totalDur}"/>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_h</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="ppt_h"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="ppt_h"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${wId1}" dur="${phaseDur}" accel="50000">
                        <p:stCondLst>
                            <p:cond delay="0"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_w</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="ppt_w"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="ppt_w*.05"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${wId2}" dur="${phaseDur}" decel="50000">
                        <p:stCondLst>
                            <p:cond delay="${phaseDur}"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>ppt_w</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:strVal val="ppt_w"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:strVal val="ppt_w/.05"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:anim calcmode="lin" valueType="num">
                <p:cBhvr>
                    <p:cTn id="${rotId}" dur="${phaseDur}" accel="50000">
                        <p:stCondLst>
                            <p:cond delay="${phaseDur}"/>
                        </p:stCondLst>
                    </p:cTn>
                    <p:tgtEl>${targetXml}</p:tgtEl>
                    <p:attrNameLst>
                        <p:attrName>style.rotation</p:attrName>
                    </p:attrNameLst>
                </p:cBhvr>
                <p:tavLst>
                    <p:tav tm="0">
                        <p:val>
                            <p:fltVal val="0"/>
                        </p:val>
                    </p:tav>
                    <p:tav tm="100000">
                        <p:val>
                            <p:fltVal val="-90"/>
                        </p:val>
                    </p:tav>
                </p:tavLst>
            </p:anim>
            <p:set>
                <p:cBhvr>
                    <p:cTn id="${setId}" dur="1" fill="hold">
                        <p:stCondLst>
                            <p:cond delay="${setDelayExit}"/>
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
            </p:set>
        </p:childTnLst>
    </p:cTn>
</p:par>`;
}
