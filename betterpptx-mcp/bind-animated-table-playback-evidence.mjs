import { createHash } from 'node:crypto'
import { readFile, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const proofPath = path.join(here, 'evidence', 'authoring-augmentation', 'animated-table-v1', 'release-qualification.json')
const indexPath = path.join(here, 'public-authoring-environment', 'gallery', 'gallery-index.v1.json')
const hashFile = async file => createHash('sha256').update(await readFile(file)).digest('hex')
const resolveProofPath = value => path.join(here, value)

const proof = JSON.parse(await readFile(proofPath, 'utf8'))
const index = JSON.parse(await readFile(indexPath, 'utf8'))
const artifactPath = resolveProofPath(proof.galleryArtifact.path)
const artifactStat = await stat(artifactPath)
const artifactSha256 = await hashFile(artifactPath)
if (artifactSha256 !== proof.galleryArtifact.sha256 || artifactStat.size !== proof.galleryArtifact.bytes) {
	throw new Error('Animated-table playback proof does not match the current gallery artifact.')
}
for (const frame of [proof.galleryArtifact.playback.before, proof.galleryArtifact.playback.after]) {
	if (await hashFile(resolveProofPath(frame.path)) !== frame.sha256) {
		throw new Error(`Animated-table playback frame does not match its proof: ${frame.path}`)
	}
}
if (proof.galleryArtifact.playback.pass !== true) throw new Error('Animated-table playback proof is not passing.')

const sample = index.samples.find(item => item.id === 'animated-table-synergy')
if (!sample) throw new Error('Animated-table gallery sample is missing.')
if (sample.artifactSha256 !== artifactSha256) throw new Error('Gallery index is not bound to the qualified animated-table artifact.')
sample.qualification.playbackEvidence = {
	proof: '../../evidence/authoring-augmentation/animated-table-v1/release-qualification.json',
	powerpointVersion: proof.powerpointVersion,
	changedFraction: proof.galleryArtifact.playback.changedFraction,
	artifactSha256,
}
sample.qualification.reviewed.playbackReviewed = true
sample.motionSample = {
	type: 'paired-keyframes',
	before: '../../evidence/authoring-augmentation/animated-table-v1/table-before.png',
	after: '../../evidence/authoring-augmentation/animated-table-v1/table-after-800ms.png',
	elapsedMs: 800,
}
sample.knownLimitations = ['Playback proof is release qualification for the exact artifact hash, not a preview of a user deck.']
await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8')
console.log(JSON.stringify({ status: 'PASS', artifactSha256, changedFraction: proof.galleryArtifact.playback.changedFraction }, null, 2))
