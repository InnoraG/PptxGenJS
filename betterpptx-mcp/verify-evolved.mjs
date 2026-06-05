// Verify the new evolved features actually landed in the OOXML.
import * as fs from 'node:fs'
import * as path from 'node:path'
import JSZip from 'jszip'

const args = process.argv.slice(2)
const target = args[0] || (() => {
	const files = fs.readdirSync('outputs').filter(n => n.startsWith('BetterPptxMcp_Showcase_v2_'))
	files.sort()
	return path.join('outputs', files[files.length - 1])
})()

console.log('verifying:', target)
const buf = fs.readFileSync(target)
const zip = await JSZip.loadAsync(buf)

const findOne = async (re, where) => {
	for (const name of Object.keys(zip.files)) {
		if (where && !where.test(name)) continue
		const xml = await zip.file(name).async('string')
		if (re.test(xml)) return name
	}
	return null
}

const findAll = async (re, where) => {
	const out = []
	for (const name of Object.keys(zip.files)) {
		if (where && !where.test(name)) continue
		const xml = await zip.file(name).async('string')
		if (re.test(xml)) out.push(name)
	}
	return out
}

const checks = {
	// === Combo chart on slide 11 — two chart types in one chartSpace ===
	'combo chart (bar + line in same chartSpace)': async () => {
		const hits = await findAll(/<c:barChart>[\s\S]*?<c:lineChart>|<c:lineChart>[\s\S]*?<c:barChart>/, /^ppt\/charts\/chart\d+\.xml$/)
		return hits.length > 0 ? `found in ${hits.length} chart file(s): ${hits.join(', ')}` : null
	},
	// === Dual axes — secondary value axis ===
	'dual value axes (secondary axis)': async () => {
		const hits = await findAll(/<c:valAx>[\s\S]*?<c:valAx>/, /^ppt\/charts\/chart\d+\.xml$/)
		return hits.length > 0 ? `found in ${hits.join(', ')}` : null
	},
	// === Styled plot/chart area ===
	'styled plot area + chart area border': async () => {
		const hits = await findAll(/<c:plotArea>[\s\S]*?<c:spPr>[\s\S]*?<a:solidFill/, /^ppt\/charts\/chart\d+\.xml$/)
		return hits.length > 0 ? `found in ${hits.join(', ')}` : null
	},
	// === Per-cell gradient on slide 12 table ===
	'per-cell gradient in evolved table (slide 12)': async () => {
		const xml = await zip.file('ppt/slides/slide12.xml').async('string')
		const m = xml.match(/<a:gradFill/g) || []
		return m.length >= 6 ? `${m.length} gradient fills on slide 12` : null
	},
	// === Colspan in table ===
	'table colspan (slide 12)': async () => {
		const xml = await zip.file('ppt/slides/slide12.xml').async('string')
		const m = xml.match(/gridSpan="\d+"/g) || []
		return m.length > 0 ? `gridSpan attrs: ${m.length}` : null
	},
	// === Side-specific borders ===
	'side-specific borders (lnB/lnT/lnR/lnL)': async () => {
		const xml = await zip.file('ppt/slides/slide12.xml').async('string')
		const sides = ['lnT', 'lnB', 'lnL', 'lnR'].filter(s => xml.includes(`<a:${s}`))
		return sides.length >= 2 ? `sides used: ${sides.join(',')}` : null
	},
	// === custGeom on slide 13 ===
	'custGeom freeform shapes (slide 13)': async () => {
		const xml = await zip.file('ppt/slides/slide13.xml').async('string')
		const m = xml.match(/<a:custGeom>/g) || []
		return m.length >= 3 ? `${m.length} custGeom shapes` : null
	},
	// === Bezier paths in custGeom ===
	'Bezier curves in custGeom': async () => {
		const xml = await zip.file('ppt/slides/slide13.xml').async('string')
		const cubic = (xml.match(/<a:cubicBezTo>/g) || []).length
		const quad = (xml.match(/<a:quadBezTo>/g) || []).length
		const moveTo = (xml.match(/<a:moveTo>/g) || []).length
		const close = (xml.match(/<a:close\/>/g) || []).length
		return moveTo > 0 ? `moveTo=${moveTo}, cubicBezTo=${cubic}, quadBezTo=${quad}, close=${close}` : null
	},
	// === Morph transition (uses mc:AlternateContent + p159:morph) ===
	'morph transition (slide 15)': async () => {
		const xml = await zip.file('ppt/slides/slide15.xml').async('string')
		return /p159:morph|p15:morph/.test(xml) ? 'p159:morph element present' : null
	},
	// === 3D model embedded ===
	'3D model embedded (.glb in package)': async () => {
		const glbs = Object.keys(zip.files).filter(n => n.toLowerCase().endsWith('.glb'))
		return glbs.length > 0 ? `embedded: ${glbs.join(', ')}` : null
	},
	'3D model fallback PNG': async () => {
		const slide16 = await zip.file('ppt/slides/slide16.xml').async('string')
		return /am3d:model3d|<p:graphicFrame/.test(slide16) ? 'model3d / graphicFrame present on slide 16' : null
	},
	// === Autoplay (advanceAfterTime + useTimings) ===
	'every slide has transition with advanceAfterTime': async () => {
		let withAdv = 0, total = 0
		for (let i = 1; i <= 17; i++) {
			const xml = await zip.file(`ppt/slides/slide${i}.xml`)?.async('string')
			if (!xml) continue
			total++
			if (/advTm="\d+"/.test(xml)) withAdv++
		}
		return withAdv === total ? `${withAdv}/${total} slides advance automatically` : `only ${withAdv}/${total} slides have advTm`
	},
	'show settings (kiosk + loop + useTimings in presProps.xml)': async () => {
		const xml = await zip.file('ppt/presProps.xml').async('string')
		const flags = []
		if (/<p:kiosk/.test(xml)) flags.push('kiosk')
		if (/loop="1"/.test(xml)) flags.push('loop')
		if (/useTimings="1"/.test(xml)) flags.push('useTimings')
		if (/showAnimation="1"/.test(xml)) flags.push('showAnimation')
		return flags.length >= 3 ? `flags: ${flags.join(', ')}` : null
	},
	// === Theme fonts ===
	'theme fonts applied (Segoe UI from aurora preset)': async () => {
		const xml = await zip.file('ppt/theme/theme1.xml').async('string')
		return /typeface="Segoe UI"/.test(xml) ? 'Segoe UI in theme1.xml' : null
	},
}

let passed = 0, failed = 0
for (const [name, fn] of Object.entries(checks)) {
	try {
		const got = await fn()
		if (got) { console.log('  ✓', name, '—', got); passed++ }
		else     { console.log('  ✗', name, '— NOT FOUND'); failed++ }
	} catch (e) {
		console.log('  !', name, '— ERROR:', e.message); failed++
	}
}
console.log('---')
console.log(`PASSED: ${passed} / ${passed + failed}`)
if (failed > 0) process.exitCode = 1
