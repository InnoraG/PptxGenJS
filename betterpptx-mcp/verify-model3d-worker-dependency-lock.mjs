#!/usr/bin/env node
/**
 * Read-only audit of the model3d-worker's Python dependency declarations.
 *
 * This is deliberately not a resolver: the local desktop Python environment
 * is not the Modal Python 3.11 image, so local `pip show` values must not be
 * promoted as worker locks. The audit records exact pins, ranges, and open
 * declarations so G5 cannot silently treat a floating build as immutable.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sourcePath = path.join(here, 'deploy', 'model3d-worker', 'model3d_app.py');
const noticesPath = path.join(here, 'avatar', 'NOTICES.md');
const outputPath = path.join(here, 'outputs', 'model3d-worker-dependency-lock-report.json');

const [source, notices] = await Promise.all([
	fs.readFile(sourcePath, 'utf8'),
	fs.readFile(noticesPath, 'utf8'),
]);

const installLines = source.match(/\.pip_install\(([^\n]+)\)/g) || [];
const declarations = [];
const indexUrls = new Set();
for (const line of installLines) {
	const body = line.slice(line.indexOf('(') + 1, -1);
	for (const indexMatch of body.matchAll(/index_url\s*=\s*(['"])(.*?)\1/g)) indexUrls.add(indexMatch[2]);
	for (const match of body.matchAll(/(['"])(.*?)\1/g)) {
		const requirement = match[2];
		if (!requirement || requirement.startsWith('#') || /^https?:\/\//i.test(requirement)) continue;
		const exact = /(?:===|==)\s*[^,\s]+/.test(requirement);
		const range = /(?:~=|>=|<=|>|<)\s*[^,\s]+/.test(requirement);
		declarations.push({
			requirement,
			status: exact ? 'EXACT_PIN' : range ? 'VERSION_RANGE' : 'UNPINNED',
		});
	}
}

const unique = [...new Map(declarations.map((item) => [item.requirement, item])).values()];
const open = unique.filter((item) => item.status !== 'EXACT_PIN');
const blenderMatch = source.match(/BLENDER_VERSION\s*=\s*["']([^"']+)["']/);
const report = {
	schemaVersion: 'betterpptx.model3d-worker-dependency-lock-report.v1',
	status: open.length === 0 ? 'PASS_EXACT_DECLARATIONS' : 'PASS_DECLARATIONS_RECORDED_OPEN_PINNING',
	scope: 'All Modal model3d-worker image declarations (performer dependency set included); no local desktop environment inference.',
	source: 'betterpptx-mcp/deploy/model3d-worker/model3d_app.py',
	blenderVersion: blenderMatch?.[1] || null,
	indexUrls: [...indexUrls],
	declarations: unique,
	openDeclarations: open,
	noticesIndexPresent: notices.includes('Maintainer version/revision index') && notices.includes('PINNING OPEN'),
	ownerApprovalNotInferred: true,
	publicEnablementAllowed: false,
};

if (!report.noticesIndexPresent) {
	report.status = 'FAIL_NOTICES_INDEX_MISSING';
}

await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (report.status === 'FAIL_NOTICES_INDEX_MISSING') process.exitCode = 1;
