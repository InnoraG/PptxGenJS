import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build RandomEffects (Dissolve) animation (presetID=24)
 * Structure: set (visibility) + anim (dummy placeholder)
 * Reference: Batch3 Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide6.xml
 *
 * CRITICAL: This effect requires a "dummy" p:anim element with:
 * - Empty 'to' attribute
 * - Empty p:attrName element
 * - Duration of 1ms
 * This is PowerPoint's way of implementing the random dissolve effect.
 */
export function buildRandomEffectsAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 500;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    // Generate IDs for sub-elements
    const setId = getNextAnimationId();
    const animId = getNextAnimationId();
    // Element ordering and fill differs for entrance vs exit (from frozen reference):
    // Entrance: set FIRST, anim second, anim HAS fill="hold"
    // Exit: anim FIRST (NO fill="hold"), set LAST
    // Delay: Comparator shows Reference uses delay=699 (duration-1) for Entrance p:set too!
    const setDelay = duration - 1;
    const animFill = isEntrance ? ' fill="hold"' : '';
    // Build visibility setter element
    const setElement = `<p:set>
    <p:cBhvr>
      <p:cTn id="${setId}" dur="1" fill="hold">
        <p:stCondLst>
          <p:cond delay="${setDelay}"/>
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
  </p:set>`;
    // Build dummy anim element (required by PowerPoint for random dissolve effect)
    const animElement = `<p:anim to="" calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animId}" dur="1"${animFill}/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst>
        <p:attrName/>
      </p:attrNameLst>
    </p:cBhvr>
  </p:anim>`;
    // Order: Entrance = set + anim, Exit = anim + set
    const childContent = isEntrance
        ? `${setElement}
        ${animElement}`
        : `${animElement}
        ${setElement}`;
    // Wrap in main par structure
    return `<p:par>
    <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
      <p:stCondLst>
        <p:cond delay="${delay}"/>
      </p:stCondLst>
      <p:childTnLst>
        ${childContent}
      </p:childTnLst>
    </p:cTn>
  </p:par>`;
}
//# sourceMappingURL=buildRandomEffectsAnimation.js.map