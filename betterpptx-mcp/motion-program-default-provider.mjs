// Ordinary product startup uses the declared cloud project/bucket. Explicit
// private providers retain their existing opt-in override; request arguments
// never choose providers or publication scope.
export function motionProgramProviderSpecifier(specifier,env=process.env){
 if(specifier!==undefined)return specifier
 if(!env.BETTERPPTX_GCP_PROJECT||!env.BETTERPPTX_GCS_BUCKET)return undefined
 return new URL('./motion-program-cloud-provider.mjs',import.meta.url).href
}
