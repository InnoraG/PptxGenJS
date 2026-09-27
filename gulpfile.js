// Suppress Node.js deprecation warnings from dependencies (e.g., fs.Stats in gulp-uglify)
process.noDeprecation = true

const pkg = require('./package.json')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { execSync, spawn } = require('child_process')
const rollup = require('rollup')
const { nodeResolve } = require('@rollup/plugin-node-resolve')
const commonjs = require('@rollup/plugin-commonjs')
const ts = require('typescript')
const UglifyJS = require('uglify-js')
const { watch, series } = require('gulp')
const gulp = require('gulp'),
	insert = require('gulp-insert')

function transpileTypeScript() {
	return {
		name: 'typescript-transpile',
		transform(code, id) {
			if (!/\.[cm]?tsx?$/.test(id) || /\.d\.[cm]?ts$/.test(id)) return null
			const result = ts.transpileModule(code, {
				fileName: id,
				compilerOptions: {
					allowSyntheticDefaultImports: true,
					importHelpers: true,
					module: ts.ModuleKind.ESNext,
					sourceMap: true,
					target: ts.ScriptTarget.ES2016,
				},
			})
			return {
				code: result.outputText,
				map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
			}
		},
	}
}

gulp.task('build', tracedReturnTask('build', () => {
	return rollup
		.rollup({
			input: './src/pptxgen.ts',
			external: [
				/^node:.*/,  // Node.js built-in modules with node: protocol
				...Object.keys(pkg.dependencies || {}),
				...Object.keys(pkg.peerDependencies || {})
			],
			plugins: [transpileTypeScript(), nodeResolve({ preferBuiltins: true, extensions: ['.mjs', '.js', '.json', '.node', '.ts'] }), commonjs()],
			onwarn(warning, warn) {
				// Suppress node: protocol import warnings (they are intentionally external)
				if (warning.message?.includes('"node:')) return;
				warn(warning);
			}
		})
		.then(async bundle => {
			// Await every output write. Starting the IIFE/CJS writes without
			// awaiting them allowed the minification task to read a partially
			// written file and fail intermittently with "Unexpected token: eof".
			await bundle.write({
				file: './src/bld/pptxgen.gulp.js',
				format: 'iife',
				name: 'PptxGenJS',
				globals: {
					jszip: 'JSZip'
				},
				sourcemap: true
			})
			await bundle.write({
				file: './src/bld/pptxgen.cjs.js',
				format: 'cjs',
				exports: 'default'
			})
			return bundle.write({
				file: './src/bld/pptxgen.es.js',
				format: 'es'
			})
		})
}))

function buildBanner() {
	return '/* PptxGenJS ' + pkg.version + ' @ ' + new Date().toISOString() + ' */\n'
}

function logShip(message) {
	console.log(`[ship ${new Date().toISOString()}] ${message}`)
}

function formatDuration(ms) {
	if (ms < 1000) return `${ms}ms`
	const sec = ms / 1000
	if (sec < 60) return `${sec.toFixed(1)}s`
	return `${Math.floor(sec / 60)}m ${(sec % 60).toFixed(1)}s`
}

function finishTrace(name, start, err) {
	const elapsed = formatDuration(Date.now() - start)
	if (err) logShip(`FAIL ${name} after ${elapsed}: ${err?.message || err}`)
	else logShip(`DONE ${name} after ${elapsed}`)
}

function tracedReturnTask(name, taskFn) {
	return function tracedTask() {
		const start = Date.now()
		logShip(`START ${name}`)
		try {
			const result = taskFn()
			if (result && typeof result.then === 'function') {
				return result.then(
					value => {
						finishTrace(name, start)
						return value
					},
					err => {
						finishTrace(name, start, err)
						throw err
					}
				)
			}
			if (result && typeof result.once === 'function') {
				let finished = false
				const finish = err => {
					if (finished) return
					finished = true
					finishTrace(name, start, err)
				}
				result.once('error', finish)
				result.once('finish', () => finish())
				result.once('end', () => finish())
				return result
			}
			finishTrace(name, start)
			return result
		} catch (err) {
			finishTrace(name, start, err)
			throw err
		}
	}
}

function tracedCallbackTask(name, taskFn) {
	return function tracedTask(done) {
		const start = Date.now()
		logShip(`START ${name}`)
		let finished = false
		const finish = err => {
			if (finished) return
			finished = true
			finishTrace(name, start, err)
			done(err)
		}
		try {
			taskFn(finish)
		} catch (err) {
			finish(err)
		}
	}
}

