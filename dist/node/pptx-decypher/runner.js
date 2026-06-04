var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { PptxDecypher } from './core/PptxDecypher.js';
function packageRootCandidates() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return [
        process.cwd(),
        path.resolve(here, '..', '..'),
        path.resolve(here, '..', '..', '..'),
    ];
}
function findFirstExisting(paths) {
    for (const candidate of paths) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return null;
}
function findUltimateTool() {
    return findFirstExisting(packageRootCandidates().map(root => path.join(root, 'PPTX_ULTIMATE_DECYPHER_TOOL.mjs')));
}
function findComparator(defaultPath) {
    if (defaultPath && fs.existsSync(defaultPath))
        return defaultPath;
    return findFirstExisting(packageRootCandidates().map(root => path.join(root, 'ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1')));
}
function powerShellExecutable() {
    return 'pwsh.exe';
}
function hashBuffer(buffer) {
    const hash = crypto.createHash('sha256');
    hash.update(buffer);
    return hash.digest('hex').substring(0, 16);
}
function emptyStats() {
    return { slideCount: 0, shapeCount: 0, animationCount: 0, mediaCount: 0, passthroughCount: 0 };
}
function runProcess(command, args, cwd, timeoutMs = 10 * 60 * 1000) {
    return new Promise(resolve => {
        var _a, _b;
        const child = spawn(command, args, { cwd, windowsHide: true });
        let stdout = '';
        let stderr = '';
        let finished = false;
        const timer = setTimeout(() => {
            if (finished)
                return;
            finished = true;
            child.kill();
            resolve({ exitCode: -1, stdout, stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim(), timedOut: true });
        }, timeoutMs);
        (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on('data', chunk => { stdout += chunk.toString(); });
        (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on('data', chunk => { stderr += chunk.toString(); });
        child.on('error', err => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            resolve({ exitCode: -1, stdout, stderr: `${stderr}\n${err.message}`.trim(), timedOut: false });
        });
        child.on('close', code => {
            if (finished)
                return;
            finished = true;
            clearTimeout(timer);
            resolve({ exitCode: code !== null && code !== void 0 ? code : 0, stdout, stderr, timedOut: false });
        });
    });
}
function materializeInput(options) {
    if (options.pptxPath) {
        return { inputPath: path.resolve(options.pptxPath), sourceName: options.sourceName || path.basename(options.pptxPath) };
    }
    if (!options.pptxBase64) {
        throw new Error('Either pptxPath or pptxBase64 is required');
    }
    const sourceName = options.sourceName || 'uploaded.pptx';
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pptxgenjs-decypher-'));
    const inputPath = path.join(tempDir, sourceName);
    fs.writeFileSync(inputPath, Buffer.from(options.pptxBase64, 'base64'));
    return { inputPath, sourceName };
}
function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function readGeneratorCode(generatorPath, includeGeneratorCode) {
    if (!includeGeneratorCode || !generatorPath || !fs.existsSync(generatorPath))
        return undefined;
    return fs.readFileSync(generatorPath, 'utf8');
}
function runStructuredDecypher(options, inputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const decypher = new PptxDecypher(options);
        const result = yield decypher.decypher(inputPath);
        return Object.assign(Object.assign({}, result), { engine: 'structured', sourcePath: inputPath, generatorCode: readGeneratorCode(result.generatorPath, options.includeGeneratorCode), runtimeAvailable: true });
    });
}
function runUltimateDecypher(options, inputPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const toolPath = findUltimateTool();
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
                };
            }
            return runStructuredDecypher(options, inputPath);
        }
        const summaryPath = path.join(os.tmpdir(), `pptxgenjs-decypher-summary-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
        const args = [toolPath, inputPath];
        if (options.outputDir)
            args.push('--output', path.resolve(options.outputDir));
        if (options.autoRegenerate === false)
            args.push('--no-regenerate');
        args.push('--json-summary', summaryPath);
        const proc = yield runProcess(process.execPath, args, process.cwd(), options.timeoutMs);
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
            };
        }
        const summary = readJsonFile(summaryPath);
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
        };
    });
}
export function decypherToGenerator(input) {
    return __awaiter(this, void 0, void 0, function* () {
        const options = typeof input === 'string' ? { pptxPath: input } : input;
        const { inputPath } = materializeInput(options);
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
            };
        }
        if (options.engine === 'structured')
            return runStructuredDecypher(options, inputPath);
        return runUltimateDecypher(options, inputPath);
    });
}
export function decypherToModel(options) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { inputPath, sourceName } = materializeInput(options);
            const decypher = new PptxDecypher(options);
            const result = yield decypher.decypherToModel(inputPath, sourceName);
            if (result.model && options.limitSlides && options.limitSlides > 0) {
                result.model.slides = result.model.slides.slice(0, options.limitSlides);
            }
            return Object.assign(Object.assign({}, result), { runtimeAvailable: true });
        }
        catch (error) {
            return {
                success: false,
                signature: '',
                stats: emptyStats(),
                warnings: [],
                errors: [error instanceof Error ? error.message : String(error)],
                runtimeAvailable: false,
            };
        }
    });
}
export function regenerateFromGenerator(options) {
    return __awaiter(this, void 0, void 0, function* () {
        const generatorPath = path.resolve(options.generatorPath);
        const outputPath = options.outputPath
            ? path.resolve(options.outputPath)
            : path.join(path.dirname(generatorPath), 'output', 'regenerated.pptx');
        const args = [generatorPath];
        if (options.outputPath)
            args.push('--out', outputPath);
        const proc = yield runProcess(process.execPath, args, path.dirname(generatorPath), options.timeoutMs);
        return {
            success: proc.exitCode === 0 && fs.existsSync(outputPath),
            generatorPath,
            outputPath,
            exitCode: proc.exitCode,
            stdout: proc.stdout,
            stderr: proc.stderr,
        };
    });
}
export function comparePresentations(options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const comparatorPath = findComparator(options.comparatorPath);
        if (process.platform !== 'win32') {
            return { success: false, runtimeAvailable: false, error: 'PowerShell comparator is only available on Windows' };
        }
        if (!comparatorPath) {
            return { success: false, runtimeAvailable: false, error: 'Comparator script was not found' };
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
        ];
        if ((_a = options.slides) === null || _a === void 0 ? void 0 : _a.length)
            args.push('-Slides', options.slides.join(','));
        const proc = yield runProcess(powerShellExecutable(), args, process.cwd(), options.timeoutMs || 10 * 60 * 1000);
        return {
            success: proc.exitCode === 0,
            runtimeAvailable: true,
            exitCode: proc.exitCode,
            stdout: proc.stdout,
            stderr: proc.stderr,
        };
    });
}
export function repairCheck(pptxPath_1) {
    return __awaiter(this, arguments, void 0, function* (pptxPath, timeoutMs = 2 * 60 * 1000) {
        if (process.platform !== 'win32') {
            return { success: false, runtimeAvailable: false, error: 'PowerPoint COM repair checks are only available on Windows' };
        }
        const scriptPath = path.join(os.tmpdir(), `pptxgenjs-repair-check-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);
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
        ].join('\n');
        fs.writeFileSync(scriptPath, script);
        const proc = yield runProcess(powerShellExecutable(), ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PptxPath', path.resolve(pptxPath)], process.cwd(), timeoutMs);
        fs.rmSync(scriptPath, { force: true });
        return {
            success: proc.exitCode === 0,
            runtimeAvailable: true,
            exitCode: proc.exitCode,
            stdout: proc.stdout,
            stderr: proc.stderr,
        };
    });
}
//# sourceMappingURL=runner.js.map