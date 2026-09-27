// Maintainer-only, local-store test reset. Never expose this through public MCP.
// Stop the service before --apply; the local store's lock is process-local.
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { hashDeckId } from '../billing/ledger-store.mjs'

const args = process.argv.slice(2)
const flag = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : undefined
}
const file = flag('--file')
const deckId = flag('--deck-id')
const expectedUsed = Number(flag('--expected-used'))
const apply = args.includes('--apply')
if (!file || !deckId || !Number.isSafeInteger(expectedUsed) || expectedUsed < 1) {
  throw new Error('Usage: node reset-publication-test-allowance.mjs --file FILE --deck-id DECK_ID --expected-used N [--apply]')
}
const absolute = path.resolve(file)
const original = fs.readFileSync(absolute)
const originalHash = crypto.createHash('sha256').update(original).digest('hex')
const store = JSON.parse(original.toString('utf8'))
const matchingDeckHash = hashDeckId(deckId).slice(-16)
const matches = Object.entries(store.rolling || {}).filter(([, value]) =>
  value?.category === 'deck-publication' &&
  Array.isArray(value.events) &&
  value.events.some(event => event?.metadata?.deckIdHash === matchingDeckHash))
if (matches.length !== 1) throw new Error(`Expected one publication identity for the specified deck; found ${matches.length}`)
const [recordKey, record] = matches[0]
if (record.events.length !== expectedUsed || record.reservations?.length) {
  throw new Error(`Expected ${expectedUsed} completed publications and no active reservations; observed ${record.events.length} and ${record.reservations?.length || 0}`)
}
if (record.events.some(event => event?.metadata?.tool !== 'betterpptx.deck.save')) {
  throw new Error('Publication record contains an unexpected event type')
}
const result = { category: record.category, beforeUsed: record.events.length, afterUsed: apply ? 0 : null, backupCreated: false, applied: false }
if (apply) {
  const now = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = `${absolute}.owner-test-reset-${now}.bak`
  const temp = `${absolute}.owner-test-reset-${now}.tmp`
  if (crypto.createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') !== originalHash) {
    throw new Error('Usage ledger changed while preparing reset; no changes applied')
  }
  fs.copyFileSync(absolute, backup, fs.constants.COPYFILE_EXCL)
  record.events = []
  record.updatedAt = new Date().toISOString()
  store.rolling[recordKey] = record
  fs.writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
  fs.renameSync(temp, absolute)
  result.backupCreated = true
  result.applied = true
  result.backup = backup
}
console.log(JSON.stringify(result))
