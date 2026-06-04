/**
 * Auto-generated from: Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx, Slide 15, SPID 3
 * Effect: Drop
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 38
 * PresetSubtype: 0
 */
export const DropEntranceTemplate = {
    presetId: 38,
    presetClass: 'entr',
    presetSubtype: 0,
    name: 'Drop',
    asOneObject: {
        ooxml: `<p:par xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cTn id="{{id0}}" presetID="38" presetClass="entr" presetSubtype="0" accel="50000" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:iterate type="lt"><p:tmPct val="50000" /></p:iterate><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id1}}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}" /></p:to></p:set><p:set><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="-45.0" /></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="318" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="-45" /></p:val></p:tav><p:tav tm="69900"><p:val><p:fltVal val="45" /></p:val></p:tav><p:tav tm="100000"><p:val><p:fltVal val="0" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="0" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y-1" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" decel="50000" autoRev="1" fill="hold"><p:stCondLst><p:cond delay="318" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)-#ppt_h/2" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id7}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="605" /></p:stCondLst></p:cTn><p:tgtEl>{{targetXml}}</p:tgtEl><p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:strVal val="#ppt_y-(0.354*#ppt_w-0.172*#ppt_h)" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_y" /></p:val></p:tav></p:tavLst></p:anim></p:childTnLst></p:cTn></p:par>`,
        params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}', '{{id7}}', '{{targetXml}}', '{{visibility}}']
    }
};
//# sourceMappingURL=drop.js.map