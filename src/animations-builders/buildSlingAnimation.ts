import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Sling animation (presetID=48)
 * 
 * Structure (Entrance):
 *   1. set (visibility=visible, dur=1)
 *   2. anim (style.rotation: 90° hold → 90° → 90° → 0°, dur=700)
 *   3. anim (ppt_x: -1 → 0.95 → #ppt_x, dur=700)
 *   4. anim (ppt_y: #ppt_y → #ppt_y, dur=700)
 *   5. animEffect (fade in, dur=700)
 * 
 * Structure (Exit):
 *   1. anim (style.rotation: 0° → 90° → 90° → 90°, dur=700)
 *   2. anim (ppt_x: ppt_x → 0.95 → -1, dur=700)
 *   3. anim (ppt_y: ppt_y → ppt_y, dur=700)
 *   4. animEffect (fade out, dur=700)
 *   5. set (visibility=hidden, dur=1, delay=699)
 * 
 * Reference: Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide13.xml
 */
export function buildSlingAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const transition = isEntrance ? 'in' : 'out';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate IDs for all sub-elements
    const setId = getNextAnimationId();
    const animRotId = getNextAnimationId();
    const animXId = getNextAnimationId();
    const animYId = getNextAnimationId();
    const effectId = getNextAnimationId();
    
    // Build rotation animation (style.rotation)
    // Entrance: 90° → 90° → 90° → 0° (sling down from rotated position)
    // Exit: 0° → 90° → 90° → 90° (sling up to rotated position)
    const rotAnimElement = isEntrance ? `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animRotId}" dur="${duration}" fill="hold"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:fltVal val="90"/></p:val></p:tav>
      <p:tav tm="80000"><p:val><p:fltVal val="90"/></p:val></p:tav>
      <p:tav tm="80000"><p:val><p:fltVal val="90"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>` : `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animRotId}" dur="${duration}"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
      <p:tav tm="20000"><p:val><p:fltVal val="90"/></p:val></p:tav>
      <p:tav tm="20000"><p:val><p:fltVal val="90"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="90"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;
    
    // Build X position animation (ppt_x)
    // Entrance: -1 (left edge) → 0.95 (bounce) → #ppt_x (final position)
    // Exit: ppt_x (current) → 0.95 (bounce) → -1 (left edge)
    const animXElement = isEntrance ? `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animXId}" dur="${duration}" fill="hold"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:fltVal val="-1"/></p:val></p:tav>
      <p:tav tm="50000"><p:val><p:fltVal val="0.95"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="#ppt_x"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>` : `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animXId}" dur="${duration}"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
      <p:tav tm="50000"><p:val><p:fltVal val="0.95"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="-1"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;
    
    // Build Y position animation (ppt_y)
    // Both entrance/exit: maintains Y position (no vertical movement)
    const yStart = isEntrance ? '#ppt_y' : 'ppt_y';
    const yEnd = isEntrance ? '#ppt_y' : 'ppt_y';
    const animYElement = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animYId}" dur="${duration}"${isEntrance ? ' fill="hold"' : ''}/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="${yStart}"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="${yEnd}"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;
    
    // Build animEffect (fade in/out)
    const animEffectElement = `
  <p:animEffect transition="${transition}" filter="fade">
    <p:cBhvr>
      <p:cTn id="${effectId}" dur="${duration}"${isEntrance ? '' : ''}/>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
  </p:animEffect>`;
    
    // Build visibility setter
    const visDelay = isEntrance ? 0 : (duration - 1);
    const setElement = `
  <p:set>
    <p:cBhvr>
      <p:cTn id="${setId}" dur="1" fill="hold">
        <p:stCondLst><p:cond delay="${visDelay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:to><p:strVal val="${visibilityValue}"/></p:to>
  </p:set>`;
    
    // Arrange elements in correct order
    // Entrance: set, anim(rot), anim(x), anim(y), animEffect
    // Exit: anim(rot), anim(x), anim(y), animEffect, set
    const childElements = isEntrance 
        ? `${setElement}${rotAnimElement}${animXElement}${animYElement}${animEffectElement}`
        : `${rotAnimElement}${animXElement}${animYElement}${animEffectElement}${setElement}`;
    
    // Add timing attributes (accel for entrance, decel for exit)
    const timingAttr = isEntrance ? ' accel="50000"' : ' decel="50000"';
    return `<p:par>
  <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0"${timingAttr} fill="hold" grpId="0" nodeType="${nodeType}">
    <p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
    <p:childTnLst>${childElements}
    </p:childTnLst>
  </p:cTn>
</p:par>`;
}
