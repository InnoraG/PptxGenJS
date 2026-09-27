#!/usr/bin/env node
/**
 * Keep Tailscale Funnel pointed at the local MCP and recover after sleep,
 * network changes, or a dropped Funnel advertisement.
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const PORT = String(process.env.BETTERPPTX_PORT || 3344)
const TARGET = `http://127.0.0.1:${PORT}`
const INTERVAL_MS = Math.max(15000, Number(process.env.BETTERPPTX_FUNNEL_KEEPALIVE_MS || 30000) || 30000)
const TS = process.platform === 'win32'
	? 'C:\\Program Files\\Tailscale\\tailscale.exe'
	: 'tailscale'

async function localHealth() {
	const res = await fetch(`${TARGET}/health`, { signal: AbortSignal.timeout(5000) })
	if (!res.ok) throw new Error(`health ${res.status}`)
}

async function funnelConfigured() {
	const { stdout } = await execFileAsync(TS, ['serve', 'status', '--json'], { timeout: 20000, windowsHide: true })
	const status = JSON.parse(stdout || '{}')
	const funnelOn = Object.values(status.AllowFunnel || {}).some(Boolean)
	const blob = JSON.stringify(status.Web || {})
	const proxyOk = blob.includes(`127.0.0.1:${PORT}`) || blob.includes(`localhost:${PORT}`)
	return funnelOn && proxyOk
}

async function repairFunnel() {
	await execFileAsync(TS, ['funnel', '--bg', '--yes', `--https=443`, TARGET], { timeout: 30000, windowsHide: true })
}

async function tick() {
	try {
		await localHealth()
	} catch (err) {
		process.stderr.write(`[funnel-keepalive] local MCP health failed: ${err.message}\n`)
	}
	try {
		if (!(await funnelConfigured())) {
			process.stderr.write('[funnel-keepalive] Funnel missing or not proxying localhost; re-applying\n')
			await repairFunnel()
		}
	} catch (err) {
		process.stderr.write(`[funnel-keepalive] Funnel check failed: ${err.message}\n`)
		try {
			await repairFunnel()
		} catch (repairErr) {
			process.stderr.write(`[funnel-keepalive] Funnel repair failed: ${repairErr.message}\n`)
		}
	}
}

process.stderr.write(`[funnel-keepalive] watching ${TARGET} every ${INTERVAL_MS}ms\n`)
await tick()
setInterval(() => {
	tick().catch(err => process.stderr.write(`[funnel-keepalive] ${err.message}\n`))
}, INTERVAL_MS)
