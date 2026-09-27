import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const apiKey = String(process.env.DID_API_KEY || '').trim()
if (!apiKey || !apiKey.includes(':')) throw new Error('DID_API_KEY must be supplied only through the process environment.')
const [username, password] = apiKey.split(':', 2)
if (!username || !password) throw new Error('DID_API_KEY is malformed.')
const auth = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
const base = 'https://api.d-id.com'
const imagePath = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/consented-head-talker-face-crop-long.png')
const audioPath = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/narration/tts-en_US-ljspeech-high-mriud6ct-25c5632f.wav')
const outputPath = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/avatar-motion-consented-long-did-talk.mp4')
const reportPath = path.resolve('D:/PptxGenJS_Claude/betterpptx-mcp/outputs/avatar-motion-consented-long-did-report.json')

async function request(url, options = {}) {
	let response
	let lastError
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			response = await fetch(`${base}${url}`, {
				...options,
				headers: { Authorization: auth, Accept: 'application/json', ...(options.headers || {}) },
			})
			break
		} catch (error) {
			lastError = error
			if (attempt === 3) throw lastError
			await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)))
		}
	}
	const contentType = response.headers.get('content-type') || ''
	const body = contentType.includes('json') ? await response.json() : await response.text()
	if (!response.ok) {
		const detail = typeof body === 'string' ? body.slice(0, 240) : JSON.stringify(body).slice(0, 240)
		throw new Error(`D-ID ${response.status}: ${detail}`)
	}
	return { response, body }
}

async function deleteQuietly(endpoint) {
	try { await request(endpoint, { method: 'DELETE' }); return true } catch { return false }
}

const sourceHash = crypto.createHash('sha256').update(await fs.readFile(imagePath)).digest('hex')
const audioHash = crypto.createHash('sha256').update(await fs.readFile(audioPath)).digest('hex')
const report = {
	provider: 'D-ID',
	product: 'Talks photo avatar API (V2-equivalent image-to-talking-head lane)',
	sourceImageSha256: sourceHash,
	audioSha256: audioHash,
	startedAt: new Date().toISOString(),
	cleanup: {},
}

async function persistReport() {
	await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
}

// A read-only account capability probe avoids spending credits if the supplied
// credential is invalid. The V4 Expressives endpoint requires a pre-created
// avatar_id; arbitrary still images are tested through the image-compatible Talks lane.
const capability = await request('/expressives/avatars?limit=1')
report.capabilityStatus = capability.response.status
report.expressiveAvatarAvailable = Array.isArray(capability.body?.avatars) ? capability.body.avatars.length > 0 : Boolean(capability.body?.data?.length)

const imageForm = new FormData()
imageForm.append('image', new Blob([await fs.readFile(imagePath)], { type: 'image/png' }), 'consented-head-talker-face-crop-long.png')
const uploadedImage = await request('/images', { method: 'POST', body: imageForm })
const imageUrl = String(uploadedImage.body?.url || uploadedImage.body?.image_url || uploadedImage.body?.source_url || '')
const imageId = String(uploadedImage.body?.id || '')
if (!imageUrl) throw new Error('D-ID image upload returned no temporary URL.')

const audioForm = new FormData()
audioForm.append('audio', new Blob([await fs.readFile(audioPath)], { type: 'audio/wav' }), 'narration.wav')
const uploadedAudio = await request('/audios', { method: 'POST', body: audioForm })
const audioUrl = String(uploadedAudio.body?.url || uploadedAudio.body?.audio_url || uploadedAudio.body?.source_url || '')
const audioId = String(uploadedAudio.body?.id || '')
if (!audioUrl) throw new Error('D-ID audio upload returned no temporary URL.')

const created = await request('/talks', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		source_url: imageUrl,
		script: { type: 'audio', audio_url: audioUrl },
		name: 'betterpptx-consented-head-talker-comparison',
		persist: false,
	}),
})
const talkId = String(created.body?.id || created.body?.talk_id || '')
if (!talkId) throw new Error('D-ID talk creation returned no id.')
report.talkId = talkId
report.createdStatus = created.response.status
await persistReport()

let completed = null
for (let attempt = 0; attempt < 60; attempt++) {
	const polled = await request(`/talks/${encodeURIComponent(talkId)}`)
	const state = String(polled.body?.status || '').toLowerCase()
	if (['done', 'completed', 'finished'].includes(state) || polled.body?.result_url) { completed = polled.body; break }
	if (['error', 'failed', 'rejected'].includes(state)) throw new Error(`D-ID talk failed: ${JSON.stringify(polled.body).slice(0, 500)}`)
	await new Promise(resolve => setTimeout(resolve, 5000))
}
if (!completed) throw new Error('D-ID talk did not complete within the polling window.')
const resultUrl = String(completed.result_url || completed.video_url || '')
if (!resultUrl) throw new Error('D-ID talk completed without a result URL.')
const media = await fetch(resultUrl, { headers: { Accept: 'video/mp4,video/*' } })
if (!media.ok) throw new Error(`D-ID result download failed: ${media.status}`)
await fs.writeFile(outputPath, Buffer.from(await media.arrayBuffer()))
const outputHash = crypto.createHash('sha256').update(await fs.readFile(outputPath)).digest('hex')
report.status = 'completed'
report.outputPath = outputPath
report.outputSha256 = outputHash
report.outputBytes = (await fs.stat(outputPath)).size
report.completedAt = new Date().toISOString()
// Remove temporary source uploads and the completed talk after downloading so the
// provider does not retain this consented test asset longer than necessary.
if (imageId) report.cleanup.imageDeleted = await deleteQuietly(`/images/${encodeURIComponent(imageId)}`)
if (audioId) report.cleanup.audioDeleted = await deleteQuietly(`/audios/${encodeURIComponent(audioId)}`)
report.cleanup.talkDeleted = await deleteQuietly(`/talks/${encodeURIComponent(talkId)}`)
await persistReport()
console.log(JSON.stringify({ ok: true, status: report.status, capabilityStatus: report.capabilityStatus, createdStatus: report.createdStatus, outputBytes: report.outputBytes, outputSha256: report.outputSha256, cleanup: report.cleanup }))
