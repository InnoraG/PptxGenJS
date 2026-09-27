import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSpecOperationPlan, NARRATION_RUBRIC } from '../ir/spec-compiler.mjs'

function baseSlide(overrides = {}) {
	return {
		id: 'slide-1',
		title: 'Ownership contract',
		message: 'This sentence is spoken.',
		...overrides,
	}
}

function compile(slide) {
	return buildSpecOperationPlan({
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Notes ownership contract',
		contentStory: { audience: 'owner', outcome: 'verify notes ownership', remember: 'the marker is the splitter' },
		visualDesign: { world: 'test' },
		motionTime: { masterClock: 'narration' },
		slides: [slide],
	}, { plan: 'premium' })
}

function slideAddNotes(plan) {
	return plan.operations.find(operation => operation.tool === 'betterpptx.slide.add')?.args?.notes
}

test('free user notes remain before the canonical final narration block', () => {
	const userNotes = 'Private reminder: ask for questions.\nDo not narrate this line.'
	const notes = slideAddNotes(compile(baseSlide({ notes: userNotes })))
	assert.equal(notes, `${userNotes}\n\n${NARRATION_RUBRIC}\nThis sentence is spoken.`)
	assert.ok(notes.endsWith(`${NARRATION_RUBRIC}\nThis sentence is spoken.`))
})

test('legacy [narration] remains readable and is canonicalized on authored output', () => {
	const notes = slideAddNotes(compile(baseSlide({
		notes: 'Owner-only note.\n\n[narration]\nLegacy narration text.',
	})))
	assert.equal(notes, `Owner-only note.\n\n${NARRATION_RUBRIC}\nLegacy narration text.`)
})

test('only the final rubric line is the ownership splitter', () => {
	const notes = slideAddNotes(compile(baseSlide({
		notes: 'User note quoting [narration] inline is still free.\nA line before the real boundary.\n\n[narration]\nSpoken ending.',
	})))
	assert.equal(notes, `User note quoting [narration] inline is still free.\nA line before the real boundary.\n\n${NARRATION_RUBRIC}\nSpoken ending.`)
})

test('an empty final rubric receives the authored narration without touching user notes', () => {
	const notes = slideAddNotes(compile(baseSlide({
		notes: 'User-owned checklist.\n\n[BetterPPTX-narration]\n',
	})))
	assert.equal(notes, `User-owned checklist.\n\n${NARRATION_RUBRIC}\nThis sentence is spoken.`)
})

test('avatar narration derives from slide message, never from free user notes', () => {
	const plan = compile(baseSlide({
		notes: 'Confidential user-only preparation note.',
		avatarNarration: { enabled: true, avatarAsset: 'asset://opaque-video', cover: 'asset://opaque-poster' },
	}))
	const avatar = plan.operations.find(operation => operation.tool === 'betterpptx.slide.add_avatar_narration')
	assert.equal(avatar?.args?.script, 'This sentence is spoken.')
	assert.equal(slideAddNotes(plan), `Confidential user-only preparation note.\n\n${NARRATION_RUBRIC}\nThis sentence is spoken.`)
	assert.equal(plan.operations.some(operation => operation.tool === 'betterpptx.deck.apply_auto_timings'), false,
		'the measured Record Studio media clock must not be overwritten by a text-duration fallback')
})
