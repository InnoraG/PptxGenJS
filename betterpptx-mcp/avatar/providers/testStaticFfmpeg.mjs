import * as path from 'node:path'
import { createStillVideoWithAudio } from '../ffmpeg.mjs'

export async function renderTestStaticFfmpeg({ avatarImagePath, audioPath, durationMs, jobDir, fps = 25 } = {}) {
	const rawVideoPath = path.join(jobDir, 'avatar-raw.mp4')
	await createStillVideoWithAudio({
		imagePath: avatarImagePath,
		audioPath,
		outputPath: rawVideoPath,
		durationMs,
		fps,
	})
	return {
		ok: true,
		rawVideoPath,
		durationMs,
		warnings: ['test-static provider creates still video only; it is not lip-sync.'],
	}
}
