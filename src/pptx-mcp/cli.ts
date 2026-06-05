#!/usr/bin/env node
import { startBetterPptxMcpMcpServer } from './index.js'
import { startBetterPptxMcpSaasServer } from './saas.js'
import { BetterPptxMcpRuntimeOptions, getWorkspaceRoot } from './engine.js'

function valueAfter(args: string[], name: string, fallback?: string): string | undefined {
	const index = args.indexOf(name)
	if (index >= 0 && args[index + 1]) return args[index + 1]
	const prefix = `${name}=`
	const inline = args.find(arg => arg.startsWith(prefix))
	return inline ? inline.slice(prefix.length) : fallback
}

function has(args: string[], name: string): boolean {
	return args.includes(name)
}

function printHelp(): void {
	process.stdout.write(`betterpptx-mcp MCP

Usage:
  betterpptx-mcp --local --workspace <dir>
  betterpptx-mcp --gateway --endpoint <url> --api-key <key>
  betterpptx-mcp-saas --host 127.0.0.1 --port 3333 --storage <dir>

Options:
  --developer-tools       expose betterpptx-mcp.internal.* tools
  --allow-code-execution  allow trusted local create_from_code jobs
  --workspace <dir>       local MCP workspace root
  --storage <dir>         SaaS artifact/job storage root
  --api-key <key>         gateway or SaaS API key
`)
}

export async function main(argv = process.argv.slice(2), saasBinary = false): Promise<void> {
	if (has(argv, '--help') || has(argv, '-h')) {
		printHelp()
		return
	}

	const options: BetterPptxMcpRuntimeOptions = {
		workspace: valueAfter(argv, '--workspace'),
		storage: valueAfter(argv, '--storage'),
		developerTools: has(argv, '--developer-tools'),
		allowCodeExecution: has(argv, '--allow-code-execution'),
		exposeLocalPaths: has(argv, '--expose-local-paths') || !has(argv, '--no-local-paths'),
		apiKey: valueAfter(argv, '--api-key') || process.env.BETTERPPTX_MCP_API_KEY,
		remoteEndpoint: valueAfter(argv, '--endpoint'),
	}

	if (saasBinary || has(argv, '--saas')) {
		const host = valueAfter(argv, '--host', '127.0.0.1')!
		const port = Number(valueAfter(argv, '--port', '3333'))
		await startBetterPptxMcpSaasServer({ ...options, host, port })
		return
	}

	if (has(argv, '--gateway')) {
		if (!options.remoteEndpoint) throw new Error('--gateway requires --endpoint <url>')
		await startBetterPptxMcpMcpServer(options)
		return
	}

	getWorkspaceRoot(options)
	await startBetterPptxMcpMcpServer(options)
}

void main().catch(error => {
	process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`)
	process.exit(1)
})

