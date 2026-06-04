/**
 * Auto-generated from: Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx
 * Effect: LightSpeed
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 34
 * PresetSubtype: 0
 */
export const LightSpeedEntranceTemplate = {
    presetId: 34,
    presetClass: 'entr',
    presetSubtype: 0,
    name: 'LightSpeed',
    asOneObject: {
        ooxml: `<p:par><p:cTn id="{{id2}}" presetID="34" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id1}}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}"/></p:to></p:set><p:anim from="(-#ppt_w/2)" to="(#ppt_x)" calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id1}}"/></p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr></p:anim><p:anim from="0" to="-1.0" calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" decel="50000" autoRev="1" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id1}}"/></p:tgtEl><p:attrNameLst><p:attrName>xshear</p:attrName></p:attrNameLst></p:cBhvr></p:anim><p:animScale><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" decel="100000" autoRev="1" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id1}}"/></p:tgtEl></p:cBhvr><p:from x="100000" y="100000"/><p:to x="80000" y="100000"/></p:animScale><p:anim by="(#ppt_h/3+#ppt_w*0.1)" calcmode="lin" valueType="num"><p:cBhvr additive="sum"><p:cTn id="{{id0}}" dur="{{duration}}" decel="100000" autoRev="1" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id1}}"/></p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst></p:cBhvr></p:anim></p:childTnLst></p:cTn></p:par>`,
        params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id2}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}', '{{visibility}}']
    }
};
//# sourceMappingURL=lightspeed.js.map