// Isolated loopback-only sign-in qualification. No production session, user
// record, token or key is written to disk or printed.
import express from 'express'
import { createHash } from 'node:crypto'
import { renderSignIn } from '../../auth/oauth-pages.mjs'
import { createSignInTokenVerifier, readSignInConfiguration } from '../../auth/oauth-sign-in.mjs'

const config = readSignInConfiguration(process.env)
if (!config) throw new Error('A valid isolated sign-in configuration is required.')
const port = Number(process.env.BETTERPPTX_SIGNIN_TEST_PORT || 48671)
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid test port.')
const origin = `http://localhost:${port}`
const verifier = createSignInTokenVerifier(config)
const app = express()
let proof = { status: 'awaiting-email-test', project: config.projectId }
app.use((req, res, next) => {
	if (!['localhost', '127.0.0.1'].includes(req.hostname)) return res.sendStatus(403)
	res.setHeader('Cache-Control', 'no-store')
	next()
})
app.get('/sign-in', (_req, res) => renderSignIn(res, {
	clientName: 'BetterPPTX authentication test', loginUrl: `${origin}/verified`,
	continueUrl: `${origin}/sign-in`, signIn: config,
}))
app.post('/verified', express.json({ limit: '12kb' }), async (req, res) => {
	if (req.get('origin') !== origin) return res.sendStatus(403)
	try {
		const account = await verifier(req.body?.idToken)
		proof = { status: 'verified', project: config.projectId, verifiedAt: new Date().toISOString(),
			uidFingerprint: createHash('sha256').update(account.accountId).digest('hex') }
		console.log(JSON.stringify(proof))
		res.json({ location: `${origin}/result` })
	} catch { res.status(401).json({ error: 'Sign-in verification failed.' }) }
})
app.get('/status', (_req, res) => res.json(proof))
app.get('/result', (_req, res) => res.type('html').send(`<!doctype html><title>BetterPPTX authentication test</title><h1>${proof.status === 'verified' ? 'BetterPPTX sign-in verified' : 'Sign-in not verified yet'}</h1><p>This test did not change production authentication.</p>`))
app.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ status: 'listening', url: `${origin}/sign-in`, project: config.projectId })))
