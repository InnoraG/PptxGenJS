import { BETTERPPTX_MCP_BRAND } from './showcase.js';
export { BETTERPPTX_MCP_BRAND };
export type JsonValue = null | boolean | number | string | JsonValue[] | {
    [key: string]: JsonValue;
};
export interface ToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: Record<string, unknown>;
    outputSchema?: Record<string, unknown>;
    annotations?: Record<string, unknown>;
}
export interface BetterPptxMcpRuntimeOptions {
    workspace?: string;
    storage?: string;
    developerTools?: boolean;
    allowCodeExecution?: boolean;
    exposeLocalPaths?: boolean;
    apiKey?: string;
    maxUploadBytes?: number;
    jobTimeoutMs?: number;
    remoteEndpoint?: string;
}
export interface PublicArtifact {
    id: string;
    jobId: string;
    kind: string;
    name: string;
    uri: string;
    mimeType: string;
    bytes: number;
    sha256: string;
    description?: string;
    path?: string;
}
export declare function getBetterPptxMcpTools(options?: BetterPptxMcpRuntimeOptions): ToolDefinition[];
export declare function serverInfo(): {
    name: string;
    version: string;
};
export declare function serverInstructions(options?: BetterPptxMcpRuntimeOptions): string;
export declare function callBetterPptxMcpTool(name: string, args?: any, options?: BetterPptxMcpRuntimeOptions): Promise<any>;
export declare function callRemoteBetterPptxMcpTool(name: string, args: any, options: BetterPptxMcpRuntimeOptions): Promise<any>;
export declare function artifactFilePath(artifactId: string, options: BetterPptxMcpRuntimeOptions): string | null;
export declare function listJobManifest(jobId: string, options: BetterPptxMcpRuntimeOptions): any | null;
export declare function getWorkspaceRoot(options: BetterPptxMcpRuntimeOptions): string;
