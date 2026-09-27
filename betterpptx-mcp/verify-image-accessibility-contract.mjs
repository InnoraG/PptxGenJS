// IMG9 accessibility/editability contract. Pure and offline; no provider or image bytes.
import assert from 'node:assert/strict'
import { buildImageAccessibilityMetadata, validateImageAccessibilityPlan } from './quality/image-accessibility.mjs'

let pass = 0
let fail = 0
const ok = (name, condition) => { if (condition) { pass += 1; console.log(`  ok   ${name}`) } else { fail += 1; console.error(`  FAIL ${name}`) } }
const plan = { id: 'abc123', concept: 'a controlled operating system', purpose: 'conceptual hero', context: { slideRole: 'executive opening visual' } }
const metadata = buildImageAccessibilityMetadata(plan)
const result = validateImageAccessibilityPlan({ ...plan, accessibility: metadata })
ok('metadata has meaningful alt text', metadata.altText.length >= 12 && metadata.altText.includes('controlled operating system'))
ok('object name is stable and machine-targetable', metadata.objectName === 'generated-visual-abc123')
ok('reading order is explicit', metadata.readingOrder === 'after-slide-title-before-supporting-copy')
ok('editable native fallback is declared', metadata.editableFallback === 'native-image-wrapper')
ok('PPTX-only output is declared', metadata.pptxOnly === true)
ok('valid plan passes', result.status === 'pass' && Object.values(result.checks).every(Boolean))
const missingAlt = validateImageAccessibilityPlan({ ...plan, accessibility: { ...metadata, altText: '' } })
ok('missing alt text fails closed', missingAlt.status === 'fail' && missingAlt.checks.altText === false)
const badName = validateImageAccessibilityPlan({ ...plan, accessibility: { ...metadata, objectName: 'image 1' } })
ok('unstable object names fail closed', badName.status === 'fail' && badName.checks.stableObjectName === false)
const rawLeak = validateImageAccessibilityPlan({ ...plan, accessibility: { ...metadata, altText: 'Modal provider path C:\\tmp\\secret' } })
ok('implementation details fail black-box check', rawLeak.status === 'fail' && rawLeak.checks.blackBoxMetadata === false)
ok('metadata is deterministic', JSON.stringify(buildImageAccessibilityMetadata(plan)) === JSON.stringify(buildImageAccessibilityMetadata(plan)))
assert.equal(fail, 0)
console.log(`\n${fail ? 'FAILED' : 'PASSED'}: ${pass} passed, ${fail} failed`)
