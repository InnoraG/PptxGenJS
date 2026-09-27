import { getNextAnimationId } from '../gen-animations-ids';
/**
 * Build LightSpeed animation (presetID=34)
 *
 * Entrance structure (5 elements):
 *   1. set: visibility=visible (dur=1, delay=0)
 *   2. anim: ppt_x from (-#ppt_w/2) to (#ppt_x) (dur=420)
 *   3. anim: xshear from 0 to -1.0 (dur=140, delay=420, decel=50000, autoRev=1)
 *   4. animScale: from 100000,100000 to 80000,100000 (dur=140, delay=420, decel=100000, autoRev=1)
 *   5. anim: ppt_x additive=sum, by=(#ppt_h/3+#ppt_w*0.1) (dur=140, delay=420, decel=100000, autoRev=1)
 *
 * Exit structure (4 elements):
 *   1. anim: ppt_x from (ppt_x) to (ppt_x+1) (dur=700)
 *   2. anim: xshear from 0 to -1.0 (dur=140, accel=50000)
 *   3. set: xshear = "-1.0" (dur=560, delay=140)
 *   4. set: visibility=hidden (dur=1, delay=699)
 *
 * Reference: Batch2 frozen reference slide2.xml
 */
export function buildLightSpeedAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target } = ctx;
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
    let childElements;
    if (isEntrance) {
        // Entrance: 5 elements
        // Timing: Phase 1 (dur=420) for position slide-in, Phase 2 (dur=140, delay=420) for wobble effect
        const setId = getNextAnimationId();
        const anim1Id = getNextAnimationId();
        const anim2Id = getNextAnimationId();
        const scaleId = getNextAnimationId();
        const anim3Id = getNextAnimationId();
        // Fixed timing values from frozen reference (Batch2 slide2.xml)
        // LightSpeed entrance has specific timing that should not be scaled
        const phase1Dur = 420; // Position slide-in duration
        const phase2Dur = 140; // Wobble effect duration
        const phase2Delay = 420; // Wobble starts after slide-in completes
        childElements = `
                  <p:set>
                    <p:cBhvr>
                      <p:cTn id="${setId}" dur="1" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="0"/>
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
                      <p:strVal val="visible"/>
                    </p:to>
                  </p:set>
                  <p:anim from="(-#ppt_w/2)" to="(#ppt_x)" calcmode="lin" valueType="num">
                    <p:cBhvr>
                      <p:cTn id="${anim1Id}" dur="${phase1Dur}" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="0"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                      <p:attrNameLst>
                        <p:attrName>ppt_x</p:attrName>
                      </p:attrNameLst>
                    </p:cBhvr>
                  </p:anim>
                  <p:anim from="0" to="-1.0" calcmode="lin" valueType="num">
                    <p:cBhvr>
                      <p:cTn id="${anim2Id}" dur="${phase2Dur}" decel="50000" autoRev="1" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="${phase2Delay}"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                      <p:attrNameLst>
                        <p:attrName>xshear</p:attrName>
                      </p:attrNameLst>
                    </p:cBhvr>
                  </p:anim>
                  <p:animScale>
                    <p:cBhvr>
                      <p:cTn id="${scaleId}" dur="${phase2Dur}" decel="100000" autoRev="1" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="${phase2Delay}"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                    </p:cBhvr>
                    <p:from x="100000" y="100000"/>
                    <p:to x="80000" y="100000"/>
                  </p:animScale>
                  <p:anim by="(#ppt_h/3+#ppt_w*0.1)" calcmode="lin" valueType="num">
                    <p:cBhvr additive="sum">
                      <p:cTn id="${anim3Id}" dur="${phase2Dur}" decel="100000" autoRev="1" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="${phase2Delay}"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                      <p:attrNameLst>
                        <p:attrName>ppt_x</p:attrName>
                      </p:attrNameLst>
                    </p:cBhvr>
                  </p:anim>`;
    }
    else {
        // Exit: 4 elements
        // Reference uses dur=700 for main position anim, dur=140 for shear, then holds
        const anim1Id = getNextAnimationId();
        const anim2Id = getNextAnimationId();
        const set1Id = getNextAnimationId();
        const set2Id = getNextAnimationId();
        // Reference timing: 140ms for shear animation, then 560ms hold, total 700ms
        const shearDur = Math.round(duration * 140 / 700);
        const holdDur = duration - shearDur; // Remaining time for hold
        const visDelay = duration - 1; // Hide at the very end
        childElements = `
                  <p:anim from="(ppt_x)" to="(ppt_x+1)" calcmode="lin" valueType="num">
                    <p:cBhvr>
                      <p:cTn id="${anim1Id}" dur="${duration}">
                        <p:stCondLst>
                          <p:cond delay="0"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                      <p:attrNameLst>
                        <p:attrName>ppt_x</p:attrName>
                      </p:attrNameLst>
                    </p:cBhvr>
                  </p:anim>
                  <p:anim from="0" to="-1.0" calcmode="lin" valueType="num">
                    <p:cBhvr>
                      <p:cTn id="${anim2Id}" dur="${shearDur}" accel="50000">
                        <p:stCondLst>
                          <p:cond delay="0"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                      <p:attrNameLst>
                        <p:attrName>xshear</p:attrName>
                      </p:attrNameLst>
                    </p:cBhvr>
                  </p:anim>
                  <p:set>
                    <p:cBhvr>
                      <p:cTn id="${set1Id}" dur="${holdDur}">
                        <p:stCondLst>
                          <p:cond delay="${shearDur}"/>
                        </p:stCondLst>
                      </p:cTn>
                      <p:tgtEl>
                        ${targetXml}
                      </p:tgtEl>
                      <p:attrNameLst>
                        <p:attrName>xshear</p:attrName>
                      </p:attrNameLst>
                    </p:cBhvr>
                    <p:to>
                      <p:strVal val="-1.0"/>
                    </p:to>
                  </p:set>
                  <p:set>
                    <p:cBhvr>
                      <p:cTn id="${set2Id}" dur="1" fill="hold">
                        <p:stCondLst>
                          <p:cond delay="${visDelay}"/>
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
                      <p:strVal val="hidden"/>
                    </p:to>
                  </p:set>`;
    }
    // Main animation wrapper
    const nodeType = ctx.nodeType || 'clickEffect';
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
//# sourceMappingURL=buildLightSpeedAnimation.js.map