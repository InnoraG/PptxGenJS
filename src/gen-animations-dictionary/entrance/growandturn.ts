/**
 * Auto-generated from: Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx
 * Effect: GrowAndTurn
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 31
 * PresetSubtype: 2
 */

import { AnimationEffect } from '../types.js'

export const GrowAndTurnEntranceTemplate = {
  presetId: 31,
  presetClass: 'entr' as const,
  presetSubtype: 2,
  name: 'GrowAndTurn',
  
  asOneObject: {
    ooxml: `<p:par><p:cTn id="{{id2}}" presetID="31" presetClass="entr" presetSubtype="2" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="{{delay}}" /></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id1}}" /></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="visible" /></p:to></p:set><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" fill="hold" /><p:tgtEl><p:spTgt spid="{{id1}}" /></p:tgtEl><p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_w" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}" fill="hold" /><p:tgtEl><p:spTgt spid="{{id1}}" /></p:tgtEl><p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="0" /></p:val></p:tav><p:tav tm="100000"><p:val><p:strVal val="#ppt_h" /></p:val></p:tav></p:tavLst></p:anim><p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{{id6}}" dur="{{duration}}" fill="hold" /><p:tgtEl><p:spTgt spid="{{id1}}" /></p:tgtEl><p:attrNameLst><p:attrName>style.rotation</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst><p:tav tm="0"><p:val><p:fltVal val="90" /></p:val></p:tav><p:tav tm="100000"><p:val><p:fltVal val="0" /></p:val></p:tav></p:tavLst></p:anim><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{{id0}}" dur="{{duration}}" /><p:tgtEl><p:spTgt spid="{{id1}}" /></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`,
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id2}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{id6}}']
  }
} satisfies AnimationEffect
