export type MotionCatalogRecoveryAction={type:'correct_catalog_scope'|'correct_preparation_comparison'|'correct_source_window_query'|'correct_motion_family'|'correct_motion_requirements';tool:'betterpptx.authoring.catalog';description:string}
export function motionCatalogRecovery(code:string):MotionCatalogRecoveryAction[]|null
