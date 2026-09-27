import assert from 'node:assert/strict'
import test from 'node:test'
import { lowerHtmlAuthoringSurface, lowerHtmlSlide } from '../ir/html-slide-compiler.mjs'
import { fallbackPolicyApproves, htmlUnsupportedRepresentationFindings } from '../ir/html-representation.mjs'
import { htmlCssMotionUnmappedFindings } from '../ir/html-css-motion.mjs'
import { planDeckLayout, validateLayoutPlan } from '../ir/layout-engine.mjs'
import { buildSpecOperationPlan } from '../ir/spec-compiler.mjs'

const payHtml = `
<section class="slide" data-world="mono" data-layout="comparison" data-mode="light" id="checkout" style="background:#ffffff">
  <h1 data-kind="title">The button was the product.</h1>
  <article data-kind="textShape" data-name="now-amount" data-region="left" style="background:#f5f5f7;color:#0a0a0a;font-family:'Segoe UI Light'">NOW $48.00</article>
  <button data-kind="textShape" data-name="now-pay" data-region="left" class="pill" style="left:40px;width:320px;background:#0071e3;color:#ffffff;border-radius:999px">Pay</button>
  <article data-kind="textShape" data-name="next-amount" data-region="right" style="background:#ffffff;color:#0a0a0a">NEXT $48.00</article>
  <button data-kind="textShape" data-name="next-pay" data-region="right" style="color:#0071e3;background:#ffffff">Pay</button>
</section>
`

test('HTML Pay pill lowers to a filled native textShape, ignoring CSS geometry', () => {
	const slide = lowerHtmlSlide(payHtml)
	const pill = slide.content.find(block => block.name === 'now-pay')
	assert.equal(pill.kind, 'textShape')
	assert.equal(pill.text, 'Pay')
	assert.equal(pill.style.fill.color, '0071E3')
	assert.equal(pill.style.color, 'FFFFFF')
	assert.equal(pill.region, 'left')
	assert.equal(slide.background, 'FFFFFF')
	assert.ok(!Object.prototype.hasOwnProperty.call(pill, 'x'))
	assert.ok(!Object.prototype.hasOwnProperty.call(pill, 'bbox'))
})

test('grid-column h1 lowers to left-region type, not the PowerPoint title band', () => {
	const slide = lowerHtmlSlide(`
<section class="slide" data-world="mono" data-layout="comparison" data-mode="light" style="background:#ffffff">
  <div class="grid2">
    <h1 data-kind="title" style="font-family:'Segoe UI Light';color:#0a0a0a">The button was the product.</h1>
    <button data-kind="textShape" data-name="now-pay" class="pill" style="background:#0071e3;color:#ffffff;border-radius:999px">Pay</button>
  </div>
</section>
`)
	const headline = slide.content.find(block => /button was the product/.test(block.text || ''))
	assert.equal(headline.kind, 'textBox')
	assert.equal(headline.region, 'left')
	assert.equal(headline.style.fontFace, 'Segoe UI Light')
	assert.ok(headline.style.fontSize >= 24)
	assert.ok(!slide.content.some(block => block.kind === 'title'))
	const pay = slide.content.find(block => block.name === 'now-pay')
	assert.equal(pay.region, 'right')
})

test('SVG diagram lowers to customGeometry without CSS geometry', () => {
	const slide = lowerHtmlSlide(`
<section class="slide blue" data-world="blueprint" data-layout="two-column" data-mode="dark" style="background:#070b12">
  <div class="grid2">
    <svg data-kind="customGeometry" data-name="lock" viewBox="0 0 640 360" aria-label="Lock chamber">
      <rect x="118" y="64" width="404" height="236" stroke="#38bdf8"/>
      <path d="M160 300v40" stroke="#38bdf8"/>
    </svg>
    <p data-kind="equation" data-name="hydrostatic" data-math="P = ρ g h">P = ρ g h</p>
  </div>
</section>
`)
	const diagram = slide.content.find(block => block.name === 'lock')
	assert.equal(diagram.kind, 'customGeometry')
	assert.equal(diagram.region, 'left')
	assert.match(diagram.svg, /viewBox="0 0 640 360"/)
	assert.match(diagram.svg, /M160 300v40/)
	assert.ok(!Object.prototype.hasOwnProperty.call(diagram, 'x'))
	assert.ok(!Object.prototype.hasOwnProperty.call(diagram, 'bbox'))
	assert.equal(slide.content.find(block => block.name === 'hydrostatic').region, 'right')
})

