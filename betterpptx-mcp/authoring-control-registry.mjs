import { createHash } from 'node:crypto'

import { publicBaselineCatalog } from './public-baseline-catalog.mjs'

export const PUBLIC_CONTROL_REGISTRY_SCHEMA_VERSION = 'betterpptx.authoring-control-registry.v1'
export const PUBLIC_CONTROL_REGISTRY_VERSION = '2026-09-25.1'

const FAMILY_FACTS = Object.freeze({
	'charts': { result: 'Editable native data graphics with truthful emphasis.', carrier: 'native-chart', paths: ['slides[].content[].chartType', 'slides[].content[].data', 'slides[].content[].chartOptions'], suitable: ['comparison', 'trend', 'distribution', 'ranking'], unsuitable: ['unsupported evidence', 'decorative repetition'], accessibility: 'Provide summary, altText, labels, and non-colour emphasis.', cost: 'included-authoring' },
	'tables': { result: 'Editable native tables for exact lookup, plus explicit editable shape-built animated tables when rows or cells need independent timing or presenter contact.', carrier: 'native-table-or-editable-native-composite', paths: ['slides[].content[].rows', 'slides[].content[].tableOptions', 'slides[].content[].header', 'slides[].content[].reveal', 'slides[].content[].appearance', 'slides[].interactions[].target'], suitable: ['exact values', 'dense comparison', 'schedule', 'progressive row explanation', 'presenter interaction with a named row or cell'], unsuitable: ['prose that needs hierarchy rather than lookup', 'claiming an animated composite is one native PowerPoint table'], accessibility: 'Preserve reading order, contrast, headers, stable target names, and a complete static reading.', cost: 'included-authoring' },
	'smartart': { result: 'Editable native relationship, hierarchy, cycle, or process diagram.', carrier: 'native-smartart', paths: ['slides[].content[].layoutId', 'slides[].content[].quickStyleId', 'slides[].content[].colorStyleId', 'slides[].content[].nodes'], suitable: ['relationships with a truthful topology'], unsuitable: ['lists forced into a false process or cycle'], accessibility: 'Provide concise node text, topology summary, and explicit text polarity.', cost: 'included-authoring' },
	'wordart-text3d': { result: 'Editable display typography with controlled transform, material, bevel, light, and depth.', carrier: 'native-text', paths: ['slides[].content[].options.wordArt', 'slides[].content[].options.text3D', 'slides[].content[].options.textGlow', 'slides[].content[].options.reflection'], suitable: ['hero statement', 'section title', 'short dimensional label'], unsuitable: ['body copy', 'dense data', 'several competing headlines'], accessibility: 'Keep literal editable text, strong contrast, and a plain reading order.', cost: 'included-authoring' },
	'shapes-gradients': { result: 'Editable native shape, fill, material, light, border, and effect treatment.', carrier: 'native-shape', paths: ['slides[].content[].style.fill', 'slides[].content[].style.line', 'slides[].content[].style.shadow', 'slides[].content[].style.glow', 'slides[].content[].style.effect3D'], suitable: ['purposeful emphasis', 'structure', 'depth', 'visual metaphor'], unsuitable: ['decoration without a communication role'], accessibility: 'Do not rely on colour, glow, or depth alone to convey meaning.', cost: 'included-authoring' },
	'layouts-themes-masters': { result: 'Coherent native theme, master, layout, and AI-authored exact composition.', carrier: 'native-layout-system', paths: ['authoringContract.geometryAuthority', 'authoringContract.placementPolicy', 'styleIntent', 'theme', 'slides[].layoutIntent', 'slides[].content[].rect'], suitable: ['all decks'], unsuitable: ['omitting exact object geometry'], accessibility: 'Theme and layout must preserve contrast, reading order, and text fit.', cost: 'included-authoring' },
	'media-images-avatar': { result: 'Governed images, video, audio, crop, framing, and consented talking-head media.', carrier: 'native-picture-or-media', paths: ['slides[].content[].source', 'slides[].content[].imageOptions', 'slides[].content[].mediaOptions', 'slides[].narration'], suitable: ['evidence', 'setting', 'demonstration', 'authorized narration'], unsuitable: ['filler imagery', 'unconsented identity media'], accessibility: 'Provide alt text, captions where supported, and a complete static reading.', cost: 'asset-or-provider-dependent' },
	'model3d': { result: 'Native 3D object with explicit view and embedded-motion controls.', carrier: 'native-model3d', paths: ['slides[].content[].modelAsset', 'slides[].content[].scene', 'slides[].content[].motionFraming'], suitable: ['physical mechanism', 'orientation', 'spatial continuity'], unsuitable: ['generic decoration'], accessibility: 'Provide a static explanation and alt text.', cost: 'asset-or-provider-dependent' },
	'equations': { result: 'Editable mathematical notation that supports a claim or derivation.', carrier: 'native-equation', paths: ['slides[].content[].latex', 'slides[].content[].mathml', 'slides[].content[].equation'], suitable: ['formula', 'relationship', 'derivation'], unsuitable: ['decorative mathematics'], accessibility: 'Define unfamiliar symbols and provide a plain-language interpretation.', cost: 'included-authoring' },
	'structural': { result: 'Editable groups, connectors, freeforms, custom geometry, and semantic annotations.', carrier: 'native-structural-object', paths: ['slides[].content[].children', 'slides[].content[].startShapeId', 'slides[].content[].endShapeId', 'slides[].content[].points'], suitable: ['connected relationships', 'custom process', 'precise annotation'], unsuitable: ['unbound lines', 'opaque package payloads'], accessibility: 'Name targets, retain a static reading order, and summarize relationships.', cost: 'included-authoring' },
	'motion-transitions-morph': { result: 'Native object animation, motion paths, repeated targets, transitions, and Morph continuity.', carrier: 'native-timing-tree', paths: ['slides[].content[].animation', 'slides[].timeline', 'slides[].transition', 'motion.sequences', 'slides[].narration.cues'], suitable: ['sequence', 'causality', 'state change', 'attention'], unsuitable: ['movement with no communication role'], accessibility: 'Provide a complete reduced-motion/static reading.', cost: 'included-authoring' },
	'presenter-motion': { result: 'Exact catalog-backed native 3D presenter gestures and continuous performance.', carrier: 'native-3d-presenter', paths: ['motionTime.kineticSelection', 'slides[].presenterMotion', 'slides[].presenterPerformance'], suitable: ['guided narrated explanation'], unsuitable: ['constant decoration', 'talking-head video requests'], accessibility: 'Preserve the complete message without presenter motion.', cost: 'asset-or-provider-dependent' },
	'art-direction': { result: 'Optional coherent visual world or a neutral/custom author-defined system.', carrier: 'theme-and-object-styles', paths: ['styleIntent.artDirection', 'theme'], suitable: ['coherent visual language'], unsuitable: ['treating a preset as aesthetic authority'], accessibility: 'Explicit object and text-run choices take precedence and must preserve contrast.', cost: 'included-authoring' },
	'layout-intents': { result: 'Semantic labels that describe and validate an AI-authored exact composition without delegating placement.', carrier: 'authoring-intent-metadata', paths: ['slides[].layoutIntent', 'slides[].arrange', 'slides[].content[].region', 'slides[].content[].rect'], suitable: ['documenting hierarchy and validating exact composition'], unsuitable: ['requesting automatic object placement'], accessibility: 'Inspect fit, scan order, and occlusion readback while retaining authored rectangles.', cost: 'included-authoring' },
	'foundation': { result: 'Core native authoring, validation, accessibility, and delivery behavior.', carrier: 'deck-or-object', paths: ['slides[]', 'validation'], suitable: ['all decks'], unsuitable: ['private package manipulation'], accessibility: 'Follow the control-specific evidence contract.', cost: 'operation-dependent' },
})

