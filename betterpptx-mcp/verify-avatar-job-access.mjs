#!/usr/bin/env node
import { assertAvatarJobAccess } from './avatar/jobs.mjs'

function expectRejected(label, fn) {
	try {
		fn()
		throw new Error(`${label} unexpectedly succeeded`)
	} catch (err) {
		if (err?.code !== 'AVATAR_JOB_NOT_FOUND') throw err
	}
}

const job = { id: 'test-job', sessionId: 'session-a' }
expectRejected('missing session context', () => assertAvatarJobAccess(job, {}))
expectRejected('wrong session context', () => assertAvatarJobAccess(job, { sessionId: 'session-b' }))
if (assertAvatarJobAccess(job, { sessionId: 'session-a' }) !== job) throw new Error('matching session was rejected')
if (assertAvatarJobAccess({ id: 'system-job', sessionId: '' }, {})?.id !== 'system-job') {
	throw new Error('unbound system job was rejected')
}
console.log('AVATAR JOB ACCESS VERIFY: PASS')
