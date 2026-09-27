#!/usr/bin/env node
// Private maintainer CLI. This does not activate assets or expose local paths publicly.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { nativeFbxMotionSource } from '../assets/native-fbx-motion-source.mjs'

const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const fail = message => Object.assign(new Error(message), { code: 'NATIVE_MOTION_SOURCE_CLI_INVALID' })
const help = `Convert an original skeletal FBX take to a native-axis motion-only GLB.

Usage:
  node betterpptx-mcp/scripts/convert-native-fbx-motion-source.mjs --input original.fbx --animation source_name --output staging/source-v1.glb

Required:
  --input              Existing original FBX file (never modified).
  --animation          Exact output GLB animation name.
  --output             New versioned GLB path; existing files are refused.

Optional:
  --source-animation   Exact source take name; required for multi-take FBX.
  --report             New private report path (default: OUTPUT.conversion.json).
  --help               Show this message.

The original skeletal basis, names and time keys are retained. There is no
canonical-skeleton bake, pose clamping or source resampling. A private report
binds source/output hashes. This command does not activate a governed source:
independent pose checks and native playback proof are required before activation.
`

export function parseNativeMotionSourceCliArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true }
  const names = new Map([['--input', 'input'], ['--animation', 'animation'], ['--output', 'output'], ['--source-animation', 'sourceAnimation'], ['--report', 'report']])
  const result = {}
  for (let index = 0; index < args.length; index++) {
    const key = names.get(args[index])
    if (!key || Object.hasOwn(result, key)) throw fail('Use each supported option at most once; see --help.')
    const value = args[++index]
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) throw fail(`Missing value for ${args[index - 1]}.`)
    result[key] = value
  }
  if (!result.input || !result.animation || !result.output) throw fail('--input, --animation and --output are required.')
  return result
}

/** Maintainer-only file boundary; pure conversion lives in native-fbx-motion-source.mjs. */
export function convertNativeFbxMotionSourceFiles({ input, animation, output, sourceAnimation, report: reportOption }) {
  if (![input, animation, output].every(value => typeof value === 'string' && value.length > 0)) throw fail('Explicit input, animation and output are required.')
  const inputFile = fs.realpathSync(path.resolve(input)), outputFile = path.resolve(output)
  if (path.extname(inputFile).toLowerCase() !== '.fbx' || path.extname(outputFile).toLowerCase() !== '.glb') throw fail('Input must be FBX and output must be GLB.')
  const reportFile = path.resolve(reportOption || `${outputFile}.conversion.json`)
  if (path.extname(reportFile).toLowerCase() !== '.json') throw fail('The private report must use a JSON filename.')
  const canonical = file => process.platform === 'win32' ? file.toLowerCase() : file
  if (new Set([inputFile, outputFile, reportFile].map(canonical)).size !== 3) throw fail('Input, output and report must be different files.')
  // lstat also rejects existing symlinks, including dangling ones. No overwrite mode exists.
  const requireAbsent = file => {
    try { fs.lstatSync(file) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    throw fail(`Refusing to overwrite existing file: ${file}`)
  }
  requireAbsent(outputFile); requireAbsent(reportFile)
  const stat = fs.statSync(inputFile)
  if (!stat.isFile() || stat.size <= 0 || stat.size > 128 * 1024 * 1024) throw fail('Input must be a nonempty regular FBX file no larger than 128 MiB.')
  const original = fs.readFileSync(inputFile)
  const result = nativeFbxMotionSource(original, { animationName: animation, ...(sourceAnimation === undefined ? {} : { sourceAnimationName: sourceAnimation }) })
  if (hash(fs.readFileSync(inputFile)) !== result.report.sourceSha256) throw fail('The original source changed during conversion; no output was written.')
  const report = { ...result.report, privateMaintainerEvidence: true, inputFile, outputFile, reportFile,
    activationStatus: 'NOT_ACTIVATED', nativePlaybackStatus: 'NOT_VERIFIED',
    timePolicy: 'Seconds as evaluated by the source importer; exact imported key arrays and take endpoint are retained without additional resampling.',
    unitPolicy: 'No additional unit conversion: imported numeric local TRS and ancestor frames are retained. This source-only skeleton is retargeted using its own measured stature, not displayed as a metre-scaled character.',
    restPolicy: 'Original imported skeletal local basis and retained ancestor TRS; no automatic bone orientation or canonical-skeleton replacement.',
    nextRequiredChecks: ['Independent original-source pose parity, including deliberate inversion/travel contrasts.', 'Generic identity retargeting with exact source/rest/profile fingerprints.', 'Native application open/save/reopen/playback and bounded visual review.', 'Explicit governed source activation after proof review.'] }
  const reportBytes = Buffer.from(JSON.stringify(report, null, 2) + '\n')
  fs.mkdirSync(path.dirname(outputFile), { recursive: true }); fs.mkdirSync(path.dirname(reportFile), { recursive: true })
  const resolvedDestinations = [outputFile, reportFile].map(file => canonical(path.join(fs.realpathSync(path.dirname(file)), path.basename(file))))
  if (new Set([canonical(inputFile), ...resolvedDestinations]).size !== 3) throw fail('Resolved input, output and report must be different files.')
  requireAbsent(outputFile); requireAbsent(reportFile)
  // Exclusive file creation is the last-line race guard. If a concurrent writer
  // claims the report after preflight, the GLB can remain for manual inspection;
  // no pre-existing file is removed, replaced or truncated.
  fs.writeFileSync(outputFile, result.buffer, { flag: 'wx' })
  fs.writeFileSync(reportFile, reportBytes, { flag: 'wx' })
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options = parseNativeMotionSourceCliArgs(process.argv.slice(2))
    if (options.help) console.log(help)
    else {
      const report = convertNativeFbxMotionSourceFiles(options)
      console.log(JSON.stringify({ status: 'CONVERTED_NOT_ACTIVATED', outputFile: report.outputFile, reportFile: report.reportFile,
        sourceSha256: report.sourceSha256, outputSha256: report.outputSha256, durationMs: report.outputDurationMs }, null, 2))
    }
  } catch (error) {
    console.error(`${error.code || 'NATIVE_MOTION_SOURCE_CLI_FAILED'}: ${error.message}`)
    process.exitCode = 1
  }
}