const INTENT_ALIASES = Object.freeze([
	{ id: 'premium-polish', patterns: [/design\s+nicet/i, /\bpremium\b/i, /\bhigh[\s-]*end\b/i, /\bextraordinary\b/i, /showcase/i, /less\s+basic/i], families: ['layouts-themes-masters', 'art-direction', 'shapes-gradients', 'media-images-avatar', 'motion-transitions-morph', 'wordart-text3d', 'charts', 'structural'], lessonIds: ['surface-craft', 'picture-treatment', 'transition-beat', 'layered-motion', 'dimensional-typography', 'chart-emphasis', 'custom-process', 'restrained-flat'] },
	{ id: 'surface-craft', patterns: [/\bgradients?\b/i, /\bshadows?\b/i, /\bvisual\s+(?:design|hierarchy|composition)\b/i, /\b(?:light|depth)\s+treatment\b/i], families: ['layouts-themes-masters', 'shapes-gradients', 'art-direction'], lessonIds: ['surface-craft', 'restrained-flat'] },
	{ id: 'transition-beat', patterns: [/\bslide\s+transitions?\b/i, /\btransition\s+(?:between|from|into)\s+slides?\b/i, /\b(?:story|visual)\s+beats?\b/i, /\banimated\s+reveal\b/i], families: ['motion-transitions-morph', 'layouts-themes-masters'], lessonIds: ['transition-beat', 'layered-motion'] },
	{ id: 'dimensional-headline', patterns: [/dimensional\s+(?:headline|type|typography)/i, /text\s*3d/i, /3d\s+text/i], families: ['wordart-text3d'], lessonIds: ['dimensional-typography'] },
	{ id: 'screenshot-evidence', patterns: [/screenshot.*(?:impressive|readable|polish)/i, /picture\s+treatment/i], families: ['media-images-avatar', 'shapes-gradients', 'structural'], lessonIds: ['picture-treatment'] },
	{ id: 'image-storytelling', patterns: [/\b(?:still\s+)?images?\b/i, /\b(?:product|evidence|editorial)\s+(?:photo|picture|visual)\b/i, /\bvisual\s+evidence\b/i], families: ['media-images-avatar', 'shapes-gradients'], lessonIds: ['picture-treatment'] },
	{ id: 'process-motion', patterns: [/animate\s+(?:a\s+)?process/i, /process.*motion/i, /more\s+than\s+fade/i, /layered[\s-]*motion/i, /purposeful\s+(?:visual\s+)?motion/i, /visual\s+storytelling/i], families: ['motion-transitions-morph', 'structural', 'smartart'], lessonIds: ['layered-motion', 'custom-process'] },
	{ id: 'chart-emphasis', patterns: [/chart.*emphasis/i, /highlight.*(?:bar|point|series)/i], families: ['charts', 'motion-transitions-morph'], lessonIds: ['chart-emphasis'] },
	{ id: 'connected-identity', patterns: [/morph/i, /connected\s+object/i, /same\s+object.*slides/i], families: ['motion-transitions-morph'], lessonIds: ['connected-object-identity'] },
	{ id: 'animated-table', patterns: [/animated[\s-]*table/i, /progressive[\s-]*table/i, /row[\s-]*(?:by[\s-]*row[\s-]*)?reveal/i, /table.*presenter/i, /presenter.*table/i], families: ['tables', 'structural', 'motion-transitions-morph', 'presenter-motion'], lessonIds: ['animated-table-synergy'] },
	{ id: 'editable-typography', patterns: [/\beditable\s+(?:type|typography|text)\b/i, /\btypograph(?:y|ic)\s+authoring\b/i], families: ['wordart-text3d'], lessonIds: ['dimensional-typography', 'restrained-flat'] },
	{ id: 'material-treatment', patterns: [/\bmaterial(?:s|ity)?\b/i, /\blight(?:ing)?\s+(?:and\s+)?material\b/i], families: ['wordart-text3d', 'shapes-gradients'], lessonIds: ['dimensional-typography'] },
	{ id: 'restrained-flat', patterns: [/minimal/i, /restrained/i, /flat\s+design/i, /no\s+effects/i], families: ['art-direction', 'layouts-themes-masters'], lessonIds: ['restrained-flat'] },
	{ id: 'native-shapes', patterns: [/\bnative\s+shapes?\b/i, /\beditable\s+shapes?\b/i], families: ['shapes-gradients', 'structural'], lessonIds: ['custom-process', 'restrained-flat'] },
	{ id: 'narrated-captions', patterns: [/\b(?:webvtt|vtt|captions?|subtitles?)\b/i, /\bnarrat(?:ion|ed|e)\b/i, /\bvoice[\s-]*over\b/i, /\bautoplay\b/i], families: ['media-images-avatar', 'motion-transitions-morph'], lessonIds: [] },
])

