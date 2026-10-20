import { randomBytes } from 'node:crypto'

// Server-rendered sign-in, consent and error pages for the built-in
// authorization server. Public copy only: no internals, providers' errors or
// identifiers are shown. Every page gets a per-response script nonce.
const FIREBASE_SDK = 'https://www.gstatic.com/firebasejs/12.19.0'

const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch])
// JSON inside <script type="application/json">: neutralise markup breakouts.
const embedJson = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026')

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--ink:#14171c;--muted:#5b6370;--line:#d9dde3;--accent:#2f5bd3;--accent-ink:#fff;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#101318;--card:#181c23;--ink:#eef1f5;--muted:#a3abb7;--line:#2b313b;--accent:#7b9cff;--accent-ink:#0b1020;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:16px}
main{width:100%;max-width:400px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:28px}
h1{font-size:1.25rem;margin:0 0 6px}p{margin:0 0 16px;color:var(--muted)}label{display:block;font-size:.9rem;margin-bottom:6px}
input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:transparent;color:inherit;font:inherit}
button{width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--line);background:transparent;color:inherit;font:inherit;cursor:pointer;margin-top:12px}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-ink);font-weight:600}button:disabled{opacity:.6;cursor:default}
.status{min-height:1.5em;margin-top:14px;font-size:.92rem;color:var(--muted)}.status.bad{color:var(--bad)}.hidden{display:none}
ul{margin:0 0 16px;padding-left:20px;color:var(--muted)}
`

function headers(res, nonce, { authDomain } = {}) {
	res.setHeader('Cache-Control', 'no-store')
	res.setHeader('Referrer-Policy', 'no-referrer')
	res.setHeader('X-Content-Type-Options', 'nosniff')
	res.setHeader('Content-Security-Policy', [
		"default-src 'none'",
		"img-src data:",
		"style-src 'unsafe-inline'",
		authDomain ? `script-src 'nonce-${nonce}' https://www.gstatic.com` : `script-src 'nonce-${nonce}'`,
		authDomain ? "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com" : "connect-src 'self'",
		authDomain ? `frame-src https://${authDomain}` : "frame-src 'none'",
		"base-uri 'none'",
		"form-action 'none'",
		"frame-ancestors 'none'",
	].join('; '))
}