function runChildWithHeartbeat(label, command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const start = Date.now()
		logShip(`START ${label}: ${command} ${args.join(' ')}`)
		const child = spawn(command, args, {
			stdio: 'inherit',
			...options,
		})
		const timer = setInterval(() => {
			logShip(`RUNNING ${label} for ${formatDuration(Date.now() - start)} (pid ${child.pid || 'unknown'})`)
		}, 30000)
		let finished = false
		const finish = err => {
			if (finished) return
			finished = true
			clearInterval(timer)
			if (err) {
				finishTrace(label, start, err)
				reject(err)
			} else {
				finishTrace(label, start)
				resolve()
			}
		}
		child.once('error', finish)
		child.once('close', code => {
			if (code === 0) finish()
			else finish(new Error(`${label} exited with code ${code}`))
		})
	})
}

function sleepMs(ms) {
	const end = Date.now() + ms
	while (Date.now() < end) {}
}

function writeFileWithRetry(filePath, content) {
	const abs = path.resolve(filePath)
	const tmp = path.join(path.dirname(abs), `.${path.basename(abs)}.${process.pid}.${Date.now()}.tmp`)
	fs.mkdirSync(path.dirname(abs), { recursive: true })
	fs.writeFileSync(tmp, content)
	let lastErr
	for (let i = 0; i < 20; i++) {
		try {
			fs.copyFileSync(tmp, abs)
			fs.rmSync(tmp, { force: true })
			return
		} catch (err) {
			lastErr = err
			sleepMs(250)
		}
	}
	fs.rmSync(tmp, { force: true })
	throw lastErr
}

function minifyFiles(inputFiles, outputFiles) {
	const sources = {}
	for (const filePath of inputFiles.filter(filePath => fs.existsSync(filePath))) {
		sources[path.basename(filePath)] = fs.readFileSync(filePath, 'utf8')
	}
	for (const outputFile of outputFiles) {
		const mapFile = `${outputFile}.map`
		const result = UglifyJS.minify(sources, {
			sourceMap: {
				filename: path.basename(outputFile),
				url: path.basename(mapFile),
			},
		})
		if (result.error) throw result.error
		writeFileWithRetry(outputFile, buildBanner() + result.code + '\n')
		writeFileWithRetry(mapFile, result.map + '\n')
	}
}

function copyFileBestEffort(srcFile, destFile) {
	try {
		writeFileWithRetry(destFile, fs.readFileSync(srcFile))
	} catch (err) {
		console.warn(`Warning: unable to update demo mirror ${destFile}: ${err?.message || err}`)
	}
}

gulp.task('min', tracedCallbackTask('min', (done) => {
	try {
		minifyFiles(['./src/bld/pptxgen.gulp.js'], ['./dist/pptxgen.min.js'])
		done()
	} catch (err) {
		done(err)
	}
}))

gulp.task('bundle', tracedCallbackTask('bundle', (done) => {
	try {
		const libs = fs.existsSync('./libs')
			? fs.readdirSync('./libs').map(name => path.join('./libs', name)).filter(filePath => fs.statSync(filePath).isFile())
			: []
		minifyFiles([...libs, './src/bld/pptxgen.gulp.js'], ['./dist/pptxgen.bundle.js', './demos/browser/js/pptxgen.bundle.js'])
		done()
	} catch (err) {
		done(err)
	}
}))

gulp.task('cjs', tracedReturnTask('cjs', () => {
	return gulp
		.src(['./src/bld/pptxgen.cjs.js'])
		.pipe(insert.prepend('/* PptxGenJS ' + pkg.version + ' @ ' + new Date().toISOString() + ' */\n'))
		.pipe(gulp.dest('./dist/'))
}))

gulp.task('es', tracedReturnTask('es', () => {
	return gulp
		.src(['./src/bld/pptxgen.es.js'])
		.pipe(insert.prepend('/* PptxGenJS ' + pkg.version + ' @ ' + new Date().toISOString() + ' */\n'))
		.pipe(gulp.dest('./dist/'))
}))

gulp.task('reactTestCode', tracedCallbackTask('reactTestCode', (done) => {
	copyFileBestEffort('./dist/pptxgen.es.js', './demos/vite-demo/node_modules/pptxgenjs/dist/pptxgen.es.js')
	done()
}))

