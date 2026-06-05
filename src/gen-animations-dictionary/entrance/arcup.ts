/**
 * Auto-generated from: Focused_EntranceExit_Showcase_BATCH2_FIX_v6_spidlabels_v4_FLOATTRANSPLANT_CLEAN.pptx
 * Effect: ArcUp
 * Type: entrance
 * Sequence Mode: asOneObject
 * PresetID: 52
 * PresetSubtype: 0
 */

import { AnimationEffect } from '../types.js'

export const ArcUpEntranceTemplate = {
  presetId: 52,
  presetClass: 'entr' as const,
  presetSubtype: 0,
  name: 'ArcUp',
  
  asOneObject: {
    ooxml: `<p:par><p:cTn id="{{id1}}" presetID="52" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst><p:childTnLst><p:set><p:cBhvr><p:cTn id="{{id2}}" dur="{{duration}}" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id0}}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst></p:cBhvr><p:to><p:strVal val="{{visibility}}"/></p:to></p:set><p:animScale><p:cBhvr><p:cTn id="{{id3}}" dur="{{duration}}" decel="50000" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id0}}"/></p:tgtEl></p:cBhvr><p:from x="250000" y="250000"/><p:to x="100000" y="100000"/></p:animScale><p:animMotion origin="layout" path="M -0.46736 0.92887  C -0.37517 0.88508  -0.02552 0.75279  0.0908 0.66613  C  0.20747 0.57948  0.21649 0.50394  0.23177 0.40825  C 0.24705 0.31256  0.22118 0.15964   0.18264 0.09152  C 0.1441 0.02341  0.03802 0.0  0.0 0.0  " pathEditMode="relative" ptsTypes=""><p:cBhvr><p:cTn id="{{id4}}" dur="{{duration}}" decel="50000" fill="hold"><p:stCondLst><p:cond delay="{{delay}}"/></p:stCondLst></p:cTn><p:tgtEl><p:spTgt spid="{{id0}}"/></p:tgtEl><p:attrNameLst><p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr></p:animMotion><p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{{id5}}" dur="{{duration}}"/><p:tgtEl><p:spTgt spid="{{id0}}"/></p:tgtEl></p:cBhvr></p:animEffect></p:childTnLst></p:cTn></p:par>`,
    params: ['{{delay}}', '{{duration}}', '{{id0}}', '{{id1}}', '{{id2}}', '{{id3}}', '{{id4}}', '{{id5}}', '{{visibility}}']
  }
} satisfies AnimationEffect
