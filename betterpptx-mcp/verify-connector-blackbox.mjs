import * as fs from 'node:fs'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'

const connectorDir = path.resolve('betterpptx-connector')
const sourceFile = path.join(connectorDir, 'index.mjs')
const packageFile = path.join(connectorDir, 'package.json')

function expect(condition, message, details = {}) {
	if (!condition) {
		const error = new Error(message)
		error.details = details
		throw error
	}
}

const source = fs.readFileSync(sourceFile, 'utf8')
const manifest = JSON.parse(fs.readFileSync(packageFile, 'utf8'))

for (const forbidden of [
	"../betterpptx-mcp",
	'/engine.mjs',
	'ledger-store',
	'rate-card',
	'reservations.mjs',
	'PptxGenJS',
]) {
	expect(!source.includes(forbidden), `Connector includes forbidden server implementation reference: ${forbidden}`, {})
}

const dependencies = Object.keys(manifest.dependencies || {}).sort()
expect(
	JSON.stringify(dependencies) === JSON.stringify(['cross-keychain', 'viem']),
	'Connector dependencies should remain limited to local key protection and standards-based EVM signing.',
	{ dependencies: manifest.dependencies },
)
expect(source.includes("'x-betterpptx-device'"), 'Connector must inject the device bearer as an HTTP header.', {})
expect(!source.includes('arguments.deviceToken') && !source.includes('params.deviceToken'), 'Connector must not place the device bearer in MCP arguments.', {})
expect(!source.includes('privateKey:') && !source.includes('signedTransaction.privateKey'), 'Connector entrypoint must not serialize wallet private keys.', {})

const connector = await import(`${pathToFileURL(sourceFile).href}?verify=${Date.now()}`)
expect(typeof connector.loadOrCreateDevice === 'function', 'Connector should expose a testable local device setup helper.', {})
expect(typeof connector.validatedEndpoint === 'function', 'Connector should expose endpoint validation for deterministic verification.', {})
expect(connector.validatedEndpoint('https://example.invalid/mcp') === 'https://example.invalid/mcp', 'Connector should accept HTTPS MCP endpoints.', {})

const setupDir = path.resolve('outputs', 'connector-verify', `run-${Date.now()}-${process.pid}`)
const deviceFile = path.join(setupDir, 'device.json')
fs.mkdirSync(setupDir, { recursive: true })
const setup = connector.loadOrCreateDevice(deviceFile)
expect(setup.created === true, 'Connector setup helper should create the local device identity.', { setup })
const device = JSON.parse(fs.readFileSync(deviceFile, 'utf8'))
expect(/^bpptx_device_[A-Za-z0-9_-]{43}$/.test(device.deviceToken), 'Connector setup did not create a valid local device identity.', {})
expect(source.includes('process.stderr.write(`BetterPPTX device backup:') && !source.includes('process.stdout.write(`BetterPPTX device backup:'), 'Connector setup backup disclosure must use stderr, never MCP stdout.', {})

console.log('CONNECTOR BLACK BOX: PASS dependencies=2 serverInternals=0 stdoutSecrets=0')
