import assert from 'node:assert/strict'
import test from 'node:test'
import { listOptionCatalog, validateMediaFormatOptions, validatePublicMediaFormatOptions, MEDIA_FORMAT_EXTENSIONS, MEDIA_FORMAT_PARAMETERS, MEDIA_FORMAT_SCHEMA_PROPERTIES, MEDIA_FORMAT_TYPES, MEDIA_FORMAT_SIZING_TYPES } from '../option-registry.mjs'
import { TOOLS } from '../tools.mjs'

test('media playback catalog exposes all native extended controls', () => {
	const catalog = listOptionCatalog({ surface: 'mediaPlayback', format: 'full' })
	assert.equal(catalog.count, 1)
	assert.equal(catalog.surfaces[0].id, 'mediaPlayback')
	assert.deepEqual(MEDIA_FORMAT_TYPES, ['audio', 'video', 'online'])
	assert.deepEqual(MEDIA_FORMAT_SIZING_TYPES, ['contain', 'cover', 'crop'])
	assert.equal(MEDIA_FORMAT_PARAMETERS.length, 12)
	assert.deepEqual(MEDIA_FORMAT_EXTENSIONS.audio, ['mp3', 'm4a', 'wav', 'ogg', 'wma'])
	assert.deepEqual(MEDIA_FORMAT_EXTENSIONS.video, ['mp4', 'm4v', 'mov', 'webm', 'wmv'])
	assert.deepEqual(Object.keys(MEDIA_FORMAT_SCHEMA_PROPERTIES), MEDIA_FORMAT_PARAMETERS.map(item => item.id))
	assert.deepEqual(catalog.surfaces[0].parameters.map(item => item.id), MEDIA_FORMAT_PARAMETERS.map(item => item.id))
})

test('media controls validate ranges, WebVTT tracks, and reject private caption paths', () => {
	const normalized = validateMediaFormatOptions({
		type: 'VIDEO',
		transparency: 12.5,
		mediaVolume: 65000,
		sizing: { type: 'cover', w: 8, h: 4.5 },
		closedCaptionTracks: [{ language: 'en_US', label: 'English', vtt: 'WEBVTT', default: true }],
	})
	assert.equal(normalized.type, 'video')
	assert.equal(normalized.closedCaptionTracks[0].language, 'en-US')
	assert.throws(() => validateMediaFormatOptions({ transparency: 100.1 }), /between 0 and 100/)
	assert.throws(() => validateMediaFormatOptions({ mediaVolume: 100001 }), /between 0 and 100000/)
	assert.throws(() => validateMediaFormatOptions({ closedCaptionTracks: [{ language: 'en-US', path: 'private.vtt' }] }), /data\/path inputs are maintainer-only/)
})

test('public media options reject drift and normalize a type-safe extension', () => {
	assert.deepEqual(validatePublicMediaFormatOptions({ type: 'AUDIO', extn: '.MP3?download=1', path: 'asset://locked/audio/example' }), {
		type: 'audio', extn: 'mp3', path: 'asset://locked/audio/example',
	})
	assert.throws(() => validatePublicMediaFormatOptions({ type: 'video', extn: 'mp3' }), /supported video extension/)
	assert.throws(() => validatePublicMediaFormatOptions({ type: 'audio', unknownLeaf: true }), /not part of the public media contract/)
})

test('add/update media tool schemas are generated from the same typed parameter catalog', () => {
	const add = TOOLS.find(tool => tool.name === 'betterpptx.slide.add_media')
	const update = TOOLS.find(tool => tool.name === 'betterpptx.slide.update_media')
	for (const schema of [add.inputSchema.properties.options, update.inputSchema.properties.optionsPatch]) {
		assert.equal(schema.additionalProperties, false)
		for (const id of MEDIA_FORMAT_PARAMETERS.map(item => item.id).filter(id => id !== 'source')) assert.ok(schema.properties[id], id)
	}
	assert.deepEqual(add.inputSchema.properties.options.properties.type.enum, MEDIA_FORMAT_TYPES)
	assert.deepEqual(update.inputSchema.properties.optionsPatch.properties.type.enum, MEDIA_FORMAT_TYPES)
	assert.match(update.inputSchema.properties.command.oneOf[1].pattern, /playFrom/)
	assert.equal(update.inputSchema.properties.command.oneOf[0].type, 'null')
})
