import * as fs from 'node:fs/promises'
import path from 'node:path'
const sourcePath = path.resolve('betterpptx-mcp/verify-public-tables-family-v1.mjs')
let source = await fs.readFile(sourcePath, 'utf8')
source = source.replace(",autoPage:true,autoPageRepeatHeader:true,autoPageHeaderRows:1,autoPageCharWeight:0.25,autoPageLineWeight:-0.2", '')
await import(`data:text/javascript,${encodeURIComponent(source)}`)
