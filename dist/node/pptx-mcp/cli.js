#!/usr/bin/env node
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { startClaudePptxMcpMcpServer } from './index.js';
import { startClaudePptxMcpSaasServer } from './saas.js';
import { getWorkspaceRoot } from './engine.js';
function valueAfter(args, name, fallback) {
    const index = args.indexOf(name);
    if (index >= 0 && args[index + 1])
        return args[index + 1];
    const prefix = `${name}=`;
    const inline = args.find(arg => arg.startsWith(prefix));
    return inline ? inline.slice(prefix.length) : fallback;
}
function has(args, name) {
    return args.includes(name);
}
function printHelp() {
    process.stdout.write(`claudepptxmcp MCP

Usage:
  claudepptxmcp --local --workspace <dir>
  claudepptxmcp --gateway --endpoint <url> --api-key <key>
  claudepptxmcp-saas --host 127.0.0.1 --port 3333 --storage <dir>

Options:
  --developer-tools       expose claudepptxmcp.internal.* tools
  --allow-code-execution  allow trusted local create_from_code jobs
  --workspace <dir>       local MCP workspace root
  --storage <dir>         SaaS artifact/job storage root
  --api-key <key>         gateway or SaaS API key
`);
}
export function main() {
    return __awaiter(this, arguments, void 0, function* (argv = process.argv.slice(2), saasBinary = false) {
        if (has(argv, '--help') || has(argv, '-h')) {
            printHelp();
            return;
        }
        const options = {
            workspace: valueAfter(argv, '--workspace'),
            storage: valueAfter(argv, '--storage'),
            developerTools: has(argv, '--developer-tools'),
            allowCodeExecution: has(argv, '--allow-code-execution'),
            exposeLocalPaths: has(argv, '--expose-local-paths') || !has(argv, '--no-local-paths'),
            apiKey: valueAfter(argv, '--api-key') || process.env.CLAUDEPPTXMCP_API_KEY,
            remoteEndpoint: valueAfter(argv, '--endpoint'),
        };
        if (saasBinary || has(argv, '--saas')) {
            const host = valueAfter(argv, '--host', '127.0.0.1');
            const port = Number(valueAfter(argv, '--port', '3333'));
            yield startClaudePptxMcpSaasServer(Object.assign(Object.assign({}, options), { host, port }));
            return;
        }
        if (has(argv, '--gateway')) {
            if (!options.remoteEndpoint)
                throw new Error('--gateway requires --endpoint <url>');
            yield startClaudePptxMcpMcpServer(options);
            return;
        }
        getWorkspaceRoot(options);
        yield startClaudePptxMcpMcpServer(options);
    });
}
void main().catch(error => {
    process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map