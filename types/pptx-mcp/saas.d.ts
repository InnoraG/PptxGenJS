import * as http from 'http';
import { BetterPptxMcpRuntimeOptions } from './engine.js';
interface SaasOptions extends BetterPptxMcpRuntimeOptions {
    host?: string;
    port?: number;
}
export declare function startBetterPptxMcpSaasServer(options?: SaasOptions): Promise<http.Server>;
export {};