const EXCLUSION_PATTERNS = Object.freeze([
	['model3d', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?3d\b/i],
	['identity-media', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?(?:avatar|talking[\s-]*head|identity\s+media)\b/i],
	['motion-transitions-morph', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?(?:animation|motion|transitions?)\b/i],
	['wordart-text3d', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?(?:3d|wordart|text\s*3d|3d\s+text)\b/i],
	['tables', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?tables?\b/i],
	['presenter-motion', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?(?:3d\s+)?presenter(?:s|\s+motion)?\b/i],
	['narration', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?(?:narration|voice[\s-]*over)\b/i],
	['paid-media', /\b(?:no|without|avoid|exclude|do\s+not\s+use)\s+(?:any\s+)?(?:paid|chargeable|generated)\s+(?:assets?|media|images?|video|audio)\b/i],
])

const EXCLUSION_TERMS = Object.freeze([
	['model3d', /\b(?:3d\s+(?:models?|objects?)|models?\s*3d)\b/i],
	['identity-media', /\b(?:avatars?|talking[\s-]*heads?|identity\s+media)\b/i],
	['motion-transitions-morph', /\b(?:animations?|motion|transitions?)\b/i],
	['wordart-text3d', /\b(?:wordart|text\s*3d|3d\s+text)\b/i],
	['tables', /\btables?\b/i],
	['presenter-motion', /\b(?:3d\s+)?presenters?(?:\s+motion)?\b/i],
	['narration', /\b(?:narration|voice[\s-]*over)\b/i],
	['paid-media', /\b(?:paid|chargeable|generated)\s+(?:assets?|media|images?|video|audio)\b/i],
])

const baseSpec = ({ title, slide }) => ({
	schemaVersion: 'betterpptx.deck-spec.v1', title,
	authoringContract: { workflow: 'ai-sovereign-v1', creativeAuthority: 'ai', directorMode: 'off', verificationMode: 'complete', geometryAuthority: 'ai', placementPolicy: 'ai-authored-geometry-v1', coordinateSystem: 'inches' },
	styleIntent: { artDirection: 'editorial', mode: 'dark' },
	validation: { validateBeforeSave: true, requireAccessibility: true },
	slides: [slide],
})

