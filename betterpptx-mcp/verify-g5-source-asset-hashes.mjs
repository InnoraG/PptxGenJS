#!/usr/bin/env node
/**
 * Read-only G5 source-row hash verifier.
 *
 * This proves that the owner-maintainer source FBX files recorded in the
 * hash manifest still exist with the measured bytes. It does not approve
 * licensing, authorize distribution, or make raw source files shippable.
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const manifestPath = path.join(
  here,
  'docs',
  'release-safety',
  'G5-SOURCE-ASSET-HASH-MANIFEST-20260802.json',
);

const fail = (message) => {
  const report = {
    schemaVersion: 'betterpptx.g5-source-asset-hash-report.v1',
    status: 'FAIL',
    manifest: path.relative(repoRoot, manifestPath).replaceAll(path.sep, '/'),
    ownerApprovalNotInferred: true,
    issues: [message],
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = 1;
};

let manifest;
try {
  manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
} catch (error) {
  fail(`manifest-read:${error instanceof Error ? error.message : String(error)}`);
}

if (!manifest || manifest.schemaVersion !== 'betterpptx.g5-source-asset-hash-manifest.v1') {
  fail('manifest-schema: expected betterpptx.g5-source-asset-hash-manifest.v1');
}

const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
if (!entries.length) fail('manifest-entries: at least one source entry is required');

const issues = [];
const checked = [];
for (const [index, entry] of entries.entries()) {
  const rel = typeof entry?.path === 'string' ? entry.path : '';
  if (!rel || path.isAbsolute(rel) || rel.includes('\\') || !rel.toLowerCase().endsWith('.fbx')) {
    issues.push(`entry-${index}: invalid relative FBX path`);
    continue;
  }
  const abs = path.resolve(repoRoot, rel);
  const relativeBack = path.relative(repoRoot, abs);
  if (relativeBack.startsWith('..') || path.isAbsolute(relativeBack)) {
    issues.push(`entry-${index}: path escapes repository root`);
    continue;
  }
  if (rel.startsWith('betterpptx-mcp/assets/') || rel.startsWith('betterpptx-mcp/outputs/')) {
    issues.push(`entry-${index}: raw source manifest points at a product/output path`);
    continue;
  }
  try {
    const stat = await fs.stat(abs);
    if (!stat.isFile()) {
      issues.push(`${rel}: not a regular file`);
      continue;
    }
    const digest = crypto.createHash('sha256');
    const bytes = await fs.readFile(abs);
    digest.update(bytes);
    const sha256 = digest.digest('hex');
    if (stat.size !== entry.bytes) issues.push(`${rel}: bytes expected ${entry.bytes}, observed ${stat.size}`);
    if (sha256 !== String(entry.sha256).toLowerCase()) issues.push(`${rel}: sha256 mismatch`);
    checked.push({ path: rel, bytes: stat.size, sha256 });
  } catch (error) {
    issues.push(`${rel}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const report = {
  schemaVersion: 'betterpptx.g5-source-asset-hash-report.v1',
  status: issues.length ? 'FAIL' : 'PASS',
  manifest: path.relative(repoRoot, manifestPath).replaceAll(path.sep, '/'),
  measuredAt: manifest.measuredAt,
  hashAlgorithm: manifest.hashAlgorithm,
  scope: manifest.scope,
  checked: checked.length,
  declared: entries.length,
  issues,
  ownerApprovalNotInferred: true,
  publicEnablementAllowed: false,
};
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