gulp.task('reactTestDefs', tracedCallbackTask('reactTestDefs', (done) => {
	copyFileBestEffort('./types/index.d.ts', './demos/vite-demo/node_modules/pptxgenjs/types/index.d.ts')
	done()
}))

gulp.task('nodeTestCjs', tracedCallbackTask('nodeTestCjs', (done) => {
	copyFileBestEffort('./dist/pptxgen.cjs.js', './demos/node/node_modules/pptxgenjs/dist/pptxgen.cjs.js')
	done()
}))

gulp.task('nodeTestEs', tracedCallbackTask('nodeTestEs', (done) => {
	copyFileBestEffort('./dist/pptxgen.es.js', './demos/node/node_modules/pptxgenjs/dist/pptxgen.es.js')
	done()
}))

gulp.task('presetIdMap', tracedCallbackTask('presetIdMap', (done) => {
	execSync('node src/gen-preset-id-map.cjs', { stdio: 'inherit' })
	done()
}))

// Parity guard: fail the ship if the 3D playScene clip selector `embedded{animId+1}` drifts between source,
// dist/node, and the ES bundle (e.g. a stale dist/node hardcoding `embedded1`). Runs after `nodeTools` so all
// three artifacts exist. The script exits nonzero on drift → execSync throws → the ship fails loudly.
gulp.task('verify3dEmbedParity', tracedCallbackTask('verify3dEmbedParity', (done) => {
	try {
		execSync('node betterpptx-mcp/verify-3d-embed-parity.mjs', { stdio: 'inherit' })
		done()
	} catch (err) {
		done(err)
	}
}))

