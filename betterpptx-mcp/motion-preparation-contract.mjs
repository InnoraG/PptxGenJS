import {createResultOutputSchema} from './mcp-result-envelope.mjs';

const object=(properties,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
const MODEL={type:'string',pattern:'^gen://rigged3d/[a-f0-9]{40}$'};
const SOURCE=object({kind:{type:'string',enum:['candidate','model','review']},id:{type:'string'}});
SOURCE.oneOf=[
 {properties:{kind:{const:'candidate'},id:{pattern:'^candidate_[a-f0-9]{32}$'}}},
 {properties:{kind:{const:'model'},id:MODEL}},
 {properties:{kind:{const:'review'},id:{pattern:'^cap_[a-f0-9]{20}$'}}},
];
export const MOTION_PREPARATION_PROFILE_LIST_INPUT_SCHEMA=object({
 source:SOURCE,targetModel:MODEL,variant:{type:'string',enum:['original','skeletal-mirrored']},
});
const profileDescriptor=object({
 profileId:{type:'string',pattern:'^preparation_profile_[a-f0-9]{32}$'},
 capability:{type:'string',enum:['original','skeletal-mirrored']},
 sourceKind:{type:'string',enum:['candidate','model','review']},
 targetCompatibility:{const:'verified-for-request'},
 sourceClockPolicy:{const:'preserve-source'},
 lifecycle:object({selectability:{const:'not-selectable'},nativeQualification:{const:'unqualified'}}),
});
profileDescriptor.properties.preparedOutput={oneOf:[object({state:{type:'string',enum:['not-prepared','not-assessed']}}),object({state:{const:'prepared'},modelAsset:MODEL,preparedVariantId:{type:'string',pattern:'^prepared_variant_[a-f0-9]{32}$'},variant:{type:'string',enum:['original','skeletal-mirrored']},sourceClock:object({startFrame:{type:'integer'},endFrame:{type:'integer'},frameCount:{type:'integer',minimum:2,maximum:10000000},fps:{type:'number',exclusiveMinimum:0,maximum:1000},durationMs:{type:'number',minimum:0,maximum:2678400000},retimed:{const:false}}),nativeQualification:{const:'unqualified'}})]};
profileDescriptor.properties.preparationMode={type:'string',enum:['reuse-only'],description:'Use the published prepared output. Inspect this profile when output availability is not assessed; do not submit it to private motion preparation.'};
export const MOTION_PREPARATION_PROFILE_LIST_DATA_SCHEMA=object({
 schemaVersion:{const:'betterpptx.motion-preparation-profile-discovery.v1'},
 state:{type:'string',enum:['eligible-profiles','none-eligible']},
 request:object({sourceKind:{type:'string',enum:['candidate','model','review']},variant:{type:'string',enum:['original','skeletal-mirrored']}}),
 profiles:{type:'array',items:profileDescriptor,maxItems:64},
});
MOTION_PREPARATION_PROFILE_LIST_DATA_SCHEMA.properties.reasonCode={type:'string',enum:['SOURCE_REGISTRATION_REQUIRED','NO_QUALIFIED_PREPARATION_PROFILE']};
export const MOTION_PREPARATION_INPUT_SCHEMA=object({
 source:SOURCE,
 targetModel:MODEL,profileId:{type:'string',pattern:'^preparation_profile_[a-f0-9]{32}$'},
 variant:{type:'string',enum:['original','skeletal-mirrored']},
 idempotencyKey:{type:'string',minLength:1,maxLength:200,pattern:'^[A-Za-z0-9._:-]+$'},
});
export const MOTION_PREPARATION_DATA_SCHEMA={
 oneOf:[
  object({schemaVersion:{const:'betterpptx.motion-preparation-request.v1'},operationId:{type:'string',pattern:'^op_[a-f0-9]{32}$'},state:{type:'string',enum:['queued','running','retry','succeeded','failed','cancelled']},variant:{type:'string',enum:['original','skeletal-mirrored']},statusTool:{const:'betterpptx.operation.status'}}),
  object({schemaVersion:{const:'betterpptx.motion-prepared-variant.v1'},preparedVariantId:{type:'string',pattern:'^prepared_variant_[a-f0-9]{32}$'},variant:{type:'string',enum:['original','skeletal-mirrored']},sourceClock:object({startFrame:{type:'integer'},endFrame:{type:'integer'},frameCount:{type:'integer',minimum:2},fps:{type:'number',exclusiveMinimum:0,maximum:1000},durationMs:{type:'number',minimum:0},retimed:{const:false}}),lifecycle:object({preparationState:{const:'prepared'},selectability:{const:'not-selectable'},nativeQualification:{const:'unqualified'}}),semantics:object({contact:object({state:{const:'unknown'},value:{type:'null'}}),slideDirection:object({state:{const:'unknown'},value:{type:'null'}})})}),
 ],
};
// The normal mutation response includes named success hints inside data.
// Preparation emits no free-form warning/artifact lists; file delivery is typed separately.
for(const schema of MOTION_PREPARATION_DATA_SCHEMA.oneOf)Object.assign(schema.properties,{
 ok:{const:true},warnings:{type:'array',maxItems:0},artifacts:{type:'array',maxItems:0},
 next:object({recommendedTool:{type:['string','null'],enum:['betterpptx.operation.status','betterpptx.deck.generate_from_spec','betterpptx.deck.summary',null]},request:object({operationId:{type:'string',pattern:'^op_[a-f0-9]{32}$'}}),reason:{type:'string'}},['recommendedTool','reason']),
});
MOTION_PREPARATION_DATA_SCHEMA.oneOf[1].properties.modelAsset=MODEL;
MOTION_PREPARATION_DATA_SCHEMA.oneOf[1].properties.delivery=object({schemaVersion:{const:'betterpptx.motion-prepared-file.v1'},downloadUrl:{type:'string',pattern:'^https://'},downloadName:{type:'string',pattern:'^prepared_variant_[a-f0-9]{32}\\.glb$'},contentType:{const:'model/gltf-binary'},sha256:{type:'string',pattern:'^[a-f0-9]{64}$'},bytes:{type:'integer',minimum:1,maximum:134217728},expiresAt:{type:'string'},downloadLinkExpiresAt:{type:'string'}});
export const MOTION_PREPARATION_TOOLS=Object.freeze([{
 name:'betterpptx.motion.preparation_profiles.list',title:'Find eligible motion-preparation profiles',
 description:'List eligible built-in or owner-authorized motion profiles for the exact source, target model and original or skeletal-mirrored variant you chose. Reuse-only profiles expose published prepared outputs after verification. This lookup does not choose motion, side, timing, geometry or contact; it preserves the source clock and does not establish native playback.',
 annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true},
 inputSchema:MOTION_PREPARATION_PROFILE_LIST_INPUT_SCHEMA,
 outputSchema:createResultOutputSchema(MOTION_PREPARATION_PROFILE_LIST_DATA_SCHEMA),
},{
 name:'betterpptx.motion.prepare_variant',title:'Prepare an explicit motion variant',
 description:'Request asynchronous preparation for an owned source, explicit target model and advertised preparation profile. Choose original or skeletal-mirrored deliberately. Unsupported profiles reject; preparation does not make a variant selectable or establish native playback. Use the returned operation ID with operation.status.',
 annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true},
 inputSchema:MOTION_PREPARATION_INPUT_SCHEMA,
 outputSchema:createResultOutputSchema(MOTION_PREPARATION_DATA_SCHEMA),
}]);
