#!/usr/bin/env node
/**
 * PptxDecypher CLI - Command-line interface for PPTX reverse engineering
 *
 * Usage:
 *   npx ts-node src/pptx-decypher/cli.ts <input.pptx> [options]
 *   node dist/pptx-decypher/cli.js <input.pptx> [options]
 *
 * Options:
 *   --output, -o <dir>    Output directory (default: ./decyphered)
 *   --no-xml              Don't extract raw XML files
 *   --no-media            Don't extract media files
 *   --no-validate         Don't run validation after generation
 *   --help, -h            Show help
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fs from 'fs';
import { decypherToGenerator, regenerateFromGenerator } from './index.js';
function parseArgs(args) {
    const result = {
        inputPath: '',
        options: {},
        showHelp: false,
        autoRegenerate: true, // Default to auto-regenerate
        json: false
    };
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--help' || arg === '-h') {
            result.showHelp = true;
        }
        else if (arg === '--output' || arg === '-o') {
            result.options.outputDir = args[++i];
        }
        else if (arg === '--no-xml') {
            result.options.extractXml = false;
        }
        else if (arg === '--no-media') {
            result.options.extractMedia = false;
        }
        else if (arg === '--no-validate') {
            result.options.validate = false;
        }
        else if (arg === '--no-regenerate') {
            result.autoRegenerate = false;
        }
        else if (arg === '--engine') {
            result.options.engine = args[++i];
        }
        else if (arg === '--json') {
            result.json = true;
        }
        else if (!arg.startsWith('-')) {
            result.inputPath = arg;
        }
    }
    return result;
}
function showHelp() {
    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                    PptxDecypher CLI v1.0.0                       ║
║       Reverse engineer PPTX files to PptxGenJS generators        ║
╚══════════════════════════════════════════════════════════════════╝

USAGE:
  npx ts-node src/pptx-decypher/cli.ts <input.pptx> [options]

ARGUMENTS:
  <input.pptx>          Path to the PPTX file to decypher

OPTIONS:
  --output, -o <dir>    Output directory (default: ./decyphered)
  --no-xml              Don't extract raw XML files for debugging
  --no-media            Don't extract media files (images, videos)
  --no-validate         Skip validation after generation
  --no-regenerate       Don't auto-run generator (default: auto-runs)
  --engine <name>       auto, ultimate, or structured (default: auto)
  --json                Print machine-readable JSON result
  --help, -h            Show this help message

EXAMPLES:
  # Basic usage
  npx ts-node src/pptx-decypher/cli.ts presentation.pptx

  # Custom output directory
  npx ts-node src/pptx-decypher/cli.ts presentation.pptx -o ./my-output

  # Minimal extraction (no XML debug files)
  npx ts-node src/pptx-decypher/cli.ts presentation.pptx --no-xml

OUTPUT STRUCTURE:
  decyphered/
  └── {signature}/
      ├── source/           # Copy of original PPTX
      ├── extracted/        # Raw XML files (for debugging)
      ├── assets/           # Extracted media files
      ├── passthrough/      # Unsupported elements (raw XML)
      ├── output/           # Generated PPTX output
      ├── generator.mjs     # Generated PptxGenJS script
      └── metadata.json     # Decypher metadata

PASSTHROUGH ITEMS:
  Elements that cannot be mapped to PptxGenJS API are saved as
  "passthrough" items. These are:
  - Preserved exactly as-is in regenerated PPTX
  - Marked in generator.mjs with __passthrough__ type
  - Cannot be modified until library support is added

For more information, see: PPTX_DECYPHER_README.md
`);
}
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Skip first two args (node and script path)
        const args = process.argv.slice(2);
        const parsed = parseArgs(args);
        if (parsed.showHelp || !parsed.inputPath) {
            showHelp();
            process.exit(parsed.showHelp ? 0 : 1);
        }
        // Validate input file exists
        if (!fs.existsSync(parsed.inputPath)) {
            console.error(`❌ Error: File not found: ${parsed.inputPath}`);
            process.exit(1);
        }
        // Validate it's a PowerPoint file
        if (!/\.(pptx|pptm)$/i.test(parsed.inputPath)) {
            console.error(`❌ Error: Input file must be a .pptx or .pptm file`);
            process.exit(1);
        }
        console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                      PptxDecypher v1.0.0                         ║
╚══════════════════════════════════════════════════════════════════╝
`);
        // Run decypher
        const result = yield decypherToGenerator(Object.assign(Object.assign({}, parsed.options), { pptxPath: parsed.inputPath, autoRegenerate: parsed.autoRegenerate, includeGeneratorCode: false }));
        if (parsed.json) {
            console.log(JSON.stringify(result, null, 2));
            process.exit(result.success ? 0 : 1);
        }
        if (result.success) {
            console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                      DECYPHER COMPLETE                           ║
╚══════════════════════════════════════════════════════════════════╝

📁 Output folder: ${result.outputFolder}
📄 Generator:     ${result.generatorPath}
⚙️ Engine:        ${result.engine}

📊 Statistics:
   • Slides:      ${result.stats.slideCount}
   • Shapes:      ${result.stats.shapeCount}
   • Animations:  ${result.stats.animationCount}
   • Media:       ${result.stats.mediaCount}
   • Passthrough: ${result.stats.passthroughCount}
`);
            if (result.warnings.length > 0) {
                console.log(`⚠️ Warnings (${result.warnings.length}):`);
                for (const warning of result.warnings.slice(0, 10)) {
                    console.log(`   • [${warning.type}] ${warning.location}: ${warning.message}`);
                }
                if (result.warnings.length > 10) {
                    console.log(`   ... and ${result.warnings.length - 10} more`);
                }
            }
            // Auto-regenerate if enabled and the selected engine did not already do it.
            if (parsed.autoRegenerate && result.regenerateSuccess == null) {
                console.log(`\n🔄 Auto-regenerating PPTX...`);
                const regenerated = yield regenerateFromGenerator({ generatorPath: result.generatorPath });
                if (regenerated.success) {
                    console.log(`\n✅ Regeneration complete!`);
                    console.log(`\n🔍 To compare with original:`);
                    console.log(`   .\\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1 \\`);
                    console.log(`     -Reference "${parsed.inputPath}" \\`);
                    console.log(`     -Generated "${regenerated.outputPath}"`);
                }
                else {
                    console.error(`\n❌ Regeneration failed:`, regenerated.stderr || regenerated.stdout);
                    console.log(`\n🚀 To manually regenerate, run:`);
                    console.log(`   node ${result.generatorPath}`);
                }
            }
            else if (parsed.autoRegenerate) {
                console.log(result.regenerateSuccess === false
                    ? `\n❌ Regeneration failed during ${result.engine} decypher: ${result.regenerateError || 'unknown error'}`
                    : `\n✅ Regeneration complete!`);
            }
            else {
                console.log(`
🚀 To regenerate the PPTX, run:
   node ${result.generatorPath}

🔍 To compare with original:
   .\\ULTIMATE_PPTX_XPATH_COMPARATOR_v2h_DECYPHER.ps1 \`
     -Reference "${parsed.inputPath}" \`
     -Generated "${result.outputFolder}/output/regenerated.pptx"
`);
            }
        }
        else {
            console.error(`
╔══════════════════════════════════════════════════════════════════╗
║                      DECYPHER FAILED                             ║
╚══════════════════════════════════════════════════════════════════╝

❌ Errors:
${result.errors.map(e => `   • ${e}`).join('\n')}
`);
            process.exit(1);
        }
    });
}
// Run main
main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map