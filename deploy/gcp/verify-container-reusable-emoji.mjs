// Packaging regression for the reusable animated emoji catalogue.
// Read on stdin by node inside the CI container; this is not live-client proof.
// It proves only that the image carries the exact registered sources and that
// the source-bound registry loads from them.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
const assets = '/app/betterpptx-mcp/assets';
const sha256 = data => createHash('sha256').update(data).digest('hex');
// Registry identities of the locally qualified catalogue (55 hand gestures =
// 102 physical hand selections, plus 70 faces).
const registries = [
 ['approved-hand-motions/catalog.json', '9bd020a42717381779e2b861d196bb43537c6bd634de258552f55e653de258bc', 102],
 ['approved-face-motions/catalog.json', null, 70],
];
const pinned = [
 ['approved-hand-motions/handshake-approved.glb', '9704e1a8c11eba95a8bf76fa7c243673e525136f091282042e7653cf31f3ef11', 2441796],
 ['approved-face-motions/face-expressions.glb', '47c2e02095b818cab89b1089fe354634db2f0cabf04394dc96ab7780c0a1781f', 15645260],
];
for (const [file, hash, bytes] of pinned) {
 const data = fs.readFileSync(`${assets}/${file}`);
 assert.equal(data.length, bytes, `${file} size`);
 assert.equal(sha256(data), hash, `${file} sha256`);
}
let bankBytes = 0;
const banks = new Set();
for (const [file, hash, count] of registries) {
 const raw = fs.readFileSync(`${assets}/${file}`);
 if (hash) assert.equal(sha256(raw), hash, `${file} sha256`);
 const dir = file.slice(0, file.lastIndexOf('/'));
 const {entries} = JSON.parse(raw);
 assert.equal(entries.length, count, `${file} entries`);
 for (const entry of entries) {
  const bank = `${dir}/${entry.glbFile}`;
  if (banks.has(bank)) continue;
  const data = fs.readFileSync(`${assets}/${bank}`);
  assert.equal(data.length, entry.bytes, `${bank} size`);
  assert.equal(sha256(data), entry.sourceSha256, `${bank} sha256`);
  banks.add(bank);
  bankBytes += data.length;
 }
}
const {reusableAnimatedModelCatalogEntries} = await import(`${assets}/reusable-animated-model-library.mjs`);
const entries = reusableAnimatedModelCatalogEntries();
assert.equal(entries.length, 172);
assert.equal(entries.filter(e => e.source === 'betterpptx-face-motions').length, 70);
assert.equal(entries.filter(e => e.source === 'betterpptx-emoji-motions').length, 102);
assert.equal(entries.filter(e => e.reusableMotion.id === 'motion.hand.handshake-approved').length, 1);
console.log(JSON.stringify({status: 'PASS_REUSABLE_EMOJI_SOURCES_PACKAGED', selections: entries.length, banks: banks.size, bankBytes}));
