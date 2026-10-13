import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {motionProgramProviderSpecifier} from './motion-program-default-provider.mjs';

const REQUIRED = ['registryRepository', 'evidenceRepository', 'validateMeasurementReceipt'];
const OPTIONAL = ['maxEvidenceBytes', 'cursorTtlMs'];
const unavailable = () => Object.assign(new Error('Candidate discovery is unavailable.'), {code: 'CANDIDATE_UNAVAILABLE'});
function data(object, key) {
  const descriptor = object && Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) throw unavailable();
  return descriptor.value;
}
function methods(object, names) {
  if (!object || typeof object !== 'object' || Array.isArray(object)) throw unavailable();
  for (const name of names) if (typeof data(object, name) !== 'function') throw unavailable();
}

// Composition only: reuse the existing P233 durable repository and evidence
// custody service. This module creates no records, owner scopes or storage.
export function assertMotionCandidateStartupConfiguration(configuration) {
  if (!configuration || Object.getPrototypeOf(configuration) !== Object.prototype) throw unavailable();
  for (const key of Reflect.ownKeys(configuration)) {
    if (typeof key !== 'string' || ![...REQUIRED, ...OPTIONAL].includes(key)) throw unavailable();
    data(configuration, key);
  }
  for (const key of REQUIRED) data(configuration, key);
  methods(configuration.registryRepository, ['ingest', 'get', 'firstPage', 'nextPage', 'pruneExpired']);
  methods(configuration.evidenceRepository, ['lookupMetadata', 'lookupSourceMetadata', 'readBytes']);
  if (typeof configuration.validateMeasurementReceipt !== 'function') throw unavailable();
  if (Object.hasOwn(configuration, 'maxEvidenceBytes') && (!Number.isSafeInteger(configuration.maxEvidenceBytes) || configuration.maxEvidenceBytes < 256 || configuration.maxEvidenceBytes > 1048576)) throw unavailable();
  if (Object.hasOwn(configuration, 'cursorTtlMs') && (!Number.isSafeInteger(configuration.cursorTtlMs) || configuration.cursorTtlMs < 1000 || configuration.cursorTtlMs > 86400000)) throw unavailable();
  return Object.freeze({...configuration});
}

// The same private file-only owner provider may optionally compose P233.
// Its absence leaves discovery unavailable; it never creates a default store.
export async function loadTrustedMotionCandidateStartup(specifier = process.env.BETTERPPTX_MOTION_PREPARATION_PROVIDER_MODULE) {
  specifier=motionProgramProviderSpecifier(specifier);
  if (specifier === undefined || specifier === null) return undefined;
  if (typeof specifier !== 'string' || specifier.length > 4096 || /[\x00-\x1f\x7f]/.test(specifier)) throw unavailable();
  if (specifier.trim() === '') return undefined;
  let url;
  try { url = specifier.startsWith('file:') ? new URL(specifier) : pathToFileURL(path.resolve(specifier)); }
  catch { throw unavailable(); }
  if (url.protocol !== 'file:') throw unavailable();
  try {
    const provider = await import(url.href);
    if (provider.createTrustedMotionCandidateStartup === undefined) return undefined;
    if (typeof provider.createTrustedMotionCandidateStartup !== 'function') throw unavailable();
    return assertMotionCandidateStartupConfiguration(await provider.createTrustedMotionCandidateStartup());
  } catch { throw unavailable(); }
}
