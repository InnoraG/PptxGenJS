#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const pluginRoot = new URL('../chatgpt-plugin/', import.meta.url)
const read = async path => readFile(new URL(path, pluginRoot), 'utf8')
const manifest = JSON.parse(await read('plugin.json'))
const legacy = JSON.parse(await read('.codex-plugin/plugin.json'))
const appMap = JSON.parse(await read('.app.json'))
const skill = await read('skills/betterpptx/SKILL.md')
const config = await read('skills/betterpptx/agents/openai.yaml')

assert.match(manifest.version, /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/)
assert.equal(manifest.version, legacy.version, 'portable and compatibility plugin versions must match')
assert.equal(manifest.name, legacy.name, 'portable and compatibility plugin identities must match')
assert.equal(manifest.author?.name, 'xMCPx.com', 'portable manifest must display the xMCPx.com developer identity')
assert.equal(manifest.extensions?.['com.openai']?.interface?.developerName, 'xMCPx.com', 'portable interface must display the xMCPx.com developer identity')
assert.equal(legacy.author?.name, manifest.author?.name, 'compatibility manifest author must match the portable manifest')
assert.equal(legacy.interface?.developerName, manifest.extensions?.['com.openai']?.interface?.developerName, 'compatibility interface developer must match the portable manifest')
assert.equal(manifest.skills, './skills/', 'portable manifest must expose the bundled skills')
assert.equal(legacy.skills, './skills/', 'compatibility manifest must expose the bundled skills')
assert.equal(manifest.extensions?.['com.openai']?.apps, './.app.json')
assert.deepEqual(manifest.extensions?.['com.openai']?.interface?.capabilities, ['Read', 'Write'], 'plugin presentation must advertise its read and write support')
assert.deepEqual(legacy.interface?.capabilities, ['Read', 'Write'], 'compatibility manifest must advertise the same capabilities')
assert.ok(appMap.apps?.[manifest.name]?.id, 'existing registered app mapping must be present')
assert.match(skill, /^---\r?\nname: betterpptx\r?\n/m)
assert.match(skill, /description: Use for PowerPoint or slide-deck creation, revision, or delivery when the user selects BetterPPTX/)
assert.match(skill, /native narration, WebVTT captions, purposeful object motion, autoplay/)
assert.match(skill, /Simple editable decks are supported too/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /Go beyond basic text-box-and-image decks/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /advanced gradients, textures and effects/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /SmartArt, charts, tables and equations/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /It also gives AI a native reconstruction path/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /rebuilding ordinary visual layers as genuine PowerPoint objects/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /traditional widescreen or 9:16 vertical decks/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /True media stays media/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /Choose only what serves the story/)
assert.match(manifest.extensions?.['com.openai']?.interface?.longDescription || '', /The result is the \.pptx itself: editable, dynamic/)
assert.equal(manifest.extensions?.['com.openai']?.interface?.shortDescription, legacy.interface?.shortDescription)
assert.match(skill, /If general slide-making instructions are also loaded/)
assert.match(config, /allow_implicit_invocation: true/)
assert.match(config, /- "CHAT"/)
assert.match(config, /type: "mcp"/)
assert.match(config, /url: "https:\/\/betterpptx\.xmcpx\.com\/mcp"/)

console.log(JSON.stringify({
	status: 'PACKAGE_PASS_RUNTIME_UNVERIFIED',
	pluginVersion: manifest.version,
	bundledSkill: 'betterpptx',
	chatImplicitInvocationConfigured: true,
	chatRuntimeActivation: 'NOT_TESTED_BY_THIS_SCRIPT',
}))
