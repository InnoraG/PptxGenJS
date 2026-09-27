// Consolidate the already immutable baseline proofs into explicit G0/G1
// promotion checks. This does not promote any universal slider row.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
const root = process.cwd()
const arg = name => process.argv.includes(name) ? process.argv[process.argv.indexOf(name)+1] : null
const files = {
	html: path.resolve(arg('--html-proof') || 'outputs/authoring-principle-corpus/global-extended-option-five-point/html-canonical-public/20260826T151454Z/canonical-html-public-proof.json'),
	portable: path.resolve(arg('--portable-proof') || 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-portable-regeneration/20260826T151415Z/canonical-25-portable-regeneration-public-proof.json'),
	lifecycle: path.resolve(arg('--lifecycle-proof') || 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-lifecycle-schemas/20260826T151532Z/canonical-25-lifecycle-schemas-proof.json'),
	global: path.resolve(arg('--global-proof') || 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/global-parameter-baseline-regression/20260826T150952Z/global-parameter-baseline-regression-proof.json'),
	archive: path.resolve(arg('--archive-proof') || 'outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide/20260826T145405Z/canonical-25-jsonspec-archive-proof.json'),
}
const load = async file => JSON.parse(await fs.readFile(file,'utf8'))
const [html, portable, lifecycle, global, archive] = await Promise.all(Object.values(files).map(load))
const checks = {
	g0PublicImplementationBaseline: html.status === 'PASS' && portable.status === 'PASS' && global.status === 'PASS',
	g0CatalogClassifiable: global.checks?.matrixRows === true && global.checks?.liveCatalogRows === true && global.checks?.noPrivateLeakage === true,
	g0SourceBaselineFrozen: html.source?.expectedSlides === 25 && html.upload?.inspect?.images === 29 && html.upload?.inspect?.detectedSlides === 25 && (html.execution?.residualFallbacks?.count === 25 || html.fallbackPolicy),
	g0LifecycleSchemaBoundary: lifecycle.status === 'PASS' && Object.values(lifecycle.checks || {}).every(Boolean),
	g0FreshSessionHandoff: portable.checks?.freshRoleAandRoleB === true && portable.checks?.bundleImportedFresh === true && portable.checks?.roleBDryRunMutationFree === true,
	g0BlackBoxNoLeakage: html.checks?.noPrivateImplementationLeakage === true && portable.checks?.noPrivateImplementationLeakage === true,
	g1HtmlEntryPath: html.checks?.freshPublicSession === true && html.checks?.htmlUpload === true && html.checks?.htmlInspect === true && html.checks?.dryRunMutationFree === true,
	g1JsonBundleEntryPath: portable.checks?.freshRoleAandRoleB === true && portable.checks?.bundleExported === true && portable.checks?.bundleInspected === true && portable.checks?.bundleImportedFresh === true && portable.checks?.roleBDryRunMutationFree === true,
	g1IdentityAndCounts: portable.checks?.sourceIdentityRetained === true && portable.roleB?.dryRun?.slideCount === 25 && portable.roleB?.dryRun?.objectCount === 871,
	g1NoFinalSave: portable.externalBoundaries?.some(value => /preview\/save is not invoked/i.test(value)) === true && html.execution?.commitSkipped === true,
	archiveDurable: archive.status === 'PASS' && archive.checks?.archiveDurable === true && archive.checks?.archiveContentAddressed === true,
}
const report = { schemaVersion:'betterpptx.g0-g1-baseline-promotion-proof.v1', status:Object.values(checks).every(Boolean)?'PASS':'FAIL', generatedAt:new Date().toISOString(), sources:Object.fromEntries(Object.entries(files).map(([key,file])=>[key,{path:path.relative(root,file).replaceAll('\\','/'),sha256:crypto.createHash('sha256').update(fsSync.readFileSync(file)).digest('hex')}])), gates:{G0:Object.values(checks).slice(0,6).every(Boolean)?'PASS':'FAIL',G1:Object.values(checks).slice(6,10).every(Boolean)?'PASS':'FAIL'}, checks, universalFormalClosure:'0/2258', interpretation:'G0/G1 baseline promotion is supported by fresh public HTML and JSON/bundle clients, durable source/archive evidence, lifecycle-schema integrity, catalog synchronization, and black-box checks. Universal formal capability closure remains 0/2258; later G2-G8/G9-G12 work is not implied.' }
const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');const outDir=path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/g0-g1-baseline/${stamp}`);await fs.mkdir(outDir,{recursive:true});const out=path.join(outDir,'g0-g1-baseline-promotion-proof.json');const bytes=Buffer.from(`${JSON.stringify(report,null,2)}\n`);await fs.writeFile(out,bytes);await fs.writeFile(`${out}.sha256`,`${crypto.createHash('sha256').update(bytes).digest('hex')}  ${path.basename(out)}\n`);console.log(JSON.stringify({...report,reportPath:path.relative(root,out).replaceAll('\\','/'),reportSha256:crypto.createHash('sha256').update(bytes).digest('hex')},null,2));if(report.status!=='PASS')process.exitCode=1