test('column headline collapses the unused title band', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'HTML column title',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: 'mono', mode: 'light' },
		html: `<html><body>
<section class="slide" data-world="mono" data-layout="comparison" data-mode="light" style="background:#ffffff">
  <div class="grid2">
    <h1 data-kind="title">The button was the product.</h1>
    <button data-kind="textShape" data-name="now-pay" class="pill" style="background:#0071e3;color:#ffffff">Pay</button>
  </div>
</section>
</body></html>`,
	})
	const layout = planDeckLayout(spec)
	assert.equal(spec.slides[0].content.find(block => /button was the product/.test(block.text || '')).kind, 'textBox')
	assert.ok(layout.slides[0].regions.body.y < 1.0, `body.y=${layout.slides[0].regions.body.y} should start above the old title band`)
	const plan = buildSpecOperationPlan(spec, { dryRun: true })
	assert.ok((plan.operations || []).some(item => String(item.args?.options?.objectName || '').includes('now-pay')))
})

test('deck html lowers before compile and keeps the Pay fill executable', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'HTML surface',
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: 'mono', mode: 'light' },
		html: `<html><body>${payHtml}</body></html>`,
	})
	assert.equal(spec.slides.length, 1)
	assert.equal(spec.slides[0].layoutIntent, 'comparison')
	assert.ok(!spec.html)
	const plan = buildSpecOperationPlan({
		...spec,
		authoringContract: { workflow: 'authoring-excellence-director-v1' },
		styleIntent: { artDirection: 'mono', mode: 'light' },
		slides: spec.slides,
	}, { dryRun: true })
	const pay = (plan.operations || []).find(item => String(item.args?.options?.objectName || '').includes('now-pay'))
	assert.ok(pay)
	const fill = pay.args?.options?.fill
	const fillColor = typeof fill === 'string' ? fill : fill?.color
	assert.equal(String(fillColor || '').replace('#', '').toUpperCase(), '0071E3')
})

const canvasHtml = `
<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1" data-duration="4000" data-transition="fade" data-title="Canvas">
  <div class="slide-canvas">
    <svg class="layer native-background" data-kind="native-background" viewBox="0 0 1600 900" style="left:0;top:0;width:1600px;height:900px"><rect width="1600" height="900" fill="#111020"/><defs><linearGradient id="nbg"><stop offset="0" stop-color="#111020"/></linearGradient></defs></svg>
    <img class="layer picture content-image" src="images/hero.png" alt="Hero" style="left:80px;top:60px;width:400px;height:300px"/>
    <div class="layer text-shape" data-text="Hello stage" style="left:120px;top:80px;width:600px;height:80px"><span style="color:#67e8f9;font-size:48px;font-family:Inter">Hello stage</span></div>
    <div class="layer text-shape" data-name="pay" data-text="Pay" style="left:800px;top:80px;width:160px;height:48px;background:#0071e3;color:#ffffff;border-radius:999px">Pay</div>
    <svg class="layer vector-shape" data-name="orb" style="left:40px;top:400px;width:80px;height:80px" viewBox="0 0 80 80"><circle cx="40" cy="40" r="36" fill="#67e8f9"/></svg>
    <svg class="layer vector-line" style="left:10px;top:10px;width:100px;height:20px" viewBox="0 0 100 20"><line x1="0" y1="10" x2="100" y2="10" stroke="#67e8f9"/></svg>
  </div>
</section>
`

