/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 18, SPID 3
 * Effect: Flip
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 56
 * PresetSubtype: 0
 */

export const FlipEntranceTemplate = {
  presetId: 56,
  presetClass: 'entr',
  presetSubtype: 0,
  name: 'Flip',
  
  asOneObject: {
    ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetID="56" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:iterate type="lt"><p:tmPct val="10000" /></p:iterate><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:anim by="(-#ppt_w*2)" calcmode="lin" valueType="num"><p:cBhvr rctx="PPT"><p:cTn id="{{id3}}" dur="{{duration}}" autoRev="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr></p:anim><p:anim by="(#ppt_w*0.50)" calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" decel="50000" autoRev="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr></p:anim><p:anim from="(-#ppt_h/2)" to="(#ppt_y)" calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:anim><p:animRot by="21600000"><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr></p:animRot></p:childTnLst></p:cTn></p:par>`,
    
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}', '{{targetXml}}', '{{visibility}}']
  }
}