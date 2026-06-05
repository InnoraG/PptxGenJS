/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 13, SPID 3
 * Effect: Float
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 30
 * PresetSubtype: 0
 */

export const FloatEntranceTemplate = {
  presetId: 30,
  presetClass: 'entr',
  presetSubtype: 0,
  name: 'Float',
  
  asOneObject: {
    ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetID="30" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" decel="100000" /><p:tgtEl>{{targetXml}}</p:tgtEl></p:cBhvr></p:animEffect><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" decel="100000" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="-90" /></p:val></p:tav><p:tav tm="100000"><p:val><p:fltVal val="0" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" decel="100000" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_x+0.4" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_x-0.05" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" decel="100000" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y-0.4" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y+0.1" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id7}}" dur="{{duration}}" accel="100000" fill="hold"><p:stCondLst><p:cond delay="560" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_x-0.05" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_x" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id8}}" dur="{{duration}}" accel="100000" fill="hold"><p:stCondLst><p:cond delay="560" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y+0.1" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y" /></p:val></p:tav></p:tavLst></p:anim></p:childTnLst></p:cTn></p:par>`,
    
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}', '{{id7}}', '{{id8}}', '{{targetXml}}', '{{visibility}}']
  }
}