// Suppress Node.js deprecation warnings from dependencies (e.g., fs.Stats in gulp-uglify)
process.noDeprecation = true

const pkg = require('./package.json')
const fs = require('fs')
const os = require('os')
const path = require('path')
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

gulp.task('build', () => {
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
		.then(bundle => {
			bundle.write({
				file: './src/bld/pptxgen.gulp.js',
				format: 'iife',
				name: 'PptxGenJS',
				globals: {
					jszip: 'JSZip'
				},
				sourcemap: true
			})
			return bundle
		})
		.then(bundle => {
			bundle.write({
				file: './src/bld/pptxgen.cjs.js',
				format: 'cjs',
				exports: 'default'
			})
			return bundle
		})
		.then(bundle => {
			return bundle.write({
				file: './src/bld/pptxgen.es.js',
				format: 'es'
			})
		})
})

function buildBanner() {
	return '/* PptxGenJS ' + pkg.version + ' @ ' + new Date().toISOString() + ' */\n'
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

gulp.task('min', (done) => {
	try {
		minifyFiles(['./src/bld/pptxgen.gulp.js'], ['./dist/pptxgen.min.js'])
		done()
	} catch (err) {
		done(err)
	}
})

gulp.task('bundle', (done) => {
	try {
		const libs = fs.existsSync('./libs')
			? fs.readdirSync('./libs').map(name => path.join('./libs', name)).filter(filePath => fs.statSync(filePath).isFile())
			: []
		minifyFiles([...libs, './src/bld/pptxgen.gulp.js'], ['./dist/pptxgen.bundle.js', './demos/browser/js/pptxgen.bundle.js'])
		done()
	} catch (err) {
		done(err)
	}
})

gulp.task('cjs', () => {
	return gulp
		.src(['./src/bld/pptxgen.cjs.js'])
		.pipe(insert.prepend('/* PptxGenJS ' + pkg.version + ' @ ' + new Date().toISOString() + ' */\n'))
		.pipe(gulp.dest('./dist/'))
})

gulp.task('es', () => {
	return gulp
		.src(['./src/bld/pptxgen.es.js'])
		.pipe(insert.prepend('/* PptxGenJS ' + pkg.version + ' @ ' + new Date().toISOString() + ' */\n'))
		.pipe(gulp.dest('./dist/'))
})

gulp.task('reactTestCode', (done) => {
	copyFileBestEffort('./dist/pptxgen.es.js', './demos/vite-demo/node_modules/pptxgenjs/dist/pptxgen.es.js')
	done()
})

gulp.task('reactTestDefs', (done) => {
	copyFileBestEffort('./types/index.d.ts', './demos/vite-demo/node_modules/pptxgenjs/types/index.d.ts')
	done()
})

gulp.task('nodeTestCjs', (done) => {
	copyFileBestEffort('./dist/pptxgen.cjs.js', './demos/node/node_modules/pptxgenjs/dist/pptxgen.cjs.js')
	done()
})

gulp.task('nodeTestEs', (done) => {
	copyFileBestEffort('./dist/pptxgen.es.js', './demos/node/node_modules/pptxgenjs/dist/pptxgen.es.js')
	done()
})

gulp.task('presetIdMap', (done) => {
	const { execSync } = require('child_process')
	execSync('node src/gen-preset-id-map.cjs', { stdio: 'inherit' })
	done()
})

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

gulp.task('nodeTools', (done) => {
	const { execFileSync } = require('child_process')
	const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-node-tools-'))
	const tmpOut = path.join(tmpRoot, 'out')
	try {
		execFileSync(process.execPath, [
			path.resolve('./node_modules/typescript/bin/tsc'),
			'--pretty',
			'false',
			'--outDir',
			tmpOut,
			'--declarationDir',
			path.join(tmpOut, 'defs'),
		], { stdio: 'inherit' })
		fs.rmSync('./dist/node', { recursive: true, force: true })
		fs.rmSync('./dist/pptx-decypher', { recursive: true, force: true })
		fs.rmSync('./dist/pptx-mcp', { recursive: true, force: true })
		copyDirFiltered(
			tmpOut,
			'./dist/node',
			filePath => /\.(js|js\.map)$/.test(filePath)
		)
		for (const surface of ['pptx-decypher', 'pptx-mcp']) {
			copyDirFiltered(
				path.join(tmpOut, 'defs', surface),
				`./types/${surface}`,
				filePath => /\.d\.ts$/.test(filePath)
			)
		}
		fs.rmSync('./dist/package.json', { force: true })
		fs.writeFileSync('./dist/node/package.json', JSON.stringify({ type: 'module' }, null, 2) + '\n')
		done()
	} catch (err) {
		done(err)
	} finally {
		fs.rmSync(tmpRoot, { recursive: true, force: true })
	}
})

// Build/Deploy (ad-hoc, no watch)
gulp.task( 'ship',
	gulp.series('build', 'min', 'cjs', 'es', 'bundle', 'nodeTools', 'reactTestCode', 'reactTestDefs', 'nodeTestCjs', 'nodeTestEs', 'presetIdMap'), () => {
	console.log('... ./dist/*.js files created!')
})
// Build/Deploy
gulp.task('default',
	gulp.series('build', 'min', 'cjs', 'es', 'bundle', 'nodeTools', 'reactTestCode', 'reactTestDefs', 'nodeTestCjs', 'nodeTestEs'), () => {
	console.log('... ./dist/*.js files created!')
})

// Watch
exports.default = function() {
	watch('src/*.ts', series('build', 'min', 'cjs', 'es', 'bundle', 'nodeTest'))
}
