import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'

const narrationScript = 'Make the dependency visible. Source: Mixamo. Kimodo is used only when a custom motion is needed.'

function sourceSpec() {
	return {
		schemaVersion: 'betterpptx.deck-spec.v1',
		title: 'Native dependency handoff',
		authoringContract: { workflow: 'authoring-excellence-director-v1', level: 'deterministic' },
		contentStory: { audience: 'reviewers', outcome: 'Verify exact native layout and audio handoff.', remember: 'The words and source pixels survive resolution.' },
		handshake: {
			audience: 'reviewers', promise: 'Keep the native dependency explanation unchanged.',
			proof: ['Measured audio and pixel-authored native objects.'], bar: 'Cold clients get the same presentation.', commitments: ['faithful-handoff'],
		},
		visualDesign: { world: 'Editorial proof', framing: 'Three exact source-pixel objects.' },
		styleIntent: { artDirection: 'editorial', mode: 'light' },
		motionTime: { masterClock: 'narration', timingSource: 'measured audio', syncPolicy: 'Visual cues follow the complete script.' },
		layout: 'LAYOUT_WIDE',
		visualReference: {
			mode: 'ai-reconstructed-native', coordinateMode: 'pixels', representationPolicy: 'native-except-media',
			viewport: { width: 1672, height: 941 }, mediaAssets: [],
		},
		presenter: { enabled: false, pixelFrame: { x: 1200, y: 320, w: 250, h: 500 } },
		slides: [{
			id: 'handoff-slide', title: 'One dependency', message: 'Preserve words, pixels, and audio.', layoutIntent: 'title-body',
			pixelViewport: { width: 1672, height: 941 },
			presenter: { enabled: false, pixelFrame: { x: 1210, y: 310, w: 245, h: 510 } },
			content: [
				{ kind: 'textBox', name: 'dependency-title', text: 'ONE DEPENDENCY', pixelFrame: { x: 160, y: 130, w: 1150, h: 120 }, style: { fontSize: 26 } },
				{ kind: 'textBox', name: 'Mixamo-label', text: 'SOURCE: MIXAMO · Kimodo when needed', pixelFrame: { x: 160, y: 340, w: 1200, h: 120 }, style: { fontSize: 20 } },
				{ kind: 'freeform', name: 'route-line', decorative: true, pixelFrame: { x: 160, y: 620, w: 1000, h: 150 }, pixelPoints: [{ x: 0, y: 150 }, { x: 1000, y: 0 }], style: { line: { color: '0088CC', width: 2 }, fill: { transparency: 100 } } },
			],
			narration: { script: narrationScript, voice: 'en_US-ljspeech-high', timingAuthority: 'media', startDelayMs: 100, paddingMs: 400 },
		}],
	}
}

function wav500ms() {
	const dataBytes = 22050
	const bytes = Buffer.alloc(44 + dataBytes)
	bytes.write('RIFF', 0); bytes.writeUInt32LE(36 + dataBytes, 4); bytes.write('WAVE', 8)
	bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22)
	bytes.writeUInt32LE(22050, 24); bytes.writeUInt32LE(44100, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34)
	bytes.write('data', 36); bytes.writeUInt32LE(dataBytes, 40)
	return bytes
}

function dataOf(label, result) {
	assert.equal(result?.ok, true, `${label}: ${JSON.stringify(result?.error || result)}`)
	return result.data || result
}

