var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fs from 'fs';
import * as http from 'http';
import { URL } from 'url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClaudePptxMcpMcpServer } from './index.js';
import { CLAUDEPPTXMCP_BRAND, artifactFilePath, callClaudePptxMcpTool, getWorkspaceRoot, listJobManifest, } from './engine.js';
const DEFAULT_MAX_BODY = 50 * 1024 * 1024;
function sendJson(res, status, body) {
    const json = JSON.stringify(body, null, 2);
    res.writeHead(status, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(json),
        'x-claudepptxmcp-brand': CLAUDEPPTXMCP_BRAND,
    });
    res.end(json);
}
function unauthorized(res) {
    sendJson(res, 401, { brand: CLAUDEPPTXMCP_BRAND, success: false, code: 'UNAUTHORIZED', message: 'Invalid or missing API key' });
}
function isAuthorized(req, options) {
    if (!options.apiKey)
        return true;
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice('Bearer '.length) : '';
    const headerKey = Array.isArray(req.headers['x-api-key']) ? req.headers['x-api-key'][0] : req.headers['x-api-key'];
    return bearer === options.apiKey || headerKey === options.apiKey;
}
function readBody(req, maxBytes = DEFAULT_MAX_BODY) {
    return new Promise((resolve, reject) => {
        let size = 0;
        let body = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            size += Buffer.byteLength(chunk);
            if (size > maxBytes) {
                reject(new Error('Request body exceeds upload limit'));
                req.destroy();
                return;
            }
            body += chunk;
        });
        req.on('end', () => {
            if (!body.trim()) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(body));
            }
            catch (error) {
                reject(error);
            }
        });
        req.on('error', reject);
    });
}
function handleMcp(req, res, options, parsedBody) {
    return __awaiter(this, void 0, void 0, function* () {
        const server = createClaudePptxMcpMcpServer(Object.assign(Object.assign({}, options), { exposeLocalPaths: false }));
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        yield server.connect(transport);
        yield transport.handleRequest(req, res, parsedBody);
    });
}
export function startClaudePptxMcpSaasServer() {
    return __awaiter(this, arguments, void 0, function* (options = {}) {
        const host = options.host || '127.0.0.1';
        const port = options.port || 3333;
        getWorkspaceRoot(options);
        const server = http.createServer((req, res) => __awaiter(this, void 0, void 0, function* () {
            try {
                const url = new URL(req.url || '/', `http://${req.headers.host || `${host}:${port}`}`);
                if (url.pathname === '/health') {
                    sendJson(res, 200, { brand: CLAUDEPPTXMCP_BRAND, status: 'ok' });
                    return;
                }
                if (!isAuthorized(req, options)) {
                    unauthorized(res);
                    return;
                }
                if (url.pathname === '/mcp') {
                    const parsedBody = req.method === 'POST'
                        ? yield readBody(req, options.maxUploadBytes || DEFAULT_MAX_BODY)
                        : undefined;
                    yield handleMcp(req, res, options, parsedBody);
                    return;
                }
                if (url.pathname === '/v1/tools/call' && req.method === 'POST') {
                    const body = yield readBody(req, options.maxUploadBytes || DEFAULT_MAX_BODY);
                    const result = yield callClaudePptxMcpTool(body === null || body === void 0 ? void 0 : body.name, (body === null || body === void 0 ? void 0 : body.arguments) || {}, Object.assign(Object.assign({}, options), { exposeLocalPaths: false }));
                    sendJson(res, (result === null || result === void 0 ? void 0 : result.isError) ? 400 : 200, result);
                    return;
                }
                const jobMatch = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
                if (jobMatch && req.method === 'GET') {
                    const manifest = listJobManifest(jobMatch[1], options);
                    if (!manifest) {
                        sendJson(res, 404, { brand: CLAUDEPPTXMCP_BRAND, success: false, code: 'NOT_FOUND', message: 'Job not found' });
                        return;
                    }
                    sendJson(res, 200, manifest);
                    return;
                }
                const artifactMatch = url.pathname.match(/^\/v1\/artifacts\/([^/]+)$/);
                if (artifactMatch && req.method === 'GET') {
                    const artifactPath = artifactFilePath(artifactMatch[1], options);
                    if (!artifactPath) {
                        sendJson(res, 404, { brand: CLAUDEPPTXMCP_BRAND, success: false, code: 'NOT_FOUND', message: 'Artifact not found' });
                        return;
                    }
                    res.writeHead(200, {
                        'content-type': 'application/octet-stream',
                        'content-length': fs.statSync(artifactPath).size,
                        'x-claudepptxmcp-brand': CLAUDEPPTXMCP_BRAND,
                    });
                    fs.createReadStream(artifactPath).pipe(res);
                    return;
                }
                sendJson(res, 404, { brand: CLAUDEPPTXMCP_BRAND, success: false, code: 'NOT_FOUND', message: 'Route not found' });
            }
            catch (error) {
                sendJson(res, 500, {
                    brand: CLAUDEPPTXMCP_BRAND,
                    success: false,
                    code: 'INTERNAL_ERROR',
                    message: error instanceof Error ? error.message : String(error),
                });
            }
        }));
        yield new Promise(resolve => server.listen(port, host, resolve));
        process.stderr.write(`${CLAUDEPPTXMCP_BRAND} SaaS listening on http://${host}:${port}\n`);
        return server;
    });
}
//# sourceMappingURL=saas.js.map