export const PUBLIC_AUTHORING_LESSONS = Object.freeze([
	{
		id: 'surface-craft', family: 'shapes-gradients', aliases: ['gradient and shadow', 'native visual polish', 'visual composition'],
		result: 'An AI-positioned native gradient surface and restrained shadow establish hierarchy without flattening text or relying on a preset card.',
		why: 'A controlled light-to-dark surface separates the principal claim from its evidence; one shadow clarifies layering while exact frames preserve the intended composition.',
		failureModes: ['Making every object a glowing card', 'Low-contrast text on a gradient stop', 'Using a shadow as the only distinction', 'Assuming package validity proves visual polish'],
		editableComponents: ['exact shape frame', 'gradient stops', 'direction and angle', 'line', 'shadow', 'foreground text'],
		adjustableControls: ['content[].rect', 'content[].style.fill.gradientStops', 'content[].style.fill.gradientAngle', 'content[].style.shadow', 'content[].style.line', 'content[].options.color'],
		minimalSpec: baseSpec({ title: 'Surface craft lesson', slide: { id: 'claim', title: 'A clear visual claim', content: [
			{ kind: 'shape', name: 'claim-surface', shapeName: 'roundRect', rect: { x: 0.85, y: 1.25, w: 7.1, h: 4.8 }, style: { fill: { type: 'gradient', gradientDirection: 'linear', gradientAngle: 25, gradientStops: [{ position: 0, color: '17324D' }, { position: 100, color: '315E71' }] }, line: { color: '7DCBC4', width: 1 }, shadow: { type: 'outer', color: '000000', opacity: 0.25, blur: 8, distance: 3 } } },
			{ kind: 'textBox', name: 'claim-text', text: 'One clear decision', rect: { x: 1.35, y: 2.45, w: 6.1, h: 1.2 }, options: { fontSize: 38, bold: true, color: 'FFFFFF' } },
			{ kind: 'textBox', name: 'evidence-text', text: 'The supporting evidence stays readable.', rect: { x: 8.4, y: 2.5, w: 3.9, h: 1.7 }, options: { fontSize: 23, color: 'E5E7EB' } },
		] } }),
		integratedUse: 'Use the gradient and shadow on the principal surface only. A photograph, chart, or process could replace the supporting text; place it with its own authored frame and preserve contrast.',
		expectedReadback: ['AI-authored exact frames', 'native gradient stop positions and colours', 'native shadow parameters', 'editable foreground text', 'contrast and fit findings'],
	},
	{
		id: 'dimensional-typography', family: 'wordart-text3d', aliases: ['dimensional headline', 'text3d', 'premium headline'],
		result: 'A short native headline gains controlled depth, material, and light while its text remains editable.',
		why: 'Use depth to establish one dominant visual moment, such as a product reveal or section opening.',
		failureModes: ['Applying depth to body copy', 'Combining several competing light rigs or reflective surfaces', 'Using low-contrast material against the canvas'],
		editableComponents: ['text', 'font', 'wordArt transform', 'bevel', 'material', 'light rig', 'glow', 'reflection'],
		adjustableControls: ['options.wordArt.transform', 'options.text3D.material', 'options.text3D.bevelTop', 'options.text3D.lightRig', 'options.textGlow', 'options.reflection'],
		minimalSpec: baseSpec({ title: 'Dimensional typography lesson', slide: { id: 'hero', title: 'Product reveal', content: [{ kind: 'textBox', name: 'hero-title', text: 'WERT', rect: { x: 0.9, y: 2.2, w: 11.5, h: 1.5 }, options: { align: 'center', fontSize: 58, bold: true, wordArt: { transform: 'textPlain' }, text3D: { material: 'warmMatte', bevel: { type: 'circle', width: 4, height: 4 }, extrusion: 8, extrusionColor: '6D28D9', lightRig: 'threePt', rotationX: 8, rotationY: -10, perspective: 20 }, textGlow: { size: 8, color: '8B5CF6', opacity: 0.35 } } }] } }),
		integratedUse: 'Pair with one flat supporting statement and one evidence object. Keep all other typography two-dimensional.',
		expectedReadback: ['requested text controls', 'effective native text representation', 'default provenance', 'serialized selection evidence'],
	},
	{
		id: 'picture-treatment', family: 'media-images-avatar', aliases: ['screenshot polish', 'evidence screenshot', 'picture framing'],
		result: 'A screenshot or photograph becomes the primary evidence through deliberate crop, frame, contrast, and native annotations.',
		why: 'Framing directs attention without replacing the source evidence or flattening editable annotations.',
		failureModes: ['Cropping away evidence', 'Excessive glow or perspective', 'Annotations covering the source', 'Using a public gallery image as a substitute for the user screenshot'],
		editableComponents: ['picture frame', 'crop', 'border', 'shadow', 'native callout', 'connector'],
		adjustableControls: ['imageOptions.sizing', 'imageOptions.crop', 'imageOptions.border', 'imageOptions.shadow', 'imageOps.highlightRegion', 'imageOps.dimOutsideRegion'],
		minimalSpec: baseSpec({ title: 'Picture treatment lesson', slide: { id: 'evidence', title: 'Evidence screenshot', content: [{ kind: 'image', name: 'evidence-shot', source: { assetRef: 'asset://image/authorized-user-source' }, rect: { x: 4.7, y: 1.25, w: 8.0, h: 5.5 }, imageOptions: { sizing: 'contain', border: { color: '94A3B8', width: 1 }, shadow: { type: 'outer', color: '000000', opacity: 0.25, blur: 8, distance: 3 } }, altText: 'Authorized evidence screenshot.' }] } }),
		integratedUse: 'Place the evidence at dominant scale with concise explanation in the remaining negative space. Add only the annotation needed to support the claim.',
		expectedReadback: ['authorized asset identity', 'crop/framing controls', 'native picture representation', 'alt text', 'geometry source'],
		requires: ['authorized user asset'],
	},
	{
		id: 'layered-motion', family: 'motion-transitions-morph', aliases: ['more than fade', 'sophisticated animation', 'layer motion'],
		result: 'One named object can enter, travel, emphasize, exit, and re-enter with absolute or relative timing while other tracks run simultaneously.',
		why: 'Layered motion can explain state change, travel, or a hand-off that a single entrance cannot communicate.',
		failureModes: ['Animating every object', 'Mixing clocks', 'Targeting unstable names', 'Using motion when reduced motion was requested'],
		editableComponents: ['object animation', 'slide timeline', 'motion path', 'trigger', 'delay', 'duration', 'narration cue'],
		adjustableControls: ['type', 'effect', 'motionPath', 'trigger', 'startMs', 'delayMs', 'durationMs', 'repeat', 'target'],
		minimalSpec: baseSpec({ title: 'Layered motion lesson', slide: { id: 'journey', title: 'State change', content: [{ kind: 'shape', name: 'signal', shapeName: 'ellipse', rect: { x: 1.2, y: 3.0, w: 0.6, h: 0.6 }, style: { fill: { color: '22C55E' } } }], timeline: [{ objectName: 'signal', type: 'entrance', effect: 'fade', trigger: 'afterPrevious', durationMs: 350 }, { objectName: 'signal', type: 'motion', motionPath: 'arcUp', trigger: 'afterPrevious', durationMs: 1400 }, { objectName: 'signal', type: 'emphasis', effect: 'colorWave', trigger: 'withPrevious', delayMs: 0, durationMs: 1400 }, { objectName: 'signal', type: 'exit', effect: 'fade', trigger: 'afterPrevious', durationMs: 300 }, { objectName: 'signal', type: 'entrance', effect: 'fade', trigger: 'afterPrevious', delayMs: 500, durationMs: 300 }] } }),
		integratedUse: 'Use the repeated target to explain one state transition. Keep unrelated objects static or give them a separate, clearly timed track.',
		expectedReadback: ['stable target resolution', 'timeline order', 'simultaneous tracks', 'effective clock', 'serialized native timing evidence'],
	},
	{
		id: 'transition-beat', family: 'motion-transitions-morph', aliases: ['slide transition storytelling', 'transition and animation', 'story beat'],
		result: 'A deliberate slide transition marks a change of state, then a native object reveal lands the new claim.',
		why: 'The transition signals that the story has moved; the object timing directs attention to the consequence instead of animating unrelated decoration.',
		failureModes: ['Using a different transition on every slide', 'Advancing before the reveal is readable', 'Assuming a transition is an object animation', 'Claiming watched playback from structural validation alone'],
		editableComponents: ['slide transition', 'named object', 'object entrance', 'object emphasis', 'timing'],
		adjustableControls: ['slides[].transition.type', 'slides[].transition.direction', 'slides[].transition.durationMs', 'slides[].timeline[].objectName', 'slides[].timeline[].effect', 'slides[].timeline[].trigger', 'slides[].timeline[].durationMs'],
		minimalSpec: { ...baseSpec({ title: 'Transition beat lesson', slide: { id: 'before', title: 'Before', content: [{ kind: 'textBox', name: 'before-state', text: 'The old state', rect: { x: 1.0, y: 2.6, w: 5.2, h: 1.0 }, options: { fontSize: 38, bold: true, color: 'FFFFFF' } }] } }), slides: [
			{ id: 'before', title: 'Before', content: [{ kind: 'textBox', name: 'before-state', text: 'The old state', rect: { x: 1.0, y: 2.6, w: 5.2, h: 1.0 }, options: { fontSize: 38, bold: true, color: 'FFFFFF' } }] },
			{ id: 'after', title: 'After', transition: { type: 'push', direction: 'left', durationMs: 700, advanceOnClick: true }, content: [{ kind: 'textBox', name: 'new-state', text: 'The new state', rect: { x: 7.0, y: 2.6, w: 5.2, h: 1.0 }, options: { fontSize: 38, bold: true, color: 'FFFFFF' } }], timeline: [{ objectName: 'new-state', type: 'entrance', effect: 'wipe', direction: 'fromLeft', trigger: 'afterPrevious', durationMs: 650 }, { objectName: 'new-state', type: 'emphasis', effect: 'pulse', trigger: 'afterPrevious', durationMs: 450 }] },
		] },
		integratedUse: 'Change the transition only when the narrative state changes. Keep both slides meaningful without motion and verify target, duration, trigger, and serialized transition separately.',
		expectedReadback: ['AI-authored frames', 'native transition type and direction', 'resolved named motion target', 'native entrance and emphasis timing', 'playback unverified until observed'],
	},
	{
		id: 'custom-process', family: 'structural', aliases: ['custom process construction', 'connected process'],
		result: 'Named editable shapes and endpoint-bound connectors form a custom process when SmartArt cannot express the relationship.',
		why: 'A custom construction preserves unusual topology or visual hierarchy without rasterizing the process.',
		failureModes: ['Unbound lines', 'False process order', 'Using top-level rect/options/fontSize/shapeId fields inside group children', 'Using custom shapes when native SmartArt already fits'],
		editableComponents: ['group', 'shape', 'text', 'connector', 'endpoint identity'],
		adjustableControls: ['content[].rect (group frame only)', 'content[].children[].x/y/w/h (group-local inches)', 'content[].children[].style.fontSize/fill/line', 'startShapeId', 'endShapeId', 'connectorType'],
		minimalSpec: baseSpec({ title: 'Custom process lesson', slide: { id: 'process', title: 'Approval loop', content: [{ kind: 'group', name: 'approval-loop', rect: { x: 1.0, y: 2.0, w: 11.3, h: 3.0 }, chOff: { x: 0, y: 0, w: 11.3, h: 3.0 }, chExt: { x: 0, y: 0, w: 11.3, h: 3.0 }, children: [{ kind: 'textShape', objectName: 'review', text: 'Review', x: 0.0, y: 0.7, w: 2.4, h: 1.0, style: { fontSize: 24, color: 'FFFFFF', fill: { color: '184A62' } } }, { kind: 'textShape', objectName: 'approve', text: 'Approve', x: 4.4, y: 0.7, w: 2.4, h: 1.0, style: { fontSize: 24, color: 'FFFFFF', fill: { color: '1E6754' } } }, { kind: 'connector', objectName: 'review-to-approve', x: 2.4, y: 1.2, w: 2.0, h: 0, startShapeId: 1, endShapeId: 2, connectorType: 'straightConnector1' }] }] } }),
		integratedUse: 'Choose this only after checking that no native SmartArt topology expresses the relationship.',
		expectedReadback: ['group-local geometry', 'endpoint binding', 'native structural representation', 'intersection findings without automatic movement'],
	},
	{
		id: 'chart-emphasis', family: 'charts', aliases: ['meaningful chart emphasis', 'highlight one value'],
		result: 'A native chart keeps context muted and highlights the decision-relevant point or series.',
		why: 'Selective emphasis makes the evidence legible without distorting scale or replacing exact values.',
		failureModes: ['Highlighting every series', 'Using colour as the only cue', 'Hiding uncertainty or axis meaning'],
		editableComponents: ['series', 'data labels', 'colour', 'axis', 'legend', 'animation target'],
		adjustableControls: ['chartOptions.chartColors', 'chartOptions.showValue', 'chartOptions.showLegend', 'chartOptions.dataLabelPosition'],
		minimalSpec: baseSpec({ title: 'Chart emphasis lesson', slide: { id: 'evidence', title: 'Adoption increased', content: [{ kind: 'chart-panel', name: 'adoption', chartType: 'bar', rect: { x: 1.0, y: 1.5, w: 11.2, h: 4.8 }, data: [{ name: 'Adoption', labels: ['Q1', 'Q2', 'Q3', 'Q4'], values: [32, 44, 51, 74] }], chartOptions: { chartColors: ['64748B', '64748B', '64748B', '22C55E'], showValue: true, showLegend: false }, verified: true, evidenceSource: 'Synthetic teaching fixture; not empirical evidence.', summary: 'Illustrative adoption rises from 32 to 74.', altText: 'Illustrative bar chart with Q4 highlighted at 74.' }] } }),
		integratedUse: 'Pair the chart with one supported takeaway. Keep the axis and exact values available.',
		expectedReadback: ['native chart representation', 'effective series treatment', 'evidence metadata', 'accessibility summary'],
	},
	{
		id: 'connected-object-identity', family: 'motion-transitions-morph', aliases: ['morph identity', 'object continuity'],
		result: 'The same stable object name across adjacent slides creates native Morph continuity.',
		why: 'Identity continuity can explain transformation, progression, or focus change across slides.',
		failureModes: ['Reusing a name for unrelated objects', 'Changing carrier type unexpectedly', 'Assuming Morph proves visual quality'],
		editableComponents: ['object names', 'geometry', 'style', 'slide transition'],
		adjustableControls: ['content[].name', 'content[].rect', 'slides[].transition.type', 'slides[].transition.option'],
		minimalSpec: { ...baseSpec({ title: 'Connected identity lesson', slide: { id: 'before', title: 'Before', content: [{ kind: 'textBox', name: 'product-name', text: 'WERT', rect: { x: 1.0, y: 2.5, w: 4.0, h: 1.0 } }] } }), slides: [{ id: 'before', title: 'Before', content: [{ kind: 'textBox', name: 'product-name', text: 'WERT', rect: { x: 1.0, y: 2.5, w: 4.0, h: 1.0 } }] }, { id: 'after', title: 'After', transition: { type: 'morph', option: 'byObject' }, content: [{ kind: 'textBox', name: 'product-name', text: 'WERT', rect: { x: 7.8, y: 0.8, w: 4.0, h: 1.0 } }] }] },
		integratedUse: 'Preserve semantic identity while changing position, scale, or treatment to explain a genuine transition.',
		expectedReadback: ['matched object identity', 'Morph transition', 'authored geometry source', 'serialized transition evidence'],
	},
	{
		id: 'animated-table-synergy', family: 'tables', aliases: ['animated table', 'progressive table', 'row reveal table', 'presenter table'],
		result: 'An editable shape-built table reveals by row, column, or cell and exposes stable descendant targets for native timing and Synergy presenter contact.',
		why: 'PowerPoint cannot independently animate cells inside one native table carrier. This explicit composite keeps every row and cell editable while making its structure addressable.',
		failureModes: ['Calling the composite a native PowerPoint table', 'Using merged cells in v1', 'Targeting generated shape IDs instead of stable row or cell names', 'Adding presenter interaction without an empirically qualified presenter timeline', 'Removing the complete static reading for reduced-motion use'],
		editableComponents: ['outer group', 'row groups', 'cell shapes', 'cell text', 'fills', 'borders', 'row/column/cell reveal timeline', 'stable interaction targets'],
		adjustableControls: ['content[].header', 'content[].rows', 'content[].rect', 'content[].appearance', 'content[].reveal.by', 'content[].reveal.order', 'content[].reveal.effect', 'content[].reveal.staggerMs', 'content[].reveal.durationMs', 'slides[].interactions[].target'],
		minimalSpec: baseSpec({ title: 'Animated table lesson', slide: { id: 'scorecard', title: 'Decision scorecard', content: [{ kind: 'animated-table', name: 'decision-table', rect: { x: 1.0, y: 1.55, w: 11.3, h: 4.7 }, header: ['Option', 'Evidence', 'Score'], rows: [['A', 'Stable', '63'], ['B', 'Strong', '81'], ['C', 'Emerging', '72']], appearance: { headerFill: '312E81', rowFill: 'FFFFFF', alternateRowFill: 'EEF2FF', textColor: '111827', borderColor: 'C7D2FE' }, reveal: { by: 'row', order: 'forward', effect: 'fade', trigger: 'withPrevious', startMs: 250, staggerMs: 180, durationMs: 360 }, summary: 'Illustrative scorecard; option B has the highest synthetic score.', altText: 'Illustrative decision scorecard: A 63, B 81, C 72.' }] } }),
		integratedUse: 'The generated stable targets are decision-table.row-1 through decision-table.row-3 and decision-table.row-2.cell-3 style cell names. A compatible Synergy interaction may target one of these names; the compiler derives presenter placement and contact timing from the qualified actor timeline rather than guessed coordinates.',
		expectedReadback: ['requested animated-table kind', 'effective editable-shape-built-animated-table representation', 'generated row and cell target names', 'native reveal timing', 'geometry source', 'Synergy target readiness', 'no silent native-table claim'],
	},
	{
		id: 'restrained-flat', family: 'art-direction', aliases: ['strong flat design', 'minimal executive'],
		result: 'A strong flat composition uses scale, whitespace, typography, and one evidence object without ornamental depth.',
		why: 'Restraint serves briefs that need speed, authority, or quiet clarity.',
		failureModes: ['Confusing restraint with empty cards', 'Using generic centred text', 'Removing the proof object'],
		editableComponents: ['type hierarchy', 'spacing', 'colour', 'one native evidence object'],
		adjustableControls: ['styleIntent.artDirection', 'theme.palette', 'content[].rect or region', 'fontSize', 'fontFace'],
		minimalSpec: baseSpec({ title: 'Restrained flat lesson', slide: { id: 'decision', title: 'Decision basis', content: [{ kind: 'textBox', name: 'claim', text: 'The evidence supports option B', rect: { x: 0.9, y: 1.2, w: 7.2, h: 1.2 }, options: { fontSize: 36, bold: true } }, { kind: 'table-panel', name: 'evidence', rect: { x: 7.9, y: 1.4, w: 4.4, h: 3.8 }, rows: [['Option', 'Score'], ['A', '63'], ['B', '81']], verified: true, evidenceSource: 'Synthetic teaching fixture.', summary: 'Option B has the higher illustrative score.', altText: 'Illustrative comparison table: A 63, B 81.' }] } }),
		integratedUse: 'Use asymmetry, scale, and evidence. Do not add depth merely to signal premium quality.',
		expectedReadback: ['explicit flat art direction', 'native evidence object', 'geometry source', 'contrast and fit findings'],
	},
])

