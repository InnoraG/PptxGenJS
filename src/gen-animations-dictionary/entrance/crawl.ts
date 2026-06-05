/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 6, SPID 3
 * Effect: Crawl
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 7
 * PresetSubtype: 8
 */

export const CrawlEntranceTemplate = {
  presetId: 7,
  presetClass: 'entr',
  presetSubtype: 8,
  name: 'Crawl',
  
  asOneObject: {
    ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetid="{{id3}}" presetClass="entr" presetSubtype="8" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="{{id3}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="0-#ppt_w/2" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_x" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr additive="base"><p:cTn id="{{id4}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y" /></p:val></p:tav></p:tavLst></p:anim></p:childTnLst></p:cTn></p:par>`,
    
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{targetXml}}', '{{visibility}}']
  }
}