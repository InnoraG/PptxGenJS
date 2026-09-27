import assert from 'node:assert/strict'
import { once } from 'node:events'
import http from 'node:http'
import test from 'node:test'
import { DOMImplementation, DOMParser, XMLSerializer } from '@xmldom/xmldom'
import express from 'express'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { minimatch } from 'minimatch'
import protobuf from 'protobufjs'
import qs from 'qs'
import { Receiver } from 'ws'

// Pure in-memory fixtures and one ephemeral loopback server. No application
// configuration, wallet, cloud SDK client, credential file, or provider loads.
test('XML namespace, escaped text and ordinary CDATA round-trip after the patch', () => {
	const doc = new DOMImplementation().createDocument('urn:fixture', 'p:slide', null)
	doc.documentElement.setAttribute('label', 'A & B < C')
	doc.documentElement.appendChild(doc.createTextNode('cost < cap & approved'))
	doc.documentElement.appendChild(doc.createCDATASection('<literal>'))
	const xml = new XMLSerializer().serializeToString(doc)
	const errors = []
	const parsed = new DOMParser({ errorHandler: { warning: message => errors.push(message), error: message => errors.push(message), fatalError: message => errors.push(message) } }).parseFromString(xml, 'application/xml')
	assert.deepEqual(errors, [])
	assert.equal(parsed.documentElement.namespaceURI, 'urn:fixture')
	assert.equal(parsed.documentElement.getAttribute('label'), 'A & B < C')
	assert.equal(parsed.documentElement.textContent, 'cost < cap & approved<literal>')
	assert.equal(parsed.getElementsByTagName('literal').length, 0)
})

test('XML creation rejects CDATA termination and entity-name markup injection', () => {
	const doc = new DOMImplementation().createDocument(null, 'fixture', null)
	assert.throws(() => doc.createCDATASection('text]]><injected/>'), { code: 5 })
	assert.throws(() => doc.createEntityReference('amp;<injected/>'), { code: 5 })
	const reference = doc.createEntityReference('amp')
	doc.documentElement.appendChild(reference)
	assert.equal(new XMLSerializer().serializeToString(doc), '<fixture>&amp;</fixture>')
	// Creation-time validation must not be the sole protection when code can
	// subsequently mutate a DOM node. Exercise the patched strict serializer.
	reference.nodeName = 'amp;<injected/>'
	assert.throws(() => new XMLSerializer().serializeToString(doc, false, null, { requireWellFormed: true }), { code: 11 })
})

test('WebSocket fragmented messages remain compatible and respect fragment bounds', { timeout: 2000 }, async () => {
	const frame = (opcode, value, final = false) => Buffer.from([(final ? 0x80 : 0) | opcode, 1, value])
	const receiver = new Receiver({ isServer: false, maxPayload: 1024, maxFragments: 2 })
	const message = once(receiver, 'message')
	receiver.end(Buffer.concat([frame(2, 65), frame(0, 66, true)]))
	assert.equal((await message)[0].toString(), 'AB')
	const limited = new Receiver({ isServer: false, maxPayload: 1024, maxFragments: 2 })
	const rejected = once(limited, 'error')
	limited.end(Buffer.concat([frame(2, 65), frame(0, 66), frame(0, 67, true)]))
	assert.equal((await rejected)[0].code, 'WS_ERR_TOO_MANY_BUFFERED_PARTS')
})

test('protobuf cloud-message encoding keeps uint64 amounts exact without a provider', () => {
	const root = protobuf.parse('syntax = "proto3"; package fixture; message Quote { string quote_id = 1; uint64 amount_atomic = 2; }').root
	const type = root.lookupType('fixture.Quote')
	const message = type.fromObject({ quoteId: 'stored-quote', amountAtomic: '9007199254740993' })
	const decoded = type.toObject(type.decode(type.encode(message).finish()), { longs: String })
	assert.deepEqual(decoded, { quoteId: 'stored-quote', amountAtomic: '9007199254740993' })
})

test('query objects reject prototype fields while package glob matching remains compatible', () => {
	const parsed = qs.parse('quoteId=stored&items[0][amount]=250&__proto__[polluted]=true&constructor[prototype][polluted]=true')
	assert.deepEqual(parsed, { quoteId: 'stored', items: [{ amount: '250' }] })
	assert.equal(Object.prototype.polluted, undefined)
	assert.equal(minimatch('ppt/slides/slide2.xml', 'ppt/**/slide{1,2}.xml'), true)
	assert.equal(minimatch('ppt/slides/slide3.xml', 'ppt/**/slide{1,2}.xml'), false)
})

test('Hono preserves request isolation and explicit credentialed CORS matching', async () => {
	const app = new Hono()
	app.use('*', cors({ origin: 'https://client.example.test', credentials: true }))
	app.get('/quotes/:id', context => context.json({ quoteId: context.req.param('id') }))
	const [first, second] = await Promise.all([
		app.request('/quotes/one', { headers: { origin: 'https://client.example.test' } }),
		app.request('/quotes/two', { headers: { origin: 'https://client.example.test.attacker.invalid' } }),
	])
	assert.deepEqual(await first.json(), { quoteId: 'one' })
	assert.deepEqual(await second.json(), { quoteId: 'two' })
	assert.equal(first.headers.get('access-control-allow-origin'), 'https://client.example.test')
	assert.equal(second.headers.get('access-control-allow-origin'), null)
})

test('Express routing and JSON/form limits still reject oversized local fixture requests', { timeout: 5000 }, async t => {
	const app = express()
	app.post('/quotes/:id', express.json({ limit: '256b' }), (req, res) => res.json({ id: req.params.id, body: req.body }))
	app.post('/form', express.urlencoded({ extended: true, limit: '256b' }), (req, res) => res.json(req.body))
	app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: 'fixture rejection' }))
	const server = http.createServer(app)
	t.after(() => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
	server.listen(0, '127.0.0.1')
	await once(server, 'listening')
	const post = (path, body, contentType) => new Promise((resolve, reject) => {
		const request = http.request({ host: '127.0.0.1', port: server.address().port, method: 'POST', path, agent: false,
			headers: { 'content-type': contentType, 'content-length': Buffer.byteLength(body) } }, response => {
			let result = ''
			response.setEncoding('utf8')
			response.on('data', chunk => { result += chunk })
			response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(result) }))
		})
		request.setTimeout(1000, () => request.destroy(new Error('loopback fixture timed out')))
		request.on('error', reject)
		request.end(body)
	})
	assert.deepEqual(await post('/quotes/stored', '{"amountAtomic":"2500000"}', 'application/json'),
		{ status: 200, body: { id: 'stored', body: { amountAtomic: '2500000' } } })
	assert.deepEqual(await post('/form', 'items[0][amount]=250', 'application/x-www-form-urlencoded'),
		{ status: 200, body: { items: [{ amount: '250' }] } })
	assert.equal((await post('/quotes/stored', JSON.stringify({ data: 'x'.repeat(512) }), 'application/json')).status, 413)
})