test('canvas .layer HTML is engine-lowered to inches, not author JSON coordinates', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Canvas original',
		html: canvasHtml,
		htmlAssetMap: { 'images/hero.png': 'asset://locked/uploaded-image/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png' },
	})
	assert.equal(spec.slides.length, 1)
	assert.equal(spec.slides[0].htmlCanvas, true)
	assert.equal(spec.authoringContract.htmlStagePolicy, 'preserve-canvas-geometry')
	assert.ok(!spec.html)
	const picture = spec.slides[0].content.find(block => block.kind === 'image')
	assert.equal(picture._engineOwnedGeometry, true)
	assert.equal(picture.noFrame, true)
	assert.deepEqual(picture._engineRect, { x: 0.6667, y: 0.5, w: 3.3333, h: 2.5 })
	assert.ok(!Object.prototype.hasOwnProperty.call(picture, 'x'))
	assert.ok(!Object.prototype.hasOwnProperty.call(picture, 'bbox'))
	const text = spec.slides[0].content.find(block => block.kind === 'textBox')
	assert.equal(text.text, 'Hello stage')
	assert.equal(text._engineOwnedGeometry, true)
	assert.equal(spec.slides[0].background, '111020')
	assert.ok(!spec.slides[0].content.some(block => block.kind === 'customGeometry' && block.name === 'native-background'))
	const pill = spec.slides[0].content.find(block => block.name === 'pay')
	assert.equal(pill.kind, 'textShape')
	assert.equal(pill.style.fill.color, '0071E3')
	const orb = spec.slides[0].content.find(block => block.name === 'orb')
	assert.equal(orb.kind, 'shape')
	assert.equal(orb.shapeName, 'ellipse')
	const hairline = spec.slides[0].content.find(block => block.shapeName === 'line')
	assert.equal(hairline.kind, 'shape')
	const layout = planDeckLayout(spec)
	const placed = layout.slides[0].objects.find(obj => obj.blockName === picture.name || obj.objectName?.includes(picture.name))
	assert.ok(placed)
	assert.equal(placed.placementSource, 'engine')
	assert.ok(Math.abs(placed.rect.x - picture._engineRect.x) < 0.002)
	assert.ok(Math.abs(placed.rect.y - picture._engineRect.y) < 0.002)
	assert.ok(Math.abs(placed.rect.w - picture._engineRect.w) < 0.002)
	assert.ok(Math.abs(placed.rect.h - picture._engineRect.h) < 0.002)
	const validation = validateLayoutPlan(layout)
	assert.ok(!validation.issues.some(issue => issue.code === 'OBJECT_OVERLAP' && issue.severity === 'error'))
})

test('plain HTML img and native-effect photos never become customGeometry', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Raster original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1" data-duration="4000" data-transition="fade">
  <div class="slide-canvas">
    <img class="layer" src="images/hero.png" alt="Hero" style="left:80px;top:60px;width:400px;height:300px"/>
    <img class="layer native-effect" src="images/glow.png" alt="Glow" style="left:0;top:0;width:1600px;height:900px"/>
    <div class="layer" data-name="nested" style="left:500px;top:60px;width:200px;height:120px"><img src="images/card.png" alt="Card"/></div>
    <svg class="layer" data-name="raster-svg" style="left:10px;top:400px;width:80px;height:80px" viewBox="0 0 80 80"><image href="images/icon.png" width="80" height="80"/></svg>
  </div>
</section>`,
		htmlAssetMap: {
			'images/hero.png': 'asset://locked/uploaded-image/hero.png',
			'images/glow.png': 'asset://locked/uploaded-image/glow.png',
			'images/card.png': 'asset://locked/uploaded-image/card.png',
			'images/icon.png': 'asset://locked/uploaded-image/icon.png',
		},
	})
	const kinds = spec.slides[0].content.map(block => `${block.name}:${block.kind}`)
	assert.ok(spec.slides[0].content.every(block => block.kind !== 'customGeometry'), kinds.join(','))
	assert.equal(spec.slides[0].content.filter(block => block.kind === 'image').length, 4)
	const glow = spec.slides[0].content.find(block => /glow/i.test(block.altText || '') || block.rasterFallback)
	assert.equal(glow.kind, 'image')
	assert.equal(glow.rasterFallback, true)
})

test('anim-rise and CSS delay lower into PowerPoint entrance animation', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Motion original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}
.anim-rise{animation:rise 700ms ease 120ms both}
</style>
<section class="slide" id="slide-1" data-duration="5000" data-transition="fade">
  <div class="slide-canvas">
    <div class="layer text-shape anim-rise" data-text="Headline" style="left:120px;top:80px;width:600px;height:80px;animation-delay:120ms;animation-duration:700ms"><span>Headline</span></div>
    <div class="layer text-shape anim-fade" data-text="Body" style="left:120px;top:200px;width:600px;height:40px"><span>Body</span></div>
  </div>
</section>`,
	})
	const headline = spec.slides[0].content.find(block => block.text === 'Headline')
	const body = spec.slides[0].content.find(block => block.text === 'Body')
	assert.equal(headline.animation.effect, 'float')
	assert.equal(headline.animation.direction, 'fromBottom')
	assert.equal(headline.animation.delay, 120)
	assert.equal(headline.animation.duration, 700)
	assert.equal(headline.animation.trigger, 'withPrevious')
	assert.equal(body.animation.effect, 'fade')
	assert.equal(spec.slides[0].transition.advanceAfterTime, 5000)
	assert.equal(spec.slides[0].timeline.cues.length, 2)
	assert.equal(spec.validation.readabilityPolicy, 'faithful-html')
})