function stable(value) {
	if (Array.isArray(value)) return value.map(stable)
	if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
	return value
}

function normalize(value) {
	return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function interpretCapabilityIntent(intent = '') {
	const text = String(intent || '')
	const coordinatedExclusions = []
	const negatedRanges = []
	const negationScope = /\b(?:no|without|avoid|exclude|do\s+not\s+use)\b[\s\S]*?(?=(?:[.!?;:\n]+|,\s*(?:but|however|except)\b|\b(?:but|however|except)\b|$))/gi
	for (const match of text.matchAll(negationScope)) {
		negatedRanges.push([match.index, match.index + match[0].length])
		for (const [id, pattern] of EXCLUSION_TERMS) if (pattern.test(match[0])) coordinatedExclusions.push(id)
	}
	const clauses = text.split(/(?:[.!?;:\n]+|,\s*(?=(?:but|however|except)\b)|\b(?:but|however|except)\b)/i).map(clause => clause.trim()).filter(Boolean)
	const clauseInterpretation = clauses.map((clause, index) => {
		const exclusions = [...new Set([
			...EXCLUSION_PATTERNS.filter(([, pattern]) => pattern.test(clause)).map(([id]) => id),
			...(/^\s*(?:no|without|avoid|exclude|do\s+not\s+use)\b/i.test(clause)
				? EXCLUSION_TERMS.filter(([, pattern]) => pattern.test(clause)).map(([id]) => id)
				: []),
		])]
		const negative = exclusions.length > 0
		const requested = negative ? [] : INTENT_ALIASES.filter(item => item.patterns.some(pattern => pattern.test(clause))).map(item => item.id)
		return { index, text: clause, requested, excluded: exclusions }
	})
	const positiveText = [...text].map((character, index) => negatedRanges.some(([start, end]) => index >= start && index < end) ? ' ' : character).join('')
	const matchedIds = new Set([
		...clauseInterpretation.flatMap(clause => clause.requested),
		...INTENT_ALIASES.filter(item => item.patterns.some(pattern => pattern.test(positiveText))).map(item => item.id),
	])
	const matches = INTENT_ALIASES.filter(item => matchedIds.has(item.id))
	const excluded = [...new Set([...coordinatedExclusions, ...clauseInterpretation.flatMap(clause => clause.excluded)])]
	const onlyScopes = [...positiveText.matchAll(/(?:^|[.!?;:\n])\s*([^.!?;:\n]*?)\s+only\b/gi)]
		.flatMap(match => INTENT_ALIASES.filter(item => item.patterns.some(pattern => pattern.test(match[1]))).flatMap(item => item.families))
	const matchedFamilies = [...new Set(matches.flatMap(item => item.families).filter(id => !excluded.includes(id)))]
	const families = onlyScopes.length
		? matchedFamilies.filter(id => onlyScopes.includes(id))
		: matchedFamilies
	const lessonIds = [...new Set(matches.flatMap(item => item.lessonIds))].filter(id => {
		const lesson = PUBLIC_AUTHORING_LESSONS.find(item => item.id === id)
		return !lesson || !excluded.includes(lesson.family)
	})
	return {
		schemaVersion: 'betterpptx.capability-intent-interpretation.v1',
		input: text,
		matchedIntents: matches.map(item => item.id),
		relevantFamilies: families,
		lessonIds,
		exclusions: excluded,
		clauses: clauseInterpretation,
		onlyFamilies: [...new Set(onlyScopes)].filter(id => !excluded.includes(id)),
		ambiguity: matches.length > 1 && families.length > 4 ? 'multiple-supported-meanings' : null,
		rule: 'This is transparent factual routing. It does not select a treatment or infer authorization.',
	}
}

function enrich(entry) {
	if (entry.sourceKind === 'observed-motion-review') return {
		id:entry.id,canonicalName:entry.label,aliases:entry.aliases||[],family:entry.family,
		audienceVisibleResult:'Review an observed source motion using measured timing and an explicitly authored description.',
		suitableUses:['Compare review candidates before target preparation.'],unsuitableUses:['Use this catalog ID as an executable motion or prepared asset.'],
		nativeCarrier:null,authoringRoutes:entry.route,jsonPaths:[],
		inputContract:{capabilityMode:entry.capabilityMode,componentOwnership:['sourceReview'],overrideFields:[],resetBehavior:entry.resetBehavior},
		outputContract:{requestedRepresentation:'source-review',plannedRepresentation:null,readback:['measured source timing','authored description basis','explicit unknowns','target preparation gaps']},
		compatibility:{combinations:[],conflicts:[],ordering:'Source facts support review; target compatibility and preparation remain unresolved.'},
		accessibility:'Preserve the complete scene message while reviewing supplemental motion.',costCategory:'review-only',
		readiness:{implemented:false,publiclyAuthorable:false,executableContract:false,callerAvailable:'authorized review only',targetCompatible:'unknown',releaseQualified:false,verifiedInArtifact:false},
		exampleIds:[],verificationEvidence:{registry:'source-review',qualificationRecord:null,artifact:'not-bound',timestamp:null,provenance:'measured-source-review',rule:'Source timing and authored descriptions do not qualify a semantic action or target playback.'},
		selection:entry.selection,sourceReview:entry.sourceReview,measurements:entry.measurements,authoringGuidance:entry.authoringGuidance,selectable:entry.selectable,
		...(entry.requirementFit ? {requirementFit:entry.requirementFit} : {}),
	}
	const facts = FAMILY_FACTS[entry.family] || FAMILY_FACTS.foundation
	return {
		id: entry.id,
		canonicalName: entry.label,
		aliases: entry.aliases || [],
		family: entry.family,
		audienceVisibleResult: facts.result,
		suitableUses: facts.suitable,
		unsuitableUses: facts.unsuitable,
		nativeCarrier: facts.carrier,
		authoringRoutes: entry.route,
		jsonPaths: [...new Set([...(facts.paths || []), entry.selection?.semanticPath].filter(Boolean))],
		inputContract: { capabilityMode: entry.capabilityMode, componentOwnership: entry.componentOwnership || [], overrideFields: entry.overrideFields || [], resetBehavior: entry.resetBehavior || null, ...(entry.parameterContract ? { parameter: entry.parameterContract } : {}) },
		outputContract: { requestedRepresentation: entry.selection?.semanticKind || null, plannedRepresentation: facts.carrier, readback: ['requested controls', 'effective values', 'default provenance', 'geometry source', 'timing source', 'serialized representation'] },
		compatibility: { combinations: entry.componentOwnership || [], conflicts: entry.conflicts || [], ordering: 'preset expansion, then explicit structured overrides, then validation and serialization' },
		accessibility: facts.accessibility,
		costCategory: facts.cost,
		readiness: { implemented: entry.implemented === true, publiclyAuthorable: entry.status === 'implemented', executableContract: entry.capabilityStatus === 'executable-exact-structured', callerAvailable: 'check caller authorization and focused runtime readiness', runtimeHealthy: 'not-probed-by-discovery', targetCompatible: 'control-specific', releaseQualified: 'unknown-without-dated-qualification-evidence', verifiedInArtifact: false },
		exampleIds: PUBLIC_AUTHORING_LESSONS.filter(lesson => lesson.family === entry.family).map(lesson => lesson.id),
		verificationEvidence: { registry: entry.capabilityStatus || entry.status, qualificationRecord: null, artifact: 'not-yet-generated', timestamp: null, provenance: 'canonical-public-catalog', rule: 'Executable registry status is not release appearance, editability, or playback qualification.' },
		selection: entry.selection,
		...(entry.matchReasons ? { matchReasons: entry.matchReasons } : {}),
		...(entry.requirementFit ? {requirementFit:entry.requirementFit} : {}),
		...(entry.authoringGuidance ? {authoringGuidance:entry.authoringGuidance} : {}),
		...(entry.measurements ? {measurements:entry.measurements} : {}),
		...(typeof entry.selectable==='boolean'?{selectable:entry.selectable}:{}),
		...(entry.qualification ? {qualification:entry.qualification} : {}),
	}
}

export function publicControlRegistry(args = {}) {
	const intent = interpretCapabilityIntent(args.intent || '')
	const requestedFamily = String(args.family || args.surface || '').trim()
	const family = requestedFamily
	const controlId = String(args.controlId || '').trim()
	const query = args.query || args.q || (controlId ? controlId : '')
	const limit = Math.max(1, Math.min(50, Number(args.limit || 12)))
	const requestedOffset = Number(args.offset || 0)
	const page = publicBaselineCatalog({
		...(args.motionRequirements ? {motionRequirements:args.motionRequirements} : {}),
		family,
		families: requestedFamily ? [] : intent.relevantFamilies,
		excludeFamilies: intent.exclusions,
		query,
		relevanceTerms: [args.intent || '', ...intent.matchedIntents],
		includePlanned: args.includePlanned === true,
		offset: controlId ? 0 : requestedOffset,
		limit: controlId ? 500 : limit,
	})
	const matchedEntries = controlId ? page.entries.filter(entry => entry.id === controlId) : page.entries
	const queryRecovery = !controlId && query && page.emptyReason === 'NO_MATCHES'
		? { reason: 'Literal query returned no controls.', nextCall: { tool: 'betterpptx.authoring.catalog', request: { view: 'controls', intent: query, offset: 0, limit } }, note: 'query/q is literal search; use intent for ordinary-language semantic routing.' }
		: null
	return {
		schemaVersion: PUBLIC_CONTROL_REGISTRY_SCHEMA_VERSION,
		registryVersion: PUBLIC_CONTROL_REGISTRY_VERSION,
		routing: { query: 'literal-control-search', q: 'literal-control-search-alias', intent: 'semantic-family-and-exclusion-routing', controlId: 'exact-control-id' },
		interpretation: intent,
		pagination: controlId ? { total: matchedEntries.length, offset: 0, limit: 1, returned: matchedEntries.length, nextOffset: null, registryVersion: PUBLIC_CONTROL_REGISTRY_VERSION } : page.pagination,
		controls: matchedEntries.slice(0, controlId ? 1 : limit).map(enrich),
		...(page.motionQuery ? {motionQuery:{...page.motionQuery,candidateComparisons:page.motionQuery.candidateComparisons.filter(candidate=>matchedEntries.slice(0,controlId?1:limit).some(entry=>entry.id===candidate.id)),comparisonScope:'returned-controls'}} : {}),
		lessons: PUBLIC_AUTHORING_LESSONS.filter(lesson => !intent.exclusions.includes(lesson.family) && (!intent.lessonIds.length || intent.lessonIds.includes(lesson.id))).map(lesson => ({ id: lesson.id, family: lesson.family, result: lesson.result, aliases: lesson.aliases })),
		...(queryRecovery ? { recovery: queryRecovery } : {}),
		unfiltered: { tool: 'betterpptx.authoring.catalog', request: { view: 'controls', offset: 0, limit: 12 }, note: 'Omit intent/query/family to inspect the unfiltered registry.' },
	}
}

export function publicAuthoringLesson(id) {
	const key = normalize(id)
	const lesson = PUBLIC_AUTHORING_LESSONS.find(item => normalize(item.id) === key || item.aliases.some(alias => normalize(alias) === key))
	if (lesson) return { schemaVersion: 'betterpptx.authoring-lesson.v1', ...lesson, source: 'same-public-contract-as-generate_from_spec', teachingExampleOnly: true }
	return { schemaVersion: 'betterpptx.authoring-lesson.v1', status: 'unknown-lesson', requested: String(id || ''), candidates: PUBLIC_AUTHORING_LESSONS.map(item => ({ id: item.id, result: item.result })) }
}

export function publicControlRegistryMetadata() {
	const content = { version: PUBLIC_CONTROL_REGISTRY_VERSION, familyFacts: FAMILY_FACTS, aliases: INTENT_ALIASES.map(item => ({ id: item.id, families: item.families, lessonIds: item.lessonIds })), lessons: PUBLIC_AUTHORING_LESSONS }
	return {
		schemaVersion: PUBLIC_CONTROL_REGISTRY_SCHEMA_VERSION,
		registryVersion: PUBLIC_CONTROL_REGISTRY_VERSION,
		lessonCount: PUBLIC_AUTHORING_LESSONS.length,
		capabilityControlDigest: createHash('sha256').update(JSON.stringify(stable(content))).digest('hex'),
	}
}
