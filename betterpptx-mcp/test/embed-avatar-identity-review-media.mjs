import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve('D:/PptxGenJS_Claude')
const htmlPath = path.join(root, 'betterpptx-mcp', 'outputs', 'visualizations', 'avatar-identity-quality-review.html')
const assetRoot = path.join(root, 'betterpptx-mcp', 'outputs')
const mimeByExt = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.mp4': 'video/mp4' }
let html = await fs.readFile(htmlPath, 'utf8')
const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]).filter(value => !value.startsWith('data:')))]
const embedded = []
for (const asset of assets) {
	const fileName = path.basename(asset)
	const filePath = path.join(assetRoot, fileName)
	const bytes = await fs.readFile(filePath)
	const mime = mimeByExt[path.extname(fileName).toLowerCase()]
	if (!mime) throw new Error(`Unsupported identity-review media: ${fileName}`)
	const dataUri = `data:${mime};base64,${bytes.toString('base64')}`
	html = html.replaceAll(`"${asset}"`, `"${dataUri}"`)
	embedded.push({ fileName, bytes: bytes.length, mime })
}
await fs.writeFile(htmlPath, html, 'utf8')
console.log(JSON.stringify({ ok: true, htmlPath, embedded, bytes: Buffer.byteLength(html) }, null, 2))
