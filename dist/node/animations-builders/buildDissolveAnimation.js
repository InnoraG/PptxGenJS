import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Dissolve animation (presetID=9)
 * Structure: set (visibility) + animEffect (dissolve filter)
 * Reference: Batch3 Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide3.xml
 *
 * Element order:
 * 1. <p:set> - visibility setter (delay=0, dur=1)
 * 2. <p:animEffect> - dissolve filter (dur=700)
 */
export function buildDissolveAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const transition = isEntrance ? 'in' : 'out';
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
    const effectId = getNextAnimationId();
    // Calculate set delay: entrance shows immediately (0), exit hides at end (duration - 1)
    const setDelay = isEntrance ? 0 : Math.max(0, duration - 1);
    // Build visibility setter element (appears immediately for entrance)
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
    // Build animEffect element with dissolve filter
    const animEffectElement = `<p:animEffect transition="${transition}" filter="dissolve">
    <p:cBhvr>
      <p:cTn id="${effectId}" dur="${duration}"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
  </p:animEffect>`;
    // Element order depends on entrance vs exit
    // Entrance: set (make visible) -> animEffect (dissolve in)
    // Exit: animEffect (dissolve out) -> set (hide)
    const elements = isEntrance
        ? `${setElement}\n        ${animEffectElement}`
        : `${animEffectElement}\n        ${setElement}`;
    // Wrap in main par structure
    return `<p:par>
    <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
      <p:stCondLst>
        <p:cond delay="${delay}"/>
      </p:stCondLst>
      <p:childTnLst>
        ${elements}
      </p:childTnLst>
    </p:cTn>
  </p:par>`;
}
//# sourceMappingURL=buildDissolveAnimation.js.map