// G5 release guard: ordinary development ships report current asset/approval
// state, while an explicitly marked release build fails closed on any missing,
// hash-drifted, or owner-pending product asset row.
gulp.task('verifyG5ReleaseGate', tracedCallbackTask('verifyG5ReleaseGate', (done) => {
	try {
		const args = ['betterpptx-mcp/verify-g5-product-asset-ledger.mjs']
		if (process.env.BETTERPPTX_G5_RELEASE_GATE === '1') args.push('--strict')
		execSync(`node ${args.join(' ')}`, { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

// G4 deployment guard: verify that checked-in Cloud Run templates keep secrets
// behind Secret Manager and that owner-supplied live deployment evidence exists
// before a release build. Normal ships are report-only; strict release builds
// fail closed until rotation/break-glass evidence is recorded.
gulp.task('verifyG4DeploymentSecretGate', tracedCallbackTask('verifyG4DeploymentSecretGate', (done) => {
	try {
		const args = ['betterpptx-mcp/verify-g4-deployment-secret-gate.mjs']
		if (process.env.BETTERPPTX_G4_RELEASE_GATE === '1') args.push('--strict')
		execSync(`node ${args.join(' ')}`, { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

// G1 delivery guard: re-hash the exact sanitized PPTX set and rescan package
// text before release. Normal ships are report-only; strict release builds
// require explicit owner approval for every artifact.
gulp.task('verifyG1DeliveryReleaseGate', tracedCallbackTask('verifyG1DeliveryReleaseGate', (done) => {
	try {
		const args = ['betterpptx-mcp/verify-g1-delivery-release-manifest.mjs']
		if (process.env.BETTERPPTX_G1_RELEASE_GATE === '1') args.push('--strict')
		execSync(`node ${args.join(' ')}`, { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

// Historical commercial-PoC artifacts are retained as private research
// evidence, but they must remain hash-pinned and disjoint from the exact
// sanitized delivery set. This gate is always safe to run in report-only
// mode; strict release builds require the same manifest to remain stable.
gulp.task('verifyG1HistoricalArtifactQuarantine', tracedCallbackTask('verifyG1HistoricalArtifactQuarantine', (done) => {
	try {
		const args = ['betterpptx-mcp/verify-g1-historical-artifact-quarantine.mjs']
		if (process.env.BETTERPPTX_G1_RELEASE_GATE === '1') args.push('--strict')
		execSync(`node ${args.join(' ')}`, { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

// P0 source/provenance guard: normal ships record the current tree honestly;
// strict release builds fail closed until the reviewed private commit is clean.
gulp.task('verifySourceProvenanceGate', tracedCallbackTask('verifySourceProvenanceGate', (done) => {
	try {
		const args = ['betterpptx-mcp/verify-source-provenance-gate.mjs']
		if (process.env.BETTERPPTX_SOURCE_PROVENANCE_GATE === '1') args.push('--strict')
		execSync(`node ${args.join(' ')}`, { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

gulp.task('verifySourceProvenanceContract', tracedCallbackTask('verifySourceProvenanceContract', (done) => {
	try {
		execSync('node betterpptx-mcp/verify-source-provenance-contract.mjs', { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

// Read-only authoring-v3 source inventory. This reports ordinary candidate
// coverage without promoting it; the dedicated v3 gate remains fail-closed
// until source, bake, G5, and PowerPoint timeline evidence arrive.
gulp.task('verifyAuthoringV3SourceAvailability', tracedCallbackTask('verifyAuthoringV3SourceAvailability', (done) => {
	try {
		execSync('node betterpptx-mcp/verify-authoring-v3-source-availability.mjs', { stdio: 'inherit', env: process.env })
		done()
	} catch (err) {
		done(err)
	}
}))

function copyDirFiltered(srcDir, destDir, predicate) {
	if (!fs.existsSync(srcDir)) return
	fs.mkdirSync(destDir, { recursive: true })
	for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
		const srcPath = path.join(srcDir, entry.name)
		const destPath = path.join(destDir, entry.name)
		if (entry.isDirectory()) {
			copyDirFiltered(srcPath, destPath, predicate)
		} else if (!predicate || predicate(srcPath)) {
			fs.mkdirSync(path.dirname(destPath), { recursive: true })
			fs.copyFileSync(srcPath, destPath)
		}
	}
}

gulp.task('nodeTools', tracedReturnTask('nodeTools', async () => {
	const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-node-tools-'))
	const tmpOut = path.join(tmpRoot, 'out')
	try {
		await runChildWithHeartbeat('nodeTools:tsc emit', process.execPath, [
			path.resolve('./node_modules/typescript/bin/tsc'),
			'--pretty',
			'false',
			'--outDir',
			tmpOut,
			'--declarationDir',
			path.join(tmpOut, 'defs'),
		])
		logShip('nodeTools: replacing dist/node, dist/pptx-decypher, and dist/pptx-mcp')
		fs.rmSync('./dist/node', { recursive: true, force: true })
		fs.rmSync('./dist/pptx-decypher', { recursive: true, force: true })
		fs.rmSync('./dist/pptx-mcp', { recursive: true, force: true })
		logShip('nodeTools: copying compiled node runtime')
		copyDirFiltered(
			tmpOut,
			'./dist/node',
			filePath => /\.(js|js\.map)$/.test(filePath)
		)
		for (const surface of ['pptx-decypher', 'pptx-mcp']) {
			logShip(`nodeTools: copying declarations for ${surface}`)
			copyDirFiltered(
				path.join(tmpOut, 'defs', surface),
				`./types/${surface}`,
				filePath => /\.d\.ts$/.test(filePath)
			)
		}
		fs.rmSync('./dist/package.json', { force: true })
		fs.writeFileSync('./dist/node/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n')
	} finally {
		fs.rmSync(tmpRoot, { recursive: true, force: true })
	}
}))

gulp.task('shipDone', tracedCallbackTask('shipDone', (done) => {
	logShip('... ./dist/*.js files created!')
	done()
}))

// Build/Deploy (ad-hoc, no watch)
gulp.task( 'ship',
	gulp.series('build', 'min', 'cjs', 'es', 'bundle', 'nodeTools', 'verify3dEmbedParity', 'verifySourceProvenanceGate', 'verifySourceProvenanceContract', 'verifyG1DeliveryReleaseGate', 'verifyG1HistoricalArtifactQuarantine', 'verifyAuthoringV3SourceAvailability', 'verifyG4DeploymentSecretGate', 'verifyG5ReleaseGate', 'reactTestCode', 'reactTestDefs', 'nodeTestCjs', 'nodeTestEs', 'presetIdMap', 'shipDone'))
// Build/Deploy
gulp.task('default',
	gulp.series('build', 'min', 'cjs', 'es', 'bundle', 'nodeTools', 'verify3dEmbedParity', 'reactTestCode', 'reactTestDefs', 'nodeTestCjs', 'nodeTestEs', 'shipDone'))

// Watch
exports.default = function() {
	watch('src/*.ts', series('build', 'min', 'cjs', 'es', 'bundle', 'nodeTest'))
}
