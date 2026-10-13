import {createHash} from 'node:crypto'
const hash=/^[a-f0-9]{64}$/
const fail=()=>{throw Object.assign(new Error('Authored visual review evidence is unavailable.'),{code:'SOURCE_REVIEW_INVALID'})}
export function validateAuthoredVisualReview(value,observation){
 const keys=['schemaVersion','preparedVariantId','preparedOutputSha256','preparationReceiptSha256','reviewReceiptSha256','sampleTimesMs','captureCount','scope','interpretationAuthority','nativeQualification']
 if(!value||typeof value!=='object'||Array.isArray(value)||Reflect.ownKeys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k))||value.schemaVersion!=='betterpptx.authored-visual-motion-review.v1'||!/^prepared_variant_[a-f0-9]{32}$/.test(value.preparedVariantId)||!['preparedOutputSha256','preparationReceiptSha256','reviewReceiptSha256'].every(k=>hash.test(value[k]))||value.scope!=='sampled-prepared-output-only'||value.interpretationAuthority!=='ai'||value.nativeQualification!=='unqualified'||!Number.isInteger(value.captureCount)||value.captureCount<1||value.captureCount>24||!Array.isArray(value.sampleTimesMs)||value.sampleTimesMs.length<1||value.sampleTimesMs.length>24||value.captureCount<value.sampleTimesMs.length)fail()
 // Rendered GLB clocks use Float32 keys; this allowance is only clock precision,
 // not retiming or evidence of continuous/native behaviour.
 const clockAllowanceMs=Math.max(.001,observation.clock.durationMs*2**-23)
 for(let i=0;i<value.sampleTimesMs.length;i++){const time=value.sampleTimesMs[i];if(!Object.hasOwn(value.sampleTimesMs,i)||typeof time!=='number'||!Number.isFinite(time)||time<0||time>observation.clock.durationMs+clockAllowanceMs||i&&time<=value.sampleTimesMs[i-1])fail()}
 return structuredClone(value)
}
export function publicAuthoredVisualReview(value){
 return {evidenceId:'evidence_'+createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32),scope:value.scope,interpretationAuthority:value.interpretationAuthority,captureCount:value.captureCount,sampleTimesMs:[...value.sampleTimesMs],nativeQualification:'unqualified',semanticQualification:'not-established',currentAssetAvailability:'not-assessed'}
}
