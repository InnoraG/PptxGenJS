import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build ThinLine animation (presetID=39)
 *
 * Structure:
 * - Entrance: set(visibility) + 4 anim (ppt_h, ppt_w, ppt_x, ppt_y) with accel="100000"
 * - Exit: 4 anim (ppt_h, ppt_w, ppt_x, ppt_y) + set(visibility) with decel="100000"
 *
 * Keyframes (3 for h/w/x, 2 for y):
 * - ppt_h: tm=0, 50000, 100000
 * - ppt_w: tm=0, 50000, 100000
 * - ppt_x: tm=0, 50000, 100000
 * - ppt_y: tm=0, 100000
 *
 * Reference: Batch3 frozen reference slide11.xml (SPIDs 3, 6)
 */
export function buildThinLineAnimation(ctx) {
    const { shapeId, animation, config, type, ids, target } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    // Extract common values
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay !== undefined ? animation.delay : (config.defaultDelay || 0);
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
    // Generate unique IDs for all elements
    const setId = getNextAnimationId();
    const animHId = getNextAnimationId();
    const animWId = getNextAnimationId();
    const animXId = getNextAnimationId();
    const animYId = getNextAnimationId();
    // Visibility setter element
    const visDelay = isEntrance ? 0 : (duration - 1);
    const setElement = `
    <p:set>
      <p:cBhvr>
        <p:cTn id="${setId}" dur="1" fill="hold">
          <p:stCondLst>
            <p:cond delay="${visDelay}"/>
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
    // Animation elements with formulas
    // ppt_h: entrance uses #ppt_h/20 -> #ppt_h, exit uses ppt_h -> ppt_h/20
    const hFrom = isEntrance ? '#ppt_h/20' : 'ppt_h';
    const hMid = isEntrance ? '#ppt_h/20' : 'ppt_h/20';
    const hTo = isEntrance ? '#ppt_h' : 'ppt_h/20';
    const animHElement = `
    <p:anim calcmode="lin" valueType="num">
      <p:cBhvr>
        <p:cTn id="${animHId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
        <p:tgtEl>${targetXml}</p:tgtEl>
        <p:attrNameLst>
          <p:attrName>ppt_h</p:attrName>
        </p:attrNameLst>
      </p:cBhvr>
      <p:tavLst>
        <p:tav tm="0">
          <p:val>
            <p:strVal val="${hFrom}"/>
          </p:val>
        </p:tav>
        <p:tav tm="50000">
          <p:val>
            <p:strVal val="${hMid}"/>
          </p:val>
        </p:tav>
        <p:tav tm="100000">
          <p:val>
            <p:strVal val="${hTo}"/>
          </p:val>
        </p:tav>
      </p:tavLst>
    </p:anim>`;
    // ppt_w: entrance uses #ppt_w+.3 -> #ppt_w, exit uses ppt_w -> ppt_w+.3
    const wFrom = isEntrance ? '#ppt_w+.3' : 'ppt_w';
    const wMid = isEntrance ? '#ppt_w+.3' : 'ppt_w+.3';
    const wTo = isEntrance ? '#ppt_w' : 'ppt_w+.3';
    const animWElement = `
    <p:anim calcmode="lin" valueType="num">
      <p:cBhvr>
        <p:cTn id="${animWId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
        <p:tgtEl>${targetXml}</p:tgtEl>
        <p:attrNameLst>
          <p:attrName>ppt_w</p:attrName>
        </p:attrNameLst>
      </p:cBhvr>
      <p:tavLst>
        <p:tav tm="0">
          <p:val>
            <p:strVal val="${wFrom}"/>
          </p:val>
        </p:tav>
        <p:tav tm="50000">
          <p:val>
            <p:strVal val="${wMid}"/>
          </p:val>
        </p:tav>
        <p:tav tm="100000">
          <p:val>
            <p:strVal val="${wTo}"/>
          </p:val>
        </p:tav>
      </p:tavLst>
    </p:anim>`;
    // ppt_x: entrance uses #ppt_x-.3 -> #ppt_x, exit uses ppt_x -> ppt_x-.3
    const xFrom = isEntrance ? '#ppt_x-.3' : 'ppt_x';
    const xMid = isEntrance ? '#ppt_x' : 'ppt_x';
    const xTo = isEntrance ? '#ppt_x' : 'ppt_x-.3';
    const animXElement = `
    <p:anim calcmode="lin" valueType="num">
      <p:cBhvr>
        <p:cTn id="${animXId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
        <p:tgtEl>${targetXml}</p:tgtEl>
        <p:attrNameLst>
          <p:attrName>ppt_x</p:attrName>
        </p:attrNameLst>
      </p:cBhvr>
      <p:tavLst>
        <p:tav tm="0">
          <p:val>
            <p:strVal val="${xFrom}"/>
          </p:val>
        </p:tav>
        <p:tav tm="50000">
          <p:val>
            <p:strVal val="${xMid}"/>
          </p:val>
        </p:tav>
        <p:tav tm="100000">
          <p:val>
            <p:strVal val="${xTo}"/>
          </p:val>
        </p:tav>
      </p:tavLst>
    </p:anim>`;
    // ppt_y: entrance uses #ppt_y -> #ppt_y (no change), exit uses ppt_y -> ppt_y (no change)
    // Only 2 keyframes (tm=0, 100000)
    const yVal = isEntrance ? '#ppt_y' : 'ppt_y';
    const animYElement = `
    <p:anim calcmode="lin" valueType="num">
      <p:cBhvr>
        <p:cTn id="${animYId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
        <p:tgtEl>${targetXml}</p:tgtEl>
        <p:attrNameLst>
          <p:attrName>ppt_y</p:attrName>
        </p:attrNameLst>
      </p:cBhvr>
      <p:tavLst>
        <p:tav tm="0">
          <p:val>
            <p:strVal val="${yVal}"/>
          </p:val>
        </p:tav>
        <p:tav tm="100000">
          <p:val>
            <p:strVal val="${yVal}"/>
          </p:val>
        </p:tav>
      </p:tavLst>
    </p:anim>`;
    // Element order: entrance (set first), exit (set last)
    const childElements = isEntrance
        ? setElement + animHElement + animWElement + animXElement + animYElement
        : animHElement + animWElement + animXElement + animYElement + setElement;
    // Main wrapper with accel for entrance, decel for exit
    const easingAttr = isEntrance ? 'accel="100000"' : 'decel="100000"';
    return `<p:par>
  <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" ${easingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
    <p:stCondLst>
      <p:cond delay="${delay}"/>
    </p:stCondLst>
    <p:childTnLst>
      ${childElements}
    </p:childTnLst>
  </p:cTn>
</p:par>`;
}
//# sourceMappingURL=buildThinLineAnimation.js.map