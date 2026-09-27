import * as fs from 'node:fs'
import * as path from 'node:path'

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/
const FORBIDDEN_KEY = /private|secret|mnemonic|seed|xprv|keystore/i

export class AddressInventoryError extends Error {
	constructor(code, message, details = {}) {
		super(message)
		this.name = 'AddressInventoryError'
		this.code = code
		this.details = details
	}
}

export function normalizeEvmAddress(value) {
	const address = String(value || '').trim()
	if (!ADDRESS_PATTERN.test(address)) {
		throw new AddressInventoryError('DEPOSIT_ADDRESS_INVALID', 'Deposit address inventory contains an invalid public address.')
	}
	return address.toLowerCase()
}

function assertNoSigningMaterial(value, key = '') {
	if (key && FORBIDDEN_KEY.test(key)) {
		throw new AddressInventoryError(
			'DEPOSIT_INVENTORY_SIGNING_MATERIAL_FORBIDDEN',
			'Deposit address inventory must contain public addresses only.',
		)
	}
	if (!value || typeof value !== 'object') return
	if (Array.isArray(value)) {
		for (const item of value) assertNoSigningMaterial(item)
		return
	}
	for (const [childKey, child] of Object.entries(value)) assertNoSigningMaterial(child, childKey)
}

export function normalizeAddressInventory(input = []) {
	assertNoSigningMaterial(input)
	if (!Array.isArray(input)) {
		throw new AddressInventoryError('DEPOSIT_INVENTORY_INVALID', 'Deposit address inventory must be an array.')
	}
	const seen = new Set()
	return input.map((item, index) => {
		const address = normalizeEvmAddress(typeof item === 'string' ? item : item?.address)
		if (seen.has(address)) {
			throw new AddressInventoryError('DEPOSIT_ADDRESS_DUPLICATE', 'Deposit address inventory contains a duplicate public address.')
		}
		seen.add(address)
		return {
			address,
			index: Math.max(0, Math.round(Number(item?.index ?? index) || 0)),
			label: typeof item === 'object' && item?.label ? String(item.label).slice(0, 120) : null,
		}
	})
}

export function configuredAddressInventory() {
	const json = String(process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_JSON || '').trim()
	const file = String(process.env.BETTERPPTX_DEPOSIT_ADDRESS_INVENTORY_FILE || '').trim()
	let parsed = []
	if (json) {
		try {
			parsed = JSON.parse(json)
		} catch {
			throw new AddressInventoryError('DEPOSIT_INVENTORY_INVALID', 'Deposit address inventory JSON is invalid.')
		}
	} else if (file) {
		try {
			parsed = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
		} catch {
			throw new AddressInventoryError('DEPOSIT_INVENTORY_INVALID', 'Deposit address inventory file is invalid.')
		}
	}
	return normalizeAddressInventory(parsed)
}
