import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Color Reveal animation (presetID=27)
 * Structure: 4 elements - set(visibility) + anim(style.color) + anim(fillcolor) + set(fill.type)
 * Reference: Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide9.xml
 * 
 * This effect animates text/shape from grayscale to color using scheme colors.
 * Uses <p:iterate type="lt"> for letter-by-letter reveal.
 */
export function buildColorRevealAnimation(ctx: AnimationBuildContext): string {
    const { shapeId, animation, config, type, ids, target , sequence } = ctx;
	const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    
    // Extract common values
    const duration = animation.duration || config.defaultDuration || 700;
    const delay = animation.delay ?? config.defaultDelay ?? 0
    const isEntrance = type === 'entrance';
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    
    // Build target XML based on sequence mode
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if (target?.type === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    
    // Generate unique IDs for each element
    const setVisId = getNextAnimationId();
    const animColorId = getNextAnimationId();
    const animFillId = getNextAnimationId();
    const setFillTypeId = getNextAnimationId();
    
    // For entrance: accent2 (gray) → hlink (colored)
    // For exit: hlink (colored) → accent2 (gray)
    const colorFrom = isEntrance ? 'accent2' : 'hlink';
    const colorTo = isEntrance ? 'hlink' : 'accent2';
    
    // Set visibility delay: 0 for Entrance, duration-1 for Exit
    const setDelay = isEntrance ? 0 : duration - 1;

    // Element 1: Visibility setter
    const setVisibility = `<p:set>
    <p:cBhvr>
      <p:cTn id="${setVisId}" dur="1" fill="hold">
        <p:stCondLst><p:cond delay="${setDelay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:to><p:strVal val="${visibilityValue}"/></p:to>
  </p:set>`;
    
    // Element 2: Color animation for style.color (text color)
    const animStyleColor = `<p:anim calcmode="discrete" valueType="clr">
    <p:cBhvr override="childStyle">
      <p:cTn id="${animColorId}" dur="${duration}"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>style.color</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0">
        <p:val>
          <p:clrVal>
            <a:schemeClr val="${colorFrom}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </p:clrVal>
        </p:val>
      </p:tav>
      <p:tav tm="50000">
        <p:val>
          <p:clrVal>
            <a:schemeClr val="${colorTo}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </p:clrVal>
        </p:val>
      </p:tav>
    </p:tavLst>
  </p:anim>`;
    
    // Element 3: Color animation for fillcolor (shape fill)
    const animFillColor = `<p:anim calcmode="discrete" valueType="clr">
    <p:cBhvr>
      <p:cTn id="${animFillId}" dur="${duration}"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>fillcolor</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0">
        <p:val>
          <p:clrVal>
            <a:schemeClr val="${colorFrom}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </p:clrVal>
        </p:val>
      </p:tav>
      <p:tav tm="50000">
        <p:val>
          <p:clrVal>
            <a:schemeClr val="${colorTo}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>
          </p:clrVal>
        </p:val>
      </p:tav>
    </p:tavLst>
  </p:anim>`;
    
    // Element 4: Set fill.type to solid
    const setFillType = `<p:set>
    <p:cBhvr>
      <p:cTn id="${setFillTypeId}" dur="${duration}"/>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>fill.type</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:to><p:strVal val="solid"/></p:to>
  </p:set>`;
    
    // Combine all elements in correct order
    // Entrance: setVis -> [Anims] -> setFill
    // Exit: [Anims] -> setFill -> setVis
    const childElements = isEntrance ? `${setVisibility}
  ${animStyleColor}
  ${animFillColor}
  ${setFillType}` : 
  `${animStyleColor}
  ${animFillColor}
  ${setFillType}
  ${setVisibility}`;
    
    // Build iterate element for letter-by-letter animation
    const iterateElement = `<p:iterate type="lt">
      <p:tmPct val="50000"/>
    </p:iterate>`;
    
    // Wrap in main par structure with iterate support
    return `<p:par>
  <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="0" nodeType="${nodeType}">
    <p:stCondLst>
      <p:cond delay="${delay}"/>
    </p:stCondLst>
    ${iterateElement}
    <p:childTnLst>
      ${childElements}
    </p:childTnLst>
  </p:cTn>
</p:par>`;
}
