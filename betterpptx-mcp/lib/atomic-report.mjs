import fs from 'node:fs'
import path from 'node:path'

// Evidence readers may run in parallel with evidence producers. Write the
// complete JSON beside the destination, then replace the destination in one
// filesystem operation so readers never observe a partial report.
export function writeJsonReport(filePath, value) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true })
	const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`
	try {
		fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`)
		fs.renameSync(temporaryPath, filePath)
	} finally {
		if (fs.existsSync(temporaryPath)) fs.rmSync(temporaryPath, { force: true })
	}
}
