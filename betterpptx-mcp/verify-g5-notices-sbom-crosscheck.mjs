#!/usr/bin/env node
/**
 * Read-only G5 notices/SBOM cross-check.
 *
 * This validates the machine-readable license/provenance ledgers against the
 * reviewed SBOM and the human notices document. It is not legal approval and
 * cannot enable a product path. Manual version coverage in NOTICES.md remains
 * an explicit result because prose cannot be treated as a version lock.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const rel = (value) => path.relative(repoRoot, value).replaceAll(path.sep, '/');
const paths = {
  notices: path.join(here, 'avatar', 'NOTICES.md'),
  talkingHeadLedger: path.join(here, 'avatar', 'license-ledger.json'),
  modelLock: path.join(here, 'avatar', 'model-provenance-lock.json'),
  native3dLedger: path.join(here, 'avatar', '3d-presenter-license-ledger.json'),
  provenanceReport: path.join(here, 'outputs', 'avatar-worker-provenance-pins-report.json'),
  sbom: path.join(here, 'outputs', 'avatar-worker-sbom.cdx.json'),
  model3dSource: path.join(here, 'deploy', 'model3d-worker', 'model3d_app.py'),
};

const issues = [];
const checks = [];
const check = (id, ok, detail) => {
  checks.push({ id, status: ok ? 'PASS' : 'FAIL', detail });
  if (!ok) issues.push(`${id}: ${detail}`);
};

const readText = async (file) => {
  try {
    return await fs.readFile(file, 'utf8');
  } catch (error) {
    issues.push(`${rel(file)}: ${error instanceof Error ? error.message : String(error)}`);
    return '';
  }
};
const readJson = async (file) => {
  const text = await readText(file);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    issues.push(`${rel(file)}: invalid JSON (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
};

const [notices, talkingHeadLedger, modelLock, native3dLedger, provenance, sbom, model3dSource] = await Promise.all([
  readText(paths.notices),
  readJson(paths.talkingHeadLedger),
  readJson(paths.modelLock),
  readJson(paths.native3dLedger),
  readJson(paths.provenanceReport),
  readJson(paths.sbom),
  readText(paths.model3dSource),
]);

check('notices-file', notices.length > 0, 'avatar/NOTICES.md is readable');
for (const token of [
  'LivePortrait',
  'MuseTalk',
  'OpenCV Zoo YuNet',
  'MediaPipe Face Landmarker',
  'Built with DINOv3',
  'DRTK',
  'PyTorch3D',
  'Meshy → Mixamo',
]) {
	check(`notices-token-${token.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`, notices.includes(token), `NOTICES.md contains ${token}`);
}

const noticesLower = notices.toLowerCase();
check('notices-version-index', notices.includes('### Maintainer version/revision index (private evidence, 2026-08-02)') &&
	noticesLower.includes('exact model/source pins are') && noticesLower.includes('not** legal approval'),
	'NOTICES.md contains the private maintainer version/revision index and its non-clearance boundary');
for (const token of [
	'9b294b3d0536135442ea73cb01e6cb3ca7029dd3',
	'0a89dec45a0192b824e3cf4daf96c239440c5ed8',
	'75fbf0183001ed9876c8dbb35de6b68552ee08bd',
	'6793c6640ff01c8fb389f3993434124bb43d2933',
	'01f9d76f26af04836b813c71c979af64e67741e2',
	'PINNING OPEN',
	'EXCLUDED_FROM_PRODUCTION',
]) {
	check(`notices-version-index-${token.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`, notices.includes(token),
		`version/revision index contains ${token}`);
}
check('mediapipe-image-scope', notices.includes('mediapipe==0.10.11') && notices.includes('mediapipe==0.10.14') &&
	notices.includes('separate model3d-worker image') && notices.includes('separate-image scopes are reconciled'),
	'NOTICES.md distinguishes the MuseTalk avatar-worker and model3d-worker MediaPipe package scopes');

const talkingEntries = Array.isArray(talkingHeadLedger?.entries) ? talkingHeadLedger.entries : [];
check('talking-head-ledger-shape', talkingEntries.length > 0, `${talkingEntries.length} talking-head license entries parsed`);
for (const [index, entry] of talkingEntries.entries()) {
  check(`talking-head-entry-${index + 1}`, Boolean(entry?.id && entry?.license && entry?.commercialStatus && entry?.reviewStatus && entry?.evidence && entry?.obligation),
    `entry ${index + 1} has id, license, status, evidence, and obligation`);
}

const modelArtifacts = Array.isArray(modelLock?.modelArtifacts) ? modelLock.modelArtifacts : [];
const sourceRepos = Array.isArray(modelLock?.sourceRepositories) ? modelLock.sourceRepositories : [];
check('model-lock-shape', modelArtifacts.length > 0 && sourceRepos.length > 0, `${sourceRepos.length} source repos and ${modelArtifacts.length} model artifacts parsed`);
for (const [index, repo] of sourceRepos.entries()) {
  check(`source-repo-pin-${index + 1}`, /^[0-9a-f]{40}$/i.test(String(repo?.observedHead || '')) && Boolean(repo?.repository),
    `source repository ${index + 1} has an immutable observed commit and URL`);
}
for (const [index, artifact] of modelArtifacts.entries()) {
  const files = Array.isArray(artifact?.files) ? artifact.files : [];
  const allFilesPinned = files.length > 0 && files.every((item) => /^[0-9a-f]{64}$/i.test(String(item?.sha256 || '')) && item?.path);
  check(`model-artifact-pin-${index + 1}`, Boolean(artifact?.source && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(String(artifact?.revision || '')) && /^[0-9a-f]{64}$/i.test(String(artifact?.sha256 || '')) && allFilesPinned),
    `model artifact ${index + 1} has source URL, immutable revision, artifact SHA-256, and file pins`);
}

const runtimePins = native3dLedger?.runtimePins || {};
const gitPins = runtimePins.git || {};
const hfPins = runtimePins.huggingFace || {};
check('native3d-runtime-pins', Object.keys(gitPins).length >= 3 && Object.values(gitPins).every((value) => /^[0-9a-f]{40}$/i.test(String(value))) &&
  Object.keys(hfPins).length >= 4 && Object.values(hfPins).every((value) => /^[0-9a-f]{40}$/i.test(String(value))),
  'native-3D runtime Git and model revisions are immutable SHA pins');
const nativeEntries = Array.isArray(native3dLedger?.entries) ? native3dLedger.entries : [];
check('native3d-ledger-entries', nativeEntries.length > 0 && nativeEntries.every((entry) => entry?.id && entry?.license && entry?.evidence && entry?.obligation),
  `${nativeEntries.length} native-3D owner-review entries have license/evidence/obligation fields`);

check('provenance-sbom-report', provenance?.status === 'PASS' && provenance?.sbom?.generated === true && provenance?.sbom?.reviewed === true && provenance?.sbom?.sourceMatchesCurrent === true,
  'avatar worker provenance report says reviewed SBOM is generated and source-matched');
check('sbom-component-inventory', sbom?.bomFormat === 'CycloneDX' && Array.isArray(sbom?.components) && sbom.components.length > 0,
  `CycloneDX SBOM contains ${Array.isArray(sbom?.components) ? sbom.components.length : 0} components`);
check('resale-boundary-source', model3dSource.includes('NON-COMMERCIAL') && model3dSource.includes('DRTK') && model3dSource.includes('EVALUATION-ONLY'),
  'native-3D source retains non-commercial/evaluation-only boundary markers');

const manualVersionCoverageRequired = true;
const report = {
	schemaVersion: 'betterpptx.g5-notices-sbom-crosscheck-report.v1',
	status: issues.length ? 'FAIL' : 'PASS_MACHINE_CROSSCHECK_VERSION_INDEX_REVIEW_OPEN',
  checks,
  issueCount: issues.length,
  issues,
  manualVersionCoverageRequired,
  ownerApprovalNotInferred: true,
  publicEnablementAllowed: false,
};
console.log(JSON.stringify(report, null, 2));
if (issues.length) process.exitCode = 1;