test('generic CSS tokens, exact PowerPoint names, keyframes, and unmapped CSS lower globally', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Global motion original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}
@keyframes heroReveal { from { opacity: 0; transform: translateY(48px); } to { opacity: 1; transform: translateY(0); } }
@keyframes unusedCustom { from { filter: blur(12px); } to { filter: blur(0); } }
.fade-in { animation: fade 400ms ease both }
.slide-up { animation: slide-up 500ms ease both }
</style>
<section class="slide" id="slide-1">
  <div class="slide-canvas">
    <div class="layer text-shape fade-in" data-text="Fade" style="left:40px;top:40px;width:200px;height:40px"><span>Fade</span></div>
    <div class="layer text-shape slide-up" data-text="Rise" style="left:40px;top:100px;width:200px;height:40px"><span>Rise</span></div>
    <div class="layer text-shape" data-text="Wipe" style="left:40px;top:160px;width:200px;height:40px;animation-name:wipe;animation-duration:600ms"><span>Wipe</span></div>
    <div class="layer text-shape" data-text="Key" style="left:40px;top:220px;width:200px;height:40px;animation-name:heroReveal;animation-duration:700ms"><span>Key</span></div>
    <div class="layer text-shape" data-text="Blur" style="left:40px;top:280px;width:200px;height:40px;animation-name:unusedCustom;animation-duration:500ms"><span>Blur</span></div>
  </div>
</section>`,
	})
	const fade = spec.slides[0].content.find(block => block.text === 'Fade')
	const rise = spec.slides[0].content.find(block => block.text === 'Rise')
	const wipe = spec.slides[0].content.find(block => block.text === 'Wipe')
	const key = spec.slides[0].content.find(block => block.text === 'Key')
	const blur = spec.slides[0].content.find(block => block.text === 'Blur')
	assert.equal(fade.animation.effect, 'fade')
	assert.equal(rise.animation.effect, 'float')
	assert.equal(rise.animation.direction, 'fromBottom')
	assert.equal(wipe.animation.effect, 'wipe')
	assert.equal(key.animation.effect, 'float')
	assert.equal(key.animation.direction, 'fromBottom')
	assert.equal(blur?.animation, undefined)
	assert.equal(spec.slides[0].htmlUnmappedCssMotion[0].cssName, 'unusedCustom')
	const findings = htmlCssMotionUnmappedFindings(spec)
	assert.equal(findings[0].code, 'HTML_CSS_MOTION_UNMAPPED')
	assert.match(findings[0].fix, /native effect/)
})

test('CSS-only native-effect layers are ledgered, not silently dropped', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Atmosphere original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1">
  <div class="slide-canvas">
    <div class="layer text-shape" data-name="hero" data-text="Hero" style="left:80px;top:80px;width:400px;height:80px"><span>Hero</span></div>
    <div class="layer native-effect" data-kind="native-effect" data-name="glow-layer" data-owner="hero" style="left:40px;top:40px;width:480px;height:160px;filter:blur(18px);mix-blend-mode:multiply"></div>
  </div>
</section>`,
	})
	assert.ok(!spec.slides[0].content.some(block => block.name === 'glow-layer'))
	const ledger = spec.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'glow-layer')
	assert.ok(ledger)
	assert.equal(ledger.needsIsolatedRaster, false)
	assert.equal(ledger.wholeSlideRasterized, false)
	assert.equal(ledger.effectOwnerId, 'hero')
	assert.equal(ledger.inheritsAnimation, true)
	assert.ok(ledger.nativeComponents.includes('native-blur'))
	assert.ok(ledger.nativeBlur)
	assert.ok(ledger.nativeFillOverlay)
	assert.equal(spec.slides[0].content.find(block => block.name === 'hero').style.blur.radiusPt > 0, true)
})

