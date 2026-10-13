import {createHash,randomBytes} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const sha=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(canonical(x))).digest('hex');
const clone=structuredClone,HASH=/^[a-f0-9]{64}$/,ID=/^candidate_[a-f0-9]{32}$/,TOKEN=/^cursor_[a-f0-9]{48}$/;
const error=(code='CANDIDATE_STORAGE_UNAVAILABLE')=>Object.assign(new Error('Candidate storage is unavailable.'),{code});
const check=(v,code)=>{if(!v)throw error(code);};
const integer=(n,min,max)=>check(Number.isSafeInteger(n)&&n>=min&&n<=max);
const closed=(v,keys)=>{check(v&&Object.getPrototypeOf(v)===Object.prototype&&!Array.isArray(v));check(Object.keys(v).length===keys.length&&Object.keys(v).every(k=>keys.includes(k)));for(const d of Object.values(Object.getOwnPropertyDescriptors(v)))check(Object.hasOwn(d,'value'));};
export function capturedOwnerKey(owner){closed(owner,['schemaVersion','kind','id']);check(owner.schemaVersion==='betterpptx.resource-owner.v1'&&['install','connector','session'].includes(owner.kind)&&HASH.test(owner.id),'CANDIDATE_IDENTITY_REQUIRED');return sha([owner.schemaVersion,owner.kind,owner.id]);}
// Inject the existing trusted server Firestore-style client. No SDK creation,
// environment defaults, credentials, cloud calls or process-local writer lock.
export function createDurableCandidateRepository({client,collection,validateEntry,limits={},candidatePlanningEntries}){
 check(client&&typeof client.runTransaction==='function'&&typeof client.collection==='function'&&typeof validateEntry==='function');
 check(typeof collection==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(collection));
 const L={entriesPerOwner:5000,entriesGlobal:100000,pagesPerOwner:64,pagesGlobal:4096,snapshotRefsPerOwner:200000,snapshotRefsGlobal:1000000,chunkSize:256,maxEntryBytes:8192,maxDocumentBytes:65536,maxReads:150,maxWrites:128,maxTransactionBytes:6000000,...limits};
 check(Object.keys(L).length===12);for(const n of Object.values(L))integer(n,1,10000000);
 for(const p of ['entries','pages','snapshotRefs'])check(L[p+'PerOwner']<=L[p+'Global']);check(L.chunkSize<=256&&L.pagesPerOwner<=64&&Math.ceil(L.entriesPerOwner/L.chunkSize)+L.pagesPerOwner+4<=L.maxWrites);
 check(candidatePlanningEntries===undefined||candidatePlanningEntries&&typeof candidatePlanningEntries.remember==='function'&&typeof candidatePlanningEntries.read==='function');
 const planningRepository=Object.freeze({}),refs=client.collection(collection),ref=k=>refs.doc(k);
 const pack=(k,data)=>({schema:'candidate-storage-envelope.v1',key:k,data,digest:sha([k,data])});
 const unpack=(k,s)=>{if(!s.exists)return null;const x=s.data();closed(x,['schema','key','data','digest']);check(x.schema==='candidate-storage-envelope.v1'&&x.key===k&&x.digest===sha([k,x.data]));return x.data;};
 const policySha256=sha(L),zero=()=>({entries:0,pages:0,snapshotRefs:0,policySha256});
 function ledger(x){closed(x,['entries','pages','snapshotRefs','policySha256']);check(x.policySha256===policySha256,'CANDIDATE_STORAGE_POLICY_MISMATCH');for(const k of ['entries','pages','snapshotRefs'])integer(x[k],0,L[k+'Global']);return x;}
 const emptyOwner=o=>({ownerKey:o,entryCount:0,indexChunks:0,snapshots:[]});
 function ownerState(x,o){closed(x,['ownerKey','entryCount','indexChunks','snapshots']);check(x.ownerKey===o);integer(x.entryCount,0,L.entriesPerOwner);check(x.indexChunks===Math.ceil(x.entryCount/L.chunkSize)&&Array.isArray(x.snapshots)&&x.snapshots.length<=L.pagesPerOwner);let refs=0,pages=0;const ids=new Set(),tokens=new Set();for(const s of x.snapshots){closed(s,['id','expiresAt','count','chunks','tokens']);check(HASH.test(s.id)&&!ids.has(s.id));ids.add(s.id);integer(s.expiresAt,0,Number.MAX_SAFE_INTEGER);integer(s.count,1,L.entriesPerOwner);check(s.chunks===Math.ceil(s.count/L.chunkSize));check(Array.isArray(s.tokens)&&s.tokens.length>0);for(const t of s.tokens){check(TOKEN.test(t)&&!tokens.has(t));tokens.add(t);}refs+=s.count;pages+=s.tokens.length;}check(pages<=L.pagesPerOwner&&refs<=L.snapshotRefsPerOwner);return x;}
 const counts=m=>({entries:m.entryCount,pages:m.snapshots.reduce((n,s)=>n+s.tokens.length,0),snapshotRefs:m.snapshots.reduce((n,s)=>n+s.count,0)});
 const admit=(g,m,delta)=>{const c=counts(m);for(const p of ['entries','pages','snapshotRefs'])check(g[p]+(delta[p]??0)<=L[p+'Global']&&c[p]+(delta[p]??0)<=L[p+'PerOwner'],'CANDIDATE_CAPACITY');};
 const transact=fn=>client.runTransaction(async tx=>{
  let reads=0,writes=0,bytes=0,wrote=false;
  const io={async get(k){check(!wrote);check(++reads<=L.maxReads,'CANDIDATE_TRANSACTION_LIMIT');const s=await tx.get(ref(k));if(s.exists){const n=Buffer.byteLength(JSON.stringify(s.data()));check(n<=L.maxDocumentBytes,'CANDIDATE_TRANSACTION_LIMIT');bytes+=n;check(bytes<=L.maxTransactionBytes,'CANDIDATE_TRANSACTION_LIMIT');}return unpack(k,s);},set(k,data){wrote=true;const x=pack(k,data),n=Buffer.byteLength(JSON.stringify(x));check(++writes<=L.maxWrites&&n<=L.maxDocumentBytes,'CANDIDATE_TRANSACTION_LIMIT');bytes+=n;check(bytes<=L.maxTransactionBytes,'CANDIDATE_TRANSACTION_LIMIT');tx.set(ref(k),x,{merge:false});},delete(k){wrote=true;check(++writes<=L.maxWrites,'CANDIDATE_TRANSACTION_LIMIT');tx.delete(ref(k));}};
  io.supportsGetAll=typeof tx.getAll==='function';
  io.getAll=async(keys,validate)=>{
   check(!wrote);check(Array.isArray(keys)&&keys.length>0&&keys.length<=64&&new Set(keys).size===keys.length);check((reads+=keys.length)<=L.maxReads,'CANDIDATE_TRANSACTION_LIMIT');
   const refsToRead=keys.map(ref),snapshots=await tx.getAll(...refsToRead);check(Array.isArray(snapshots)&&snapshots.length===keys.length);
   return snapshots.map((snapshot,n)=>{const expected=refsToRead[n].path??refsToRead[n].name??refsToRead[n].key,actual=snapshot?.ref?.path??snapshot?.ref?.name??snapshot?.ref?.key;check(typeof expected==='string'&&actual===expected&&typeof snapshot.exists==='boolean');if(snapshot.exists){const size=Buffer.byteLength(JSON.stringify(snapshot.data()));check(size<=L.maxDocumentBytes,'CANDIDATE_TRANSACTION_LIMIT');bytes+=size;check(bytes<=L.maxTransactionBytes,'CANDIDATE_TRANSACTION_LIMIT');}const value=unpack(keys[n],snapshot);validate(value,n);return value;});
  };
  return fn(io);
 });
 async function state(io,o){const g=ledger(await io.get('global')??zero()),m=ownerState(await io.get('owner-'+o)??emptyOwner(o),o);for(const p of ['entries','pages','snapshotRefs'])check(g[p]>=counts(m)[p]);return {g,m};}
 const chunkKey=(o,n)=>'index-'+o+'-'+n,entryKey=(o,id)=>'entry-'+o+'-'+id,snapKey=(o,id)=>'snapshot-'+o+'-'+id,snapChunk=(o,id,n)=>'snapshotchunk-'+o+'-'+id+'-'+n,cursorKey=(o,t)=>'cursor-'+o+'-'+t;
 function idsChunk(x,max=L.chunkSize){check(Array.isArray(x)&&x.length<=max&&x.every(t=>ID.test(t))&&new Set(x).size===x.length);return x;}
 async function readEntries(io,o,ids){
  const out=[],width=io.supportsGetAll?64:8;
  for(let start=0;start<ids.length;start+=width){const issued=ids.slice(start,start+width),validate=(entry,n)=>{check(entry&&entry.candidateId===issued[n]&&entry.ownerKey===o,'CANDIDATE_UNAVAILABLE');validateEntry(entry);};let entries;
   if(io.supportsGetAll)entries=await io.getAll(issued.map(id=>entryKey(o,id)),validate);
   else{const settled=await Promise.allSettled(issued.map(async(id,n)=>{const entry=await io.get(entryKey(o,id));validate(entry,n);return entry;}));entries=[];for(const result of settled){if(result.status==='rejected')throw result.reason;entries.push(result.value);}}
   out.push(...entries);
  }
  return out;
 }
 async function pruneExpired(capturedOwner,now){const o=capturedOwnerKey(capturedOwner);integer(now,0,Number.MAX_SAFE_INTEGER);return transact(async io=>{const {g,m}=await state(io,o);const s=m.snapshots.find(x=>x.expiresAt<=now);if(!s)return {prunedSnapshots:0};
  // One whole snapshot bounded by <=20 chunks + <=64 cursors under defaults.
  g.pages-=s.tokens.length;g.snapshotRefs-=s.count;m.snapshots=m.snapshots.filter(x=>x.id!==s.id);for(const t of s.tokens)io.delete(cursorKey(o,t));for(let i=0;i<s.chunks;i++)io.delete(snapChunk(o,s.id,i));io.delete(snapKey(o,s.id));io.set('global',g);io.set('owner-'+o,m);return {prunedSnapshots:1,releasedPages:s.tokens.length,releasedReferences:s.count};});}
 async function ingest(capturedOwner,privateEvidence){
  const o=capturedOwnerKey(capturedOwner),p=clone(privateEvidence),candidateId='candidate_'+randomBytes(16).toString('hex'),e={candidateId,ownerKey:o,private:p};validateEntry(e);check(Buffer.byteLength(JSON.stringify(e))<=L.maxEntryBytes,'CANDIDATE_ENTRY_LIMIT');
  // Source/algorithm/rig/artifact remain private; normalize identity in runtime before this hook.
  const identityKey='identity-'+o+'-'+sha(p.identity);
  return transact(async io=>{const {g,m}=await state(io,o),index=await io.get(identityKey);if(index){closed(index,['candidateId','identityDigest']);check(index.identityDigest===sha(p.identity)&&ID.test(index.candidateId));const existing=(await readEntries(io,o,[index.candidateId]))[0];check(sha(existing.private)===sha(p),'CANDIDATE_IMMUTABLE_CONFLICT');return existing;}
   const n=Math.floor(m.entryCount/L.chunkSize),tail=idsChunk(await io.get(chunkKey(o,n))??[]);check(tail.length===m.entryCount%L.chunkSize);admit(g,m,{entries:1});tail.push(candidateId);m.entryCount++;m.indexChunks=Math.ceil(m.entryCount/L.chunkSize);g.entries++;io.set(entryKey(o,candidateId),e);io.set(identityKey,{candidateId,identityDigest:sha(p.identity)});io.set(chunkKey(o,n),tail);io.set('global',g);io.set('owner-'+o,m);return e;});
 }
 async function get(capturedOwner,candidateId){check(ID.test(candidateId),'CANDIDATE_UNAVAILABLE');const o=capturedOwnerKey(capturedOwner);return transact(io=>readEntries(io,o,[candidateId]).then(es=>es[0]));}
 async function getMany(capturedOwner,candidateIds){check(Array.isArray(candidateIds)&&candidateIds.length>0&&candidateIds.length<=64&&new Set(candidateIds).size===candidateIds.length&&candidateIds.every(id=>ID.test(id)),'CANDIDATE_UNAVAILABLE');const o=capturedOwnerKey(capturedOwner),cached=candidatePlanningEntries?.read(planningRepository,capturedOwner,candidateIds);
  if(cached!==undefined){
   check(Array.isArray(cached)&&cached.length===candidateIds.length,'CANDIDATE_UNAVAILABLE');
   check(candidateIds.length<=L.maxReads,'CANDIDATE_TRANSACTION_LIMIT');let bytes=0;
   const entries=clone(cached);
   for(let n=0;n<entries.length;n++){const entry=entries[n];check(entry&&entry.candidateId===candidateIds[n]&&entry.ownerKey===o,'CANDIDATE_UNAVAILABLE');
    // Reconstruct only the verified immutable envelope for the same read budgets.
    const size=Buffer.byteLength(JSON.stringify(pack(entryKey(o,candidateIds[n]),entry)));
    check(size<=L.maxDocumentBytes,'CANDIDATE_TRANSACTION_LIMIT');bytes+=size;check(bytes<=L.maxTransactionBytes,'CANDIDATE_TRANSACTION_LIMIT');validateEntry(entry);
   }return entries;
  }
  return transact(io=>readEntries(io,o,candidateIds));
 }
 // Share only a currently running scan within this repository instance.
 // Candidate entries are immutable; every scan still checks the owner index
 // before, during and after reading. Later calls never reuse a settled scan.
 const sourceScans=new Map();
 function scanSourceEntries(o){
  const active=sourceScans.get(o);if(active)return active;
  const scan=(async()=>{
   const initial=await transact(async io=>{const {m}=await state(io,o);return {entryCount:m.entryCount,indexChunks:m.indexChunks,supportsGetAll:io.supportsGetAll}}),entries=[];
   // Overlap four intact bulk transactions; singular-read fallback stays at two.
   const scanWidth=initial.supportsGetAll?4:2;
   for(let groupStart=0;groupStart<initial.entryCount;groupStart+=64*scanWidth){
    const starts=Array.from({length:Math.min(scanWidth,Math.ceil((initial.entryCount-groupStart)/64))},(_,i)=>groupStart+i*64);
    const settled=await Promise.allSettled(starts.map(start=>transact(async io=>{const {m}=await state(io,o);check(m.entryCount===initial.entryCount&&m.indexChunks===initial.indexChunks,'CANDIDATE_LOOKUP_CHANGED');const end=Math.min(start+64,m.entryCount),ids=[];
     for(let n=Math.floor(start/L.chunkSize);n<=Math.floor((end-1)/L.chunkSize);n++){const chunk=idsChunk(await io.get(chunkKey(o,n)));check(chunk.length===Math.min(L.chunkSize,m.entryCount-n*L.chunkSize));for(let i=Math.max(start,n*L.chunkSize);i<Math.min(end,(n+1)*L.chunkSize);i++)ids.push(chunk[i-n*L.chunkSize]);}return readEntries(io,o,ids);})));
    // Drain the whole issued group before propagating the first ordered failure.
    for(const result of settled){if(result.status==='rejected')throw result.reason;entries.push(...result.value);}
   }
   await transact(async io=>{const {m}=await state(io,o);check(m.entryCount===initial.entryCount&&m.indexChunks===initial.indexChunks,'CANDIDATE_LOOKUP_CHANGED')});return entries;
  })();
  let shared;const clear=()=>{if(sourceScans.get(o)===shared)sourceScans.delete(o);};
  shared=scan.then(entries=>{clear();return entries;},error=>{clear();throw error;});sourceScans.set(o,shared);return shared;
 }
 async function findBySourceObservations(capturedOwner,observations){
  check(Array.isArray(observations)&&observations.length<=520);const o=capturedOwnerKey(capturedOwner),requested=new Map(),results=[];
  for(const item of observations){closed(item,['reviewId','sourceSha256','sourceObservation']);check(typeof item.reviewId==='string'&&/^cap_[a-f0-9]{20}$/.test(item.reviewId)&&!requested.has(item.reviewId)&&HASH.test(item.sourceSha256)&&item.sourceObservation&&typeof item.sourceObservation==='object');const row={reviewId:item.reviewId,matches:[],sourceIdentityCount:0};requested.set(item.reviewId,{input:clone(item),row});results.push(row);}
  const bySource=new Map();for(const value of requested.values()){const rows=bySource.get(value.input.sourceSha256)||[];rows.push(value);bySource.set(value.input.sourceSha256,rows);}
  const entries=await scanSourceEntries(o);
  // Seed each caller after the shared scan and its final owner-index check succeed.
  candidatePlanningEntries?.remember(planningRepository,capturedOwner,entries);
  for(const entry of entries)for(const value of bySource.get(entry.private.identity.sourceSha256)||[]){value.row.sourceIdentityCount++;if(entry.private.parseState==='measured'&&isDeepStrictEqual(entry.private.observation,value.input.sourceObservation))value.row.matches.push(entry);}
  return clone({results,lookupComplete:true});
 }
 async function findBySourceObservation(capturedOwner,{sourceSha256,sourceObservation}){
  check(HASH.test(sourceSha256)&&sourceObservation&&typeof sourceObservation==='object');const o=capturedOwnerKey(capturedOwner),observation=clone(sourceObservation),matches=[];let sourceIdentityCount=0;
  for(const entry of await scanSourceEntries(o))if(entry.private.identity.sourceSha256===sourceSha256){sourceIdentityCount++;if(entry.private.parseState==='measured'&&isDeepStrictEqual(entry.private.observation,observation))matches.push(entry);}
  return clone({matches,sourceIdentityCount,lookupComplete:true});
 }
 async function firstPage(capturedOwner,{limit=50,now=Date.now(),ttlMs=900000}={}){
  integer(limit,1,100);integer(ttlMs,1000,86400000);integer(now,0,Number.MAX_SAFE_INTEGER-ttlMs);const o=capturedOwnerKey(capturedOwner),snapshotId=randomBytes(32).toString('hex'),token='cursor_'+randomBytes(24).toString('hex');
  return transact(async io=>{const {g,m}=await state(io,o),ids=[];for(let i=0;i<m.indexChunks;i++){const chunk=idsChunk(await io.get(chunkKey(o,i)));check(chunk.length===Math.min(L.chunkSize,m.entryCount-i*L.chunkSize));ids.push(...chunk);}check(ids.length===m.entryCount&&new Set(ids).size===ids.length);const entries=await readEntries(io,o,ids.slice(0,limit));if(ids.length<=limit)return {entries,nextCursor:null};
   admit(g,m,{pages:1,snapshotRefs:ids.length});const expiresAt=now+ttlMs,descriptor={id:snapshotId,expiresAt,count:ids.length,chunks:Math.ceil(ids.length/L.chunkSize),tokens:[token]};m.snapshots.push(descriptor);g.pages++;g.snapshotRefs+=ids.length;
   for(let i=0;i<descriptor.chunks;i++)io.set(snapChunk(o,snapshotId,i),ids.slice(i*L.chunkSize,(i+1)*L.chunkSize));io.set(snapKey(o,snapshotId),{ownerKey:o,count:ids.length,chunks:descriptor.chunks,expiresAt});io.set(cursorKey(o,token),{ownerKey:o,snapshotId,offset:limit,limit,expiresAt,nextToken:null});io.set('global',g);io.set('owner-'+o,m);return {entries,nextCursor:token};});
 }
 async function nextPage(capturedOwner,{cursor,limit,now=Date.now()}){
  check(TOKEN.test(cursor),'CANDIDATE_UNAVAILABLE');if(limit!==undefined)integer(limit,1,100);integer(now,0,Number.MAX_SAFE_INTEGER);const o=capturedOwnerKey(capturedOwner),next='cursor_'+randomBytes(24).toString('hex');
  return transact(async io=>{const {g,m}=await state(io,o),c=await io.get(cursorKey(o,cursor));check(c,'CANDIDATE_UNAVAILABLE');closed(c,['ownerKey','snapshotId','offset','limit','expiresAt','nextToken']);const d=m.snapshots.find(x=>x.id===c.snapshotId&&x.tokens.includes(cursor));check(d&&c.ownerKey===o&&c.expiresAt===d.expiresAt&&c.expiresAt>now&&(limit===undefined||c.limit===limit),'CANDIDATE_UNAVAILABLE');integer(c.limit,1,100);integer(c.offset,1,d.count);check(c.offset%c.limit===0);check(c.nextToken===null||TOKEN.test(c.nextToken));
   check(c.offset<d.count);const manifest=await io.get(snapKey(o,d.id));closed(manifest,['ownerKey','count','chunks','expiresAt']);check(manifest.ownerKey===o&&manifest.count===d.count&&manifest.chunks===d.chunks&&manifest.expiresAt===d.expiresAt);const end=Math.min(c.offset+c.limit,d.count),ids=[];for(let n=Math.floor(c.offset/L.chunkSize);n<=Math.floor((end-1)/L.chunkSize);n++){const chunk=idsChunk(await io.get(snapChunk(o,d.id,n)));check(chunk.length===Math.min(L.chunkSize,d.count-n*L.chunkSize));for(let i=Math.max(c.offset,n*L.chunkSize);i<Math.min(end,(n+1)*L.chunkSize);i++)ids.push(chunk[i-n*L.chunkSize]);}const entries=await readEntries(io,o,ids);
   if(c.nextToken)check(d.tokens.includes(c.nextToken));if(end<d.count&&!c.nextToken){admit(g,m,{pages:1});c.nextToken=next;d.tokens.push(next);g.pages++;io.set(cursorKey(o,next),{ownerKey:o,snapshotId:d.id,offset:end,limit:c.limit,expiresAt:c.expiresAt,nextToken:null});io.set(cursorKey(o,cursor),c);io.set('global',g);io.set('owner-'+o,m);}return {entries,nextCursor:c.nextToken};});
 }
 return Object.freeze({ingest,get,getMany,findBySourceObservation,findBySourceObservations,firstPage,nextPage,pruneExpired,limits:Object.freeze(L)});
}
