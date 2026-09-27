// Consolidated G3 proof for the canonical HTML-to-native structural port.
// Visual residuals are counted and approved explicitly; no whole-slide raster
// is treated as an acceptable substitute for native authoring.
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const rel = file => path.relative(root, file).replaceAll('\\', '/')
const exists = file => fsSync.existsSync(file)
const sha256 = file => crypto.createHash('sha256').update(fsSync.readFileSync(file)).digest('hex')
const load = async file => JSON.parse(await fs.readFile(file, 'utf8'))
const source = file => file && ({ path: rel(file), sha256: sha256(file) })
const latest = async (dir, suffix) => {
	if (!exists(dir)) return null
	const walk = async current => {
		const found = []
		for (const entry of await fs.readdir(current, { withFileTypes: true })) {
			const full = path.join(current, entry.name)
			if (entry.isDirectory()) found.push(...await walk(full))
			else if (entry.isFile() && entry.name.endsWith(suffix)) found.push(full)
		}
		return found
	}
	return (await walk(dir)).sort().at(-1) || null
}

const htmlProof = await latest(path.resolve('outputs/authoring-principle-corpus/global-extended-option-five-point/html-canonical-public'), 'canonical-html-public-proof.json')
const fallbackProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-html-raster-fallback-inventory'), 'canonical-raster-fallback-inventory-proof.json')
const descriptorProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'descriptor-compare.json')
const packageProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-native-package-proof.json')
const packageAudit = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-package-integrity-proof.json')
const officeProof = await latest(path.resolve('outputs/authoring-principle-corpus/finalized-jsonspec-archive/canonical-25-slide-native-package'), 'canonical-25-office-com-proof.json')
if (![htmlProof, fallbackProof, descriptorProof, packageProof, packageAudit, officeProof].every(Boolean)) throw new Error('Missing immutable G3 evidence')
const [html, fallback, descriptor, nativePackage, audit, office] = await Promise.all([htmlProof, fallbackProof, descriptorProof, packageProof, packageAudit, officeProof].map(load))
const manifest = html.upload?.htmlLoweringManifest || {}
const htmlChecks = html.checks || {}
const fallbackChecks = fallback.checks || {}
const descriptorChecks = descriptor.checks || {}
const packageChecks = nativePackage.checks || {}
const checks = {
	freshPublicHtmlClient: html.status === 'PASS' && htmlChecks.freshPublicSession === true && htmlChecks.servedDiscovery === true,
	htmlSourceUploadedAndInspected: htmlChecks.htmlUpload === true && htmlChecks.htmlInspect === true && htmlChecks.relativeAssetsResolved !== false,
	structuralCountsComplete: html.source?.expectedSlides === 25
		&& html.upload?.inspect?.detectedSlides === 25
		&& manifest.slideCount === 25
		&& manifest.nativeImages === 29
		&& fallback.counts?.nativeSupportEntries === 106
		&& html.execution?.dryRun?.objectCount === 871,
	nativeSemanticLowering: manifest.nativeBackgrounds === 25
		&& manifest.nativeTextBoxes === 467
		&& manifest.nativePresetShapes === 259
		&& manifest.customGeometry === 116
		&& manifest.retainedSvg === 116
		&& manifest.rasterFallbacks === 0,
	motionRetained: html.execution?.dryRun?.mutationFree === true && manifest.cssMotionMapped === 746 && manifest.unmappedCssMotion?.length === 0,
	fallbackInventoryComplete: fallback.status === 'PASS'
		&& fallbackChecks.archivedInventoryPass === true
		&& fallbackChecks.sourceHashMatchesArchived === true
		&& fallbackChecks.countsMatchCanonical === true
		&& fallbackChecks.allResidualsIsolatedAndOwnerApproved === true
		&& fallbackChecks.wholeSlideRasterization === true
		&& fallback.counts?.isolatedResidualEntries === 25
		&& fallback.counts?.approvedResidualEntries === 25
		&& fallback.counts?.wholeSlideRasters === 0,
	htmlNativeDescriptorParity: descriptor.status === 'PASS'
		&& Object.values(descriptorChecks).every(Boolean)
		&& descriptor.realCountMismatches?.length === 0,
	nativePackageReadback: nativePackage.status === 'PASS'
		&& packageChecks.sourceIs25Slides === true
		&& packageChecks.reopened === true
		&& packageChecks.readbackSlides === true
		&& packageChecks.readbackObjectsAtLeastSource === true,
	packageIntegrity: audit.status === 'PASS' && audit.errors?.length === 0 && audit.warnings?.length === 0 && audit.externalTargets?.length === 0,
	officeRepairFreeRoundtrip: office.status === 'PASS' && office.slideCount === 25 && office.verifyCount === 25,
	noPrivateLeakage: htmlChecks.noPrivateImplementationLeakage === true,
}
const report = {
	schemaVersion: 'betterpptx.g3-canonical-html-native-structural-port-proof.v1',
	status: Object.values(checks).every(Boolean) ? 'PASS' : 'FAIL',
	generatedAt: new Date().toISOString(),
	gate: 'G3',
	checks,
	structuralCounts: {
		slides: 25,
		semanticObjects: 871,
		nativeImages: 29,
		nativeSupportLayers: 106,
		mappedMotion: 746,
		customGeometry: manifest.customGeometry,
		retainedSvg: manifest.retainedSvg,
		wholeSlideRasters: fallback.counts?.wholeSlideRasters,
		approvedIsolatedResiduals: fallback.counts?.approvedResidualEntries,
	},
	evidence: {
		htmlPublic: { ...source(htmlProof), status: html.status },
		fallbackInventory: { ...source(fallbackProof), status: fallback.status },
		descriptorCompare: { ...source(descriptorProof), status: descriptor.status },
		nativePackage: { ...source(packageProof), status: nativePackage.status, readback: nativePackage.readback, package: nativePackage.package },
		packageAudit: { ...source(packageAudit), status: audit.status, counts: audit.counts },
		officeRoundtrip: { ...source(officeProof), status: office.status, slideCount: office.slideCount, verifyCount: office.verifyCount },
	},
	universalFormalClosure: '0/2258',
	interpretation: 'G3 certifies the canonical HTML entry as a structurally complete native port: all 25 slides, 29 images, 106 native support layers, 871 semantic objects, and 746 mapped motion items are retained; the only approved residual is one isolated feTurbulence remainder per slide, with zero whole-slide rasterization. Native/package/Office evidence is included. Universal formal closure remains 0/2258.',
}
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
const outDir = path.resolve(`outputs/authoring-principle-corpus/finalized-jsonspec-archive/g3-canonical-html-native-structural-port/${stamp}`)
await fs.mkdir(outDir, { recursive: true })
const out = path.join(outDir, 'g3-canonical-html-native-structural-port-proof.json')
const bytes = Buffer.from(`${JSON.stringify(report, null, 2)}\n`)
await fs.writeFile(out, bytes)
const digest = crypto.createHash('sha256').update(bytes).digest('hex')
await fs.writeFile(`${out}.sha256`, `${digest}  ${path.basename(out)}\n`)
console.log(JSON.stringify({ ...report, reportPath: rel(out), reportSha256: digest }, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