test('drop-shadow native-effect maps onto the owner object', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Shadow original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1">
  <div class="slide-canvas">
    <div class="layer text-shape" data-name="hero" data-text="Hero" style="left:80px;top:80px;width:400px;height:80px"><span>Hero</span></div>
    <div class="layer native-effect" data-kind="native-effect" data-name="shadow-layer" data-owner="hero" style="left:40px;top:40px;width:480px;height:160px;filter:drop-shadow(0 12px 24px rgba(0,0,0,0.45))"></div>
  </div>
</section>`,
	})
	const hero = spec.slides[0].content.find(block => block.name === 'hero')
	assert.equal(hero.style.shadow.type, 'outer')
	assert.equal(hero.style.shadow.color, '000000')
	const ledger = spec.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'shadow-layer')
	assert.ok(ledger.nativeComponents.includes('shadow-or-glow'))
	assert.equal(ledger.needsIsolatedRaster, false)
})

test('filter SVG with lines extracts vectors and still ledgers turbulence', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Grid original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1">
  <div class="slide-canvas">
    <svg class="layer native-background" data-kind="native-background" data-name="grid" style="left:0;top:0;width:1600px;height:900px" viewBox="0 0 1600 900">
      <defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.65"/></filter></defs>
      <rect width="1600" height="900" fill="#0B1020" filter="url(#grain)"/>
      <line x1="0" y1="80" x2="1600" y2="80" stroke="#67E8F9"/>
    </svg>
  </div>
</section>`,
	})
	assert.equal(spec.slides[0].background, '0B1020')
	assert.ok(spec.slides[0].content.some(block => block.kind === 'customGeometry'))
	const ledger = spec.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'grid')
	assert.ok(ledger.nativeComponents.includes('vector-grid-or-shapes'))
	assert.ok(ledger.fallbackComponents.includes('feTurbulence'))
})

