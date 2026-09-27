import assert from 'node:assert/strict'
import test from 'node:test'

test('public authoring action describes behavior without prescribing client policy', async () => {
	const previous = process.env.BETTERPPTX_PUBLIC_BLACK_BOX
	process.env.BETTERPPTX_PUBLIC_BLACK_BOX = '1'
	try {
		const { TOOLS } = await import('../tools.mjs?host-safety-test')
		const tool = TOOLS.find(row => row.name === 'betterpptx.deck.generate_from_spec')
		assert.ok(tool)
		assert.match(tool.description, /phase:"dryRun" checks the proposed deck without creating it/)
		assert.match(tool.description, /phase:"commit" creates or revises a deck/)
		assert.doesNotMatch(tool.description, /Start with|recommended workflow|forbidden|Validate according to|The AI owns/i)
		assert.match(tool.inputSchema.properties.spec.description, /slide-inch rectangles/)
	} finally {
		if (previous === undefined) delete process.env.BETTERPPTX_PUBLIC_BLACK_BOX
		else process.env.BETTERPPTX_PUBLIC_BLACK_BOX = previous
	}
})
