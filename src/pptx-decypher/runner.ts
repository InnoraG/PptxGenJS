import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

import { PptxDecypher } from './core/PptxDecypher.js'
import {
	DecypherOptions,
	DecypherResult,
	DecypherStats,
	PresentationModel,
} from './types.js'

export type DecypherEngine = 'auto' | 'ultimate' | 'structured'

export interface DecypherGeneratorOptions extends DecypherOptions {
	pptxPath?: string
	pptxBase64?: string
	sourceName?: string
	engine?: DecypherEngine
	autoRegenerate?: boolean
	includeGeneratorCode?: boolean
	timeoutMs?: number
}

export interface DecypherGeneratorResult extends DecypherResult {
	engine: 'ultimate' | 'structured'
	sourcePath?: string
	regeneratedPath?: string
	regenerateSuccess?: boolean | null
	regenerateError?: string | null
	generatorCode?: string
	stdout?: string
	stderr?: string
	runtimeAvailable: boolean
}

export interface DecypherModelOptions extends DecypherOptions {
	pptxPath?: string
	pptxBase64?: string
	sourceName?: string
	engine?: DecypherEngine
	limitSlides?: number
	timeoutMs?: number
}

export interface DecypherModelResult {
	success: boolean
	engine: 'ultimate' | 'structured'
	model?: PresentationModel
	signature: string
	stats: DecypherStats
	warnings: DecypherResult['warnings']
	errors: string[]
	runtimeAvailable: boolean
}

export interface RegenerateOptions {
	generatorPath: string
	outputPath?: string
	timeoutMs?: number
}

export interface RegenerateResult {
	success: boolean
	generatorPath: string
	outputPath: string
	exitCode: number
	stdout: string
	stderr: string
}

export interface CompareOptions {
	referencePath: string
	generatedPath: string
	slides?: Array<number | string>
	comparatorPath?: string
	timeoutMs?: number
}

export interface OracleResult {
	success: boolean
	runtimeAvailable: boolean
	exitCode?: number
	stdout?: string
	stderr?: string
	error?: string
}

interface ProcessResult {
	exitCode: number
	stdout: string
	stderr: string
	timedOut: boolean
}

function packageRootCandidates(): string[] {
	const here = path.dirname(fileURLToPath(import.meta.url))
	return [
		process.cwd(),
		path.resolve(here, '..', '..'),
		path.resolve(here, '..', '..', '..'),
	]
}

function findFirstExisting(paths: string[]): string | null {
	for (const candidate of paths) {
		if (fs.existsSync(candidate)) return candidate
	}
	return null
}

function findUltimateTool(): string | null {
	return findFirstExisting(packageRootCandidates().map(root => path.join(root, 'PPTX_ULTIMATE_DECYPHER_TOOL.mjs')))
}

function findComparator(defaultPath?: string): string | null {
	if (defaultPath && fs.existsSync(defaultPath)) return defaultPath
	return findFirstExisting(packageRootCandidates().map(root => path.join(root, 'ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')))
}

function powerShellExecutable(): string {
	return 'pwsh.exe'
}

function hashBuffer(buffer: Buffer): string {
	const hash = crypto.createHash('sha256')
	hash.update(buffer)
	return hash.digest('hex').substring(0, 16)
}

function emptyStats(): DecypherStats {
	return { slideCount: 0, shapeCount: 0, animationCount: 0, mediaCount: 0, passthroughCount: 0 }
}

function runProcess(command: string, args: string[], cwd: string, timeoutMs = 10 * 60 * 1000): Promise<ProcessResult> {
	return new Promise(resolve => {
		const child = spawn(command, args, { cwd, windowsHide: true })
		let stdout = ''
		let stderr = ''
		let finished = false
		const timer = setTimeout(() => {
			if (finished) return
			finished = true
			child.kill()
			resolve({ exitCode: -1, stdout, stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim(), timedOut: true })
		}, timeoutMs)
		child.stdout?.on('data', chunk => { stdout += chunk.toString() })
		child.stderr?.on('data', chunk => { stderr += chunk.toString() })
		child.on('error', err => {
			if (finished) return
			finished = true
			clearTimeout(timer)
			resolve({ exitCode: -1, stdout, stderr: `${stderr}\n${err.message}`.trim(), timedOut: false })
		})
		child.on('close', code => {
			if (finished) return
			finished = true
			clearTimeout(timer)
			resolve({ exitCode: code ?? 0, stdout, stderr, timedOut: false })
		})
	})
}

