// One-time operator migration. Preserves the private MCP URL path byte-for-byte
// while changing only its origin; never prints that path or secret values.
import assert from 'node:assert/strict';
import { lstatSync, readFileSync, writeFileSync, openSync, fsyncSync, closeSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const mode = process.argv[2] || '--check';
assert.ok(['--check', '--apply', '--restore'].includes(mode));
const path = fileURLToPath(new URL('../production.env', import.meta.url));
const previous = 'https://betterpptx.tail070c3a.ts.net';
const target = 'https://betterpptx.xmcpx.com';
const stat = lstatSync(path);
assert.ok(stat.isFile() && !stat.isSymbolicLink() && stat.size < 65536);
const source = readFileSync(path, 'utf8');

function one(key, input) {
  const matches = [...input.matchAll(new RegExp(`^${key}=(.*)$`, 'gm'))];
  assert.equal(matches.length, 1, `Expected exactly one ${key}.`);
  return matches[0][1].replace(/\r$/, '');
}
function replaceOne(key, input, value) {
  return input.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
}
const oldBase = one('BETTERPPTX_PUBLIC_BASE', source);
const oldUrl = one('BETTERPPTX_PUBLIC_MCP_URL', source);
const originalUrl = new URL(oldUrl);
assert.equal(originalUrl.protocol, 'https:');
assert.ok(!originalUrl.username && !originalUrl.password);
assert.ok([previous, target].includes(oldBase));
assert.equal(originalUrl.origin, oldBase, 'Public URL and base must share the same current origin.');

if (mode === '--check') {
  console.log(JSON.stringify({ status: 'checked', baseHost: new URL(oldBase).hostname,
    urlHost: originalUrl.hostname, privatePathPrinted: false }));
} else if (mode === '--apply') {
  assert.equal(oldBase, previous, 'Already migrated or unexpected source origin.');
  const suffix = oldUrl.slice(previous.length);
  assert.ok(suffix.startsWith('/'), 'Expected an absolute same-origin MCP URL.');
  let next = replaceOne('BETTERPPTX_PUBLIC_BASE', source, target);
  next = replaceOne('BETTERPPTX_PUBLIC_MCP_URL', next, target + suffix);
  assert.equal(one('BETTERPPTX_PUBLIC_BASE', next), target);
  assert.equal(new URL(one('BETTERPPTX_PUBLIC_MCP_URL', next)).origin, target);
  writeFileSync(path, next, 'utf8');
  const fd = openSync(path, 'r+');
  try { fsyncSync(fd); } finally { closeSync(fd); }
  console.log(JSON.stringify({ status: 'migrated', baseHost: new URL(target).hostname,
    urlHost: new URL(one('BETTERPPTX_PUBLIC_MCP_URL', next)).hostname,
    privatePathPrinted: false }));
} else {
  assert.equal(oldBase, target, 'Restore requires the migrated origin.');
  const suffix = oldUrl.slice(target.length);
  assert.ok(suffix.startsWith('/'));
  let prior = replaceOne('BETTERPPTX_PUBLIC_BASE', source, previous);
  prior = replaceOne('BETTERPPTX_PUBLIC_MCP_URL', prior, previous + suffix);
  writeFileSync(path, prior, 'utf8');
  console.log(JSON.stringify({ status: 'restored', baseHost: new URL(previous).hostname,
    privatePathPrinted: false }));
}
