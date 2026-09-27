var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { Server } from "@modelcontextprotocol/server";
import { BETTERPPTX_MCP_BRAND, artifactFilePath, callBetterPptxMcpTool, callRemoteBetterPptxMcpTool, getBetterPptxMcpTools, serverInfo, serverInstructions, } from './engine.js';
export { BETTERPPTX_MCP_BRAND, callBetterPptxMcpTool, getBetterPptxMcpTools } from './engine.js';
export const BETTERPPTX_MCP_MCP_TOOLS = getBetterPptxMcpTools({ developerTools: true });
export const PPTXGENJS_MCP_TOOLS = BETTERPPTX_MCP_MCP_TOOLS;
function jsonContent(structuredContent, isError = false) {
    return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
        isError,
    };
}
function sdkTool(tool) {
    return {
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        annotations: tool.annotations,
    };
}
function withStdoutRedirected(fn) {
    return __awaiter(this, void 0, void 0, function* () {
        const originalLog = console.log;
        console.log = (...args) => {
            process.stderr.write(`${args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ')}\n`);
        };
        try {
            return yield fn();
        }
        finally {
            console.log = originalLog;
        }
    });
}
export function createBetterPptxMcpMcpServer(options = {}) {
    const server = new Server(serverInfo(), {
        capabilities: {
            tools: { listChanged: false },
            resources: { subscribe: false, listChanged: false },
        },
        instructions: serverInstructions(options),
    });
    server.setRequestHandler('tools/list', () => __awaiter(this, void 0, void 0, function* () {
        return ({
            tools: getBetterPptxMcpTools(options).map(sdkTool),
        });
    }));
    server.setRequestHandler('tools/call', (request) => __awaiter(this, void 0, void 0, function* () {
        const name = request.params.name;
        const args = request.params.arguments || {};
        return withStdoutRedirected(() => __awaiter(this, void 0, void 0, function* () {
            if (options.remoteEndpoint)
                return callRemoteBetterPptxMcpTool(name, args, options);
            return callBetterPptxMcpTool(name, args, options);
        }));
    }));
    server.setRequestHandler('resources/list', () => __awaiter(this, void 0, void 0, function* () {
        return ({
            resources: [],
        });
    }));
    server.setRequestHandler('resources/read', (request) => __awaiter(this, void 0, void 0, function* () {
        const uri = request.params.uri;
        if (!uri.startsWith('betterpptx-mcp-artifact://')) {
            return {
                contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({ brand: BETTERPPTX_MCP_BRAND, error: 'Unsupported resource URI' }, null, 2),
                    }],
            };
        }
        const artifactId = uri.slice('betterpptx-mcp-artifact://'.length);
        const filePath = artifactFilePath(artifactId, options);
        if (!filePath) {
            return {
                contents: [{
                        uri,
                        mimeType: 'application/json',
                        text: JSON.stringify({ brand: BETTERPPTX_MCP_BRAND, error: 'Artifact not found' }, null, 2),
                    }],
            };
        }
        return {
            contents: [{
                    uri,
                    mimeType: 'application/octet-stream',
                    blob: Buffer.from(yield import('fs').then(fs => fs.readFileSync(filePath))).toString('base64'),
                }],
        };
    }));
    return server;
}
export function startBetterPptxMcpMcpServer() {
    return __awaiter(this, arguments, void 0, function* (options = {}) {
        const server = createBetterPptxMcpMcpServer(options);
        yield server.connect(new StdioServerTransport());
    });
}
export function startPptxGenMcpServer() {
    return __awaiter(this, arguments, void 0, function* (options = {}) {
        yield startBetterPptxMcpMcpServer(options);
    });
}
export function callPptxGenMcpTool(name_1) {
    return __awaiter(this, arguments, void 0, function* (name, args = {}, options = {}) {
        var _a;
        const mappedName = name.startsWith('pptx.') ? name.replace(/^pptx\./, 'betterpptx-mcp.') : name;
        const result = yield callBetterPptxMcpTool(mappedName, args, Object.assign(Object.assign({}, options), { developerTools: (_a = options.developerTools) !== null && _a !== void 0 ? _a : true }));
        return (result === null || result === void 0 ? void 0 : result.content) ? result : jsonContent(result);
    });
}
//# sourceMappingURL=index.js.map