function materializeInput(options: DecypherGeneratorOptions | DecypherModelOptions): { inputPath: string; sourceName: string } {
	if (options.pptxPath) {
		return { inputPath: path.resolve(options.pptxPath), sourceName: options.sourceName || path.basename(options.pptxPath) }
	}
	if (!options.pptxBase64) {
		throw new Error('Either pptxPath or pptxBase64 is required')
	}
	const sourceName = options.sourceName || 'uploaded.pptx'
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-decypher-'))
	const inputPath = path.join(tempDir, sourceName)
	fs.writeFileSync(inputPath, Buffer.from(options.pptxBase64, 'base64'))
	return { inputPath, sourceName }
}

function readJsonFile(filePath: string): any {
	return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function readGeneratorCode(generatorPath: string, includeGeneratorCode?: boolean): string | undefined {
	if (!includeGeneratorCode || !generatorPath || !fs.existsSync(generatorPath)) return undefined
	return fs.readFileSync(generatorPath, 'utf8')
}

async function runStructuredDecypher(options: DecypherGeneratorOptions, inputPath: string): Promise<DecypherGeneratorResult> {
	const decypher = new PptxDecypher(options)
	const result = await decypher.decypher(inputPath)
	return {
		...result,
		engine: 'structured',
		sourcePath: inputPath,
		generatorCode: readGeneratorCode(result.generatorPath, options.includeGeneratorCode),
		runtimeAvailable: true,
	}
}

async function runUltimateDecypher(options: DecypherGeneratorOptions, inputPath: string): Promise<DecypherGeneratorResult> {
	const toolPath = findUltimateTool()
	if (!toolPath) {
		if (options.engine === 'ultimate') {
			return {
				success: false,
				engine: 'ultimate',
				signature: '',
				generatorPath: '',
				outputFolder: '',
				stats: emptyStats(),
				warnings: [],
				errors: ['PPTX_ULTIMATE_DECYPHER_TOOL.mjs was not found in the current project or package root'],
				runtimeAvailable: false,
			}
		}
		return runStructuredDecypher(options, inputPath)
	}

	const summaryPath = path.join(os.tmpdir(), `pptxgenjs-decypher-summary-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
	const args = [toolPath, inputPath]
	if (options.outputDir) args.push('--output', path.resolve(options.outputDir))
	if (options.autoRegenerate === false) args.push('--no-regenerate')
	args.push('--json-summary', summaryPath)

	const proc = await runProcess(process.execPath, args, process.cwd(), options.timeoutMs)
	if (proc.exitCode !== 0 || !fs.existsSync(summaryPath)) {
		return {
			success: false,
			engine: 'ultimate',
			sourcePath: inputPath,
			signature: fs.existsSync(inputPath) ? hashBuffer(fs.readFileSync(inputPath)) : '',
			generatorPath: '',
			outputFolder: '',
			stats: emptyStats(),
			warnings: [],
			errors: [`Ultimate decypher failed with exit code ${proc.exitCode}`, proc.stderr || proc.stdout].filter(Boolean),
			stdout: proc.stdout,
			stderr: proc.stderr,
			runtimeAvailable: true,
		}
	}

	const summary = readJsonFile(summaryPath)
	return {
		success: summary.success === true,
		engine: 'ultimate',
		sourcePath: summary.sourcePath || inputPath,
		signature: summary.signature || '',
		generatorPath: summary.generatorPath || '',
		outputFolder: summary.outputFolder || '',
		regeneratedPath: summary.regeneratedPath,
		regenerateSuccess: summary.regenerateSuccess,
		regenerateError: summary.regenerateError,
		stats: summary.stats || emptyStats(),
		warnings: summary.warnings || [],
		errors: summary.errors || [],
		generatorCode: readGeneratorCode(summary.generatorPath, options.includeGeneratorCode),
		stdout: proc.stdout,
		stderr: proc.stderr,
		runtimeAvailable: true,
	}
}

async function runStructuredModelDecypher(options: DecypherModelOptions, inputPath: string, sourceName: string): Promise<DecypherModelResult> {
	const decypher = new PptxDecypher(options)
	const result = await decypher.decypherToModel(inputPath, sourceName)
	if (result.model && options.limitSlides && options.limitSlides > 0) {
		result.model.slides = result.model.slides.slice(0, options.limitSlides)
	}
	return { ...result, engine: 'structured', runtimeAvailable: true }
}

async function runUltimateModelDecypher(options: DecypherModelOptions, inputPath: string): Promise<DecypherModelResult> {
	const toolPath = findUltimateTool()
	if (!toolPath) {
		return {
			success: false,
			engine: 'ultimate',
			signature: fs.existsSync(inputPath) ? hashBuffer(fs.readFileSync(inputPath)) : '',
			stats: emptyStats(),
			warnings: [],
			errors: ['PPTX_ULTIMATE_DECYPHER_TOOL.mjs was not found in the current project or package root'],
			runtimeAvailable: false,
		}
	}

	const summaryPath = path.join(os.tmpdir(), `pptxgenjs-decypher-summary-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
	const modelPath = path.join(os.tmpdir(), `pptxgenjs-decypher-model-${Date.now()}-${Math.random().toString(16).slice(2)}.json`)
	const args = [toolPath, inputPath]
	if (options.outputDir) args.push('--output', path.resolve(options.outputDir))
	args.push('--no-regenerate', '--json-summary', summaryPath, '--json-model', modelPath)

	const proc = await runProcess(process.execPath, args, process.cwd(), options.timeoutMs)
	if (proc.exitCode !== 0 || !fs.existsSync(modelPath)) {
		return {
			success: false,
			engine: 'ultimate',
			signature: fs.existsSync(inputPath) ? hashBuffer(fs.readFileSync(inputPath)) : '',
			stats: emptyStats(),
			warnings: [],
			errors: [`Ultimate decypher model export failed with exit code ${proc.exitCode}`, proc.stderr || proc.stdout].filter(Boolean),
			runtimeAvailable: true,
		}
	}

	const modelResult = readJsonFile(modelPath)
	if (modelResult.model && options.limitSlides && options.limitSlides > 0) {
		modelResult.model.slides = modelResult.model.slides.slice(0, options.limitSlides)
	}
	return {
		success: modelResult.success === true,
		engine: 'ultimate',
		model: modelResult.model,
		signature: modelResult.signature || '',
		stats: modelResult.stats || emptyStats(),
		warnings: modelResult.warnings || [],
		errors: modelResult.errors || [],
		runtimeAvailable: true,
	}
}

export async function decypherToGenerator(input: string | DecypherGeneratorOptions): Promise<DecypherGeneratorResult> {
	const options: DecypherGeneratorOptions = typeof input === 'string' ? { pptxPath: input } : input
	const { inputPath } = materializeInput(options)
	if (!fs.existsSync(inputPath)) {
		return {
			success: false,
			engine: options.engine === 'structured' ? 'structured' : 'ultimate',
			sourcePath: inputPath,
			signature: '',
			generatorPath: '',
			outputFolder: '',
			stats: emptyStats(),
			warnings: [],
			errors: [`File not found: ${inputPath}`],
			runtimeAvailable: false,
		}
	}
	if (options.engine === 'structured') return runStructuredDecypher(options, inputPath)
	return runUltimateDecypher(options, inputPath)
}

export async function decypherToModel(options: DecypherModelOptions): Promise<DecypherModelResult> {
	try {
		const { inputPath, sourceName } = materializeInput(options)
		if (!fs.existsSync(inputPath)) {
			return {
				success: false,
				engine: options.engine === 'structured' ? 'structured' : 'ultimate',
				signature: '',
				stats: emptyStats(),
				warnings: [],
				errors: [`File not found: ${inputPath}`],
				runtimeAvailable: false,
			}
		}
		if (options.engine === 'structured') return runStructuredModelDecypher(options, inputPath, sourceName)
		return runUltimateModelDecypher(options, inputPath)
	} catch (error) {
		return {
			success: false,
			engine: options.engine === 'structured' ? 'structured' : 'ultimate',
			signature: '',
			stats: emptyStats(),
			warnings: [],
			errors: [error instanceof Error ? error.message : String(error)],
			runtimeAvailable: false,
		}
	}
}

export async function regenerateFromGenerator(options: RegenerateOptions): Promise<RegenerateResult> {
	const generatorPath = path.resolve(options.generatorPath)
	const outputPath = options.outputPath
		? path.resolve(options.outputPath)
		: path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx')
	const args = [generatorPath]
	if (options.outputPath) args.push('--out', outputPath)
	const proc = await runProcess(process.execPath, args, path.dirname(generatorPath), options.timeoutMs)
	return {
		success: proc.exitCode === 0 && fs.existsSync(outputPath),
		generatorPath,
		outputPath,
		exitCode: proc.exitCode,
		stdout: proc.stdout,
		stderr: proc.stderr,
	}
}

export async function comparePresentations(options: CompareOptions): Promise<OracleResult> {
	const comparatorPath = findComparator(options.comparatorPath)
	if (process.platform !== 'win32') {
		return { success: false, runtimeAvailable: false, error: 'PowerShell comparator is only available on Windows' }
	}
	if (!comparatorPath) {
		return { success: false, runtimeAvailable: false, error: 'Comparator script was not found' }
	}
	const args = [
		'-NoProfile',
		'-ExecutionPolicy',
		'Bypass',
		'-File',
		comparatorPath,
		'-Reference',
		path.resolve(options.referencePath),
		'-Generated',
		path.resolve(options.generatedPath),
	]
	if (options.slides?.length) args.push('-Slides', options.slides.join(','))
	const proc = await runProcess(powerShellExecutable(), args, process.cwd(), options.timeoutMs || 10 * 60 * 1000)
	return {
		success: proc.exitCode === 0,
		runtimeAvailable: true,
		exitCode: proc.exitCode,
		stdout: proc.stdout,
		stderr: proc.stderr,
	}
}

export async function repairCheck(pptxPath: string, timeoutMs = 2 * 60 * 1000): Promise<OracleResult> {
	if (process.platform !== 'win32') {
		return { success: false, runtimeAvailable: false, error: 'PowerPoint COM repair checks are only available on Windows' }
	}
	const scriptPath = path.join(os.tmpdir(), `pptxgenjs-repair-check-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`)
	const script = [
		'param([string]$PptxPath)',
		"$ErrorActionPreference='Stop'",
		'$path=[IO.Path]::GetFullPath($PptxPath)',
		'$app=New-Object -ComObject PowerPoint.Application',
		'$app.DisplayAlerts=1',
		'try {',
		'  $pres=$app.Presentations.Open($path,$true,$false,$false)',
		'  $count=$pres.Slides.Count',
		'  $pres.Close()',
		'  @{ success=$true; slideCount=$count; path=$path } | ConvertTo-Json -Compress',
		'} finally {',
		'  $app.Quit()',
		'}',
	].join('\n')
	fs.writeFileSync(scriptPath, script)
	const proc = await runProcess(powerShellExecutable(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PptxPath', path.resolve(pptxPath)], process.cwd(), timeoutMs)
	fs.rmSync(scriptPath, { force: true })
	return {
		success: proc.exitCode === 0,
		runtimeAvailable: true,
		exitCode: proc.exitCode,
		stdout: proc.stdout,
		stderr: proc.stderr,
	}
}