async function inFreshProcess(lockedSpec, authoredSpec, operationId) {
	const engineUrl = new URL('../engine.mjs', import.meta.url).href
	const code = `
		import assert from 'node:assert/strict';
		const {createMcpToolDispatcher, getDeck} = await import(${JSON.stringify(engineUrl)});
		let input = ''; for await (const chunk of process.stdin) input += chunk;
		const {lockedSpec:spec,authoredSpec,operationId} = JSON.parse(input);
		const mcp = createMcpToolDispatcher({sessionId:'cold-handoff-'+process.pid, installHash:'pixel-handoff-install', clientInfo:{name:'cold-handoff-test',version:'1'}, blackBox:true});
		const unpack = (label, result) => {assert.equal(result?.ok,true,label+': '+JSON.stringify(result?.error || result)); return result.data || result};
		let deckId;
		try {
			const status = unpack('operation status',await mcp.call('betterpptx.operation.status',{operationId}));
			assert.deepEqual(status.result.lockedSpec,spec,'durable status retains the original public handoff');
			assert.ok(!JSON.stringify(status).includes('_authoredSpecLiterals'));
			const replay = unpack('durable resolve replay',await mcp.call('betterpptx.deck.generate_from_spec',{spec:authoredSpec,phase:'resolve',commitMode:'createNew',plan:'premium',billingConfirmed:true,detail:'full',idempotencyKey:'pixel-handoff-resolve'}));
			assert.equal(replay.durableOperation.replay,true);
			assert.deepEqual(replay.lockedSpec,spec,'durable replay retains the original public handoff');
			const dry = unpack('lockedDryRun',await mcp.call('betterpptx.deck.generate_from_spec',{spec:structuredClone(spec),phase:'lockedDryRun',commitMode:'createNew',plan:'premium',detail:'full'}));
			const committed = unpack('commit',await mcp.call('betterpptx.deck.generate_from_spec',{spec:structuredClone(spec),phase:'commit',commitMode:'createNew',plan:'premium',billingConfirmed:true,detail:'full'}));
			deckId = committed.deckId;
			const entry = getDeck(deckId);
			const slide = entry.pptx.slides[0];
			const objectText = value => typeof value === 'string' ? value : Array.isArray(value) ? value.map(objectText).join('') : (value?.text || '');
			const texts = (slide._slideObjects || []).map(object => objectText(object.text));
			assert.ok(texts.includes('SOURCE: MIXAMO · Kimodo when needed'),JSON.stringify(texts));
			console.log('COLD_HANDOFF_RESULT '+JSON.stringify({dryDigest:dry.lockedPlanDigest,commitDigest:committed.lockedPlanDigest,drySpecDigest:dry.lockedSpecDigest,commitSpecDigest:committed.lockedSpecDigest,dryTimeline:dry.narrationTimeline,commitTimeline:committed.narrationTimeline,nativeTextRetained:true}));
		} finally { if(deckId) await mcp.call('betterpptx.deck.dispose',{deckId}); }
	`
	const child = spawn(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
	let stdout = '', stderr = ''
	child.stdout.on('data', bytes => { stdout += bytes })
	child.stderr.on('data', bytes => { stderr += bytes })
	child.stdin.end(JSON.stringify({ lockedSpec, authoredSpec, operationId }))
	const codeResult = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve) })
	assert.equal(codeResult, 0, `Fresh process failed:\n${stderr}\n${stdout}`)
	const marker = stdout.split(/\r?\n/).find(line => line.startsWith('COLD_HANDOFF_RESULT '))
	assert.ok(marker, stdout)
	return JSON.parse(marker.slice('COLD_HANDOFF_RESULT '.length))
}

