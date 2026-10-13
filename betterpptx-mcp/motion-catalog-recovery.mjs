// Catalog corrections remain discovery requests. They never select a motion,
// invent a model/profile binding, or send a metadata query into deck creation.
export function motionCatalogRecovery(code){
 const catalog='betterpptx.authoring.catalog'
 switch(code){
  case 'MOTION_COMPARISON_SCOPE_INVALID':return [{type:'correct_catalog_scope',tool:catalog,description:'Use view:"motion-comparisons" and family:"presenter-motion" for compact comparison queries. Keep intent and controlId out of that view; use view:"controls" for either and omit compact-only preparationTarget and motionWindowRequirements.'}]
  case 'MOTION_COMPARISON_TARGET_INVALID':return [{type:'correct_preparation_comparison',tool:catalog,description:'Retry view:"motion-comparisons" with family:"presenter-motion", an integer limit from 1 to 16, and preparationTarget containing only the exact owned targetModel handle and explicit variant "original" or "skeletal-mirrored". Do not invent an asset or preparation profile.'}]
  case 'MOTION_WINDOW_REQUIREMENTS_INVALID':return [{type:'correct_source_window_query',tool:catalog,description:'Retry view:"motion-comparisons" with explicit unique landmarks, finite nonnegative maximumStepSpeedShoulderSpansPerSecond, positive minimumDurationMs, and frame "source-world" or "root-translation-removed". Sampled windows do not qualify gesture holds.'}]
  case 'MOTION_REQUIREMENT_FAMILY_REQUIRED':return [{type:'correct_motion_family',tool:catalog,description:'Query family:"presenter-motion" when using motion requirements or motion comparisons; preserve the intended constraints.'}]
  case 'MOTION_REQUIREMENT_INVALID':return [{type:'correct_motion_requirements',tool:catalog,description:'Correct only the reported motionRequirements fields using the public catalog contract, then repeat the presenter-motion catalog query. Unknown hand, hold, physical and native properties remain unqualified.'}]
  default:return null
 }
}
