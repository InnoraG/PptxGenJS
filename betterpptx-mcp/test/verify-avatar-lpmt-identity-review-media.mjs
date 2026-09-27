import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('betterpptx-mcp')
const packet = path.resolve(process.argv[2] || path.join(root, 'outputs', 'visualizations', 'avatar-lpmt-identity-review.html'))
const output = path.resolve(process.argv[3] || path.join(root, 'outputs', 'avatar-identity-review-media-audit.json'))
const html = await fs.readFile(packet, 'utf8')
const dataUrls = [...html.matchAll(/src="data:([^"\s]+)"/g)].map(match => {
  const [mime, encoded] = match[1].split(';base64,')
  return { mime, encodedBytes: encoded ? Buffer.from(encoded, 'base64').length : 0 }
})
const imageUrls = dataUrls.filter(item => item.mime === 'image/png')
const videoUrls = dataUrls.filter(item => item.mime === 'video/mp4')
const cardCount = (html.match(/<article class="card">/g) || []).length
const report = {
  schemaVersion: 'betterpptx.avatar.identity-review-media-audit.v1',
  status: imageUrls.length === 1 && videoUrls.length === 5 && cardCount === 6 && dataUrls.every(item => item.encodedBytes > 0) ? 'PASS' : 'FAIL',
  packet,
  cardCount,
  embeddedDataUrlCount: dataUrls.length,
  embeddedImageCount: imageUrls.length,
  embeddedVideoCount: videoUrls.length,
  payloadBytes: dataUrls.reduce((sum, item) => sum + item.encodedBytes, 0),
  media: dataUrls,
  noExternalMediaReferences: !/src="https?:\/\//i.test(html),
}
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS' || !report.noExternalMediaReferences) process.exitCode = 1
