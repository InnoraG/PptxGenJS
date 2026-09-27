import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const repo = path.resolve('betterpptx-mcp')
const verifier = path.join(repo, 'verify-avatar-owner-closure-decision.mjs')
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'betterpptx-owner-packet-'))

const run = (packet, output) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [verifier, packet, output], { cwd: path.resolve('.'), stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', chunk => { stdout += chunk })
  child.stderr.on('data', chunk => { stderr += chunk })
  child.on('error', reject)
  child.on('close', code => {
    try { resolve({ code, report: JSON.parse(stdout) }) } catch (error) { reject(new Error(`${error.message}; stderr=${stderr}; stdout=${stdout}`)) }
  })
})

try {
  const safePacket = {
    schemaVersion: 'betterpptx.avatar.owner-closure-decision.v1',
    automationMustNotInferApproval: true,
    status: 'OPEN_INCOMPLETE',
    gates: { identityReview: {}, providerBilling: {}, meshyMixamo: {} },
    rawSecretsPrinted: false,
    customerData: false,
  }
  const unsafePacket = { ...safePacket, metadata: { apiKey: 'must-never-be-accepted' } }
  const safePath = path.join(temp, 'safe.json')
  const unsafePath = path.join(temp, 'unsafe.json')
  const safeReportPath = path.join(temp, 'safe-report.json')
  const unsafeReportPath = path.join(temp, 'unsafe-report.json')
  await fs.writeFile(safePath, `${JSON.stringify(safePacket)}\n`)
  await fs.writeFile(unsafePath, `${JSON.stringify(unsafePacket)}\n`)

  const safe = await run(safePath, safeReportPath)
  const unsafe = await run(unsafePath, unsafeReportPath)
  if (safe.code !== 0 || safe.report.status !== 'OPEN_INCOMPLETE' || safe.report.checks.unsafeKeys !== true) throw new Error(`Safe metadata packet regression: ${JSON.stringify(safe.report)}`)
  if (unsafe.code === 0 || unsafe.report.status !== 'FAIL_UNSAFE_PACKET' || unsafe.report.checks.unsafeKeys !== false) throw new Error(`Unsafe key regression: ${JSON.stringify(unsafe.report)}`)
  console.log(JSON.stringify({ status: 'PASS', safeStatus: safe.report.status, unsafeStatus: unsafe.report.status, safeMetadataAllowed: true, unsafeKeyRejected: true }, null, 2))
} finally {
  await fs.rm(temp, { recursive: true, force: true })
}
