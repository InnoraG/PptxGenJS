import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

const root = path.resolve('betterpptx-mcp')
const visualDir = path.join(root, 'outputs', 'visualizations')
const primary = path.resolve(process.argv[2] || path.join(visualDir, 'avatar-presenter-progress.html'))
const rendered = path.resolve(process.argv[3] || path.join(visualDir, 'avatar-presenter-progress-rendered.html'))
const output = path.resolve(process.argv[4] || path.join(visualDir, 'avatar-presenter-progress-link-audit.json'))

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const readLinks = async file => {
  const html = await fs.readFile(file, 'utf8')
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])
  const local = hrefs.filter(href => !/^(?:https?:|#|mailto:|data:)/i.test(href))
  const missing = []
  for (const href of local) {
    const withoutFragment = href.split('#', 1)[0]
    if (!withoutFragment) continue
    const target = path.resolve(path.dirname(file), withoutFragment)
    try { await fs.stat(target) } catch { missing.push({ href, target }) }
  }
  return { hrefCount: hrefs.length, localLinkCount: local.length, missing }
}

const [primaryBytes, renderedBytes, primaryLinks, renderedLinks] = await Promise.all([
  fs.readFile(primary),
  fs.readFile(rendered),
  readLinks(primary),
  readLinks(rendered),
])
const report = {
  schemaVersion: 'betterpptx.avatar.presenter-progress-link-audit.v1',
  status: primaryLinks.missing.length === 0 && renderedLinks.missing.length === 0 && primaryBytes.equals(renderedBytes) ? 'PASS' : 'FAIL',
  primary,
  rendered,
  primarySha256: sha256(primaryBytes),
  renderedSha256: sha256(renderedBytes),
  trackerCopiesIdentical: primaryBytes.equals(renderedBytes),
  primaryLinks,
  renderedLinks,
  generatedAt: new Date().toISOString(),
}
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report, null, 2))
if (report.status !== 'PASS') process.exitCode = 1
