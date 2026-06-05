import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { narrationOutDir, writeToneWav, hashText } from '../audio.mjs'

export function createToneProvider() {
	return {
		name: 'tone',
		async listVoices() {
			return [{ id: 'test-tone', language: 'test', quality: 'synthetic' }]
		},
		async synthesize(req) {
			if (String(process.env.BETTERPPTX_NARRATION_MODE || 'development').toLowerCase() === 'production') {
				throw new Error('The tone provider is only available outside production mode.')
			}
			const textHash = hashText(req.text || '')
			const words = String(req.text || '').trim().split(/\s+/).filter(Boolean).length
			const seconds = Math.min(20, Math.max(1.1, 0.55 + words * 0.22))
			const filePath = path.join(narrationOutDir(), `tone-${textHash.slice(0, 10)}.wav`)
			writeToneWav(filePath, seconds, 440 + (parseInt(textHash.slice(0, 2), 16) % 220))
			return {
				wav: await fs.readFile(filePath),
				sampleRate: 22050,
				channels: 1,
				bitsPerSample: 16,
				voice: { id: 'test-tone', language: 'test', quality: 'synthetic' },
			}
		},
	}
}
