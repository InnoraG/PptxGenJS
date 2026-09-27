import test from 'node:test'
import assert from 'node:assert/strict'
import JSZip from 'jszip'
import { validatePackageMetadataLeaksFromZip } from '../quality/package-metadata.mjs'

function packageWithMetadata({
	title = 'Pilot GCP before migrating the estate',
	subject = 'Pilot GCP before migrating the estate',
	creator = 'BetterPPTX',
	lastModifiedBy = 'BetterPPTX',
	customName = 'Review owner',
	customValue = 'Architecture team',
	relationshipTarget = '../slides/slide1.xml',
} = {}) {
	const zip = new JSZip()
	zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <dc:title>${title}</dc:title>
  <dc:subject>${subject}</dc:subject>
  <dc:creator>${creator}</dc:creator>
  <cp:lastModifiedBy>${lastModifiedBy}</cp:lastModifiedBy>
</cp:coreProperties>`)
	zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Microsoft Office PowerPoint</Application>
  <Company>BetterPPTX</Company>
</Properties>`)
	zip.file('docProps/custom.xml', `<?xml version="1.0" encoding="UTF-8"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/custom-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <property fmtid="{D5CDD505-2E9C-101B-9397-08002B2CF9AE}" pid="2" name="${customName}"><vt:lpwstr>${customValue}</vt:lpwstr></property>
</Properties>`)
	zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${relationshipTarget}"/>
</Relationships>`)
	return zip
}

const trustedGcpTitleAndSubject = {
	trustedMetadataValues: [
		{ part: 'docProps/core.xml', field: 'dc:title', value: 'Pilot GCP before migrating the estate', allowedDisclosureCodes: ['CLOUD_INTERNAL_NAME'] },
		{ part: 'docProps/core.xml', field: 'dc:subject', value: 'Pilot GCP before migrating the estate', allowedDisclosureCodes: ['CLOUD_INTERNAL_NAME'] },
	],
}

test('exact trusted authored cloud terms pass without weakening structural metadata checks', async () => {
	const result = await validatePackageMetadataLeaksFromZip(packageWithMetadata(), trustedGcpTitleAndSubject)
	assert.equal(result.ok, true, JSON.stringify(result.issues))
	assert.deepEqual(result.issues, [])
})

test('untrusted or engine-controlled cloud metadata remains blocked with an exact field', async () => {
	const untrusted = await validatePackageMetadataLeaksFromZip(packageWithMetadata())
	assert.equal(untrusted.ok, false)
	assert.deepEqual(
		untrusted.issues.filter(issue => issue.code === 'PUBLIC_METADATA_CLOUD_INTERNAL_NAME').map(issue => issue.field).sort(),
		['dc:subject', 'dc:title'],
	)

	const injectedCreator = await validatePackageMetadataLeaksFromZip(packageWithMetadata({ creator: 'GCP service account' }), trustedGcpTitleAndSubject)
	assert.equal(injectedCreator.ok, false)
	assert.ok(injectedCreator.issues.some(issue => issue.code === 'PUBLIC_METADATA_CLOUD_INTERNAL_NAME' && issue.field === 'dc:creator'))
})

test('trusted author content never suppresses paths, private targets, or custom-property values', async () => {
	const localTitle = 'Pilot GCP from C:\\private\\deck.pptx'
	const localTitleResult = await validatePackageMetadataLeaksFromZip(packageWithMetadata({ title: localTitle }), {
		trustedMetadataValues: [{ part: 'docProps/core.xml', field: 'dc:title', value: localTitle, allowedDisclosureCodes: ['CLOUD_INTERNAL_NAME', 'LOCAL_WINDOWS_PATH'] }],
	})
	assert.equal(localTitleResult.ok, false)
	assert.ok(localTitleResult.issues.some(issue => issue.code === 'PUBLIC_METADATA_LOCAL_WINDOWS_PATH' && issue.field === 'dc:title'))

	const relationshipResult = await validatePackageMetadataLeaksFromZip(packageWithMetadata({
		title: 'Safe title',
		subject: 'Safe subject',
		relationshipTarget: 'C:\\private\\slide1.xml',
	}))
	assert.ok(relationshipResult.issues.some(issue => issue.code === 'PUBLIC_METADATA_LOCAL_WINDOWS_PATH' && issue.scope === 'relationship target' && issue.field === 'Target'))

	const ordinaryCustom = await validatePackageMetadataLeaksFromZip(packageWithMetadata({ title: 'Safe title', subject: 'Safe subject' }))
	assert.equal(ordinaryCustom.ok, true, JSON.stringify(ordinaryCustom.issues))
	const leakingCustom = await validatePackageMetadataLeaksFromZip(packageWithMetadata({
		title: 'Safe title',
		subject: 'Safe subject',
		customValue: 'C:\\private\\artifact.pptx',
	}))
	assert.ok(leakingCustom.issues.some(issue => issue.code === 'PUBLIC_METADATA_LOCAL_WINDOWS_PATH' && issue.field === 'vt:lpwstr'))
})