test('filter SVG backgrounds extract native fill and do not dump the filter graph as customGeometry', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Filter original',
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1">
  <div class="slide-canvas">
    <svg class="layer native-background" data-kind="native-background" data-name="atmosphere" style="left:0;top:0;width:1600px;height:900px" viewBox="0 0 1600 900">
      <defs><filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.65"/></filter></defs>
      <rect width="1600" height="900" fill="#0B1020" filter="url(#grain)"/>
    </svg>
    <div class="layer text-shape" data-text="Copy" style="left:80px;top:80px;width:400px;height:80px"><span>Copy</span></div>
  </div>
</section>`,
	})
	assert.equal(spec.slides[0].background, '0B1020')
	assert.ok(!spec.slides[0].content.some(block => block.kind === 'customGeometry'))
	const ledger = spec.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'atmosphere')
	assert.ok(ledger.nativeComponents.includes('gradient-or-solid-fill'))
	assert.ok(ledger.fallbackComponents.includes('feTurbulence'))
	assert.equal(ledger.needsIsolatedRaster, true)
})

test('explicit fallbackPolicy approves only the named residual effect', () => {
	const html = `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1" data-duration="4000" data-transition="fade"><div class="slide-canvas">
  <svg class="layer native-background" data-kind="native-background" data-name="grain" style="left:0;top:0;width:1600px;height:900px" viewBox="0 0 1600 900">
    <defs><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65"/></filter></defs>
    <rect width="1600" height="900" fill="#0B1020" filter="url(#noise)"/>
  </svg>
</div></section>`
	const unapproved = lowerHtmlAuthoringSurface({ schemaVersion: 'betterpptx.deck-spec.v1', html })
	const pending = unapproved.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'grain')
	assert.equal(pending.aiApprovedDowngrade, false)
	const approved = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		fallbackPolicy: {
			unsupportedAtmosphere: {
				feTurbulence: {
					decision: 'approve-minimal-isolated-raster',
					rationale: 'No native procedural-noise primitive; preserve the native base and isolate only the residual.',
				},
			},
		},
		html,
	})
	const accepted = approved.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'grain')
	assert.equal(accepted.aiApprovedDowngrade, true)
	assert.equal(accepted.needsIsolatedRaster, true)
	assert.equal(accepted.wholeSlideRasterized, false)
})

test('fallback policy is generic, narrow, and informational after approval', () => {
	const policy = {
		unsupportedAtmosphere: {
			feDisplacementMap: { decision: 'approve-minimal-isolated-raster' },
			'backdrop-filter': { action: 'approve-minimal-isolated-raster' },
		},
	}
	assert.equal(fallbackPolicyApproves(policy, 'feDisplacementMap'), true)
	assert.equal(fallbackPolicyApproves(policy, 'backdrop-filter'), true)
	assert.equal(fallbackPolicyApproves(policy, 'feTurbulence'), false)
	assert.equal(fallbackPolicyApproves(policy, 'feDisplacementMap'), true)
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		fallbackPolicy: policy,
		html: `<style>:root{--stage-w:1600px;--stage-h:900px}</style>
<section class="slide" id="slide-1"><div class="slide-canvas">
  <svg class="layer native-background" data-kind="native-background" data-name="warp" style="left:0;top:0;width:1600px;height:900px" viewBox="0 0 1600 900">
    <defs><filter id="warp"><feDisplacementMap in="SourceGraphic" scale="12"/></filter></defs>
    <rect width="1600" height="900" fill="#0B1020" filter="url(#warp)"/>
  </svg>
</div></section>`,
	})
	const ledger = spec.slides[0].htmlFallbacks.find(entry => entry.sourceObjectId === 'warp')
	assert.ok(ledger)
	assert.deepEqual(ledger.fallbackComponents, ['feDisplacementMap'])
	assert.equal(ledger.aiApprovedDowngrade, true)
	const findings = htmlUnsupportedRepresentationFindings(spec)
	assert.equal(findings.length, 1)
	assert.equal(findings[0].code, 'HTML_UNSUPPORTED_EFFECT_APPROVED_FALLBACK')
	assert.equal(findings[0].severity, 'info')
})

test('source CSS font stacks and output variants are source-derived', () => {
	const spec = lowerHtmlAuthoringSurface({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Font original',
		outputVariant: 'silent-timed-notes',
		narration: { preserveInNotes: true, synthesizeAudio: false, useAsTimingAuthority: true },
		html: `<html data-runtime="voice+captions" data-playback-mode="silent">
<style>:root{--stage-w:1600px;--stage-h:900px;font-family:'Example Display','Example Sans','Segoe UI',Arial,sans-serif}</style>
<section class="slide" id="slide-1">
  <div class="slide-canvas">
    <div class="layer text-shape" data-text="Type" style="left:80px;top:80px;width:400px;height:80px"><span>Type</span></div>
  </div>
</section></html>`,
	})
	assert.ok(spec.htmlFontStacks.some(entry => entry.stack[0] === 'Example Display'))
	assert.ok(spec.htmlFontStacks.some(entry => entry.stack.includes('Example Sans')))
	assert.deepEqual(spec.selectedOutputVariants, ['silent-timed-notes'])
	assert.ok(spec.detectedSourceModes.includes('voice+captions'))
	assert.ok(spec.detectedSourceModes.includes('silent'))
	assert.equal(spec.fontPolicy.mode, 'substitute-and-warn')
	assert.equal(spec.morphPolicy.unmatched, 'warn')
})
