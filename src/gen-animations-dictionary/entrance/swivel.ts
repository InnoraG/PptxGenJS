/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 11, SPID 3
 * Effect: Swivel
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 19
 * PresetSubtype: 10
 */

export const SwivelEntranceTemplate = {
  presetId: 19,
  presetClass: 'entr',
  presetSubtype: 10,
  name: 'Swivel',
  
  asOneObject: {
    ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetID="19" presetClass="entr" presetSubtype="10" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0" fmla="#ppt_w*sin(2.5*pi*$)"><p:val><p:fltVal val="0" /></p:val></p:tav><p:tav tm="100000"><p:val><p:fltVal val="1" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_h" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_h" /></p:val></p:tav></p:tavLst></p:anim></p:childTnLst></p:cTn></p:par>`,
    
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{targetXml}}', '{{visibility}}']
  }
}