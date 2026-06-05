import pkg from "./package.json" with { type: "json" };
import resolve from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import ts from "typescript";

const nodeBuiltinsRE = /^node:.*/; /* Regex that matches all Node built-in specifiers */

function transpileTypeScript() {
	return {
		name: "typescript-transpile",
		transform(code, id) {
			if (!/\.[cm]?tsx?$/.test(id) || /\.d\.[cm]?ts$/.test(id)) return null;
			const result = ts.transpileModule(code, {
				fileName: id,
				compilerOptions: {
					allowSyntheticDefaultImports: true,
					importHelpers: true,
					module: ts.ModuleKind.ESNext,
					sourceMap: true,
					target: ts.ScriptTarget.ES2016,
				},
			});
			return {
				code: result.outputText,
				map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
			};
		},
	};
}

export default {
	input: "src/pptxgen.ts",
	output: [
		{
			file: "./src/bld/pptxgen.js",
			format: "iife",
			name: "PptxGenJS",
			globals: { jszip: "JSZip" },
		},
		{ file: "./src/bld/pptxgen.cjs.js", format: "cjs", exports: "default" },
		{ file: "./src/bld/pptxgen.es.js", format: "es" },
	],
	external: [
		nodeBuiltinsRE,
		...Object.keys(pkg.dependencies || {}),
		...Object.keys(pkg.peerDependencies || {}),
	],
	plugins: [
		resolve({ preferBuiltins: true, extensions: [".mjs", ".js", ".json", ".node", ".ts"] }),
		commonjs(),
		transpileTypeScript(),
	]
};
