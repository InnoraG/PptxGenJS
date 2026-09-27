import { createHash } from 'node:crypto'

import { createBillingLedgerStore, fromCreditUnits } from './ledger-store.mjs'
import { logEvent } from '../logger.mjs'
import { recordBillingCreditTelemetry } from '../telemetry.mjs'

const INSTALL_HASH_PATTERN = /^install_[a-f0-9]{64}$/
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/
const RAW_INSTALL_TOKEN_PATTERN = /\bbpptx_device_[A-Za-z0-9_-]{20,}\b/
const FORBIDDEN_INPUT_KEY = /^(rawToken|deviceToken|installToken|x-betterpptx-device)$/i

export class OwnerGoodwillError extends Error {
	constructor(code, message, statusCode = 400, details = {}) {
		super(message)
		this.name = 'OwnerGoodwillError'
		this.code = code
		this.statusCode = statusCode
		this.details = details
	}
}

function fingerprint(kind, value) {
	const digest = createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, 16)
	return `${kind}:${digest}`
}

function assertNoRawInstallToken(value, key = '') {
	if (key && FORBIDDEN_INPUT_KEY.test(key)) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_RAW_TOKEN_FORBIDDEN',
			'Owner credit actions accept an approved install hash, never a bearer device token.',
			400,
		)
	}
	if (typeof value === 'string' && RAW_INSTALL_TOKEN_PATTERN.test(value)) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_RAW_TOKEN_FORBIDDEN',
			'Owner credit actions accept an approved install hash, never a bearer device token.',
			400,
		)
	}
	if (!value || typeof value !== 'object') return
	if (Array.isArray(value)) {
		for (const item of value) assertNoRawInstallToken(item)
		return
	}
	for (const [childKey, child] of Object.entries(value)) assertNoRawInstallToken(child, childKey)
}

function normalizeAmount(value) {
	const amountCredits = Number(value)
	const configuredMax = Number(process.env.BETTERPPTX_OWNER_GOODWILL_MAX_CREDITS || 100000)
	const maxCredits = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : 100000
	if (!Number.isFinite(amountCredits) || amountCredits <= 0 || amountCredits > maxCredits) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_AMOUNT_INVALID',
			`Goodwill credit amount must be positive and no greater than ${maxCredits} credits.`,
			400,
			{ maxCredits },
		)
	}
	return Number(amountCredits.toFixed(2))
}

function normalizeRequest(input = {}) {
	assertNoRawInstallToken(input)
	const targetHash = String(input.targetHash || '').trim()
	if (!INSTALL_HASH_PATTERN.test(targetHash)) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_TARGET_INVALID',
			'Goodwill credits require an approved install hash.',
			400,
		)
	}
	const amountCredits = normalizeAmount(input.amountCredits)
	const reason = String(input.reason || '').trim()
	if (reason.length < 8 || reason.length > 500) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_REASON_REQUIRED',
			'Goodwill credits require an audit reason between 8 and 500 characters.',
			400,
		)
	}
	const idempotencyKey = String(input.idempotencyKey || '').trim()
	if (!IDEMPOTENCY_PATTERN.test(idempotencyKey)) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_IDEMPOTENCY_REQUIRED',
			'Goodwill credits require an idempotency key between 8 and 128 safe characters.',
			400,
		)
	}
	const expectedConfirm = `CREDIT ${idempotencyKey}`
	if (String(input.confirm || '').trim() !== expectedConfirm) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_CONFIRMATION_REQUIRED',
			`Confirmation must exactly match: ${expectedConfirm}`,
			400,
			{ expected: expectedConfirm },
		)
	}
	return { targetHash, amountCredits, reason, idempotencyKey }
}

export function ownerOperatorFingerprint(value) {
	const text = String(value || '').trim()
	if (!text) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_OPERATOR_REQUIRED',
			'The authenticated owner identity is missing.',
			403,
		)
	}
	return fingerprint('owner', text)
}

export async function grantOwnerGoodwillCredits(input = {}, {
	store = createBillingLedgerStore(),
	operatorFingerprint,
} = {}) {
	const normalized = normalizeRequest(input)
	const operator = String(operatorFingerprint || '').trim()
	if (!/^owner:[a-f0-9]{16}$/.test(operator)) {
		throw new OwnerGoodwillError(
			'OWNER_GOODWILL_OPERATOR_REQUIRED',
			'The authenticated owner identity is missing.',
			403,
		)
	}
	const targetFingerprint = fingerprint('install', normalized.targetHash)
	const result = await store.creditCustomer({
		customerHash: normalized.targetHash,
		source: 'owner_goodwill',
		amountCredits: normalized.amountCredits,
		idempotencyKey: normalized.idempotencyKey,
		proofRef: {
			actionId: normalized.idempotencyKey,
			operatorFingerprint: operator,
		},
		metadata: {
			reason: normalized.reason,
			operatorFingerprint: operator,
			targetFingerprint,
		},
	})
	const response = {
		ok: true,
		action: 'owner_goodwill',
		idempotent: Boolean(result.idempotent),
		idempotencyKey: normalized.idempotencyKey,
		targetFingerprint,
		operatorFingerprint: operator,
		amountCredits: normalized.amountCredits,
		availableBalanceCredits: fromCreditUnits(result.customer.availableBalanceUnits),
	}
	if (!result.idempotent) {
		recordBillingCreditTelemetry({ source: 'owner_goodwill', amountCredits: normalized.amountCredits })
	}
	logEvent('mission_control.owner_goodwill', {
		status: 'ok',
		idempotent: response.idempotent,
		idempotencyKey: response.idempotencyKey,
		targetFingerprint,
		operatorFingerprint: operator,
		amountCredits: normalized.amountCredits,
		reason: normalized.reason,
	})
	return response
}