test('serialized public pixel resolve handoff commits in a fresh process without another synthesis', { timeout: 45000 }, async () => {
	const previous = new Map()
	const setEnv = (key, value) => { previous.set(key, process.env[key]); process.env[key] = value }
	const lockedRoot = await mkdtemp(path.join(os.tmpdir(), 'betterpptx-pixel-handoff-'))
	for (const [key, value] of Object.entries({
		BETTERPPTX_PUBLIC_BLACK_BOX: '1', BETTERPPTX_PUBLIC_SPEC_FIRST_ONLY: '1',
		BETTERPPTX_BILLING_ENFORCE: '0', BETTERPPTX_LOCAL_MAINTAINER: '1',
		BETTERPPTX_LOCKED_ASSET_ROOT: lockedRoot, BETTERPPTX_ALLOWED_AUDIO_DIRS: lockedRoot,
		BETTERPPTX_TTS_PROVIDER: 'piper-http',
		BETTERPPTX_DURABLE_OPERATION_STORE: 'local', BETTERPPTX_OPERATION_STORE_FILE: path.join(lockedRoot, 'operations.json'),
		BETTERPPTX_OPERATION_EXECUTION_MODE: 'inline', BETTERPPTX_REQUIRE_DURABLE_OPERATION_IDEMPOTENCY: '0',
	})) setEnv(key, value)
	const requests = []
	const server = http.createServer(async (request, response) => {
		if (request.method === 'POST') {
			let body = ''; for await (const chunk of request) body += chunk
			requests.push(JSON.parse(body))
			response.writeHead(200, { 'content-type': 'audio/wav' }); response.end(wav500ms())
			return
		}
		response.writeHead(200, { 'content-type': 'application/json' }); response.end('[]')
	})
	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
	setEnv('BETTERPPTX_TTS_URL', `http://127.0.0.1:${server.address().port}`)
	try {
		const { createMcpToolDispatcher } = await import('../engine.mjs')
		const mcp = createMcpToolDispatcher({ sessionId: `pixel-resolve-${Date.now()}`, installHash: 'pixel-handoff-install', clientInfo: { name: 'pixel-resolve-test', version: '1' }, blackBox: true })
		const source = sourceSpec()
		for (const mutate of [
			candidate => { candidate.presenter._visualReferenceFrame = { x: 1, y: 1, w: 2, h: 3 } },
			candidate => {
				candidate.authoringContract.placementPolicy = 'visual-reference-pixels-v1'
				candidate.slides[0].content[0].bbox = { x: 1, y: 1, w: 2, h: 3 }
			},
		]) {
			const forged = structuredClone(source); mutate(forged)
			const rejected = await mcp.call('betterpptx.deck.generate_from_spec', {
				spec: forged, phase: 'resolve', commitMode: 'createNew', plan: 'premium', billingConfirmed: true,
			})
			assert.equal(rejected.ok, false, 'client private/effective geometry must not enter the public resolver')
			assert.match(JSON.stringify(rejected.error), /VISUAL_REFERENCE_SPEC_INVALID/)
			assert.equal(requests.length, 0, 'invalid private geometry fails before any synthesis')
		}
		const resolved = dataOf('resolve', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: structuredClone(source), phase: 'resolve', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
			idempotencyKey: 'pixel-handoff-resolve',
		}))
		assert.equal(resolved.resolution.locked, true)
		const handoff = JSON.parse(JSON.stringify(resolved.lockedSpec))
		assert.deepEqual(handoff.slides[0].content, source.slides[0].content)
		assert.deepEqual(handoff.presenter, source.presenter)
		assert.deepEqual(handoff.slides[0].presenter, source.slides[0].presenter)
		assert.deepEqual(handoff.slides[0].pixelViewport, source.slides[0].pixelViewport)
		assert.equal(handoff.slides[0].narration.script, narrationScript)
		assert.equal(handoff.slides[0].narration.segments, undefined)
		assert.doesNotMatch(JSON.stringify(handoff), /_visualReferenceFrame|"bbox"|private-provider|service component/)
		assert.equal(requests.length, 1, 'the full source narration is synthesized once, not once per object')
		assert.equal(requests[0].text, narrationScript)
		const replayed = dataOf('resolve replay', await mcp.call('betterpptx.deck.generate_from_spec', {
			spec: structuredClone(source), phase: 'resolve', commitMode: 'createNew', plan: 'premium', billingConfirmed: true, detail: 'full',
			idempotencyKey: 'pixel-handoff-resolve',
		}))
		assert.equal(replayed.idempotentReplay, true)
		assert.deepEqual(replayed.lockedSpec, handoff, 'a lost-response retry must return the same authored handoff')
		assert.equal(requests.length, 1)
		assert.ok(resolved.durableOperation?.operationId)
		const cold = await inFreshProcess(handoff, source, resolved.durableOperation.operationId)
		assert.equal(cold.dryDigest, resolved.lockedPlanDigest)
		assert.equal(cold.commitDigest, resolved.lockedPlanDigest)
		assert.equal(cold.drySpecDigest, resolved.lockedSpecDigest)
		assert.equal(cold.commitSpecDigest, resolved.lockedSpecDigest)
		assert.equal(cold.nativeTextRetained, true)
		assert.equal(requests.length, 1, 'cold lockedDryRun and commit reuse the locked audio')
		assert.deepEqual(cold.dryTimeline.slides, resolved.narrationTimeline.slides)
		assert.deepEqual(cold.commitTimeline.slides, resolved.narrationTimeline.slides)
	} finally {
		await new Promise(resolve => server.close(resolve))
		await rm(lockedRoot, { recursive: true, force: true })
		for (const [key, value] of previous) { if (value === undefined) delete process.env[key]; else process.env[key] = value }
	}
})
