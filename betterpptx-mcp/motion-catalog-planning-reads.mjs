import {AsyncLocalStorage} from 'node:async_hooks';
import {isDeepStrictEqual} from 'node:util';
import {currentResourceOwner} from './auth/resource-authorization.mjs';
import {recordResourceUsage} from './billing/resource-meter.mjs';
const scopes=new AsyncLocalStorage();
const failure=code=>Object.assign(new Error('Catalog preparation evidence changed during discovery.'),{code});
const fail=code=>{throw failure(code);};
const check=scope=>{if(scope.closed)fail('PREPARATION_INPUT_DRIFT');if(!isDeepStrictEqual(currentResourceOwner(),scope.owner))fail('RESOURCE_IDENTITY_REQUIRED');if(scope.transportFailure)throw scope.transportFailure;};
const detached=entry=>({exists:entry.exists,data:()=>structuredClone(entry.value)});
// Ordinary metadata reads share one bounded transport batch inside this query.
function remember(scope,client,key,load,snapshot){
 check(scope);if(typeof snapshot?.exists!=='boolean'||snapshot.exists&&typeof snapshot.data!=='function')fail('PREPARATION_INPUT_DRIFT');
 const entry={exists:snapshot.exists,value:snapshot.exists?structuredClone(snapshot.data()):undefined,client,key,load};
 const approval=entry.exists&&entry.value?.schemaVersion==='betterpptx.private-motion-approval.v1';
 if(approval)scope.approvals.push(entry);if(scope.fenceAll||approval)scope.fencedReads.push(entry);return entry;
}
function documentRef(client,key){const parts=key.split('/');if(parts.length!==2||parts.some(part=>!part))fail('PREPARATION_INPUT_DRIFT');return client.collection(parts[0]).doc(parts[1]);}
function queueRead(scope,client,key,load){
 let state=scope.queues.get(client);if(!state){state={client,pending:[]};scope.queues.set(client,state);scope.queueStates.add(state);}
 const promise=new Promise((resolve,reject)=>state.pending.push({key,load,resolve,reject}));
 scheduleFlush(scope);return promise;
}
function scheduleFlush(scope){
 if(scope.closed||scope.transportFailure||scope.phase!=='initial'||scope.timer)return;
 scope.timer=setImmediate(()=>{scope.timer=null;flush(scope);});
}
function rejectQueued(scope,error){for(const state of scope.queueStates)for(const entry of state.pending.splice(0))entry.reject(error);}
function flush(scope){
 if(scope.closed||scope.transportFailure||scope.phase!=='initial')return;
 while(scope.transports.size<4){
  const state=[...scope.queueStates].find(state=>state.pending.length);if(!state)break;
  const issued=state.pending.splice(0,64);
  // Track the transport before starting it; close/error must drain issued work.
  const task=Promise.resolve().then(async()=>{
   check(scope);const refs=issued.map(entry=>documentRef(state.client,entry.key));recordResourceUsage({firestoreReads:refs.length});const rows=await state.client.getAll(...refs);check(scope);
   if(!Array.isArray(rows)||rows.length!==issued.length)fail('PREPARATION_INPUT_DRIFT');
   const entries=rows.map((row,n)=>{const expected=refs[n].path??refs[n].name,actual=row?.ref?.path??row?.ref?.name;if(typeof expected!=='string'||expected!==actual)fail('PREPARATION_INPUT_DRIFT');return remember(scope,state.client,issued[n].key,issued[n].load,row);});
   for(let n=0;n<issued.length;n++)issued[n].resolve(entries[n]);
  }).catch(error=>{scope.transportFailure??=error;for(const entry of issued)entry.reject(scope.transportFailure);rejectQueued(scope,scope.transportFailure);})
   .finally(()=>{scope.transports.delete(task);scheduleFlush(scope);});
  scope.transports.add(task);
 }
}
async function finishInitialReads(scope){
 for(;;){check(scope);const count=scope.initialReads.size,settled=await Promise.allSettled([...scope.initialReads]);await Promise.allSettled([...scope.transports]);for(const item of settled)if(item.status==='rejected')throw item.reason;check(scope);if(scope.initialReads.size===count)break;}
 if(scope.transportFailure)throw scope.transportFailure;scope.phase='fence';
}
async function closeScope(scope){scope.closed=true;if(scope.timer){clearImmediate(scope.timer);scope.timer=null;}rejectQueued(scope,scope.transportFailure??failure('PREPARATION_INPUT_DRIFT'));await Promise.allSettled([...scope.transports]);}
// Every custody and approval predicate still runs on a detached full document.
export async function motionCatalogPlanningRead(client,key,load){
 const scope=scopes.getStore();if(!scope)return load();check(scope);if(scope.phase!=='initial')fail('PREPARATION_INPUT_DRIFT');
 let records=scope.clients.get(client);if(!records){records=new Map();scope.clients.set(client,records);}
 let pending=records.get(key);if(!pending){pending=typeof client.getAll==='function'?queueRead(scope,client,key,load):(async()=>remember(scope,client,key,load,await load()))();records.set(key,pending);scope.initialReads.add(pending);pending.catch(()=>records.delete(key));}
 const entry=await pending;check(scope);return detached(entry);
}
// Repository-instance identity prevents sharing entries across validators or limits.
function candidateEntries(scope,repository,owner,create){
 check(scope);if(scope.phase!=='initial')fail('PREPARATION_INPUT_DRIFT');
 if(!isDeepStrictEqual(owner,scope.owner))fail('RESOURCE_IDENTITY_REQUIRED');
 if(scope.fenceAll)return undefined;
 let entries=scope.candidates.get(repository);if(!entries&&create){entries=new Map();scope.candidates.set(repository,entries);}return entries;
}
export function rememberMotionCatalogCandidates(repository,owner,entries){
 const scope=scopes.getStore();if(!scope)return;
 const cache=candidateEntries(scope,repository,owner,true);
 if(!cache)return;
 for(const entry of entries){const prior=cache.get(entry.candidateId);if(prior&&!isDeepStrictEqual(prior,entry))fail('PREPARATION_INPUT_DRIFT');cache.set(entry.candidateId,structuredClone(entry));}
}
export function readMotionCatalogCandidates(repository,owner,ids){
 const scope=scopes.getStore();if(!scope)return undefined;
 const cache=candidateEntries(scope,repository,owner,false);
 if(!cache||ids.some(id=>!cache.has(id)))return undefined;
 return ids.map(id=>structuredClone(cache.get(id)));
}
// Catalog-only snapshot; preparation execution and subsequent queries use fresh reads.
async function withCatalogReads(callback,fenceAll){
 const scope={owner:structuredClone(currentResourceOwner()),clients:new WeakMap(),candidates:new WeakMap(),queues:new WeakMap(),queueStates:new Set(),initialReads:new Set(),transports:new Set(),timer:null,approvals:[],fencedReads:[],fenceAll,closed:false,phase:'initial'};
 return scopes.run(scope,async()=>{
  try{const result=await callback();check(scope);await finishInitialReads(scope);
  // Mutable decisions are fetched again before publication; hashes/ownership remain guarded.
  const groups=new Map();for(const entry of scope.fencedReads){const entries=groups.get(entry.client)||[];entries.push(entry);groups.set(entry.client,entries);}
  function validateFresh(fresh,entry){
   check(scope);if(typeof fresh?.exists!=='boolean'||fresh.exists!==entry.exists||fresh.exists&&(typeof fresh.data!=='function'||!isDeepStrictEqual(fresh.data(),entry.value)))fail('PREPARATION_INPUT_DRIFT');
   if(entry.exists&&entry.value?.schemaVersion==='betterpptx.private-motion-approval.v1'&&(entry.value.status!=='approved'||entry.value.expiresAtMs<=Date.now()))fail('PREPARATION_INPUT_DRIFT');
  }
  const jobs=[];
  for(const [client,entries]of groups){
   if(typeof client.getAll==='function'){
    for(let start=0;start<entries.length;start+=64){const issued=entries.slice(start,start+64);jobs.push({bulk:true,run:async()=>{
     const refs=issued.map(entry=>documentRef(client,entry.key));check(scope);recordResourceUsage({firestoreReads:refs.length});
     const fresh=await client.getAll(...refs);check(scope);if(!Array.isArray(fresh)||fresh.length!==refs.length)fail('PREPARATION_INPUT_DRIFT');
     for(let n=0;n<issued.length;n++){const expected=refs[n].path??refs[n].name,actual=fresh[n]?.ref?.path??fresh[n]?.ref?.name;if(typeof expected!=='string'||actual!==expected)fail('PREPARATION_INPUT_DRIFT');validateFresh(fresh[n],issued[n]);}
    }});}
   }else{
    for(let start=0;start<entries.length;start+=8){const issued=entries.slice(start,start+8);jobs.push({bulk:false,run:async()=>{
     const settled=await Promise.allSettled(issued.map(async entry=>validateFresh(await entry.load(),entry)));for(const item of settled)if(item.status==='rejected')throw item.reason;
    }});}
   }
  }
  // At most four <=64-document bulk calls globally; fallback loads retain width eight.
  for(let start=0;start<jobs.length;){let width=1;if(jobs[start].bulk)while(width<4&&jobs[start+width]?.bulk)width++;
   const settled=await Promise.allSettled(jobs.slice(start,start+width).map(job=>job.run()));start+=width;
   // Drain every issued call before propagating the first failure in request order.
   for(const item of settled)if(item.status==='rejected')throw item.reason;
  }
  check(scope);for(const entry of scope.approvals)if(entry.value.expiresAtMs<=Date.now())fail('PREPARATION_INPUT_DRIFT');return result;}finally{await closeScope(scope);}
 });
}
export function withMotionCatalogPlanningReads(callback){return withCatalogReads(callback,false);}
// Selected-output final checks get an empty scope after hydration. Every reused
// document is fetched again before any verified output is published.
export function withMotionCatalogVerificationReads(callback){return withCatalogReads(callback,true);}
