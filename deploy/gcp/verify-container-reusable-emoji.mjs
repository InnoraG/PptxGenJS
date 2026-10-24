// Packaging regression for the reusable animated emoji catalogue.
// Read on stdin by node inside the CI container; this is not live-client proof.
// It proves only that the image carries the exact registered sources and that
// the source-bound registry loads from them.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const assets = '/app/betterpptx-mcp/assets';
const expected = [
 ['approved-hand-motions/handshake-approved.glb', '9704e1a8c11eba95a8bf76fa7c243673e525136f091282042e7653cf31f3ef11', 2441796],
 ['approved-face-motions/face-expressions.glb', '47c2e02095b818cab89b1089fe354634db2f0cabf04394dc96ab7780c0a1781f', 15645260],
];
for (const [file, sha256, bytes] of expected) {
 const data = fs.readFileSync(`${assets}/${file}`);
 assert.equal(data.length, bytes, `${file} size`);
 assert.equal(createHash('sha256').update(data).digest('hex'), sha256, `${file} sha256`);
}
const {reusableAnimatedModelCatalogEntries} = await import(`${assets}/reusable-animated-model-library.mjs`);
const entries = reusableAnimatedModelCatalogEntries();
assert.equal(entries.length, 71);
assert.equal(entries.filter(e => e.source === 'betterpptx-face-motions').length, 70);
assert.equal(entries.filter(e => e.reusableMotion.id === 'motion.hand.handshake-approved').length, 1);
console.log(JSON.stringify({status: 'PASS_REUSABLE_EMOJI_SOURCES_PACKAGED', selections: entries.length}));
