// Separate read-only discovery tools. Never merge candidates into qualified motion catalog.
const object=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const nullable={type:'null'};
const unknown=object({state:{const:'unknown'},value:nullable});
const lifecycle=object({parseState:{enum:['measured','not-measured','failed-or-unknown']},preparationState:{const:'unprepared'},selectability:{const:'not-selectable'},semanticQualification:{const:'unqualified'}});
const count={type:'integer',minimum:0,maximum:10000000};
const observation=object({clock:object({durationMs:{type:'number',minimum:0,maximum:2678400000},fps:{type:'number',minimum:0.001,maximum:1000},frameCount:{type:'integer',minimum:2,maximum:10000000},sampleCount:{type:'integer',minimum:2,maximum:10000000},temporalCoverage:{const:'every-integer-frame'}}),coordinateSpace:{const:'source-motion-space'},units:object({state:{const:'unverified'},value:nullable}),confidence:{const:'direct-source-measurement'},rigBoneCount:{type:'integer',minimum:1,maximum:100000},measuredLandmarks:{type:'array',uniqueItems:true,items:{enum:['root','head','leftHand','rightHand','leftFoot','rightFoot']}},geometricBasis:object({pelvisVerifiedSamples:count,pelvisUnknownSamples:count,chestVerifiedSamples:count,chestUnknownSamples:count})});
const base={schemaVersion:{const:'betterpptx.owner-motion-candidate.v1'},candidateId:{type:'string',pattern:'^candidate_[a-f0-9]{32}$'},lifecycle,sourceObservation:observation,targetClock:nullable,semantics:object(Object.fromEntries(['action','actionOwningHand','activeStroke','absoluteFacing','contact','support','slideDirection'].map(k=>[k,unknown]))),preparationRequired:{const:true}};
const measured=object({...base,lifecycle:object({...lifecycle.properties,parseState:{const:'measured'}}),limitations:{type:'array',items:{enum:['SOURCE_CLOCK_NOT_PREPARED_TARGET_CLOCK','SOURCE_UNITS_UNVERIFIED','SOURCE_MEASUREMENT_NOT_SEMANTIC_QUALIFICATION','CANDIDATE_NOT_MOTION_SELECTOR']},minItems:4,maxItems:4,uniqueItems:true}});
const unmeasured=state=>object({...base,lifecycle:object({...lifecycle.properties,parseState:{const:state}}),sourceObservation:nullable,confidence:{const:'unknown'},reasonCode:{const:state==='not-measured'?'MEASUREMENT_NOT_REQUESTED':'MEASUREMENT_UNAVAILABLE'}});
export const CANDIDATE_SCHEMA={oneOf:[measured,unmeasured('not-measured'),unmeasured('failed-or-unknown')]};
export const CANDIDATE_TOOLS=Object.freeze([
 {name:'betterpptx.motion.candidates.list',title:'List your motion candidates',description:'List your private motion candidates and available source observations. Candidates are unprepared and cannot be selected for presentation playback.',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:false},inputSchema:{type:'object',additionalProperties:false,properties:{limit:{type:'integer',minimum:1,maximum:100},cursor:{type:'string',pattern:'^cursor_[a-f0-9]{48}$'}}},outputSchema:object({schemaVersion:{const:'betterpptx.owner-motion-candidate-discovery.v1'},candidates:{type:'array',items:CANDIDATE_SCHEMA},nextCursor:{oneOf:[{type:'string',pattern:'^cursor_[a-f0-9]{48}$'},nullable]}})},
 {name:'betterpptx.motion.candidates.get',title:'Get a motion candidate',description:'Return your available source observations for one unprepared motion candidate. This is not a motion selection or preparation operation.',annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true},inputSchema:object({candidateId:{type:'string',pattern:'^candidate_[a-f0-9]{32}$'}}),outputSchema:object({schemaVersion:{const:'betterpptx.owner-motion-candidate-detail.v1'},candidate:CANDIDATE_SCHEMA})}
]);
// Normal MCP dispatcher returns {ok,data} or {ok:false,error}; retain the closed
// candidate DTO within data rather than advertising an incompatible bare page.
export const PUBLIC_CANDIDATE_TOOLS=Object.freeze(CANDIDATE_TOOLS.map(tool=>({
 ...tool,outputSchema:{type:'object',properties:{ok:{type:'boolean'},data:tool.outputSchema,error:{type:'object',properties:{code:{type:'string'},message:{type:'string'}},additionalProperties:true}},required:['ok'],additionalProperties:true,
  oneOf:[{properties:{ok:{const:true}},required:['data']},{properties:{ok:{const:false}},required:['error']}]}
})));
// Called inside the existing authenticated dispatcher/withResourceAuthorization scope.
// No owner arguments or anonymous fallback. No engine/export/HTTP changes in this proposal.
export function createCandidateReadOnlyDispatch(publicReadOnly){return async(name,args)=>{
 try{if(name===CANDIDATE_TOOLS[0].name)return await publicReadOnly.list(args);if(name===CANDIDATE_TOOLS[1].name)return {schemaVersion:'betterpptx.owner-motion-candidate-detail.v1',candidate:await publicReadOnly.get(args)};const e=new Error('Unsupported candidate operation.');e.code='CANDIDATE_OPERATION_UNSUPPORTED';throw e;}
 catch(e){const safe=new Set(['CANDIDATE_INVALID','CANDIDATE_UNAVAILABLE','CANDIDATE_IDENTITY_REQUIRED','CANDIDATE_OPERATION_UNSUPPORTED']);const out=new Error(safe.has(e.code)?e.message:'Candidate discovery is unavailable.');out.code=safe.has(e.code)?e.code:'CANDIDATE_UNAVAILABLE';throw out;}
};}
