import type { MotionOwner, PreparedMotionEntry } from './motion-preparation-runtime.d.ts';

export interface MotionAssetGrants {
  assertAccess(handle: string): Promise<string>;
  assertBytesSync(handle: string, bytes: Uint8Array): Uint8Array;
  produce(input: { operation: unknown; source: 'owned-derivation'; requireReady: true }, callback: (receipt: { capture(handle: string, bytes: Uint8Array): string }) => Promise<{ ok: true }>): Promise<{ ok: true } | null>;
}

export function createGeneratedMotionPreparationCache(input: {
  currentResourceOwner(): MotionOwner;
  assetGrants: MotionAssetGrants;
  getCached(hash: string): unknown;
  getStaged(hash: string): unknown;
  hydrate(hash: string, tenant: string): Promise<unknown>;
  registerLocal(input: { glbBase64: string; glbBytes: number; manifest: unknown; basisKey: string }): { hash: string; handle: string };
  persist(hash: string, tenant: string): Promise<{ ok: boolean }>;
  bundleBytes(entry: unknown): Uint8Array;
  produceOutput(input: { operation: unknown; handle: string; bytes: Uint8Array }): Promise<boolean>;
}): Readonly<{
  getVerifiedOutput(input: { plan: unknown; owner: MotionOwner }): Promise<{prepared:PreparedMotionEntry;modelAsset:string} | null>;
  getVerified(input: { plan: unknown; owner: MotionOwner }): Promise<PreparedMotionEntry | null>;
  storeProduced(input: { plan: unknown; owner: MotionOwner; operation: unknown; output: unknown }): Promise<PreparedMotionEntry>;
  verifyReadback(input: { prepared: unknown; plan: unknown; owner: MotionOwner }): Promise<boolean>;
  readVerifiedBytes(input: { prepared: PreparedMotionEntry; plan: unknown; owner: MotionOwner }): Promise<Uint8Array>;
  readVerifiedModelAsset(input: { prepared: PreparedMotionEntry; plan: unknown; owner: MotionOwner }): Promise<string>;
}>;
