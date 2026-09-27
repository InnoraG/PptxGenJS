/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 16, SPID 3
 * Effect: Whip
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 41
 * PresetSubtype: 0
 */
export const WhipEntranceTemplate = {
    presetId: 41,
    presetClass: 'entr',
    presetSubtype: 0,
    name: 'Whip',
    asOneObject: {
        ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetID="41" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:iterate type="lt"><p:tmPct val="10000" /></p:iterate><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_x" /></p:val></p:tav><p:tav tm="50000"><p:val><p:strVal val="#ppt_x+.1" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_x" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_h/10" /></p:val></p:tav><p:tav tm="50000"><p:val><p:strVal val="#ppt_h+.01" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_h" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" fill="hold" /><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_w/10" /></p:val></p:tav><p:tav tm="50000"><p:val><p:strVal val="#ppt_w+.01" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_w" /></p:val></p:tav></p:tavLst></p:anim><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{{id7}}" dur="{{duration}}" tmFilter="0,0; .5, 1; 1, 1" /><p:tgtEl>{{targetXml}}</p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`,
        params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}', '{{id7}}', '{{targetXml}}', '{{visibility}}']
    }
};
//# sourceMappingURL=whip.js.map