function page(title, body, nonce, script = '', data = null) {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>${STYLE}</style></head><body><main>${body}</main>
${data ? `<script id="page-data" type="application/json">${embedJson(data)}</script>` : ''}
${script ? `<script type="module" nonce="${nonce}">${script}</script>` : ''}</body></html>`
}

// Shared by both pages: POST JSON to our own interaction endpoint and follow
// the returned location (a navigation, not a form submission).
const SUBMIT = `
const data = JSON.parse(document.getElementById('page-data').textContent)
const statusEl = document.getElementById('status')
const say = (text, bad = false) => { statusEl.textContent = text; statusEl.classList.toggle('bad', bad) }
async function submit(url, body) {
  const response = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || typeof result.location !== 'string') throw new Error('rejected')
  location.assign(result.location)
}
`

const SIGN_IN_SCRIPT = `${SUBMIT}
import { initializeApp } from '${FIREBASE_SDK}/firebase-app.js'
import { getAuth, setPersistence, inMemoryPersistence, sendSignInLinkToEmail, isSignInWithEmailLink, signInWithEmailLink, GoogleAuthProvider, signInWithPopup } from '${FIREBASE_SDK}/firebase-auth.js'
const auth = getAuth(initializeApp({ apiKey: data.apiKey, authDomain: data.authDomain, projectId: data.projectId }))
await setPersistence(auth, inMemoryPersistence)
const STORE = 'betterpptx.signin.email'
const remember = value => { try { localStorage.setItem(STORE, value) } catch {} }
const recall = () => { try { return localStorage.getItem(STORE) } catch { return null } }
const forget = () => { try { localStorage.removeItem(STORE) } catch {} }
const emailForm = document.getElementById('email-form')
const emailInput = document.getElementById('email')
const emailButton = document.getElementById('email-button')
async function finish(credential) {
  say('Signing you in…')
  await submit(data.loginUrl, { idToken: await credential.user.getIdToken() })
}
async function completeLink(email) {
  try {
    await finish(await signInWithEmailLink(auth, email, location.href))
    forget()
  } catch {
    say('That sign-in link is invalid or has expired. Request a new one.', true)
  }
}
if (data.methods.includes('email-link') && isSignInWithEmailLink(auth, location.href)) {
  const email = recall()
  if (email) await completeLink(email)
  else {
    document.getElementById('intro').textContent = 'Confirm the email address the sign-in link was sent to.'
    emailButton.textContent = 'Continue'
    emailForm.dataset.mode = 'confirm'
  }
}
emailForm?.addEventListener('submit', async event => {
  event.preventDefault()
  const email = emailInput.value.trim()
  if (!email) return
  emailButton.disabled = true
  if (emailForm.dataset.mode === 'confirm') { await completeLink(email); emailButton.disabled = false; return }
  try {
    await sendSignInLinkToEmail(auth, email, { url: data.continueUrl, handleCodeInApp: true })
    remember(email)
    say('Check your inbox: we sent a sign-in link to ' + email + '. Open it in this browser.')
  } catch {
    say('The sign-in link could not be sent. Check the address and try again.', true)
    emailButton.disabled = false
  }
})
document.getElementById('google')?.addEventListener('click', async () => {
  try { await finish(await signInWithPopup(auth, new GoogleAuthProvider())) } catch { say('Google sign-in did not complete.', true) }
})
`

export function renderSignIn(res, { clientName, loginUrl, continueUrl, signIn }) {
	const nonce = randomBytes(18).toString('base64')
	headers(res, nonce, { authDomain: signIn.authDomain })
	const email = signIn.methods.includes('email-link')
	const google = signIn.methods.includes('google')
	const body = `<h1>Sign in to BetterPPTX</h1>
<p id="intro">${escapeHtml(clientName)} wants to use your BetterPPTX account.</p>
${email ? `<form id="email-form" novalidate><label for="email">Email address</label>
<input id="email" type="email" autocomplete="email" required><button id="email-button" class="primary" type="submit">Email me a sign-in link</button></form>` : ''}
${google ? '<button id="google" type="button">Continue with Google</button>' : ''}
<div id="status" class="status" role="status" aria-live="polite"></div>`
	res.status(200).type('html').send(page('Sign in · BetterPPTX', body, nonce, SIGN_IN_SCRIPT, {
		apiKey: signIn.apiKey, authDomain: signIn.authDomain, projectId: signIn.projectId,
		methods: signIn.methods, loginUrl, continueUrl,
	}))
}

const CONSENT_SCRIPT = `${SUBMIT}
for (const [id, allow] of [['allow', true], ['deny', false]]) {
  document.getElementById(id).addEventListener('click', async event => {
    event.target.disabled = true
    try { await submit(data.consentUrl, { allow }) } catch { say('Something went wrong. Please start again from your app.', true) }
  })
}
`

export function renderConsent(res, { clientName, consentUrl }) {
	const nonce = randomBytes(18).toString('base64')
	headers(res, nonce)
	const body = `<h1>Allow ${escapeHtml(clientName)}?</h1>
<p>${escapeHtml(clientName)} will be able to:</p>
<ul><li>Create, edit and save presentations in your BetterPPTX account</li><li>Use your BetterPPTX allowance</li></ul>
<button id="allow" class="primary" type="button">Allow</button><button id="deny" type="button">Cancel</button>
<div id="status" class="status" role="status" aria-live="polite"></div>`
	res.status(200).type('html').send(page('Allow access · BetterPPTX', body, nonce, CONSENT_SCRIPT, { consentUrl }))
}

export function errorPage(title = 'Sign-in could not continue', message = 'Please return to your app and start the sign-in again.') {
	const nonce = randomBytes(18).toString('base64')
	return {
		nonce,
		html: page(`${title} · BetterPPTX`, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>`, nonce),
		csp: `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
	}
}
