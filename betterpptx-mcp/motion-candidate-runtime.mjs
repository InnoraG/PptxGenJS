// Private proposal module. No product path, owner fixture or importer is embedded.
import {randomBytes,createHash} from 'node:crypto';
const HASH=/^[a-f0-9]{64}$/,ID=/^candidate_[a-f0-9]{32}$/,CURSOR=/^cursor_[a-f0-9]{48}$/;
const LANDMARKS=['root','head','leftHand','rightHand','leftFoot','rightFoot'];
const STATES=['measured','not-measured','failed-or-unknown'];
const schemaVersion='betterpptx.owner-motion-candidate.v1';
const fail=(code='CANDIDATE_INVALID')=>{const e=new Error(code==='CANDIDATE_UNAVAILABLE'?'The candidate or page is unavailable.':'The candidate request is unsupported.');e.code=code;throw e;};
const validSourceResourceId=id=>{if(typeof id!=='string'||id.length<1||id.length>512||id.trim()===''||[...id].some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127))fail();return id;};
function record(v){if(!v||typeof v!=='object'||Array.isArray(v)||![Object.prototype,null].includes(Object.getPrototypeOf(v)))fail();for(const k of Reflect.ownKeys(v)){const d=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!d.enumerable||!Object.hasOwn(d,'value'))fail();}return v;}
function keys(v,names){record(v);if(Object.keys(v).length!==names.length||Object.keys(v).some(k=>!names.includes(k)))fail();}
function optional(v,names){record(v);if(Object.keys(v).some(k=>!names.includes(k)))fail();}
function integer(v,min,max){if(!Number.isSafeInteger(v)||v<min||v>max)fail();}
function number(v,min,max){if(!Number.isFinite(v)||v<min||v>max)fail();}
function array(v){if(!Array.isArray(v)||Object.getPrototypeOf(v)!==Array.prototype)fail();for(const k of Reflect.ownKeys(v)){if(k==='length')continue;const d=Object.getOwnPropertyDescriptor(v,k);if(typeof k!=='string'||!/^\d+$/.test(k)||Number(k)>=v.length||!Object.hasOwn(d,'value'))fail();}for(let i=0;i<v.length;i++)if(!Object.hasOwn(v,i))fail();return v;}
const digest=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const clone=v=>structuredClone(v);
function ownerKey(owner){keys(owner,['schemaVersion','kind','id']);if(owner.schemaVersion!=='betterpptx.resource-owner.v1'||!['install','connector','session'].includes(owner.kind)||!HASH.test(owner.id))fail('CANDIDATE_IDENTITY_REQUIRED');return digest([owner.schemaVersion,owner.kind,owner.id]);}
export function validateObservation(v){
 keys(v,['clock','coordinateSpace','units','confidence','rigBoneCount','measuredLandmarks','geometricBasis']);
 keys(v.clock,['durationMs','fps','frameCount','sampleCount','temporalCoverage']);
 const c=v.clock;number(c.durationMs,0,2678400000);number(c.fps,0.001,1000);integer(c.frameCount,2,10000000);integer(c.sampleCount,2,10000000);
 if(c.sampleCount!==c.frameCount||c.temporalCoverage!=='every-integer-frame'||Math.abs(c.durationMs-(c.frameCount-1)*1000/c.fps)>0.00001)fail();
 keys(v.units,['state','value']);if(v.coordinateSpace!=='source-motion-space'||v.units.state!=='unverified'||v.units.value!==null||v.confidence!=='direct-source-measurement')fail();
 integer(v.rigBoneCount,1,100000);array(v.measuredLandmarks);if(new Set(v.measuredLandmarks).size!==v.measuredLandmarks.length||v.measuredLandmarks.some(x=>!LANDMARKS.includes(x)))fail();
 keys(v.geometricBasis,['pelvisVerifiedSamples','pelvisUnknownSamples','chestVerifiedSamples','chestUnknownSamples']);
 const b=v.geometricBasis;for(const n of Object.values(b))integer(n,0,c.sampleCount);
 if(b.pelvisVerifiedSamples+b.pelvisUnknownSamples!==c.sampleCount||b.chestVerifiedSamples+b.chestUnknownSamples!==c.sampleCount)fail();return clone(v);
}
function validatePrivate(v){
 optional(v,['identity','parseState','observation','sourceResourceId']);if(!['identity','parseState','observation'].every(k=>Object.hasOwn(v,k)))fail();keys(v.identity,['sourceSha256','algorithmSha256','rigRestSha256','measurementArtifactSha256']);
 if(!STATES.includes(v.parseState)||typeof v.identity.sourceSha256!=='string'||!HASH.test(v.identity.sourceSha256))fail();
 for(const k of ['algorithmSha256','rigRestSha256','measurementArtifactSha256']){const x=v.identity[k];if(!(v.parseState!=='measured'&&x===null)&&(typeof x!=='string'||!HASH.test(x)))fail();}
 if(v.parseState==='measured')validateObservation(v.observation);else if(v.observation!==null)fail();
 return {identity:Object.fromEntries(['sourceSha256','algorithmSha256','rigRestSha256','measurementArtifactSha256'].map(k=>[k,v.identity[k]])),parseState:v.parseState,observation:v.observation===null?null:validateObservation(v.observation),...(Object.hasOwn(v,'sourceResourceId')?{sourceResourceId:validSourceResourceId(v.sourceResourceId)}:{})};
}
const unknown=()=>({state:'unknown',value:null});
export function projectCandidate(entry){
 keys(entry,['candidateId','ownerKey','private']);if(!ID.test(entry.candidateId)||!HASH.test(entry.ownerKey))fail();validatePrivate(entry.private);
 const p=entry.private;
 const out={schemaVersion,candidateId:entry.candidateId,lifecycle:{parseState:p.parseState,preparationState:'unprepared',selectability:'not-selectable',semanticQualification:'unqualified'},sourceObservation:p.observation===null?null:validateObservation(p.observation),targetClock:null,semantics:Object.fromEntries(['action','actionOwningHand','activeStroke','absoluteFacing','contact','support','slideDirection'].map(k=>[k,unknown()])),preparationRequired:true};
 if(p.parseState==='measured')out.limitations=['SOURCE_CLOCK_NOT_PREPARED_TARGET_CLOCK','SOURCE_UNITS_UNVERIFIED','SOURCE_MEASUREMENT_NOT_SEMANTIC_QUALIFICATION','CANDIDATE_NOT_MOTION_SELECTOR'];
 else {out.confidence='unknown';out.reasonCode=p.parseState==='not-measured'?'MEASUREMENT_NOT_REQUESTED':'MEASUREMENT_UNAVAILABLE';}
 validatePublicCandidate(out);return out;
}
export function validatePublicCandidate(v){
 record(v);keys(v.lifecycle,['parseState','preparationState','selectability','semanticQualification']);const measured=v.lifecycle.parseState==='measured';keys(v,['schemaVersion','candidateId','lifecycle','sourceObservation','targetClock','semantics','preparationRequired',...(measured?['limitations']:['confidence','reasonCode'])]);
 if(v.schemaVersion!==schemaVersion||!ID.test(v.candidateId)||v.targetClock!==null||v.preparationRequired!==true)fail();
 keys(v.lifecycle,['parseState','preparationState','selectability','semanticQualification']);const l=v.lifecycle;
 if(!STATES.includes(l.parseState)||l.preparationState!=='unprepared'||l.selectability!=='not-selectable'||l.semanticQualification!=='unqualified')fail();
 keys(v.semantics,['action','actionOwningHand','activeStroke','absoluteFacing','contact','support','slideDirection']);for(const x of Object.values(v.semantics)){keys(x,['state','value']);if(x.state!=='unknown'||x.value!==null)fail();}
 if(measured){validateObservation(v.sourceObservation);array(v.limitations);if(JSON.stringify(v.limitations)!==JSON.stringify(['SOURCE_CLOCK_NOT_PREPARED_TARGET_CLOCK','SOURCE_UNITS_UNVERIFIED','SOURCE_MEASUREMENT_NOT_SEMANTIC_QUALIFICATION','CANDIDATE_NOT_MOTION_SELECTOR']))fail();}
 else if(v.sourceObservation!==null||v.confidence!=='unknown'||v.reasonCode!==(l.parseState==='not-measured'?'MEASUREMENT_NOT_REQUESTED':'MEASUREMENT_UNAVAILABLE'))fail();return true;
}
const blank=()=>({version:1,entries:[],pages:[]});
function validateState(s){keys(s,['version','entries','pages']);if(s.version!==1||!Array.isArray(s.entries)||!Array.isArray(s.pages))fail();const ids=new Set();for(const e of s.entries){projectCandidate(e);if(ids.has(e.candidateId))fail();ids.add(e.candidateId);}for(const p of s.pages){keys(p,['token','ownerKey','ids','offset','limit','expiresAt','nextToken']);if(!CURSOR.test(p.token)||!HASH.test(p.ownerKey)||!Array.isArray(p.ids)||new Set(p.ids).size!==p.ids.length||p.ids.some(id=>!s.entries.some(e=>e.candidateId===id&&e.ownerKey===p.ownerKey)))fail();integer(p.offset,0,p.ids.length);integer(p.limit,1,100);number(p.expiresAt,0,Number.MAX_SAFE_INTEGER);if(p.nextToken!==null&&!CURSOR.test(p.nextToken))fail();}return s;}
// Adapter.transaction must serialize all writers; durable adapters must supply atomic commit.
// The private ingestion capability is returned separately and must NEVER enter dispatcher tables.
export function createCandidateRuntime({adapter,repository,currentResourceOwner,verifyEvidence,now=Date.now,cursorTtlMs=900000,limits={},requireSourceResourceId=false}){
 if((adapter!==undefined)===(repository!==undefined)||typeof currentResourceOwner!=='function'||typeof verifyEvidence!=='function'||typeof now!=='function'||typeof requireSourceResourceId!=='boolean')fail();
 if(repository!==undefined){for(const method of ['ingest','get','firstPage','nextPage','pruneExpired'])if(typeof repository?.[method]!=='function')fail();}
 else if(typeof adapter?.transaction!=='function')fail();integer(cursorTtlMs,1000,86400000);
 optional(limits,['entriesPerOwner','entriesGlobal','pagesPerOwner','pagesGlobal','snapshotRefsPerOwner','snapshotRefsGlobal']);
 const bounds={entriesPerOwner:5000,entriesGlobal:100000,pagesPerOwner:64,pagesGlobal:4096,snapshotRefsPerOwner:200000,snapshotRefsGlobal:1000000,...limits};
 for(const [key,value] of Object.entries(bounds))integer(value,1,key.startsWith('snapshotRefs')?10000000:1000000);
 for(const prefix of ['entries','pages','snapshotRefs'])if(bounds[prefix+'PerOwner']>bounds[prefix+'Global'])fail();
 const owner=()=>ownerKey(currentResourceOwner());
 const timestamp=()=>{const t=now();number(t,0,Number.MAX_SAFE_INTEGER-cursorTtlMs);return t;};
 if(repository!==undefined){
  // Operation-oriented storage keeps global accounting in the transaction
  // repository, never in a fabricated owner-only whole-registry adapter.
  if(Object.keys(limits).length)fail();
  const capture=()=>{const captured=Object.freeze(clone(currentResourceOwner()));ownerKey(captured);return captured;};
  const projectOwned=(entry,captured)=>{const result=projectCandidate(entry);if(entry.ownerKey!==ownerKey(captured))fail('CANDIDATE_UNAVAILABLE');return result;};
  const ingest=async(input,sourceBinding)=>{
   const captured=capture(),base=validatePrivate(input);
   if(Object.hasOwn(base,'sourceResourceId'))fail('CANDIDATE_INVALID');
   let sourceResourceId;
   if(sourceBinding!==undefined){keys(sourceBinding,['sourceResourceId']);sourceResourceId=validSourceResourceId(sourceBinding.sourceResourceId);}
   if(requireSourceResourceId&&sourceResourceId===undefined)fail('CANDIDATE_PROVENANCE_UNVERIFIED');
   if(await verifyEvidence(clone(base),captured,sourceResourceId)!==true)fail('CANDIDATE_PROVENANCE_UNVERIFIED');
   const p=sourceResourceId===undefined?base:{...base,sourceResourceId};
   const entry=await repository.ingest(captured,p);projectOwned(entry,captured);
   if(JSON.stringify(validatePrivate(entry.private))!==JSON.stringify(p))fail('CANDIDATE_IMMUTABLE_CONFLICT');
   return entry.candidateId;
  };
  const get=async args=>{keys(args,['candidateId']);if(!ID.test(args.candidateId))fail('CANDIDATE_UNAVAILABLE');const captured=capture(),entry=await repository.get(captured,args.candidateId);if(entry.candidateId!==args.candidateId)fail('CANDIDATE_UNAVAILABLE');return projectOwned(entry,captured);};
  const list=async(args={})=>{
   optional(args,['limit','cursor']);if(args.limit!==undefined)integer(args.limit,1,100);if(args.cursor!==undefined&&(typeof args.cursor!=='string'||!CURSOR.test(args.cursor)))fail('CANDIDATE_UNAVAILABLE');
   const captured=capture(),t=timestamp();await repository.pruneExpired(captured,t);
   const page=args.cursor
    ?await repository.nextPage(captured,{cursor:args.cursor,limit:args.limit,now:t})
    :await repository.firstPage(captured,{limit:args.limit??50,now:t,ttlMs:cursorTtlMs});
   keys(page,['entries','nextCursor']);array(page.entries);if(page.entries.length>(args.limit??(args.cursor?100:50))||new Set(page.entries.map(e=>e.candidateId)).size!==page.entries.length||!(page.nextCursor===null||typeof page.nextCursor==='string'&&CURSOR.test(page.nextCursor)))fail();
   return {schemaVersion:'betterpptx.owner-motion-candidate-discovery.v1',candidates:page.entries.map(e=>projectOwned(e,captured)),nextCursor:page.nextCursor};
  };
  return Object.freeze({publicReadOnly:Object.freeze({list,get}),privateIngest:ingest});
 }
 const capacity=(s,o,entry=null,page=null)=>{
  const ownedEntries=s.entries.filter(e=>e.ownerKey===o),ownedPages=s.pages.filter(p=>p.ownerKey===o);
  if(s.entries.length+(entry?1:0)>bounds.entriesGlobal||ownedEntries.length+(entry?1:0)>bounds.entriesPerOwner
   ||s.pages.length+(page?1:0)>bounds.pagesGlobal||ownedPages.length+(page?1:0)>bounds.pagesPerOwner
   ||s.pages.reduce((n,p)=>n+p.ids.length,0)+(page?.ids.length??0)>bounds.snapshotRefsGlobal
   ||ownedPages.reduce((n,p)=>n+p.ids.length,0)+(page?.ids.length??0)>bounds.snapshotRefsPerOwner)fail('CANDIDATE_CAPACITY');
 };
 const tx=fn=>adapter.transaction(s=>{s=validateState(s??blank());const t=timestamp();s.pages=s.pages.filter(p=>p.expiresAt>t);return fn(s,t);});
 const ingest=async(input,sourceBinding)=>{const capturedOwner=Object.freeze(clone(currentResourceOwner())),o=ownerKey(capturedOwner),base=validatePrivate(input);if(Object.hasOwn(base,'sourceResourceId'))fail('CANDIDATE_INVALID');let sourceResourceId;if(sourceBinding!==undefined){keys(sourceBinding,['sourceResourceId']);sourceResourceId=validSourceResourceId(sourceBinding.sourceResourceId);}if(requireSourceResourceId&&sourceResourceId===undefined)fail('CANDIDATE_PROVENANCE_UNVERIFIED');if(await verifyEvidence(clone(base),capturedOwner,sourceResourceId)!==true)fail('CANDIDATE_PROVENANCE_UNVERIFIED');const p=sourceResourceId===undefined?base:{...base,sourceResourceId};return tx(s=>{const same=s.entries.find(e=>e.ownerKey===o&&JSON.stringify(e.private.identity)===JSON.stringify(p.identity));if(same){if(JSON.stringify(same.private)!==JSON.stringify(p))fail('CANDIDATE_IMMUTABLE_CONFLICT');return same.candidateId;}const e={candidateId:'candidate_'+randomBytes(16).toString('hex'),ownerKey:o,private:p};capacity(s,o,e);s.entries.push(e);return e.candidateId;});};
 const get=async args=>{keys(args,['candidateId']);if(!ID.test(args.candidateId))fail('CANDIDATE_UNAVAILABLE');const o=owner();return tx(s=>{const e=s.entries.find(e=>e.candidateId===args.candidateId&&e.ownerKey===o);if(!e)fail('CANDIDATE_UNAVAILABLE');return projectCandidate(e);});};
 const list=async(args={})=>{optional(args,['limit','cursor']);if(args.limit!==undefined)integer(args.limit,1,100);if(args.cursor!==undefined&&(typeof args.cursor!=='string'||!CURSOR.test(args.cursor)))fail('CANDIDATE_UNAVAILABLE');const o=owner();return tx((s,t)=>{
  let p;
  if(args.cursor){p=s.pages.find(x=>x.token===args.cursor&&x.ownerKey===o);if(!p||p.expiresAt<=t||(args.limit!==undefined&&args.limit!==p.limit))fail('CANDIDATE_UNAVAILABLE');}
  else {p={token:'cursor_'+randomBytes(24).toString('hex'),ownerKey:o,ids:s.entries.filter(e=>e.ownerKey===o).map(e=>e.candidateId),offset:0,limit:args.limit??50,expiresAt:t+cursorTtlMs,nextToken:null};}
  const end=Math.min(p.offset+p.limit,p.ids.length);if(end<p.ids.length&&!p.nextToken){const next={...p,token:'cursor_'+randomBytes(24).toString('hex'),offset:end,nextToken:null};capacity(s,o,null,next);p.nextToken=next.token;s.pages.push(next);}
  const candidates=p.ids.slice(p.offset,end).map(id=>projectCandidate(s.entries.find(e=>e.candidateId===id&&e.ownerKey===o)));
  // Opaque cursor is registry-backed, contains no encoded identity/hash/offset and supports same-owner replay.
  return {schemaVersion:'betterpptx.owner-motion-candidate-discovery.v1',candidates,nextCursor:p.nextToken};
 });};
 const publicReadOnly=Object.freeze({list,get});return Object.freeze({publicReadOnly,privateIngest:ingest});
}
export function rejectCandidateSelection(){fail('CANDIDATE_NOT_SELECTABLE');}
export function createMemoryAdapter(){let state=blank(),chain=Promise.resolve();return {transaction(fn){const task=chain.then(async()=>{const draft=clone(state),result=await fn(draft);state=draft;return clone(result);});chain=task.catch(()=>{});return task;}};}
