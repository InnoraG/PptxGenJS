/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 17, SPID 3
 * Effect: Zip
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 51
 * PresetSubtype: 0
 */

export const ZipEntranceTemplate = {
  presetId: 51,
  presetClass: 'entr',
  presetSubtype: 0,
  name: 'Zip',
  
  asOneObject: {
    ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetID="51" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" decel="100000" /><p:tgtEl>{{targetXml}}</p:tgtEl></p:cBhvr></p:animEffect><p:animScale><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" decel="100000" /><p:tgtEl>{{targetXml}}</p:tgtEl></p:cBhvr><p:from x="10000" y="10000" /><p:to x="200000" y="450000" /></p:animScale><p:animScale><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" accel="100000" fill="hold"><p:stCondLst><p:cond delay="269" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl></p:cBhvr><p:from x="200000" y="450000" /><p:to x="100000" y="100000" /></p:animScale><p:set><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="(0.5)" /></p:to></p:set><p:anim from="(0.5)" to="(#ppt_x)" calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id7}}" dur="{{duration}}" accel="100000" fill="hold"><p:stCondLst><p:cond delay="269" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr></p:anim><p:set><p:cBhvr><p:cTn id="{{id8}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="(#ppt_y+0.4)" /></p:to></p:set><p:anim from="(#ppt_y+0.4)" to="(#ppt_y)" calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id9}}" dur="{{duration}}" accel="100000" fill="hold"><p:stCondLst><p:cond delay="269" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:anim></p:childTnLst></p:cTn></p:par>`,
    
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}', '{{id7}}', '{{id8}}', '{{id9}}', '{{targetXml}}', '{{visibility}}']
  }
}