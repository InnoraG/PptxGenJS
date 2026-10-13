/** Private startup capabilities. Existing stores supply all records and custody. */
export interface MotionCandidateStartupConfiguration {
  registryRepository: {
    ingest(owner: unknown, evidence: unknown): Promise<unknown>;
    get(owner: unknown, candidateId: string): Promise<unknown>;
    firstPage(owner: unknown, query: unknown): Promise<unknown>;
    nextPage(owner: unknown, query: unknown): Promise<unknown>;
    pruneExpired(owner: unknown, now: number): Promise<unknown>;
  };
  evidenceRepository: {
    lookupMetadata(resourceId: string): Promise<unknown>;
    lookupSourceMetadata(resourceId: string): Promise<unknown>;
    readBytes(metadata: unknown, bounds: {maxBytes: number}): Promise<Uint8Array>;
  };
  validateMeasurementReceipt(evidence: unknown, metadata: unknown, source: unknown, owner: unknown): Promise<boolean>;
  maxEvidenceBytes?: number;
  cursorTtlMs?: number;
}
export function assertMotionCandidateStartupConfiguration(configuration: unknown): Readonly<MotionCandidateStartupConfiguration>;
export function loadTrustedMotionCandidateStartup(specifier?: string): Promise<Readonly<MotionCandidateStartupConfiguration> | undefined>;
