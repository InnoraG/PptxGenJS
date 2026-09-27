import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Server } from "@modelcontextprotocol/server";
import {
	BETTERPPTX_MCP_BRAND,
	BetterPptxMcpRuntimeOptions,
	ToolDefinition,
	artifactFilePath,
	callBetterPptxMcpTool,
	callRemoteBetterPptxMcpTool,
	getBetterPptxMcpTools,
	serverInfo,
	serverInstructions,
} from './engine.js'

export type { BetterPptxMcpRuntimeOptions, ToolDefinition } from './engine.js'
export { BETTERPPTX_MCP_BRAND, callBetterPptxMcpTool, getBetterPptxMcpTools } from './engine.js'

export const BETTERPPTX_MCP_MCP_TOOLS: ToolDefinition[] = getBetterPptxMcpTools({ developerTools: true })
export const PPTXGENJS_MCP_TOOLS: ToolDefinition[] = BETTERPPTX_MCP_MCP_TOOLS

function jsonContent(structuredContent: any, isError = false): any {
	return {
		content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
		structuredContent,
		isError,
	}
}

function sdkTool(tool: ToolDefinition): any {
	return {
		name: tool.name,
		title: tool.title,
		description: tool.description,
		inputSchema: tool.inputSchema as any,
		outputSchema: tool.outputSchema as any,
		annotations: tool.annotations as any,
	}
}

async function withStdoutRedirected<T>(fn: () => Promise<T>): Promise<T> {
	const originalLog = console.log
	console.log = (...args: any[]) => {
		process.stderr.write(`${args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')}\n`)
	}
	try {
		return await fn()
	} finally {
		console.log = originalLog
	}
}

export function createBetterPptxMcpMcpServer(options: BetterPptxMcpRuntimeOptions = {}): Server {
	const server = new Server(serverInfo(), {
		capabilities: {
			tools: { listChanged: false },
			resources: { subscribe: false, listChanged: false },
		},
		instructions: serverInstructions(options),
	})

	server.setRequestHandler('tools/list', async () => ({
		tools: getBetterPptxMcpTools(options).map(sdkTool),
	}))

	server.setRequestHandler('tools/call', async request => {
		const name = request.params.name
		const args = request.params.arguments || {}
		return withStdoutRedirected(async () => {
			if (options.remoteEndpoint) return callRemoteBetterPptxMcpTool(name, args, options)
			return callBetterPptxMcpTool(name, args, options)
		})
	})

	server.setRequestHandler('resources/list', async () => ({
		resources: [],
	}))

	server.setRequestHandler('resources/read', async request => {
		const uri = request.params.uri
		if (!uri.startsWith('betterpptx-mcp-artifact://')) {
			return {
				contents: [{
					uri,
					mimeType: 'application/json',
					text: JSON.stringify({ brand: BETTERPPTX_MCP_BRAND, error: 'Unsupported resource URI' }, null, 2),
				}],
			}
		}
		const artifactId = uri.slice('betterpptx-mcp-artifact://'.length)
		const filePath = artifactFilePath(artifactId, options)
		if (!filePath) {
			return {
				contents: [{
					uri,
					mimeType: 'application/json',
					text: JSON.stringify({ brand: BETTERPPTX_MCP_BRAND, error: 'Artifact not found' }, null, 2),
				}],
			}
		}
		return {
			contents: [{
				uri,
				mimeType: 'application/octet-stream',
				blob: Buffer.from(await import('fs').then(fs => fs.readFileSync(filePath))).toString('base64'),
			}],
		}
	})

	return server
}

export async function startBetterPptxMcpMcpServer(options: BetterPptxMcpRuntimeOptions = {}): Promise<void> {
	const server = createBetterPptxMcpMcpServer(options)
	await server.connect(new StdioServerTransport())
}

export async function startPptxGenMcpServer(options: BetterPptxMcpRuntimeOptions = {}): Promise<void> {
	await startBetterPptxMcpMcpServer(options)
}

export async function callPptxGenMcpTool(name: string, args: any = {}, options: BetterPptxMcpRuntimeOptions = {}): Promise<any> {
	const mappedName = name.startsWith('pptx.') ? name.replace(/^pptx\./, 'betterpptx-mcp.') : name
	const result = await callBetterPptxMcpTool(mappedName, args, { ...options, developerTools: options.developerTools ?? true })
	return result?.content ? result : jsonContent(result)
}
