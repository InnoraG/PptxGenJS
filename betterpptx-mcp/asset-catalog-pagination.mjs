import{createHash}from'node:crypto'

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const fail=(code,message)=>{throw Object.assign(new Error(message),{code})}
const opaqueHandle=value=>typeof value==='string'&&/^[a-z][a-z0-9-]*:\/\/(?:catalog\/[a-z0-9-]+|public)\/[a-f0-9]{16,64}$/i.test(value)

/** An inventory continuation, never authorization. It contains only hashes,
 * a public opaque handle and a position. Current filtering still owns access. */
export function paginateAssetCatalog({items,scope,cursor,limit=60,key,version}={}){
 if(!Array.isArray(items)||typeof key!=='function'||typeof version!=='function'||!scope||typeof scope!=='object'||!Number.isSafeInteger(limit)||limit<1||limit>500)throw new TypeError('A bounded asset inventory is required.')
 const handles=items.map(key);if(handles.some(handle=>!opaqueHandle(handle)))throw new TypeError('Pagination requires public opaque asset handles.')
 const scopeHash=digest(scope),snapshot=digest(items.map((item,i)=>[handles[i],version(item)]));let offset=0
 if(cursor!==undefined){
  const invalid=()=>fail('ASSET_CATALOG_CURSOR_INVALID','The asset continuation is invalid. Start a new catalog request.')
  if(typeof cursor!=='string'||!/^pc1\.[A-Za-z0-9_-]{1,2048}$/.test(cursor))invalid()
  let payload;try{payload=JSON.parse(Buffer.from(cursor.slice(4),'base64url').toString('utf8'))}catch{invalid()}
  if(!payload||Object.getPrototypeOf(payload)!==Object.prototype||Object.keys(payload).sort().join(',')!=='a,n,p,s,v'||payload.v!==1||!Number.isSafeInteger(payload.n)||payload.n<1||!opaqueHandle(payload.a)||!(/^[a-f0-9]{64}$/).test(payload.s)||!(/^[a-f0-9]{64}$/).test(payload.p))invalid()
  if(payload.s!==scopeHash)fail('ASSET_CATALOG_CURSOR_SCOPE_MISMATCH','Use the asset continuation with the same catalog filters, or start a new request.')
  if(payload.p!==snapshot)fail('ASSET_CATALOG_CURSOR_STALE','The asset inventory changed. Start a new catalog request.')
  if(payload.n>items.length||handles[payload.n-1]!==payload.a)invalid()
  offset=payload.n
 }
 const page=items.slice(offset,offset+limit),end=offset+page.length,hasMore=end<items.length,nextCursor=hasMore?'pc1.'+Buffer.from(JSON.stringify({v:1,s:scopeHash,p:snapshot,a:handles[end-1],n:end})).toString('base64url'):null
 return{items:page,nextCursor,pagination:{offset,limit,returned:page.length,total:items.length,hasMore,nextCursor}}
}
