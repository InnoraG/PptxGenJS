var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import { spawn, spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';
import { DOMParser } from '@xmldom/xmldom';
import { comparePresentations, decypherToGenerator, repairCheck, regenerateFromGenerator, } from '../pptx-decypher/index.js';
import { CLAUDEPPTXMCP_BRAND, loadClaudePptxMcpPresentationEngine } from './showcase.js';
import { buildCapabilityLedger, ledgerSemanticHash } from './capability-ledger.js';
import { buildExpressiveDeck, ExpressiveSpecValidationError } from './expressive.js';
import { buildDesignSystemDeck, listComponents, outlineToDesignSystemSpec, validateComponent } from './design-system.js';
import { assetCatalog, findAsset } from './assets.js';
import { PROCEDURAL_ASSET_KINDS, generateProceduralAsset } from './procedural-assets.js';
import { PROCEDURAL_GEOMETRY_KINDS, generateProceduralGeometry } from './procedural-geometry.js';
import { composeDynamicRecipe, listRecipes, normalizeFeatureBudget, prepareGenerativeSpec, recipeById, recommendRecipes } from './recipes.js';
import { CHART_PRESET_CATALOG, chartPresetById, recommendChartPresets } from './chart-presets.js';
import { POWERPOINT_TABLE_STYLE_OPTIONS, TABLE_PRESET_CATALOG, recommendTablePresets, tablePresetById } from './table-presets.js';
import { listReferenceTargets, publicReferenceTarget, referenceTargetById } from './reference-targets.js';
export { CLAUDEPPTXMCP_BRAND };
const SERVER_VERSION = '1.0.0';
const DEFAULT_MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const DEFAULT_JOB_TIMEOUT_MS = 10 * 60 * 1000;
const publicToolPrefix = 'claudepptxmcp';
const publicTools = [
    {
        name: 'claudepptxmcp.capabilities.query',
        title: 'Query claudepptxmcp capabilities',
        description: 'Return machine-oriented capability chunks, recommended feature budget, and premium recipes for generation, editing, validation, artifacts, and MCP tool use.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string' },
                limit: { type: 'number', default: 8 },
                format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                motionLevel: { type: 'string', enum: ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'], default: 'subtle' },
                chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
            },
        },
    },
    {
        name: 'claudepptxmcp.recipe.list',
        title: 'List reusable design recipes',
        description: 'List claudepptxmcp reusable pattern recipes for rich design, 3D, charts, WordArt, media/voice, motion, transitions, and shape-built visuals. These are generic feature patterns, not fixed topic decks.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string' },
                query: { type: 'string' },
                limit: { type: 'number', default: 20 },
            },
        },
    },
    {
        name: 'claudepptxmcp.recipe.preview',
        title: 'Preview reusable design recipe',
        description: 'Return a recipe contract and example usage so an AI client can apply it deliberately before deck creation.',
        inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.chart.recommend',
        title: 'Recommend chart presets',
        description: 'Return context-adapted PowerPoint chart presets for an AI client. Results label whether a preset is native-chart, native-composite, or shape-built so unsupported PowerPoint picker families are not mistaken for native chartType values.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Brief, chart intent, or data story to match.' },
                chartIntent: { type: 'string', description: 'Specific chart intent such as trend, comparison, distribution, funnel, geography, or dashboard.' },
                dataShape: { type: 'string', description: 'Known data shape such as categorical, time-series, x/y, hierarchy, distribution, bridge, or matrix.' },
                category: { type: 'string', description: 'Optional PowerPoint picker category or tag filter.' },
                authoringMode: { type: 'string', enum: ['native', 'native-composite', 'shape-built'] },
                chartPresetId: { type: 'string', enum: CHART_PRESET_CATALOG.map(preset => preset.id) },
                limit: { type: 'number', default: 8 },
                format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
            },
        },
    },
    {
        name: 'claudepptxmcp.table.recommend',
        title: 'Recommend table presets',
        description: 'Return beautiful, context-adapted PowerPoint table presets for an AI client, including Table Design ribbon variants such as Header Row, Total Row, First/Last Column, and Banded Rows/Columns plus ready-to-apply table and cell styling recipes.',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Brief, table intent, or data story to match.' },
                tableIntent: { type: 'string', description: 'Specific table intent such as KPI scorecard, financial variance, roadmap status, comparison matrix, heatmap, evidence grid, or dense appendix.' },
                dataShape: { type: 'string', description: 'Known row/column shape such as metrics, numeric variance, roadmap status, feature matrix, risk heatmap, or dense data grid.' },
                category: { type: 'string', description: 'Optional PowerPoint picker category or tag filter.' },
                authoringMode: { type: 'string', enum: ['native-table', 'visual-adapted', 'preserve-only'] },
                tablePresetId: { type: 'string', enum: TABLE_PRESET_CATALOG.map(preset => preset.id) },
                limit: { type: 'number', default: 8 },
                format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
            },
        },
    },
    {
        name: 'claudepptxmcp.recipe.compose',
        title: 'Compose dynamic recipe scaffold',
        description: 'Create an on-the-fly, AI-facing recipe scaffold for a new brief. This does not hardcode topic content; it tells the AI client which assets, geometry, tools, and feature gates to use in the same MCP session.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string' },
                brief: { type: 'string' },
                audience: { type: 'string' },
                theme: { type: 'string' },
                style: { type: 'string' },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'cinematic' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                motionLevel: { type: 'string', enum: ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'], default: 'showcase' },
                chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
                assetStrategy: { type: 'string', enum: ['library-first', 'client-provided', 'procedural-fallback', 'procedural-only'], default: 'library-first' },
                minSlides: { type: 'number', description: 'Minimum slide count for broad creative output. Use 1 only for explicit single-slide/minimal requests.' },
                allowSingleSlide: { type: 'boolean', default: false },
            },
        },
    },
    {
        name: 'claudepptxmcp.recipe.apply',
        title: 'Apply reusable design recipes',
        description: 'Apply one or more claudepptxmcp recipes to a draft deck spec. Return an enriched spec by default, or render the deck when render=true.',
        inputSchema: {
            type: 'object',
            properties: {
                spec: { type: 'object' },
                recipeId: { type: 'string' },
                recipeIds: { type: 'array', items: { type: 'string' } },
                mode: { type: 'string', enum: ['expressive', 'design-system'], default: 'design-system' },
                render: { type: 'boolean', default: false },
                outputName: { type: 'string' },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                motionLevel: { type: 'string', enum: ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'], default: 'subtle' },
                chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
            },
        },
    },
    {
        name: 'claudepptxmcp.reference.list',
        title: 'List frozen reference targets',
        description: 'List AI-facing frozen-reference targets that an AI client can recreate through public claudepptxmcp generation tools, then evaluate against repair, comparator, visual, and feature gates.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string' },
                query: { type: 'string' },
                limit: { type: 'number', default: 20 },
            },
        },
    },
    {
        name: 'claudepptxmcp.reference.brief',
        title: 'Get frozen reference recreation brief',
        description: 'Return an AI-facing target brief, recommended recipes/tools, feature budget, and acceptance gates for recreating a frozen reference without using deterministic generator code.',
        inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.reference.evaluate',
        title: 'Evaluate candidate against frozen reference',
        description: 'Evaluate an AI-produced candidate deck against a frozen reference target using package validation, feature gates, optional PowerPoint repair check, and optional comparator.',
        inputSchema: {
            type: 'object',
            required: ['id', 'candidatePath'],
            properties: {
                id: { type: 'string' },
                candidatePath: { type: 'string' },
                compare: { type: 'boolean', default: true },
                repairCheck: { type: 'boolean', default: true },
                visualOracle: { type: 'boolean', default: false },
                timeoutMs: { type: 'number', default: DEFAULT_JOB_TIMEOUT_MS },
            },
        },
    },
    {
        name: 'claudepptxmcp.presentation.create',
        title: 'Create presentation',
        description: 'Create a new custom claudepptxmcp PowerPoint deck. Premium/advanced creative requests are recipe-enriched by default; use mode=expressive for full primitive control and mode=design-system for component/intent driven decks.',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'User-facing deck title.' },
                spec: {
                    type: 'object',
                    description: 'AI-authored deck specification. For creative capability demos, include a unique brief, creativeSeed, audience, designDirection, scenes/slides, and explicit feature intentions instead of calling the frozen validation showcase.',
                    properties: {
                        mode: { type: 'string', enum: ['structured', 'expressive', 'design-system', 'creative-capability-demo', 'creative-showcase', 'capability-demo'], description: 'Prefer top-level mode. Legacy creative-capability-demo aliases route to a public creative/design path.' },
                        creativeSeed: { type: 'string', description: 'Unique deterministic variation seed. Same seed/spec should reproduce the same deck.' },
                        briefId: { type: 'string' },
                        brief: { type: 'string' },
                        audience: { type: 'string' },
                        designDirection: { type: 'object' },
                        featureBudget: { type: 'object' },
                        mustDemonstrate: { type: 'array', items: { type: 'string' } },
                        slides: { type: 'array', items: { type: 'object' } },
                        validation: { type: 'object' },
                    },
                },
                outputName: { type: 'string', description: 'Artifact file name. Use a unique, request-specific name for public creative decks.' },
                mode: { type: 'string', enum: ['structured', 'expressive', 'design-system'], default: 'structured' },
                validate: { type: 'boolean', default: true },
                emitScreenshots: { type: 'boolean', default: false },
                emitCoverageReport: { type: 'boolean', default: false },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                motionLevel: { type: 'string', enum: ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'], default: 'subtle' },
                chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
                recipeIds: { type: 'array', items: { type: 'string' } },
                assetStrategy: { type: 'string', enum: ['library-first', 'client-provided', 'procedural-fallback', 'procedural-only'], default: 'library-first' },
                minSlides: { type: 'number', description: 'Minimum slide count for broad creative output. Defaults to a dense multi-slide deck. Set to 1 only for explicit single-slide requests.' },
                allowSingleSlide: { type: 'boolean', default: false },
            },
        },
    },
    {
        name: 'claudepptxmcp.presentation.create_from_code',
        title: 'Create presentation from trusted code',
        description: 'Run trusted local generator source. Disabled unless code execution is explicitly allowed.',
        inputSchema: {
            type: 'object',
            properties: {
                code: { type: 'string' },
                generatorPath: { type: 'string' },
                generatedPathHint: { type: 'string', description: 'Trusted/local only. Existing output path written by legacy generators that do not honor --out; copied into the MCP job artifact when present.' },
                outputName: { type: 'string' },
                timeoutMs: { type: 'number', default: DEFAULT_JOB_TIMEOUT_MS },
            },
        },
        annotations: { security: 'trusted-local-only' },
    },
    ...['improve', 'edit', 'restyle', 'apply_brand', 'animate', 'upgrade'].map(action => ({
        name: `claudepptxmcp.presentation.${action}`,
        title: `${action.replace('_', ' ')} presentation`,
        description: `Apply deterministic ${action.replace('_', ' ')} instructions to an existing deck or create a demonstration deck when no input deck is supplied.`,
        inputSchema: {
            type: 'object',
            properties: {
                pptxPath: { type: 'string' },
                pptxBase64: { type: 'string' },
                sourceName: { type: 'string' },
                goals: { type: 'string' },
                editSpec: { type: 'object' },
                brandKit: { type: 'object' },
                outputName: { type: 'string' },
                validate: { type: 'boolean', default: true },
                noOpRoundTrip: { type: 'boolean', default: false },
            },
        },
    })),
    {
        name: 'claudepptxmcp.slide.add_with_transition',
        title: 'Create slide with transition',
        description: 'Create a deck containing a new slide with a deterministic transition specimen.',
        inputSchema: { type: 'object', properties: { transition: { type: 'object' }, outputName: { type: 'string' } } },
    },
    ...[
        'object.insert_3d_asset',
        'object.insert_media',
        'object.apply_animation',
        'object.apply_motion_path',
        'object.insert_smartart',
        'object.apply_wordart',
        'object.apply_action',
        'chart.add',
        'table.add',
    ].map(name => ({
        name: `claudepptxmcp.${name}`,
        title: name.split('.').join(' '),
        description: `Create a focused ${name.split('.').join(' ')} feature deck and artifact manifest.`,
        inputSchema: { type: 'object', properties: { outputName: { type: 'string' }, spec: { type: 'object' } } },
    })),
    {
        name: 'claudepptxmcp.presentation.validate',
        title: 'Validate presentation package',
        description: 'Run package/XML/relationship/content-type validation and optional metadata checks.',
        inputSchema: {
            type: 'object',
            required: ['pptxPath'],
            properties: {
                pptxPath: { type: 'string' },
                expectClaudePptxMcpMetadata: { type: 'boolean', default: false },
                visualOracle: { type: 'boolean', default: false },
            },
        },
    },
    {
        name: 'claudepptxmcp.presentation.compare',
        title: 'Compare presentations',
        description: 'Run the local XPath comparator when available.',
        inputSchema: {
            type: 'object',
            required: ['referencePath', 'generatedPath'],
            properties: {
                referencePath: { type: 'string' },
                generatedPath: { type: 'string' },
                slides: { type: 'array', items: { oneOf: [{ type: 'number' }, { type: 'string' }] } },
                comparatorPath: { type: 'string' },
                timeoutMs: { type: 'number', default: DEFAULT_JOB_TIMEOUT_MS },
            },
        },
        annotations: { runtimeGated: true, requires: ['windows', 'powershell', 'comparator-script'] },
    },
    {
        name: 'claudepptxmcp.presentation.repair_check',
        title: 'Check PowerPoint repair behavior',
        description: 'Open a deck through PowerPoint COM as a repair oracle when available.',
        inputSchema: {
            type: 'object',
            required: ['pptxPath'],
            properties: {
                pptxPath: { type: 'string' },
                timeoutMs: { type: 'number', default: 120000 },
            },
        },
        annotations: { runtimeGated: true, requires: ['windows', 'powerpoint-com'] },
    },
    {
        name: 'claudepptxmcp.presentation.snapshot',
        title: 'Snapshot presentation package',
        description: 'Produce a compact direct package snapshot with parts, relationships, media hashes, and content type state.',
        inputSchema: {
            type: 'object',
            required: ['pptxPath'],
            properties: { pptxPath: { type: 'string' }, outputName: { type: 'string' } },
        },
    },
    {
        name: 'claudepptxmcp.artifact.get',
        title: 'Get artifact',
        description: 'Return artifact metadata and optionally base64 content for a job artifact.',
        inputSchema: {
            type: 'object',
            required: ['artifactId'],
            properties: {
                artifactId: { type: 'string' },
                includeBase64: { type: 'boolean', default: false },
            },
        },
    },
    {
        name: 'claudepptxmcp.component.list',
        title: 'List design components',
        description: 'List the claudepptxmcp design-system component catalog with slot schemas.',
        inputSchema: { type: 'object', properties: { category: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.component.validate',
        title: 'Validate design component slots',
        description: 'Validate a component slot payload before rendering a design-system deck.',
        inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, slots: { type: 'object' } } },
    },
    {
        name: 'claudepptxmcp.component.preview',
        title: 'Preview design component',
        description: 'Render a single-component preview deck artifact for inspection.',
        inputSchema: { type: 'object', required: ['name'], properties: { name: { type: 'string' }, slots: { type: 'object' }, outputName: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.asset.list',
        title: 'List presentation assets',
        description: 'List addressable presentation assets as opaque handles for use in deck specs and slide media/model tools. The response does not expose server paths or implementation details.',
        inputSchema: { type: 'object', properties: { category: { type: 'string' }, tag: { type: 'string' }, query: { type: 'string' }, source: { type: 'string' }, limit: { type: 'number', default: 30 }, format: { type: 'string', enum: ['summary', 'full'], default: 'summary' } } },
    },
    {
        name: 'claudepptxmcp.assets.catalog',
        title: 'Catalog presentation assets',
        description: 'Return AI-facing asset catalog entries as opaque handles, including native 3D model choices, poster availability, audio fixtures, textures, images, videos, and shape scenes.',
        inputSchema: {
            type: 'object',
            properties: {
                category: { type: 'string', enum: ['stock', 'icons', 'models3d', 'audio', 'video', 'textures', 'datasets', 'shape-scenes'] },
                tag: { type: 'string' },
                query: { type: 'string' },
                source: { type: 'string' },
                limit: { type: 'number', default: 30 },
                format: { type: 'string', enum: ['summary', 'full'], default: 'summary' },
            },
        },
    },
    {
        name: 'claudepptxmcp.asset.preview',
        title: 'Preview bundled asset',
        description: 'Return metadata and artifact link for a bundled sample asset or preview image.',
        inputSchema: { type: 'object', required: ['handle'], properties: { handle: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.asset.generate',
        title: 'Generate procedural asset',
        description: 'Generate a deterministic native GLB 3D asset and PNG poster fallback for use in an claudepptxmcp presentation job.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: [...PROCEDURAL_ASSET_KINDS], default: 'abstract-hero' },
                seed: { type: 'string' },
                theme: { type: 'string', default: 'cinematic' },
                style: { type: 'string', default: 'cinematic' },
                id: { type: 'string' },
            },
        },
    },
    {
        name: 'claudepptxmcp.narration.generate',
        title: 'Generate narration audio',
        description: 'Generate a WAV narration artifact from text for embedding in a deck. The response reports whether speech synthesis succeeded or an explicit tone fallback was used.',
        inputSchema: {
            type: 'object',
            required: ['text'],
            properties: {
                text: { type: 'string' },
                outputName: { type: 'string', default: 'narration.wav' },
                fallbackToneFrequency: { type: 'number', default: 440 },
            },
        },
    },
    {
        name: 'claudepptxmcp.geometry.generate',
        title: 'Generate native custom geometry',
        description: 'Generate normal expressive slide objects backed by native PowerPoint custom geometry, including world maps, focus regions, routes, masks, layered scenes, contours, and organic shapes.',
        inputSchema: {
            type: 'object',
            properties: {
                kind: { type: 'string', enum: [...PROCEDURAL_GEOMETRY_KINDS], default: 'world-map' },
                seed: { type: 'string' },
                style: { type: 'string', default: 'cinematic' },
                x: { type: 'number' },
                y: { type: 'number' },
                w: { type: 'number' },
                h: { type: 'number' },
                name: { type: 'string' },
                render: { type: 'boolean', default: true },
                outputName: { type: 'string' },
            },
        },
    },
    {
        name: 'claudepptxmcp.brandkit.register',
        title: 'Register brand kit',
        description: 'Store a workspace-scoped brand kit for design-system and expressive decks.',
        inputSchema: { type: 'object', required: ['brandKit'], properties: { brandKit: { type: 'object' }, name: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.brandkit.list',
        title: 'List brand kits',
        description: 'List workspace-scoped claudepptxmcp brand kits.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'claudepptxmcp.deck.fromOutline',
        title: 'Create deck from outline',
        description: 'Convert a markdown outline into a premium design-system deck spec with recipe-based enrichment, optionally rendering immediately.',
        inputSchema: {
            type: 'object',
            required: ['outline'],
            properties: {
                outline: { type: 'string' },
                intent: { type: 'object' },
                brandKit: { type: 'object' },
                render: { type: 'boolean', default: true },
                outputName: { type: 'string' },
                title: { type: 'string' },
                visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' },
                featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' },
                motionLevel: { type: 'string', enum: ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'], default: 'subtle' },
                chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' },
                requireFeatures: { type: 'array', items: { type: 'string' } },
                recipeIds: { type: 'array', items: { type: 'string' } },
            },
        },
    },
    {
        name: 'claudepptxmcp.deck.refine',
        title: 'Refine deck with feedback',
        description: 'Apply structured feedback to an existing deck using the edit pipeline and return refreshed artifacts.',
        inputSchema: { type: 'object', required: ['pptxPath'], properties: { pptxPath: { type: 'string' }, feedback: { type: 'string' }, editSpec: { type: 'object' }, outputName: { type: 'string' }, visualOracle: { type: 'boolean', default: false }, visualQuality: { type: 'string', enum: ['standard', 'premium', 'cinematic', 'reference'], default: 'premium' }, featureDepth: { type: 'string', enum: ['basic', 'advanced', 'exhaustive'], default: 'advanced' }, motionLevel: { type: 'string', enum: ['none', 'subtle', 'showcase', 'dynamic', 'cinematic', 'autoplay-live'], default: 'subtle' }, chartRichness: { type: 'string', enum: ['native', 'hybrid', 'executive-dashboard'], default: 'hybrid' }, requireFeatures: { type: 'array', items: { type: 'string' } } } },
    },
];
const internalTools = [
    {
        name: 'claudepptxmcp.internal.decypher',
        title: 'Internal decypher',
        description: 'Developer/admin-only deck decypher tool.',
        inputSchema: { type: 'object', properties: { pptxPath: { type: 'string' }, pptxBase64: { type: 'string' }, sourceName: { type: 'string' }, autoRegenerate: { type: 'boolean' } } },
    },
    {
        name: 'claudepptxmcp.internal.regenerate',
        title: 'Internal regenerate',
        description: 'Developer/admin-only generator rerun tool.',
        inputSchema: { type: 'object', required: ['generatorPath'], properties: { generatorPath: { type: 'string' }, outputPath: { type: 'string' }, timeoutMs: { type: 'number' } } },
    },
    {
        name: 'claudepptxmcp.internal.package_snapshot',
        title: 'Internal package snapshot',
        description: 'Developer/admin-only package snapshot tool.',
        inputSchema: { type: 'object', required: ['pptxPath'], properties: { pptxPath: { type: 'string' } } },
    },
    {
        name: 'claudepptxmcp.internal.visual_oracle',
        title: 'Internal visual oracle',
        description: 'Developer/admin-only PowerPoint PNG export when available.',
        inputSchema: { type: 'object', required: ['pptxPath'], properties: { pptxPath: { type: 'string' }, slides: { type: 'array', items: { type: 'number' } } } },
    },
];
export function getClaudePptxMcpTools(options = {}) {
    return options.developerTools ? [...publicTools, ...internalTools] : publicTools;
}
export function serverInfo() {
    return { name: CLAUDEPPTXMCP_BRAND, version: SERVER_VERSION };
}
export function serverInstructions(options = {}) {
    const admin = options.developerTools ? ' Developer tools are enabled for this session.' : '';
    return `${CLAUDEPPTXMCP_BRAND} is a self-contained PPTX generation, editing, artifact, and validation MCP. The AI client can use this MCP directly for PPTX tasks without calling another PPTX authoring library. Public tools are claudepptxmcp.* and generated decks use ${CLAUDEPPTXMCP_BRAND} metadata. Use capabilities, recipes, assets, geometry, presentation creation/editing, package validation, comparison, and artifact tools as composable generic building blocks for the user's requested deck or edit.${admin}`;
}
function packageRootCandidates() {
    const here = path.dirname(fileURLToPath(import.meta.url));
    return [
        process.cwd(),
        path.resolve(here, '..', '..'),
        path.resolve(here, '..', '..', '..'),
    ];
}
function repoRoot() {
    for (const candidate of packageRootCandidates()) {
        if (fs.existsSync(path.join(candidate, 'package.json')))
            return candidate;
    }
    return process.cwd();
}
function workspaceRoot(options = {}) {
    return path.resolve(options.storage || options.workspace || path.join(process.cwd(), 'claudepptxmcp-workspace'));
}
function jobsRoot(options = {}) {
    return path.join(workspaceRoot(options), 'claudepptxmcp-jobs');
}
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
function withEngineConsoleSilenced(fn) {
    return __awaiter(this, void 0, void 0, function* () {
        const originalLog = console.log;
        console.log = () => undefined;
        try {
            return yield fn();
        }
        finally {
            console.log = originalLog;
        }
    });
}
function nowIso() {
    return new Date().toISOString();
}
function newJobId(kind) {
    const safeKind = kind.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'job';
    return `${safeKind}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
function hashFile(filePath) {
    const hash = crypto.createHash('sha256');
    hash.update(fs.readFileSync(filePath));
    return hash.digest('hex');
}
function normalizePublicPath(value) {
    return value.replace(/\\/g, '/');
}
function artifactJobPath(manifest, filePath) {
    const abs = path.resolve(filePath);
    if (isInside(manifest.jobDir, abs))
        return normalizePublicPath(path.relative(manifest.jobDir, abs));
    return normalizePublicPath(path.basename(abs));
}
function sanitizePublicString(value, options = {}, manifest) {
    const targets = [
        manifest === null || manifest === void 0 ? void 0 : manifest.jobDir,
        jobsRoot(options),
        workspaceRoot(options),
        repoRoot(),
        process.cwd(),
    ].filter((item) => !!item);
    const uniqueTargets = [...new Set(targets.map(item => path.resolve(item)))].sort((a, b) => b.length - a.length);
    let sanitized = value;
    for (const target of uniqueTargets) {
        const replacement = manifest && path.resolve(target) === path.resolve(manifest.jobDir)
            ? `claudepptxmcp-jobs/${manifest.jobId}`
            : '<claudepptxmcp-runtime>';
        sanitized = sanitized.split(target).join(replacement);
        sanitized = sanitized.split(normalizePublicPath(target)).join(replacement);
        sanitized = sanitized.split(target.replace(/\\/g, '\\\\')).join(replacement);
    }
    return sanitized;
}
function sanitizePublicData(value, options = {}, manifest) {
    if (typeof value === 'string')
        return sanitizePublicString(value, options, manifest);
    if (Array.isArray(value))
        return value.map(item => sanitizePublicData(item, options, manifest));
    if (value && typeof value === 'object') {
        const output = {};
        for (const [key, item] of Object.entries(value)) {
            output[key] = sanitizePublicData(item, options, manifest);
        }
        return output;
    }
    return value;
}
function publicArtifact(record, options) {
    const { filePath } = record, publicRecord = __rest(record, ["filePath"]);
    return publicRecord;
}
function resolveSerializedArtifactPath(artifact, options) {
    if (path.isAbsolute(artifact.filePath))
        return artifact.filePath;
    return resolveContained(jobsRoot(options), path.join(artifact.jobId, artifact.filePath));
}
function addArtifact(manifest, filePath, kind, mimeType, description, options = {}) {
    const abs = path.resolve(filePath);
    const stat = fs.statSync(abs);
    const sha256 = hashFile(abs);
    const id = `art_${sha256.slice(0, 14)}_${crypto.randomBytes(3).toString('hex')}`;
    const record = {
        id,
        jobId: manifest.jobId,
        kind,
        name: path.basename(abs),
        uri: `claudepptxmcp-artifact://${id}`,
        mimeType,
        bytes: stat.size,
        sha256,
        description,
        path: artifactJobPath(manifest, abs),
        filePath: abs,
    };
    manifest.artifacts.push(record);
    return publicArtifact(record, options);
}
function writeManifest(manifest, options = {}) {
    const manifestPath = path.join(manifest.jobDir, 'manifest.json');
    const publicManifest = sanitizePublicData(Object.assign(Object.assign({}, manifest), { workspaceRoot: '<claudepptxmcp-runtime>', jobDir: `claudepptxmcp-jobs/${manifest.jobId}`, artifacts: manifest.artifacts.map((_a) => {
            var { filePath } = _a, rest = __rest(_a, ["filePath"]);
            return (Object.assign(Object.assign({}, rest), { path: artifactJobPath(manifest, filePath), filePath: artifactJobPath(manifest, filePath) }));
        }) }), options, manifest);
    fs.writeFileSync(manifestPath, JSON.stringify(Object.assign({}, publicManifest), null, 2));
    return manifestPath;
}
function jsonArtifact(manifest, name, data, kind, description, options) {
    const filePath = path.join(manifest.jobDir, name);
    fs.writeFileSync(filePath, JSON.stringify(sanitizePublicData(data, options, manifest), null, 2));
    return addArtifact(manifest, filePath, kind, 'application/json', description, options);
}
function textArtifact(manifest, name, text, kind, description, options) {
    const filePath = path.join(manifest.jobDir, name);
    fs.writeFileSync(filePath, sanitizePublicString(text, options, manifest));
    return addArtifact(manifest, filePath, kind, 'text/plain', description, options);
}
function createManifest(kind, options) {
    const root = jobsRoot(options);
    ensureDir(root);
    const jobId = newJobId(kind);
    const jobDir = path.join(root, jobId);
    ensureDir(jobDir);
    return {
        jobId,
        kind,
        status: 'succeeded',
        createdAt: nowIso(),
        brand: CLAUDEPPTXMCP_BRAND,
        workspaceRoot: workspaceRoot(options),
        jobDir,
        artifacts: [],
        warnings: [],
        validation: undefined,
        logs: [],
    };
}
function toolResponse(structuredContent, isError = false) {
    return {
        content: [{ type: 'text', text: JSON.stringify(structuredContent, null, 2) }],
        structuredContent,
        isError,
    };
}
function successJobResponse(manifest, options) {
    const manifestPath = writeManifest(manifest, options);
    const manifestArtifact = addArtifact(manifest, manifestPath, 'manifest', 'application/json', 'Job artifact manifest', options);
    writeManifest(manifest, options);
    return Object.assign({ jobId: manifest.jobId, status: manifest.status, brand: manifest.brand, artifacts: [...manifest.artifacts.map(artifact => publicArtifact(artifact, options))].filter(artifact => artifact.id !== manifestArtifact.id).concat(manifestArtifact), warnings: manifest.warnings, validation: sanitizePublicData(manifest.validation, options, manifest), logsRef: sanitizePublicData(manifest.logs, options, manifest) }, (manifest.error ? { error: sanitizePublicString(manifest.error, options, manifest) } : {}));
}
function errorResult(code, message, details) {
    return toolResponse({ success: false, code, message, details }, true);
}
function isInside(parent, candidate) {
    const relative = path.relative(path.resolve(parent), path.resolve(candidate));
    return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}
function resolveContained(root, value) {
    const resolved = path.resolve(root, value);
    if (!isInside(root, resolved)) {
        throw new Error(`Path is outside the configured ${CLAUDEPPTXMCP_BRAND} workspace`);
    }
    return resolved;
}
function resolveInputPath(value, options) {
    const root = workspaceRoot(options);
    const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(root, value);
    if (!isInside(root, resolved)) {
        throw new Error(`Input path is outside the allowed ${CLAUDEPPTXMCP_BRAND} workspace`);
    }
    return resolved;
}
function materializePptxInput(args, manifest, options) {
    if (args === null || args === void 0 ? void 0 : args.pptxPath) {
        const inputPath = resolveInputPath(String(args.pptxPath), options);
        if (!fs.existsSync(inputPath))
            throw new Error(`Input deck not found: ${inputPath}`);
        return inputPath;
    }
    if (!(args === null || args === void 0 ? void 0 : args.pptxBase64))
        throw new Error('Either pptxPath or pptxBase64 is required');
    const sourceName = path.basename(String(args.sourceName || 'uploaded.pptx'));
    const data = String(args.pptxBase64);
    const bytes = Buffer.byteLength(data, 'base64');
    const maxUploadBytes = options.maxUploadBytes || DEFAULT_MAX_UPLOAD_BYTES;
    if (bytes > maxUploadBytes) {
        throw new Error(`Upload exceeds ${maxUploadBytes} byte limit`);
    }
    const inputPath = path.join(manifest.jobDir, 'input', sourceName);
    ensureDir(path.dirname(inputPath));
    fs.writeFileSync(inputPath, Buffer.from(data, 'base64'));
    addArtifact(manifest, inputPath, 'input', contentTypeFor(inputPath), 'Uploaded source deck', options);
    return inputPath;
}
function contentTypeFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pptx')
        return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (ext === '.pptm')
        return 'application/vnd.ms-powerpoint.presentation.macroEnabled.12';
    if (ext === '.json')
        return 'application/json';
    if (ext === '.mjs' || ext === '.js')
        return 'text/javascript';
    if (ext === '.png')
        return 'image/png';
    if (ext === '.jpg' || ext === '.jpeg')
        return 'image/jpeg';
    if (ext === '.svg')
        return 'image/svg+xml';
    if (ext === '.wav')
        return 'audio/wav';
    if (ext === '.mp3')
        return 'audio/mpeg';
    if (ext === '.mp4' || ext === '.m4v')
        return 'video/mp4';
    if (ext === '.log' || ext === '.txt')
        return 'text/plain';
    return 'application/octet-stream';
}
function writeToneWav(filePath, seconds = 1.4, frequency = 440) {
    const sampleRate = 22050;
    const samples = Math.max(1, Math.floor(sampleRate * seconds));
    const data = Buffer.alloc(samples * 2);
    for (let i = 0; i < samples; i++) {
        const envelope = Math.min(1, i / (sampleRate * 0.08), (samples - i) / (sampleRate * 0.1));
        const value = Math.round(Math.sin((2 * Math.PI * frequency * i) / sampleRate) * 10000 * Math.max(0, envelope));
        data.writeInt16LE(value, i * 2);
    }
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(sampleRate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write('data', 36);
    header.writeUInt32LE(data.length, 40);
    fs.writeFileSync(filePath, Buffer.concat([header, data]));
}
function writeSpeechOrToneWav(filePath, text, toneFrequency) {
    if (process.platform === 'win32') {
        const scriptPath = `${filePath}.speech.ps1`;
        const script = [
            'param([string]$Text,[string]$OutPath)',
            "$ErrorActionPreference='Stop'",
            'Add-Type -AssemblyName System.Speech',
            '$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer',
            '$synth.Rate=-1',
            '$synth.Volume=92',
            '$synth.SetOutputToWaveFile([IO.Path]::GetFullPath($OutPath))',
            '$synth.Speak($Text)',
            '$synth.Dispose()',
        ].join('\n');
        fs.writeFileSync(scriptPath, script);
        const proc = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-Text', text, '-OutPath', filePath], {
            encoding: 'utf8',
            timeout: 15000,
            windowsHide: true,
        });
        fs.rmSync(scriptPath, { force: true });
        if (proc.status === 0 && fs.existsSync(filePath) && fs.statSync(filePath).size > 1024)
            return false;
    }
    writeToneWav(filePath, 1.35, toneFrequency);
    return true;
}
function findCapabilitiesPath() {
    for (const root of packageRootCandidates()) {
        const candidate = path.join(root, 'docs', 'capabilities', 'claudepptxmcp-capabilities.json');
        if (fs.existsSync(candidate))
            return candidate;
    }
    return null;
}
function loadCapabilities() {
    const capabilitiesPath = findCapabilitiesPath();
    if (!capabilitiesPath) {
        return {
            generatedAt: null,
            runtime_surfaces: {},
            mcp_tools: getClaudePptxMcpTools({ developerTools: false }),
            warnings: ['Capability JSON was not found; returning claudepptxmcp tool contracts only.'],
        };
    }
    return JSON.parse(fs.readFileSync(capabilitiesPath, 'utf8'));
}
function toPublicBrand(value) {
    if (typeof value === 'string') {
        return value
            .split('PptxGenJS').join(CLAUDEPPTXMCP_BRAND)
            .split('pptxgenjs').join('claudepptxmcp')
            .split('PPTXGENJS').join('CLAUDEPPTXMCP')
            .split('pptx.').join('claudepptxmcp.')
            .split('PPTX.').join('CLAUDEPPTXMCP.');
    }
    if (Array.isArray(value))
        return value.map(toPublicBrand);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) {
            out[toPublicBrand(key)] = toPublicBrand(item);
        }
        return out;
    }
    return value;
}
function textOf(value) {
    return JSON.stringify(value, null, 0).toLowerCase();
}
function pushObjectChunks(chunks, prefix, value) {
    if (!value)
        return;
    if (Array.isArray(value)) {
        value.forEach((item, index) => chunks.push({ id: `${prefix}.${index}`, family: prefix, payload: item, text: textOf(item) }));
        return;
    }
    for (const [key, payload] of Object.entries(value)) {
        chunks.push({ id: `${prefix}.${key}`, family: prefix, payload, text: textOf(payload) });
    }
}
function buildCapabilityChunks(capabilities) {
    const publicCapabilities = toPublicBrand(capabilities);
    const ledger = buildCapabilityLedger(capabilities, CLAUDEPPTXMCP_BRAND);
    const chunks = [];
    chunks.push({ id: 'package', family: 'package', payload: publicCapabilities.package || {}, text: textOf(publicCapabilities.package || {}) });
    chunks.push({ id: 'exhaustive_capability_ledger.summary', family: 'exhaustive_capability_ledger', payload: ledger.summary, text: textOf(ledger.summary) });
    for (const row of ledger.rows) {
        chunks.push({ id: row.featureId, family: 'exhaustive_capability_ledger', payload: row, text: textOf(row) });
    }
    pushObjectChunks(chunks, 'runtime_surfaces', publicCapabilities.runtime_surfaces || publicCapabilities.runtimeSurfaces);
    pushObjectChunks(chunks, 'capability_atoms', publicCapabilities.capability_atoms || publicCapabilities.capabilityAtoms);
    pushObjectChunks(chunks, 'generation_recipes', publicCapabilities.generation_recipes || publicCapabilities.generationRecipes);
    pushObjectChunks(chunks, 'mcp_tools', getClaudePptxMcpTools({ developerTools: false }));
    pushObjectChunks(chunks, 'claudepptxmcp_recipes', listRecipes());
    pushObjectChunks(chunks, 'chart_presets', CHART_PRESET_CATALOG);
    pushObjectChunks(chunks, 'claudepptxmcp_reference_targets', listReferenceTargets().map(publicReferenceTarget));
    pushObjectChunks(chunks, 'coverage_matrix', publicCapabilities.coverage_matrix || publicCapabilities.coverageMatrix);
    pushObjectChunks(chunks, 'feature_groups', publicCapabilities.featureGroups);
    pushObjectChunks(chunks, 'key_option_interfaces', publicCapabilities.keyOptionInterfaces);
    return chunks;
}
function scoreChunk(query, chunkText) {
    if (!query)
        return 1;
    const terms = query.toLowerCase().split(/[^a-z0-9_:.+-]+/).filter(Boolean);
    if (!terms.length)
        return 1;
    let score = 0;
    for (const term of terms) {
        if (chunkText.includes(term))
            score += term.length > 3 ? 2 : 1;
    }
    return score;
}
function publicAssetCatalogItem(asset, full = false) {
    const base = {
        handle: asset.handle,
        category: asset.category,
        altText: asset.altText,
        tags: asset.tags || [],
        usage: asset.usage,
        hasPreview: !!asset.preview,
        useWith: asset.category === 'models3d'
            ? ['model3d slots', 'claudepptxmcp.object.insert_3d_asset', 'presentation.create expressive/design-system model3d objects']
            : asset.category === 'audio'
                ? ['narration/audio slots', 'media objects', 'claudepptxmcp.narration.generate']
                : ['presentation.create media slots', 'asset.preview', 'slide media/image tools'],
    };
    if (asset.category === 'models3d') {
        base.model3d = {
            handle: asset.handle,
            posterRequired: true,
            previewAvailable: !!asset.preview,
        };
    }
    if (!full)
        return base;
    const metadata = asset.metadata || {};
    const safeMetadata = Object.fromEntries(Object.entries({
        title: metadata.title,
        categories: metadata.categories,
        aliases: metadata.aliases,
        animated: metadata.animated,
        duplicateCount: metadata.duplicateCount,
    }).filter(([, value]) => value !== undefined && value !== null));
    return Object.assign(Object.assign({}, base), { sourceCategory: asset.sourceCategory, metadata: safeMetadata });
}
function publicAssetCatalog(args) {
    const category = (args === null || args === void 0 ? void 0 : args.category) ? String(args.category) : '';
    const tag = (args === null || args === void 0 ? void 0 : args.tag) ? String(args.tag).toLowerCase() : '';
    const source = (args === null || args === void 0 ? void 0 : args.source) ? String(args.source).toLowerCase() : '';
    const query = String((args === null || args === void 0 ? void 0 : args.query) || '');
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || 30), 100));
    const full = (args === null || args === void 0 ? void 0 : args.format) === 'full';
    const root = repoRoot();
    const items = assetCatalog(root)
        .filter(asset => !category || asset.category === category)
        .filter(asset => { var _a; return !tag || ((_a = asset.tags) === null || _a === void 0 ? void 0 : _a.some(item => item.toLowerCase() === tag)); })
        .filter(asset => !source || [asset.source, asset.sourceKey, asset.sourceLabel, asset.sourceCategory, asset.category]
        .some(value => String(value || '').toLowerCase() === source))
        .map(asset => ({ asset, score: scoreChunk(query, textOf(publicAssetCatalogItem(asset, true))) }))
        .filter(item => !query || item.score > 0)
        .sort((a, b) => b.score - a.score || Number(b.asset.sourcePriority || 0) - Number(a.asset.sourcePriority || 0) || a.asset.handle.localeCompare(b.asset.handle))
        .slice(0, limit)
        .map(item => publicAssetCatalogItem(item.asset, full));
    return {
        brand: CLAUDEPPTXMCP_BRAND,
        count: items.length,
        assets: items,
        workflow: [
            'Choose an asset by opaque handle.',
            'Use claudepptxmcp.asset.preview when a visual/audio preview artifact is needed.',
            'Use model3d handles in model3d slots or slide.add_model3d; use audio handles or claudepptxmcp.narration.generate for narration media.',
            'Validate the deck after embedding assets.',
        ],
    };
}
function publicChartPreset(preset, full = false) {
    const base = {
        id: preset.id,
        title: preset.title,
        powerPointCategory: preset.powerPointCategory,
        powerPointPreset: preset.powerPointPreset,
        authoringMode: preset.authoringMode,
        chartType: preset.chartType,
        chartTypes: preset.chartTypes,
        shapeBuiltVisual: preset.shapeBuiltVisual,
        dataShape: preset.dataShape,
        requiredFields: preset.requiredFields,
        useWhen: preset.useWhen,
        avoidWhen: preset.avoidWhen,
        optionDefaults: preset.optionDefaults,
        fidelityNote: preset.fidelityNote,
    };
    return full ? Object.assign(Object.assign({}, base), { tags: preset.tags, sampleData: preset.sampleData }) : base;
}
function publicTablePreset(preset, full = false) {
    const base = {
        id: preset.id,
        title: preset.title,
        powerPointCategory: preset.powerPointCategory,
        powerPointPreset: preset.powerPointPreset,
        authoringMode: preset.authoringMode,
        tableIntent: preset.tableIntent,
        dataShape: preset.dataShape,
        requiredStructure: preset.requiredStructure,
        useWhen: preset.useWhen,
        avoidWhen: preset.avoidWhen,
        tableStyleOptions: preset.tableStyleOptions,
        optionDefaults: preset.optionDefaults,
        cellStyleRecipe: preset.cellStyleRecipe,
        layoutGuardrails: preset.layoutGuardrails,
        fidelityNote: preset.fidelityNote,
    };
    return full ? Object.assign(Object.assign({}, base), { tags: preset.tags, sampleRows: preset.sampleRows }) : base;
}
function chartRecommend(args) {
    const featureBudget = normalizeFeatureBudget(args);
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || 8), CHART_PRESET_CATALOG.length));
    const format = (args === null || args === void 0 ? void 0 : args.format) === 'full' ? 'full' : 'summary';
    const query = String((args === null || args === void 0 ? void 0 : args.query) || (args === null || args === void 0 ? void 0 : args.chartIntent) || (args === null || args === void 0 ? void 0 : args.dataShape) || (args === null || args === void 0 ? void 0 : args.category) || '');
    const recommended = recommendChartPresets(query, featureBudget, args)
        .slice(0, limit)
        .map(item => ({
        score: item.score,
        selectionReason: item.selectionReason,
        preset: publicChartPreset(item.preset, format === 'full'),
    }));
    return {
        brand: CLAUDEPPTXMCP_BRAND,
        query,
        chartIntent: (args === null || args === void 0 ? void 0 : args.chartIntent) || null,
        dataShape: (args === null || args === void 0 ? void 0 : args.dataShape) || null,
        featureBudget,
        nativeChartTypes: ['area', 'bar', 'bar3D', 'bubble', 'bubble3D', 'doughnut', 'line', 'pie', 'radar', 'scatter', 'treemap', 'sunburst', 'histogram', 'pareto', 'boxWhisker', 'waterfall', 'funnel', 'regionMap'],
        pickerCategoryPolicy: {
            native: ['Column via bar + barDir=col', 'Bar', 'Line', 'Pie', 'Doughnut', 'Area', 'X Y (Scatter)', 'Bubble', 'Radar', 'Combo from supported native base types', 'Treemap', 'Sunburst', 'Histogram', 'Pareto', 'Box & Whisker', 'Waterfall', 'Funnel', 'Filled Map / regionMap'],
            shapeBuiltOrPreserveOnly: ['Stock', 'Surface'],
            rule: 'Use preset.chartType as addChart chartType when authoringMode is native. ChartEx picker families are native-editable for new authoring; exact imported ChartEx stays passthrough until the first update_chart edit promotes it to native editable ChartEx.',
        },
        presets: recommended,
        relatedRecipes: recommendRecipes(query || 'charts', featureBudget)
            .filter(recipe => recipe.category === 'charts' || recipe.featureHighlights.includes('shape-built-chart'))
            .slice(0, 4),
    };
}
function tableRecommend(args) {
    const featureBudget = normalizeFeatureBudget(args);
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || 8), TABLE_PRESET_CATALOG.length));
    const format = (args === null || args === void 0 ? void 0 : args.format) === 'full' ? 'full' : 'summary';
    const query = String((args === null || args === void 0 ? void 0 : args.query) || (args === null || args === void 0 ? void 0 : args.tableIntent) || (args === null || args === void 0 ? void 0 : args.dataShape) || (args === null || args === void 0 ? void 0 : args.category) || '');
    const recommended = recommendTablePresets(query, featureBudget, args)
        .slice(0, limit)
        .map(item => ({
        score: item.score,
        selectionReason: item.selectionReason,
        preset: publicTablePreset(item.preset, format === 'full'),
    }));
    return {
        brand: CLAUDEPPTXMCP_BRAND,
        query,
        tableIntent: (args === null || args === void 0 ? void 0 : args.tableIntent) || null,
        dataShape: (args === null || args === void 0 ? void 0 : args.dataShape) || null,
        featureBudget,
        ribbonOptions: POWERPOINT_TABLE_STYLE_OPTIONS,
        authoringPolicy: {
            native: 'Use tableStyleId plus Header Row, Total Row, First/Last Column, and Banded Rows/Columns when a native PowerPoint table style is known.',
            visualAdapted: 'For the most beautiful generated tables, apply preset.optionDefaults to slide.add_table options and apply preset.cellStyleRecipe to header, body, banded, total, first-column, last-column, and semantic cells.',
            layoutPreflight: 'Before drawing, apply preset.layoutGuardrails: reserve slide safe area, compute table width from colW, reject or revise side panels that push the visual group past the safe right edge, and keep every table/label inside the safe area including shadow padding.',
            overlays: 'Overlay chips, labels, or callouts must be cell-anchored from table x/y/colW/rowH. If the overlay cannot be tied to a specific cell or merged span, put the text inside the table cell instead.',
            preserveOnly: 'Exact unfamiliar PowerPoint table style IDs and custom tableStyles.xml definitions should be preserved from imported/reference decks rather than guessed.',
        },
        presets: recommended,
        relatedRecipes: recommendRecipes(query || 'tables', featureBudget)
            .filter(recipe => recipe.featureHighlights.includes('tables') || recipe.category === 'layout')
            .slice(0, 4),
    };
}
function queryCapabilities(args) {
    const capabilities = loadCapabilities();
    const ledger = buildCapabilityLedger(capabilities, CLAUDEPPTXMCP_BRAND);
    const query = String((args === null || args === void 0 ? void 0 : args.query) || '');
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || 8), 50));
    const format = (args === null || args === void 0 ? void 0 : args.format) === 'full' ? 'full' : 'summary';
    const featureBudget = normalizeFeatureBudget(args);
    const recommendedRecipes = recommendRecipes(query, featureBudget).slice(0, 8);
    const recommendedChartPresets = recommendChartPresets(query, featureBudget, args).slice(0, 8);
    const recommendedTablePresets = recommendTablePresets(query, featureBudget, args).slice(0, 8);
    const chunks = buildCapabilityChunks(capabilities)
        .map(chunk => (Object.assign(Object.assign({}, chunk), { score: scoreChunk(query, chunk.text) })))
        .filter(chunk => chunk.score > 0)
        .sort((a, b) => b.score - a.score || String(a.id).localeCompare(String(b.id)))
        .slice(0, limit)
        .map((_a) => {
        var { text } = _a, chunk = __rest(_a, ["text"]);
        return format === 'full' ? chunk : {
            id: chunk.id,
            family: chunk.family,
            score: chunk.score,
            payload: chunk.payload,
        };
    });
    return Object.assign(Object.assign(Object.assign(Object.assign({ brand: CLAUDEPPTXMCP_BRAND, query,
        format, source: findCapabilitiesPath() ? 'packaged-capabilities' : null, counts: capabilities.counts, ledgerSummary: ledger.summary, semanticHash: ledgerSemanticHash(ledger), publicTools: getClaudePptxMcpTools({ developerTools: false }).map(tool => tool.name), recommendedFeatureBudget: featureBudget, recommendedWorkflow: {
            primaryCreativeTool: 'claudepptxmcp.recipe.compose',
            reason: 'For bespoke creative prompts, let the AI client compose the topic-specific story while claudepptxmcp generates needed assets, geometry, package artifacts, and validation in the same session.',
            sequence: ['claudepptxmcp.capabilities.query', 'claudepptxmcp.recipe.compose', 'claudepptxmcp.assets.catalog', 'claudepptxmcp.narration.generate', 'claudepptxmcp.asset.generate', 'claudepptxmcp.geometry.generate', 'claudepptxmcp.presentation.create', 'claudepptxmcp.presentation.validate', 'claudepptxmcp.artifact.get'],
        } }, (query ? { dynamicRecipeScaffold: composeDynamicRecipe(Object.assign(Object.assign({}, args), { brief: query })) } : {})), { recommendedRecipes, recommendedChartPresets: recommendedChartPresets.map(item => ({
            score: item.score,
            selectionReason: item.selectionReason,
            preset: publicChartPreset(item.preset, format === 'full'),
        })), recommendedTablePresets: recommendedTablePresets.map(item => ({
            score: item.score,
            selectionReason: item.selectionReason,
            preset: publicTablePreset(item.preset, format === 'full'),
        })) }), (format === 'full' ? { capabilityLedger: ledger } : {})), { chunks });
}
function referenceList(args) {
    const category = (args === null || args === void 0 ? void 0 : args.category) ? String(args.category).toLowerCase() : '';
    const query = String((args === null || args === void 0 ? void 0 : args.query) || '');
    const limit = Math.max(1, Math.min(Number((args === null || args === void 0 ? void 0 : args.limit) || 20), 100));
    const targets = listReferenceTargets()
        .map(target => ({ target, score: scoreChunk(query, textOf(publicReferenceTarget(target))) }))
        .filter(item => (!category || item.target.category.toLowerCase() === category) && (!query || item.score > 0))
        .sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id))
        .slice(0, limit)
        .map(item => publicReferenceTarget(item.target));
    return {
        brand: CLAUDEPPTXMCP_BRAND,
        count: targets.length,
        targets,
        workflow: [
            'Call claudepptxmcp.reference.brief for the selected target.',
            'Have the AI author a fresh expressive/design-system spec using public claudepptxmcp tools and recommended recipes.',
            'Generate the candidate with claudepptxmcp.presentation.create or claudepptxmcp.deck.fromOutline.',
            'Evaluate the candidate with claudepptxmcp.reference.evaluate and iterate until gates pass.',
        ],
    };
}
function referenceBrief(args) {
    const target = referenceTargetById(String((args === null || args === void 0 ? void 0 : args.id) || ''));
    if (!target)
        return null;
    const featureBudget = normalizeFeatureBudget({
        visualQuality: 'reference',
        featureDepth: 'exhaustive',
        motionLevel: 'showcase',
        chartRichness: target.category === 'charts' ? 'executive-dashboard' : 'hybrid',
        requireFeatures: target.requiredFeatures,
    });
    return {
        brand: CLAUDEPPTXMCP_BRAND,
        target: publicReferenceTarget(target),
        featureBudget,
        recommendedRecipes: target.recommendedRecipes.map(id => recipeById(id)).filter(Boolean),
        recommendedChartPresets: (target.recommendedChartPresets || [])
            .map(id => chartPresetById(id))
            .filter(Boolean)
            .map(preset => publicChartPreset(preset, false)),
        aiClientContract: {
            do: [
                'Generate a new candidate through public claudepptxmcp creation tools.',
                'Use the reference brief as a target, not as deterministic source code.',
                'Maximize visible applied examples and content-level animation where relevant.',
                'Run claudepptxmcp.reference.evaluate after generation and iterate on failures.',
            ],
            doNot: [
                'Do not call claudepptxmcp.presentation.create_from_code for this AI-piloted test.',
                'Generate a fresh candidate through the public creation tools rather than a fixed showcase generator.',
                'Do not create visible listing/table slides when the target calls for applied specimens.',
            ],
        },
        suggestedCreateArguments: {
            mode: 'expressive',
            visualQuality: featureBudget.visualQuality,
            featureDepth: featureBudget.featureDepth,
            motionLevel: featureBudget.motionLevel,
            chartRichness: featureBudget.chartRichness,
            requireFeatures: featureBudget.requireFeatures,
            recipeIds: target.recommendedRecipes,
            emitCoverageReport: true,
            validate: true,
        },
    };
}
function runProcess(command, args, cwd, timeoutMs = DEFAULT_JOB_TIMEOUT_MS) {
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
function createBaseDeck(title) {
    return __awaiter(this, void 0, void 0, function* () {
        const PresentationEngine = yield loadClaudePptxMcpPresentationEngine();
        const pptx = new PresentationEngine();
        pptx.layout = 'LAYOUT_WIDE';
        pptx.author = CLAUDEPPTXMCP_BRAND;
        pptx.company = CLAUDEPPTXMCP_BRAND;
        pptx.subject = `${CLAUDEPPTXMCP_BRAND} generated presentation`;
        pptx.title = title || `${CLAUDEPPTXMCP_BRAND} presentation`;
        pptx.lang = 'en-US';
        pptx.theme = { headFontFace: 'Aptos Display', bodyFontFace: 'Aptos', lang: 'en-US' };
        return pptx;
    });
}
function addDefaultSlide(pptx, title, body) {
    const slide = pptx.addSlide();
    slide.background = { color: '071018' };
    slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 0.12, fill: { color: '20D6E7' }, line: { color: '20D6E7', transparency: 100 } });
    slide.addText(CLAUDEPPTXMCP_BRAND, { x: 0.55, y: 0.42, w: 2, h: 0.22, fontSize: 8, bold: true, color: '20D6E7', margin: 0 });
    slide.addText(title, { x: 0.72, y: 1.2, w: 8.9, h: 0.55, fontFace: 'Aptos Display', fontSize: 28, bold: true, color: 'F7FAFC', margin: 0 });
    slide.addText(body, { x: 0.78, y: 2.1, w: 7.8, h: 1.5, fontSize: 15, color: '9FB2C3', margin: 0.04, fit: 'shrink' });
    slide.addShape('roundRect', { x: 9.4, y: 1.35, w: 2.4, h: 2.4, fill: { color: '13283A' }, line: { color: '2D4C63' } });
    slide.addText('AIM\nMCP\nX', { x: 9.85, y: 1.72, w: 1.5, h: 1.4, fontSize: 28, bold: true, color: '20D6E7', align: 'center', margin: 0, fit: 'shrink' });
    slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}.`);
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
function pick(items, seed, offset = 0) {
    return items[(seed + offset) % items.length];
}
function creativePalette(seed) {
    const palettes = [
        { bg: '071018', panel: '102233', panel2: '162E42', text: 'F7FAFC', muted: '9FB2C3', accents: ['20D6E7', '2FE6A6', 'FFB84D', '8B5CF6'] },
        { bg: '100B18', panel: '21152F', panel2: '322044', text: 'FFF7ED', muted: 'C8B9D8', accents: ['FF5C8A', 'FFB84D', '5EEAD4', 'A78BFA'] },
        { bg: '0A111F', panel: '12203A', panel2: '1D3354', text: 'F8FAFC', muted: 'B6C5D8', accents: ['38BDF8', 'F97316', '84CC16', 'E879F9'] },
        { bg: '0D1412', panel: '14231F', panel2: '20362F', text: 'F4FFF8', muted: 'A9C5B8', accents: ['34D399', 'F59E0B', '60A5FA', 'F472B6'] },
    ];
    return pick(palettes, seed);
}
function creativeAssets(root) {
    const candidates = {
        image: [
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'textures', 'agency-depth-texture.jpg'),
            path.join(root, 'demos', 'common', 'images', 'sample_logo.png'),
            path.join(root, 'demos', 'ultimate-showcase', 'assets', 'model-fallback.png'),
        ],
        video: [path.join(root, 'demos', 'common', 'media', 'sample.mp4')],
        audio: [path.join(root, 'demos', 'common', 'media', 'sample.mp3')],
        model: [
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'models', 'orbit-torus.glb'),
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'models', 'ribbon-wave.glb'),
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'models', 'growth-arrow.glb'),
            path.join(root, 'demos', 'ultimate-showcase', 'assets', 'lab-pyramid.glb'),
            path.join(root, 'comparator', 'results_20260302_235823', 'ref_extracted', 'ppt', 'media', 'model3d1.glb'),
            path.join(root, 'comparator', 'results_20260302_235823', 'gen_extracted', 'ppt', 'media', 'model3d1.glb'),
        ],
        modelPoster: [
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'posters', 'orbit-torus.png'),
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'posters', 'ribbon-wave.png'),
            path.join(root, 'demos', 'claudepptxmcp-premium-assets', 'posters', 'growth-arrow.png'),
            path.join(root, 'demos', 'ultimate-showcase', 'assets', 'model-fallback.png'),
            path.join(root, 'demos', 'common', 'images', 'sample_logo.png'),
        ],
    };
    const firstExisting = (items) => items.find(item => fs.existsSync(item));
    return {
        image: firstExisting(candidates.image),
        video: firstExisting(candidates.video),
        audio: firstExisting(candidates.audio),
        model: firstExisting(candidates.model),
        modelPoster: firstExisting(candidates.modelPoster),
    };
}
function addCreativeTitle(slide, title, subtitle, palette, seed) {
    slide.background = { color: palette.bg };
    slide.transition = { type: pick(['fade', 'push', 'wipe', 'zoom'], seed), speed: 'fast', advanceOnClick: false, advanceAfterTime: 8500 };
    slide.addShape('rect', { x: 0, y: 0, w: 13.333, h: 7.5, fill: { color: palette.bg }, line: { color: palette.bg, transparency: 100 } });
    slide.addShape('arc', { x: -0.7, y: 0.55, w: 4.0, h: 4.0, line: { color: palette.accents[0], width: 2.25, beginArrowType: 'triangle', endArrowType: 'triangle', transparency: 12 }, adjustPoint: 0.24, objectName: 'creative-orbit' });
    slide.addShape('roundRect', { x: 8.35, y: 1.05, w: 3.42, h: 3.42, rectRadius: 0.08, fill: { color: palette.panel2, transparency: 4 }, line: { color: palette.accents[2], transparency: 30 }, rotate: -6, shadow: { type: 'outer', color: '000000', opacity: 0.32, blur: 7, offset: 2, angle: 45 }, objectName: 'creative-hero-tile' });
    slide.addText(CLAUDEPPTXMCP_BRAND, { x: 0.62, y: 0.48, w: 2.2, h: 0.22, fontSize: 8, bold: true, color: palette.accents[0], margin: 0 });
    slide.addText(title, { x: 0.72, y: 1.55, w: 8.2, h: 0.88, fontFace: 'Aptos Display', fontSize: 34, bold: true, color: palette.text, margin: 0, fit: 'shrink', objectName: 'creative-title' });
    slide.addText(subtitle, { x: 0.78, y: 2.65, w: 7.35, h: 1.06, fontSize: 15, color: palette.muted, breakLine: false, margin: 0.04, fit: 'shrink', objectName: 'creative-subtitle' });
    slide.addText('LIVE\nMCP', { x: 8.92, y: 1.58, w: 2.25, h: 1.25, fontFace: 'Aptos Display', fontSize: 32, bold: true, color: palette.accents[0], align: 'center', margin: 0, fit: 'shrink', wordArt: { transform: 'textArchUp' }, objectName: 'creative-wordmark' });
    slide.addAnimation('creative-title', { type: 'entrance', effect: 'fade', duration: 850 });
    slide.addAnimation('creative-subtitle', { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 820 });
    slide.addAnimation('creative-wordmark', { type: 'emphasis', effect: 'spin', duration: 1200, rotation: 8 });
    slide.addAnimation('creative-orbit', { type: 'motion', motionPath: 'circle', duration: 1500 });
    slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Creative seed controls deterministic variation.`);
}
function addCreativeWordArtScene(pptx, palette, seed) {
    const slide = pptx.addSlide();
    slide.background = { color: palette.bg };
    slide.transition = { type: 'morph', speed: 'fast', advanceOnClick: false, advanceAfterTime: 9500 };
    slide.addText('WordArt speaks by transforming itself', { x: 0.7, y: 0.52, w: 10.9, h: 0.38, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: palette.text, margin: 0 });
    const transforms = ['textArchUp', 'textCircle', 'textWave1', 'textInflate', 'textFadeRight', 'textSlantUp'];
    transforms.forEach((transform, index) => {
        const x = 0.85 + (index % 3) * 4.08;
        const y = 1.35 + Math.floor(index / 3) * 2.35;
        const objectName = `creative-wordart-${index}`;
        slide.addText(['CURVE', 'ORBIT', 'WAVE', 'DEPTH', 'FADE', 'SLANT'][index], {
            x,
            y,
            w: 3.28,
            h: 0.72,
            fontFace: 'Aptos Display',
            fontSize: 28,
            bold: true,
            color: palette.accents[index % palette.accents.length],
            align: 'center',
            margin: 0,
            wordArt: { transform },
            shadow: { type: 'outer', color: '000000', opacity: 0.3, blur: 4, offset: 1.2, angle: 45 },
            glow: { color: palette.accents[(index + 1) % palette.accents.length], size: 4, opacity: 0.28 },
            reflection: { type: 'tight', opacity: 0.18, blur: 1, distance: 1.5 },
            objectName,
        });
        slide.addShape('roundRect', { x: x + 0.32, y: y + 1.04, w: 2.6, h: 0.16, fill: { color: palette.panel2 }, line: { color: palette.accents[index % palette.accents.length], transparency: 25 }, objectName: `${objectName}-base` });
        slide.addAnimation(objectName, index % 2 === 0 ? { type: 'emphasis', effect: 'growshrink', scale: 1.12, duration: 900 } : { type: 'emphasis', effect: 'spin', rotation: 9, duration: 900 });
    });
    slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Applied WordArt scene; transforms are visible on the words.`);
}
function addCreativeDataScene(pptx, palette, seed, slideSpec) {
    var _a, _b, _c;
    const slide = pptx.addSlide();
    slide.background = { color: palette.bg };
    slide.transition = { type: 'wipe', direction: 'left', advanceOnClick: false, advanceAfterTime: 9800 };
    slide.addText((slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.title) || 'Data is demonstrated as a live cockpit', { x: 0.68, y: 0.5, w: 10.8, h: 0.4, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: palette.text, margin: 0 });
    const chartData = ((_a = slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.chart) === null || _a === void 0 ? void 0 : _a.data) || [
        { name: 'Native', labels: ['Text', 'Shapes', 'Charts', 'Media', '3D'], values: [92, 88, 84, 78, 73] },
        { name: 'Validated', labels: ['Text', 'Shapes', 'Charts', 'Media', '3D'], values: [98, 96, 93, 90, 86] },
    ];
    slide.addChart((((_b = slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.chart) === null || _b === void 0 ? void 0 : _b.type) || 'bar'), chartData, {
        x: 0.82,
        y: 1.3,
        w: 5.75,
        h: 3.24,
        showLegend: true,
        showTitle: true,
        title: ((_c = slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.chart) === null || _c === void 0 ? void 0 : _c.title) || 'Capability coverage',
        catAxisLabelColor: palette.muted,
        valAxisLabelColor: palette.muted,
        showValue: true,
    });
    const kpis = [
        ['Native charts', 'non-blank'],
        ['Shape visuals', 'applied'],
        ['Validation', 'artifacted'],
    ];
    kpis.forEach((item, index) => {
        const objectName = `creative-kpi-${index}`;
        slide.addShape('roundRect', { x: 7.08, y: 1.34 + index * 1.05, w: 4.2, h: 0.76, fill: { color: palette.panel, transparency: 3 }, line: { color: palette.accents[index], transparency: 30 }, objectName });
        slide.addText(item[0], { x: 7.28, y: 1.52 + index * 1.05, w: 1.9, h: 0.16, fontSize: 8, bold: true, color: palette.accents[index], margin: 0 });
        slide.addText(item[1], { x: 9.1, y: 1.43 + index * 1.05, w: 1.95, h: 0.27, fontSize: 15, bold: true, color: palette.text, align: 'right', margin: 0 });
        slide.addAnimation(objectName, { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 640 });
    });
    slide.addShape('blockArc', { x: 8.2, y: 4.62, w: 1.2, h: 1.2, fill: { color: palette.accents[0], transparency: 10 }, line: { color: palette.accents[0], transparency: 100 }, adjustPoint: 0.18, objectName: 'creative-gauge-arc' });
    slide.addShape('trapezoid', { x: 9.72, y: 4.68, w: 1.15, h: 0.86, fill: { color: palette.accents[2], transparency: 4 }, line: { color: palette.accents[2], transparency: 20 }, objectName: 'creative-funnel-slice' });
    slide.addAnimation('creative-gauge-arc', { type: 'emphasis', effect: 'spin', rotation: 24, duration: 900 });
    slide.addAnimation('creative-funnel-slice', { type: 'emphasis', effect: 'changefillcolor', color: palette.accents[1], duration: 760 });
    slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Native chart plus shape-built analytical fixtures.`);
}
function addCreativeMotionScene(pptx, palette) {
    const slide = pptx.addSlide();
    slide.background = { color: palette.bg };
    slide.transition = { type: 'push', direction: 'left', advanceOnClick: false, advanceAfterTime: 9000 };
    slide.addText('Content motion is the product surface', { x: 0.72, y: 0.54, w: 10.4, h: 0.4, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: palette.text, margin: 0 });
    const effects = [
        ['entry', { type: 'entrance', effect: 'zoom', duration: 750 }],
        ['exit', { type: 'exit', effect: 'fade', duration: 750 }],
        ['color', { type: 'emphasis', effect: 'changefillcolor', color: palette.accents[2], duration: 800 }],
        ['scale', { type: 'emphasis', effect: 'growshrink', scale: 1.24, duration: 820 }],
        ['spin', { type: 'emphasis', effect: 'spin', rotation: 18, duration: 860 }],
        ['path', { type: 'motion', motionPath: 'sineWave', duration: 1100 }],
    ];
    effects.forEach(([label, animation], index) => {
        const x = 0.9 + (index % 3) * 3.95;
        const y = 1.5 + Math.floor(index / 3) * 2.12;
        const objectName = `creative-motion-${label}`;
        slide.addShape(index % 2 ? 'hexagon' : 'roundRect', { x, y, w: 2.8, h: 1.08, fill: { color: palette.panel2 }, line: { color: palette.accents[index % palette.accents.length], width: 1.2 }, shadow: { type: 'outer', color: '000000', opacity: 0.22, blur: 5, offset: 1.1, angle: 45 }, objectName });
        slide.addText(label.toUpperCase(), { x: x + 0.25, y: y + 0.37, w: 2.3, h: 0.2, fontSize: 11, bold: true, color: palette.text, align: 'center', margin: 0 });
        slide.addAnimation(objectName, animation);
    });
    slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Applied content-level timing: entrance, exit, emphasis, color, transform, and motion path.`);
}
function addCreativeMedia3DScene(pptx, palette, assets) {
    const features = [];
    const slide = pptx.addSlide();
    slide.background = { color: palette.bg };
    slide.transition = { type: 'fade', advanceOnClick: false, advanceAfterTime: 11000 };
    slide.addText('Media, voice, and 3D are first-class objects', { x: 0.72, y: 0.52, w: 10.8, h: 0.4, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: palette.text, margin: 0 });
    slide.addShape('roundRect', { x: 0.85, y: 1.28, w: 5.3, h: 3.45, fill: { color: palette.panel }, line: { color: palette.accents[0], transparency: 25 } });
    if (assets.video && assets.image) {
        slide.addMedia({ type: 'video', path: assets.video, cover: dataUriFile(assets.image), x: 1.08, y: 1.52, w: 4.82, h: 2.72, objectName: 'creative-video' });
        slide.addAnimation('creative-video', { type: 'media', command: 'play', duration: 1000 });
        features.push('video');
    }
    else {
        slide.addText('Video asset unavailable', { x: 1.25, y: 2.45, w: 4.2, h: 0.3, fontSize: 14, color: palette.muted, align: 'center', margin: 0 });
    }
    if (assets.audio) {
        slide.addMedia({ type: 'audio', path: assets.audio, x: 1.1, y: 4.55, w: 0.32, h: 0.32, objectName: 'creative-audio' });
        slide.addAnimation('creative-audio', { type: 'media', command: 'play', duration: 1000 });
        features.push('audio');
    }
    slide.addShape('roundRect', { x: 6.82, y: 1.28, w: 5.05, h: 3.45, fill: { color: palette.panel2 }, line: { color: palette.accents[2], transparency: 25 } });
    if (assets.model && assets.modelPoster) {
        slide.addModel3D({ glbFile: assets.model, rasterFile: assets.modelPoster, x: 7.2, y: 1.55, w: 4.18, h: 2.8, rotate: 6, objectName: 'creative-model3d', camera: { fov: 45 }, ambientLight: { color: { r: 50000, g: 50000, b: 50000 }, illuminance: 0.5 } });
        slide.addShape('arc', { x: 7.08, y: 1.25, w: 4.25, h: 3.25, line: { color: palette.accents[1], width: 1.6, beginArrowType: 'triangle', endArrowType: 'triangle' }, objectName: 'creative-model-orbit' });
        slide.addAnimation('creative-model3d', { type: 'emphasis', effect: 'pulse', scale: 1.06, duration: 1000 });
        slide.addAnimation('creative-model-orbit', { type: 'motion', motionPath: 'circle', duration: 1300 });
        features.push('model3d');
    }
    else {
        slide.addText('3D asset unavailable', { x: 7.46, y: 2.55, w: 3.65, h: 0.3, fontSize: 14, color: palette.muted, align: 'center', margin: 0 });
    }
    slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Public creative media/3D scene. Missing assets should become validation warnings in a production creative compiler.`);
    return features;
}
function buildCreativeCapabilityDeck(args, outputPath, sourcePath) {
    return __awaiter(this, void 0, void 0, function* () {
        const spec = (args === null || args === void 0 ? void 0 : args.spec) || {};
        const title = String((args === null || args === void 0 ? void 0 : args.title) || spec.title || `${CLAUDEPPTXMCP_BRAND} Creative Capability Demo`);
        const seedText = String(spec.creativeSeed || spec.briefId || (args === null || args === void 0 ? void 0 : args.outputName) || title || nowIso());
        const seed = hashString(seedText);
        const palette = creativePalette(seed);
        const assets = creativeAssets(repoRoot());
        const pptx = yield createBaseDeck(title);
        pptx.subject = `${CLAUDEPPTXMCP_BRAND} creative capability demo`;
        pptx.title = title;
        const subtitle = String(spec.brief || spec.summary || 'A fresh MCP-authored presentation built as applied scenes, motion, data, media, and validation-ready artifacts.');
        addCreativeTitle(pptx.addSlide(), title, subtitle, palette, seed);
        addCreativeWordArtScene(pptx, palette, seed);
        const dataSlide = Array.isArray(spec.slides) ? spec.slides.find((item) => item === null || item === void 0 ? void 0 : item.chart) : undefined;
        addCreativeDataScene(pptx, palette, seed, dataSlide);
        addCreativeMotionScene(pptx, palette);
        const mediaFeatures = addCreativeMedia3DScene(pptx, palette, assets);
        if (Array.isArray(spec.slides)) {
            spec.slides.filter((item) => !(item === null || item === void 0 ? void 0 : item.chart)).slice(0, 4).forEach((slideSpec, index) => {
                const slide = pptx.addSlide();
                slide.background = { color: palette.bg };
                slide.transition = { type: pick(['fade', 'wipe', 'push', 'zoom'], seed, index + 3), advanceOnClick: false, advanceAfterTime: 8200 };
                slide.addText(String((slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.title) || `Scene ${index + 1}`), { x: 0.72, y: 0.58, w: 10.5, h: 0.4, fontFace: 'Aptos Display', fontSize: 23, bold: true, color: palette.text, margin: 0, objectName: `creative-scene-title-${index}` });
                if (slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.body)
                    slide.addText(String(slideSpec.body), { x: 0.84, y: 1.28, w: 5.9, h: 1.2, fontSize: 14, color: palette.muted, margin: 0.04, fit: 'shrink', objectName: `creative-scene-body-${index}` });
                const shapes = ['chevron', 'flowChartProcess', 'hexagon', 'pie', 'blockArc'];
                shapes.forEach((shape, shapeIndex) => {
                    const objectName = `creative-scene-${index}-shape-${shapeIndex}`;
                    slide.addShape(shape, { x: 7.1 + (shapeIndex % 3) * 1.42, y: 1.35 + Math.floor(shapeIndex / 3) * 1.32, w: 1.04, h: 0.86, fill: { color: palette.accents[(shapeIndex + index) % palette.accents.length], transparency: shapeIndex * 4 }, line: { color: palette.text, transparency: 48 }, rotate: (shapeIndex - 2) * 5, objectName });
                    slide.addAnimation(objectName, shapeIndex % 2 ? { type: 'emphasis', effect: 'pulse', duration: 650, scale: 1.1 } : { type: 'entrance', effect: 'zoom', duration: 620 });
                });
                if (Array.isArray(slideSpec === null || slideSpec === void 0 ? void 0 : slideSpec.bullets)) {
                    slide.addText(slideSpec.bullets.slice(0, 5).map((text) => ({ text, options: { bullet: { indent: 12 }, breakLine: true } })), { x: 0.95, y: 2.75, w: 5.4, h: 1.55, fontSize: 11, color: palette.text, margin: 0.04, objectName: `creative-scene-bullets-${index}` });
                    slide.addAnimation(`creative-scene-bullets-${index}`, { type: 'entrance', effect: 'wipe', direction: 'fromLeft', duration: 760 });
                }
                slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Fresh public creative scene derived from AI-authored spec.`);
            });
        }
        const finalSlide = pptx.addSlide();
        finalSlide.background = { color: palette.bg };
        finalSlide.transition = { type: 'fade', advanceOnClick: false, advanceAfterTime: 6500 };
        finalSlide.addText('Generated through MCP, validated as artifacts', { x: 0.75, y: 0.72, w: 10.5, h: 0.52, fontFace: 'Aptos Display', fontSize: 28, bold: true, color: palette.text, margin: 0, objectName: 'creative-final-title' });
        finalSlide.addTable([['Artifact', 'Purpose'], ['PPTX', 'delivery'], ['source', 'repeatability'], ['validation', 'quality gate'], ['manifest', 'retrieval']], { x: 1.0, y: 1.7, w: 5.4, h: 2.0, fontSize: 11, color: palette.text, fill: { color: palette.panel }, border: { color: palette.accents[0], pt: 0.75 } });
        finalSlide.addShape('roundRect', { x: 7.5, y: 1.78, w: 3.7, h: 1.62, fill: { color: palette.panel2 }, line: { color: palette.accents[1] }, objectName: 'creative-final-panel' });
        finalSlide.addText(CLAUDEPPTXMCP_BRAND, { x: 8.02, y: 2.32, w: 2.65, h: 0.32, fontSize: 18, bold: true, color: palette.accents[1], align: 'center', margin: 0 });
        finalSlide.addAnimation('creative-final-title', { type: 'entrance', effect: 'fade', duration: 700 });
        finalSlide.addAnimation('creative-final-panel', { type: 'emphasis', effect: 'growshrink', scale: 1.08, duration: 860 });
        finalSlide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}. Validation and artifact retrieval should be used after creation.`);
        yield withEngineConsoleSilenced(() => pptx.writeFile({ fileName: outputPath, compression: true }));
        ensureDir(path.dirname(sourcePath));
        fs.writeFileSync(sourcePath, publicSourceForSpec(title, spec));
        return {
            slideCount: pptx.slides.length,
            features: ['create', 'creative-capability-demo', 'metadata', 'source', 'validation', 'wordart', 'chart', 'shape-built-chart', 'animation', ...mediaFeatures],
        };
    });
}
function buildSimpleDeck(args, outputPath, sourcePath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const title = String((args === null || args === void 0 ? void 0 : args.title) || ((_a = args === null || args === void 0 ? void 0 : args.spec) === null || _a === void 0 ? void 0 : _a.title) || `${CLAUDEPPTXMCP_BRAND} Presentation`);
        const pptx = yield createBaseDeck(title);
        const slides = Array.isArray((_b = args === null || args === void 0 ? void 0 : args.spec) === null || _b === void 0 ? void 0 : _b.slides) ? args.spec.slides : [];
        if (!slides.length) {
            addDefaultSlide(pptx, title, ((_c = args === null || args === void 0 ? void 0 : args.spec) === null || _c === void 0 ? void 0 : _c.summary) || 'Deterministic deck generated through the claudepptxmcp MCP surface.');
        }
        else {
            for (const slideSpec of slides) {
                const slide = pptx.addSlide();
                slide.background = { color: slideSpec.background || '071018' };
                slide.transition = slideSpec.transition || { type: 'fade', speed: 'fast' };
                slide.addText(slideSpec.title || title, { x: 0.7, y: 0.55, w: 10.4, h: 0.42, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0 });
                if (slideSpec.body)
                    slide.addText(String(slideSpec.body), { x: 0.75, y: 1.25, w: 7.4, h: 1.2, fontSize: 13, color: 'CBD5E1', margin: 0.04, fit: 'shrink' });
                if (Array.isArray(slideSpec.bullets)) {
                    slide.addText(slideSpec.bullets.map((text) => ({ text, options: { bullet: { indent: 12 }, breakLine: true } })), {
                        x: 0.85,
                        y: 2.42,
                        w: 6.8,
                        h: 2.1,
                        fontSize: 12,
                        color: 'F7FAFC',
                        margin: 0.04,
                    });
                }
                if (slideSpec.chart) {
                    slide.addChart((slideSpec.chart.type || 'bar'), slideSpec.chart.data || [{ name: 'Series', labels: ['A', 'B', 'C'], values: [2, 5, 3] }], {
                        x: 8.25,
                        y: 1.35,
                        w: 3.5,
                        h: 2.4,
                        showLegend: true,
                        showTitle: true,
                        title: slideSpec.chart.title || 'Generated chart',
                    });
                }
                if (slideSpec.table) {
                    slide.addTable(slideSpec.table.rows || [['Metric', 'Value'], ['Jobs', '1'], ['Brand', CLAUDEPPTXMCP_BRAND]], {
                        x: 8.0,
                        y: 4.15,
                        w: 3.8,
                        h: 1.4,
                        fontSize: 9,
                        color: 'F7FAFC',
                        fill: { color: '13283A' },
                        border: { color: '2D4C63', pt: 0.75 },
                    });
                }
                slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}.`);
            }
        }
        yield withEngineConsoleSilenced(() => pptx.writeFile({ fileName: outputPath, compression: true }));
        ensureDir(path.dirname(sourcePath));
        fs.writeFileSync(sourcePath, publicSourceForSpec(title, (args === null || args === void 0 ? void 0 : args.spec) || {}));
        return { slideCount: pptx.slides.length, features: ['create', 'metadata', 'source', 'validation'] };
    });
}
function publicSourceForSpec(title, spec) {
    return `#!/usr/bin/env node
/**
 * ${CLAUDEPPTXMCP_BRAND} deterministic public source.
 */
const deck = claudepptxmcp.presentation.create(${JSON.stringify({ title, spec }, null, 2)})
await deck.writeFile('${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'presentation'}.pptx')
`;
}
function buildFocusedFeatureDeck(toolName, args, outputPath, sourcePath) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const pptx = yield createBaseDeck(`${CLAUDEPPTXMCP_BRAND} ${toolName}`);
        const slide = pptx.addSlide();
        slide.background = { color: '071018' };
        slide.transition = (args === null || args === void 0 ? void 0 : args.transition) || { type: 'fade', speed: 'fast' };
        slide.addText(toolName, { x: 0.7, y: 0.52, w: 10, h: 0.4, fontFace: 'Aptos Display', fontSize: 24, bold: true, color: 'F7FAFC', margin: 0 });
        slide.addText(`Generated by ${CLAUDEPPTXMCP_BRAND} through ${toolName}.`, { x: 0.72, y: 1.05, w: 8.6, h: 0.26, fontSize: 10, color: '9FB2C3', margin: 0 });
        if (toolName.includes('media')) {
            const media = path.join(repoRoot(), 'demos', 'common', 'media', 'sample.mp4');
            const cover = path.join(repoRoot(), 'demos', 'common', 'images', 'sample_logo.png');
            if (fs.existsSync(media))
                slide.addMedia({ type: 'video', path: media, cover: dataUriFile(cover), x: 1, y: 1.65, w: 5, h: 2.8 });
        }
        if (toolName.includes('3d')) {
            const glb = path.join(repoRoot(), 'demos', 'ultimate-showcase', 'assets', 'lab-pyramid.glb');
            const poster = path.join(repoRoot(), 'demos', 'ultimate-showcase', 'assets', 'model-fallback.png');
            if (fs.existsSync(glb) && fs.existsSync(poster)) {
                slide.addModel3D({ glbFile: glb, rasterFile: poster, x: 1.0, y: 1.55, w: 3.2, h: 2.4, rotate: 0 });
            }
            else {
                slide.addShape('cube', { x: 1.0, y: 1.7, w: 2.2, h: 1.5, fill: { color: '20D6E7' }, line: { color: 'FFFFFF', transparency: 60 } });
            }
        }
        if (toolName.includes('animation') || toolName.includes('motion_path') || toolName.includes('transition')) {
            slide.addShape('roundRect', { x: 1.1, y: 2.0, w: 2.0, h: 1.0, fill: { color: '20D6E7' }, line: { color: 'FFFFFF', transparency: 60 }, objectName: 'animated-object' });
            slide.addAnimation('animated-object', toolName.includes('motion_path')
                ? { type: 'motion', motionPath: 'right', duration: 1000 }
                : { type: 'entrance', effect: 'fade', duration: 800 });
        }
        if (toolName.includes('smartart')) {
            slide.addSmartArt({
                x: 1.0,
                y: 1.65,
                w: 8.9,
                h: 2.45,
                layout: ((_a = args === null || args === void 0 ? void 0 : args.spec) === null || _a === void 0 ? void 0 : _a.layout) || 'process',
                nodes: ((_b = args === null || args === void 0 ? void 0 : args.spec) === null || _b === void 0 ? void 0 : _b.nodes) || ['Plan', 'Compile', 'Validate', 'Deliver'],
                objectName: 'smartart-feature',
                palette: ['20D6E7', '2FE6A6', 'FFB84D', '448CFF'],
                color: '071018',
                fontSize: 8,
                line: { color: 'FFFFFF', transparency: 60 },
            });
            slide.addText('Native PowerPoint SmartArt diagram packages are preserve-only on roundtrip; new generated diagrams are editable shape-built SmartArt-style objects.', { x: 1.0, y: 4.35, w: 8.6, h: 0.35, fontSize: 10, color: '9FB2C3', margin: 0 });
        }
        if (toolName.includes('wordart')) {
            slide.addText('claudepptxmcp WordArt', { x: 1.0, y: 2.0, w: 6.8, h: 0.7, fontFace: 'Aptos Display', fontSize: 32, bold: true, color: '20D6E7', align: 'center', margin: 0, wordArt: { transform: ((_c = args === null || args === void 0 ? void 0 : args.spec) === null || _c === void 0 ? void 0 : _c.transform) || 'textArchUp' } });
        }
        if (toolName.includes('action')) {
            slide.addShape('actionButtonHome', { x: 1.0, y: 2.0, w: 1.0, h: 0.8, fill: { color: '20D6E7' }, line: { color: 'FFFFFF' }, hyperlink: { url: 'https://claudepptxmcp', tooltip: 'claudepptxmcp' } });
            slide.addText('Click and hover actions are preserved and validated; macro/run-program actions are never executed.', { x: 2.35, y: 2.15, w: 7.5, h: 0.45, fontSize: 13, color: 'F7FAFC', margin: 0 });
        }
        if (toolName.includes('chart')) {
            const chartSpec = (args === null || args === void 0 ? void 0 : args.spec) || {};
            const featureBudget = normalizeFeatureBudget(Object.assign(Object.assign({}, args), chartSpec));
            const recommendation = recommendChartPresets(String(chartSpec.query || chartSpec.chartIntent || chartSpec.dataShape || chartSpec.chartPresetId || 'comparison dashboard'), featureBudget, chartSpec)[0];
            const preset = recommendation === null || recommendation === void 0 ? void 0 : recommendation.preset;
            if ((preset === null || preset === void 0 ? void 0 : preset.authoringMode) === 'native-composite') {
                const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
                slide.addChart([
                    { type: 'bar', data: [{ name: 'Volume', labels, values: [22, 28, 31, 36, 39, 44] }], options: { chartColors: ['20D6E7'], barDir: 'col' } },
                    { type: 'line', data: [{ name: 'Rate', labels, values: [12, 15, 17, 19, 20, 23] }], options: { chartColors: ['FFB84D'], secondaryValAxis: true, lineDataSymbol: 'circle' } },
                ], { x: 1.0, y: 1.55, w: 5.8, h: 3.0, showLegend: true, showTitle: true, title: preset.title });
            }
            else if ((preset === null || preset === void 0 ? void 0 : preset.authoringMode) === 'shape-built') {
                slide.addShape('roundRect', { x: 1.0, y: 1.55, w: 5.8, h: 3.0, fill: { color: '102233' }, line: { color: '20D6E7', transparency: 35 }, shadow: { type: 'outer', color: '000000', opacity: 0.22, blur: 6, offset: 1, angle: 45 } });
                [0, 1, 2, 3].forEach(step => {
                    slide.addShape(preset.shapeBuiltVisual === 'funnel' ? 'trapezoid' : 'rect', { x: 1.45 + step * 1.05, y: 2.15 + step * 0.18, w: 0.9, h: 1.15 - step * 0.16, fill: { color: ['20D6E7', '8B5CF6', 'FFB84D', '2FE6A6'][step], transparency: 8 }, line: { color: 'FFFFFF', transparency: 65 } });
                });
                slide.addText(`${preset.title}: ${preset.shapeBuiltVisual}`, { x: 1.25, y: 4.72, w: 5.2, h: 0.3, fontSize: 12, bold: true, color: 'F7FAFC', margin: 0, fit: 'shrink' });
            }
            else {
                const chartType = ((preset === null || preset === void 0 ? void 0 : preset.chartType) || chartSpec.chartType || 'bar');
                const data = chartSpec.data || (preset === null || preset === void 0 ? void 0 : preset.sampleData) || [{ name: 'Series', labels: ['A', 'B', 'C'], values: [4, 7, 5] }];
                slide.addChart(chartType, data, Object.assign({ x: 1.0, y: 1.55, w: 5.8, h: 3.0, showLegend: true, showTitle: true, title: (preset === null || preset === void 0 ? void 0 : preset.title) || 'Chart preset' }, ((preset === null || preset === void 0 ? void 0 : preset.optionDefaults) || {})));
            }
            if (preset) {
                slide.addText(`Suggested preset: ${preset.powerPointCategory} / ${preset.powerPointPreset} (${preset.authoringMode})`, { x: 1.0, y: 5.05, w: 8.8, h: 0.26, fontSize: 10, color: '9FB2C3', margin: 0 });
            }
        }
        if (toolName.includes('table')) {
            slide.addTable([['Feature', 'Value'], ['Tool', toolName], ['Brand', CLAUDEPPTXMCP_BRAND]], { x: 1.0, y: 1.6, w: 5, h: 1.6, fontSize: 11, fill: { color: '13283A' }, color: 'F7FAFC' });
        }
        slide.addNotes(`Generated by ${CLAUDEPPTXMCP_BRAND}.`);
        yield withEngineConsoleSilenced(() => pptx.writeFile({ fileName: outputPath, compression: true }));
        fs.writeFileSync(sourcePath, publicSourceForSpec(toolName, { featureTool: toolName, spec: (args === null || args === void 0 ? void 0 : args.spec) || {} }));
        return { features: [toolName], slideCount: pptx.slides.length };
    });
}
function dataUriFile(filePath) {
    if (!fs.existsSync(filePath))
        return undefined;
    return `data:image/png;base64,${fs.readFileSync(filePath).toString('base64')}`;
}
function brandKitRoot(options) {
    const root = path.join(workspaceRoot(options), 'brand-kits');
    ensureDir(root);
    return root;
}
function safeId(value) {
    return value.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-|-$/g, '') || 'default';
}
function componentPreviewJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const validation = validateComponent(String((args === null || args === void 0 ? void 0 : args.name) || ''), (args === null || args === void 0 ? void 0 : args.slots) || {});
        if (!validation.ok)
            return toolResponse({ success: false, ok: false, errors: validation.errors }, true);
        const manifest = createManifest('component-preview', options);
        try {
            const outputName = path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || `claudepptxmcp-component-${safeId(String(args.name))}.pptx`));
            const outputPath = path.join(manifest.jobDir, outputName);
            const sourcePath = path.join(manifest.jobDir, 'source', 'claudepptxmcp-component-preview.mjs');
            const spec = {
                title: `${CLAUDEPPTXMCP_BRAND} component preview`,
                slides: [{
                        transition: { type: 'fade', speed: 'fast' },
                        objects: [{ kind: 'component', name: String(args.name), slots: (args === null || args === void 0 ? void 0 : args.slots) || {}, x: 0.7, y: 0.8, w: 11.9, h: 5.8 }],
                    }],
            };
            const build = yield buildDesignSystemDeck({ title: spec.title, spec }, outputPath, sourcePath, repoRoot());
            addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), 'Component preview deck', options);
            addArtifact(manifest, sourcePath, 'source', 'text/javascript', 'Component preview source artifact', options);
            manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: true });
            jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
            jsonArtifact(manifest, 'summary.json', { brand: CLAUDEPPTXMCP_BRAND, component: args.name, slideCount: build.slideCount, features: build.features }, 'summary', 'Component preview summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function registerBrandKit(args, options) {
    const kit = args === null || args === void 0 ? void 0 : args.brandKit;
    if (!kit || typeof kit !== 'object')
        return errorResult('INVALID_INPUT', 'brandKit object is required');
    const name = safeId(String((args === null || args === void 0 ? void 0 : args.name) || kit.name || 'brand-kit'));
    const filePath = path.join(brandKitRoot(options), `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(Object.assign(Object.assign({}, kit), { name }), null, 2));
    return toolResponse({ success: true, brand: CLAUDEPPTXMCP_BRAND, name, uri: `brand://${name}`, path: normalizePublicPath(path.relative(workspaceRoot(options), filePath)) });
}
function listBrandKits(options) {
    const root = brandKitRoot(options);
    const kits = fs.readdirSync(root)
        .filter(name => name.endsWith('.json'))
        .map(name => {
        const filePath = path.join(root, name);
        try {
            const kit = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            return { name: kit.name || path.basename(name, '.json'), uri: `brand://${kit.name || path.basename(name, '.json')}`, path: normalizePublicPath(path.relative(workspaceRoot(options), filePath)) };
        }
        catch (_a) {
            return { name: path.basename(name, '.json'), invalid: true };
        }
    });
    return toolResponse({ brand: CLAUDEPPTXMCP_BRAND, kits });
}
function assetPreviewJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const asset = findAsset(repoRoot(), String((args === null || args === void 0 ? void 0 : args.handle) || ''));
        if (!asset)
            return errorResult('NOT_FOUND', `Asset not found: ${args === null || args === void 0 ? void 0 : args.handle}`);
        const manifest = createManifest('asset-preview', options);
        try {
            const previewPath = asset.preview && fs.existsSync(asset.preview) ? asset.preview : asset.src;
            addArtifact(manifest, previewPath, 'asset-preview', contentTypeFor(previewPath), `Preview for ${asset.handle}`, options);
            if (path.resolve(previewPath) !== path.resolve(asset.src)) {
                addArtifact(manifest, asset.src, 'asset-source', contentTypeFor(asset.src), `Source asset for ${asset.handle}`, options);
            }
            jsonArtifact(manifest, 'asset.json', publicAssetCatalogItem(asset, true), 'asset-metadata', 'Asset metadata', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function assetGenerateJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest('asset-generate', options);
        try {
            const generated = generateProceduralAsset(repoRoot(), manifest.jobDir, args);
            const { license: _license } = generated, publicGenerated = __rest(generated, ["license"]);
            addArtifact(manifest, generated.src, 'model3d', 'model/gltf-binary', `${CLAUDEPPTXMCP_BRAND} generated ${generated.kind} GLB`, options);
            addArtifact(manifest, generated.preview, 'asset-preview', 'image/png', `${CLAUDEPPTXMCP_BRAND} generated ${generated.kind} poster`, options);
            jsonArtifact(manifest, 'asset.json', publicGenerated, 'asset-metadata', 'Procedural asset metadata', options);
            jsonArtifact(manifest, 'summary.json', {
                brand: CLAUDEPPTXMCP_BRAND,
                kind: generated.kind,
                handle: generated.handle,
                usage: generated.usage,
                modelPath: path.relative(manifest.jobDir, generated.src),
                posterPath: path.relative(manifest.jobDir, generated.preview),
            }, 'summary', 'Procedural asset generation summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function narrationGenerateJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const text = String((args === null || args === void 0 ? void 0 : args.text) || '').trim();
        if (!text)
            return errorResult('INVALID_INPUT', 'Narration text is required.');
        const manifest = createManifest('narration-generate', options);
        try {
            let outputName = path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || 'narration.wav'));
            if (!outputName.toLowerCase().endsWith('.wav'))
                outputName += '.wav';
            const outputPath = path.join(manifest.jobDir, outputName);
            const frequency = Number.isFinite(Number(args === null || args === void 0 ? void 0 : args.fallbackToneFrequency)) ? Number(args.fallbackToneFrequency) : 440;
            const fallbackUsed = writeSpeechOrToneWav(outputPath, text.slice(0, 8000), frequency);
            const artifact = addArtifact(manifest, outputPath, 'narration-audio', 'audio/wav', 'Generated narration WAV asset', options);
            jsonArtifact(manifest, 'summary.json', {
                brand: CLAUDEPPTXMCP_BRAND,
                success: true,
                artifactId: artifact.id,
                uri: artifact.uri,
                mimeType: artifact.mimeType,
                bytes: artifact.bytes,
                fallbackUsed,
                ttsAvailable: !fallbackUsed,
                textCharacters: text.length,
                usage: 'Embed this artifact as narration/media audio, then run presentation validation and narration validation when available.',
            }, 'summary', 'Narration generation summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function geometryGenerateJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest('geometry-generate', options);
        try {
            const geometry = generateProceduralGeometry(repoRoot(), args);
            const { license: _license } = geometry, publicGeometry = __rest(geometry, ["license"]);
            jsonArtifact(manifest, 'geometry-spec.json', publicGeometry, 'geometry-spec', 'Generated custom geometry object spec', options);
            if ((args === null || args === void 0 ? void 0 : args.render) !== false) {
                const outputName = path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || `claudepptxmcp-${geometry.kind}-geometry-preview.pptx`));
                const outputPath = path.join(manifest.jobDir, outputName);
                const sourcePath = path.join(manifest.jobDir, 'source', 'claudepptxmcp-geometry-source.mjs');
                const spec = {
                    title: `${CLAUDEPPTXMCP_BRAND} ${geometry.kind} geometry`,
                    slides: [{
                            background: { color: '04130E' },
                            transition: { type: 'fade', speed: 'fast', advanceOnClick: false, advanceAfterTime: 7200 },
                            objects: [
                                { kind: 'text', name: 'geometry-title', text: `${geometry.kind.split('-').join(' ')} generated as native PowerPoint geometry`, x: 0.72, y: 0.46, w: 10.8, h: 0.42, fontFace: 'Aptos Display', fontSize: 22, bold: true, color: 'F7FAFC', margin: 0 },
                                ...geometry.objects,
                            ],
                            animations: geometry.objects.slice(0, 4).map((object, index) => ({ target: object.name, kind: index % 2 ? 'emphasis' : 'entrance', effect: index % 2 ? 'pulse' : 'fade', duration: 650, trigger: index === 0 ? 'afterPrevious' : 'withPrevious' })),
                            notes: `${CLAUDEPPTXMCP_BRAND} generated custom geometry preview. Coverage metadata is in geometry-spec.json.`,
                        }],
                };
                const build = yield buildExpressiveDeck({ title: spec.title, mode: 'expressive', spec }, outputPath, sourcePath, repoRoot());
                addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), 'Generated geometry preview deck', options);
                addArtifact(manifest, sourcePath, 'source', 'text/javascript', 'Geometry preview source artifact', options);
                manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: true });
                jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
                jsonArtifact(manifest, 'coverage-report.json', { brand: CLAUDEPPTXMCP_BRAND, features: build.features, specimens: geometry.specimenMap }, 'coverage-report', 'Geometry coverage report', options);
            }
            jsonArtifact(manifest, 'summary.json', {
                brand: CLAUDEPPTXMCP_BRAND,
                kind: geometry.kind,
                objectCount: geometry.objects.length,
                specimenCount: geometry.specimenMap.length,
            }, 'summary', 'Procedural geometry generation summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function deckFromOutlineJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const title = String((args === null || args === void 0 ? void 0 : args.title) || 'claudepptxmcp outline deck');
        const intent = Object.assign(Object.assign({}, ((args === null || args === void 0 ? void 0 : args.intent) || {})), { visualQuality: (_a = args === null || args === void 0 ? void 0 : args.visualQuality) !== null && _a !== void 0 ? _a : (_b = args === null || args === void 0 ? void 0 : args.intent) === null || _b === void 0 ? void 0 : _b.visualQuality, featureDepth: (_c = args === null || args === void 0 ? void 0 : args.featureDepth) !== null && _c !== void 0 ? _c : (_d = args === null || args === void 0 ? void 0 : args.intent) === null || _d === void 0 ? void 0 : _d.featureDepth, motionLevel: (_e = args === null || args === void 0 ? void 0 : args.motionLevel) !== null && _e !== void 0 ? _e : (_f = args === null || args === void 0 ? void 0 : args.intent) === null || _f === void 0 ? void 0 : _f.motionLevel, chartRichness: (_g = args === null || args === void 0 ? void 0 : args.chartRichness) !== null && _g !== void 0 ? _g : (_h = args === null || args === void 0 ? void 0 : args.intent) === null || _h === void 0 ? void 0 : _h.chartRichness, requireFeatures: (_j = args === null || args === void 0 ? void 0 : args.requireFeatures) !== null && _j !== void 0 ? _j : (_k = args === null || args === void 0 ? void 0 : args.intent) === null || _k === void 0 ? void 0 : _k.requireFeatures });
        const spec = outlineToDesignSystemSpec(String((args === null || args === void 0 ? void 0 : args.outline) || ''), intent, title);
        if ((args === null || args === void 0 ? void 0 : args.render) === false)
            return toolResponse({ brand: CLAUDEPPTXMCP_BRAND, mode: 'design-system', spec });
        return createDeckJob({
            title: spec.title || title,
            outputName: (args === null || args === void 0 ? void 0 : args.outputName) || `${safeId(spec.title || title)}.pptx`,
            mode: 'design-system',
            spec,
            recipeIds: args === null || args === void 0 ? void 0 : args.recipeIds,
            visualQuality: args === null || args === void 0 ? void 0 : args.visualQuality,
            featureDepth: args === null || args === void 0 ? void 0 : args.featureDepth,
            motionLevel: args === null || args === void 0 ? void 0 : args.motionLevel,
            chartRichness: args === null || args === void 0 ? void 0 : args.chartRichness,
            requireFeatures: args === null || args === void 0 ? void 0 : args.requireFeatures,
            validate: true,
            emitCoverageReport: true,
            emitScreenshots: (args === null || args === void 0 ? void 0 : args.emitScreenshots) === true,
        }, options);
    });
}
function createDeckJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c;
        const manifest = createManifest('presentation-create', options);
        try {
            const outputName = path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || 'claudepptxmcp-presentation.pptx'));
            const outputPath = path.join(manifest.jobDir, outputName);
            const sourcePath = path.join(manifest.jobDir, 'source', 'claudepptxmcp-source.mjs');
            const explicitMode = (args === null || args === void 0 ? void 0 : args.mode) || ((_a = args === null || args === void 0 ? void 0 : args.spec) === null || _a === void 0 ? void 0 : _a.mode);
            const rawMode = String(explicitMode || 'design-system').toLowerCase();
            const mode = ['creative-capability-demo', 'creative-showcase', 'capability-demo'].includes(rawMode)
                ? 'design-system'
                : rawMode === 'expressive' || rawMode === 'design-system'
                    ? rawMode
                    : 'structured';
            const prepared = mode === 'structured'
                ? null
                : prepareGenerativeSpec(args, mode);
            if ((prepared === null || prepared === void 0 ? void 0 : prepared.designGate) && !prepared.designGate.ok) {
                return toolResponse({ success: false, ok: false, brand: CLAUDEPPTXMCP_BRAND, designGate: prepared.designGate, featureUsePlan: prepared.featureUsePlan, designPlan: prepared.designPlan }, true);
            }
            if ((_c = (_b = prepared === null || prepared === void 0 ? void 0 : prepared.designGate) === null || _b === void 0 ? void 0 : _b.warnings) === null || _c === void 0 ? void 0 : _c.length)
                manifest.warnings.push(...prepared.designGate.warnings.map(item => item.message));
            const buildArgs = prepared
                ? Object.assign(Object.assign({}, args), { mode, spec: Object.assign(Object.assign({}, prepared.spec), { designPlan: prepared.designPlan, featureUsePlan: prepared.featureUsePlan, designGate: prepared.designGate, recipesApplied: prepared.recipesApplied }) }) : args;
            const build = mode === 'expressive'
                ? yield buildExpressiveDeck(buildArgs, outputPath, sourcePath, repoRoot())
                : mode === 'design-system'
                    ? yield buildDesignSystemDeck(buildArgs, outputPath, sourcePath, repoRoot())
                    : yield buildSimpleDeck(buildArgs, outputPath, sourcePath);
            addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), 'Generated PowerPoint deck', options);
            addArtifact(manifest, sourcePath, 'source', 'text/javascript', 'Public deterministic source artifact', options);
            manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: true });
            jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
            if (build.validation)
                jsonArtifact(manifest, 'expressive-validation.json', build.validation, 'expressive-validation', 'Pre-write expressive spec validation report', options);
            if (prepared) {
                jsonArtifact(manifest, 'design-plan.json', prepared.designPlan, 'design-plan', 'Recipe-driven design plan', options);
                jsonArtifact(manifest, 'feature-use-plan.json', prepared.featureUsePlan, 'feature-use-plan', 'Detected and required feature usage plan', options);
                jsonArtifact(manifest, 'design-gate.json', prepared.designGate, 'design-gate', 'Premium feature-budget gate report', options);
            }
            if ((args === null || args === void 0 ? void 0 : args.emitCoverageReport) || build.coverageReport || prepared)
                jsonArtifact(manifest, 'coverage-report.json', {
                    brand: CLAUDEPPTXMCP_BRAND,
                    mode,
                    features: build.features,
                    buildCoverage: build.coverageReport,
                    designPlan: prepared === null || prepared === void 0 ? void 0 : prepared.designPlan,
                    featureUsePlan: prepared === null || prepared === void 0 ? void 0 : prepared.featureUsePlan,
                    designGate: prepared === null || prepared === void 0 ? void 0 : prepared.designGate,
                }, 'coverage-report', 'Generated deck capability coverage report', options);
            if (args === null || args === void 0 ? void 0 : args.emitScreenshots) {
                const visualDir = path.join(manifest.jobDir, 'visual-oracle');
                const visual = yield exportVisualOracle(outputPath, visualDir, [1, 2, 3, 4, 5]);
                jsonArtifact(manifest, 'visual-oracle.json', visual.summary, 'visual-oracle', 'Visual oracle export summary', options);
                for (const file of visual.files)
                    addArtifact(manifest, file, 'visual-screenshot', contentTypeFor(file), 'Visual oracle screenshot', options);
            }
            jsonArtifact(manifest, 'summary.json', { brand: CLAUDEPPTXMCP_BRAND, mode, slideCount: build.slideCount, features: build.features, featureBudget: prepared === null || prepared === void 0 ? void 0 : prepared.featureBudget, recipesApplied: prepared === null || prepared === void 0 ? void 0 : prepared.recipesApplied, designGate: prepared === null || prepared === void 0 ? void 0 : prepared.designGate }, 'summary', 'Job summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            if (error instanceof ExpressiveSpecValidationError)
                return toolResponse(error.result, true);
            return failedJob(manifest, error, options);
        }
    });
}
function editExistingJob(action, args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest(`presentation-${action}`, options);
        try {
            if (!(args === null || args === void 0 ? void 0 : args.pptxPath) && !(args === null || args === void 0 ? void 0 : args.pptxBase64)) {
                manifest.warnings.push('No input deck was supplied; generated a deterministic feature demonstration deck instead.');
                const outputPath = path.join(manifest.jobDir, path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || `claudepptxmcp-${action}.pptx`)));
                const sourcePath = path.join(manifest.jobDir, 'source', 'claudepptxmcp-source.mjs');
                const build = yield buildFocusedFeatureDeck(`claudepptxmcp.presentation.${action}`, args, outputPath, sourcePath);
                addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), `${action} demonstration deck`, options);
                addArtifact(manifest, sourcePath, 'source', 'text/javascript', 'Public deterministic source artifact', options);
                manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: true });
                jsonArtifact(manifest, 'summary.json', { action, features: build.features, slideCount: build.slideCount, goals: (args === null || args === void 0 ? void 0 : args.goals) || null }, 'summary', 'Edit job summary', options);
                jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
                return toolResponse(successJobResponse(manifest, options));
            }
            const inputPath = materializePptxInput(args, manifest, options);
            const outputPath = path.join(manifest.jobDir, path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || `claudepptxmcp-${action}.pptx`)));
            if ((args === null || args === void 0 ? void 0 : args.noOpRoundTrip) === true) {
                const decypher = yield decypherToGenerator({
                    pptxPath: inputPath,
                    outputDir: path.join(manifest.jobDir, 'decyphered'),
                    autoRegenerate: true,
                    includeGeneratorCode: false,
                    timeoutMs: options.jobTimeoutMs || DEFAULT_JOB_TIMEOUT_MS,
                });
                jsonArtifact(manifest, 'decypher.json', toPublicBrand(decypher), 'decypher-report', 'Internal round-trip report', options);
                if (decypher.regeneratedPath && fs.existsSync(decypher.regeneratedPath)) {
                    fs.copyFileSync(decypher.regeneratedPath, outputPath);
                }
                else {
                    fs.copyFileSync(inputPath, outputPath);
                    manifest.warnings.push('Round-trip regeneration did not produce an output; returned original deck copy.');
                }
            }
            else {
                fs.copyFileSync(inputPath, outputPath);
                manifest.warnings.push(`${action} accepted deterministic instructions, but no concrete edit patch was supplied; returned a validated deck copy.`);
            }
            addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), `${action} output deck`, options);
            manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: false });
            jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
            jsonArtifact(manifest, 'edit-summary.json', { action, goals: (args === null || args === void 0 ? void 0 : args.goals) || null, editSpec: (args === null || args === void 0 ? void 0 : args.editSpec) || null, brandKit: (args === null || args === void 0 ? void 0 : args.brandKit) || null }, 'summary', 'Edit summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function focusedFeatureJob(toolName, args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest(toolName.replace(`${publicToolPrefix}.`, ''), options);
        try {
            const outputPath = path.join(manifest.jobDir, path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || `${toolName.replace(/[^a-z0-9]+/gi, '-')}.pptx`)));
            const sourcePath = path.join(manifest.jobDir, 'source', 'claudepptxmcp-source.mjs');
            const build = yield buildFocusedFeatureDeck(toolName, args, outputPath, sourcePath);
            addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), `${toolName} feature deck`, options);
            addArtifact(manifest, sourcePath, 'source', 'text/javascript', 'Public deterministic source artifact', options);
            manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: true });
            jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
            jsonArtifact(manifest, 'summary.json', { toolName, features: build.features, slideCount: build.slideCount }, 'summary', 'Feature job summary', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function createFromCodeJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!options.allowCodeExecution) {
            return errorResult('SECURITY_BLOCKED', 'Trusted generator execution is disabled. Start local claudepptxmcp with --allow-code-execution to enable it.');
        }
        const manifest = createManifest('presentation-create-from-code', options);
        try {
            const generatorPath = (args === null || args === void 0 ? void 0 : args.generatorPath)
                ? resolveInputPath(String(args.generatorPath), options)
                : path.join(manifest.jobDir, 'source', 'generator.mjs');
            if (args === null || args === void 0 ? void 0 : args.code) {
                ensureDir(path.dirname(generatorPath));
                fs.writeFileSync(generatorPath, String(args.code));
            }
            if (!fs.existsSync(generatorPath))
                throw new Error('generatorPath not found and no code was supplied');
            const outputPath = path.join(manifest.jobDir, path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || 'claudepptxmcp-from-code.pptx')));
            const proc = yield runProcess(process.execPath, [generatorPath, '--out', outputPath], path.dirname(generatorPath), Number((args === null || args === void 0 ? void 0 : args.timeoutMs) || DEFAULT_JOB_TIMEOUT_MS));
            textArtifact(manifest, 'generator.stdout.log', proc.stdout, 'log', 'Generator stdout', options);
            textArtifact(manifest, 'generator.stderr.log', proc.stderr, 'log', 'Generator stderr', options);
            if (!fs.existsSync(outputPath) && (args === null || args === void 0 ? void 0 : args.generatedPathHint)) {
                const hintedOutputPath = resolveInputPath(String(args.generatedPathHint), options);
                if (fs.existsSync(hintedOutputPath))
                    fs.copyFileSync(hintedOutputPath, outputPath);
            }
            if (proc.exitCode !== 0 || !fs.existsSync(outputPath)) {
                throw new Error(`Generator failed with exit code ${proc.exitCode}`);
            }
            addArtifact(manifest, generatorPath, 'source', 'text/javascript', 'Trusted generator source', options);
            addArtifact(manifest, outputPath, 'presentation', contentTypeFor(outputPath), 'Generated PowerPoint deck', options);
            manifest.validation = yield validatePptxPackage(outputPath, { expectClaudePptxMcpMetadata: false });
            jsonArtifact(manifest, 'validation.json', manifest.validation, 'validation', 'Package validation report', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function failedJob(manifest, error, options) {
    manifest.status = 'failed';
    manifest.error = error instanceof Error ? error.message : String(error);
    writeManifest(manifest, options);
    return toolResponse(successJobResponse(manifest, options), true);
}
function snapshotJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest('presentation-snapshot', options);
        try {
            const pptxPath = resolveInputPath(String(args === null || args === void 0 ? void 0 : args.pptxPath), options);
            const snapshot = yield packageSnapshot(pptxPath);
            jsonArtifact(manifest, path.basename(String((args === null || args === void 0 ? void 0 : args.outputName) || 'package-snapshot.json')), snapshot, 'package-snapshot', 'Package snapshot', options);
            manifest.validation = snapshot.validation;
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function validateJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest('presentation-validate', options);
        try {
            const pptxPath = resolveInputPath(String(args === null || args === void 0 ? void 0 : args.pptxPath), options);
            const validation = yield validatePptxPackage(pptxPath, { expectClaudePptxMcpMetadata: (args === null || args === void 0 ? void 0 : args.expectClaudePptxMcpMetadata) === true });
            manifest.validation = validation;
            jsonArtifact(manifest, 'validation.json', validation, 'validation', 'Package validation report', options);
            if ((args === null || args === void 0 ? void 0 : args.visualOracle) === true) {
                const visual = yield exportVisualOracle(pptxPath, path.join(manifest.jobDir, 'visual-oracle'), [1, 2, 3]);
                manifest.validation.visualOracle = visual.summary;
                jsonArtifact(manifest, 'visual-oracle.json', visual.summary, 'visual-oracle', 'Visual oracle export summary', options);
                for (const png of visual.files)
                    addArtifact(manifest, png, 'visual-screenshot', 'image/png', 'PowerPoint slide export screenshot', options);
            }
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function referenceEvaluateJob(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const manifest = createManifest('reference-evaluate', options);
        try {
            const target = referenceTargetById(String((args === null || args === void 0 ? void 0 : args.id) || ''));
            if (!target)
                throw new Error(`Reference target not found: ${args === null || args === void 0 ? void 0 : args.id}`);
            const candidatePath = resolveInputPath(String((args === null || args === void 0 ? void 0 : args.candidatePath) || ''), options);
            const referencePath = target.privateReferencePath
                ? (path.isAbsolute(target.privateReferencePath) ? target.privateReferencePath : path.join(repoRoot(), target.privateReferencePath))
                : '';
            const validation = yield validatePptxPackage(candidatePath, { expectClaudePptxMcpMetadata: true });
            const featureSignals = yield inspectPptxFeatureSignals(candidatePath);
            const gateReport = evaluateReferenceGates(featureSignals, target.gates);
            const repair = (args === null || args === void 0 ? void 0 : args.repairCheck) === false ? null : yield repairCheck(candidatePath, Number((args === null || args === void 0 ? void 0 : args.timeoutMs) || DEFAULT_JOB_TIMEOUT_MS));
            let compare = null;
            if ((args === null || args === void 0 ? void 0 : args.compare) !== false && referencePath && fs.existsSync(referencePath)) {
                compare = yield comparePresentations({
                    referencePath,
                    generatedPath: candidatePath,
                    timeoutMs: Number((args === null || args === void 0 ? void 0 : args.timeoutMs) || DEFAULT_JOB_TIMEOUT_MS),
                });
                textArtifact(manifest, 'compare.stdout.log', toPublicBrand(compare.stdout || ''), 'log', 'Reference comparator stdout', options);
                textArtifact(manifest, 'compare.stderr.log', toPublicBrand(compare.stderr || ''), 'log', 'Reference comparator stderr', options);
            }
            let visual = null;
            if ((args === null || args === void 0 ? void 0 : args.visualOracle) === true) {
                visual = yield exportVisualOracle(candidatePath, path.join(manifest.jobDir, 'visual-oracle'), [1, 2, 3, 4, 5]);
                jsonArtifact(manifest, 'visual-oracle.json', visual.summary, 'visual-oracle', 'Visual oracle export summary', options);
                for (const png of visual.files)
                    addArtifact(manifest, png, 'visual-screenshot', 'image/png', 'PowerPoint slide export screenshot', options);
            }
            const evaluation = {
                brand: CLAUDEPPTXMCP_BRAND,
                target: publicReferenceTarget(target),
                candidate: { name: path.basename(candidatePath), sha256: fs.existsSync(candidatePath) ? hashFile(candidatePath) : null },
                referenceAvailable: !!referencePath && fs.existsSync(referencePath),
                validation,
                featureSignals,
                gates: gateReport,
                repairCheck: repair,
                compare: compare ? {
                    success: compare.success,
                    runtimeAvailable: compare.runtimeAvailable,
                    exitCode: compare.exitCode,
                    stdoutRef: 'compare.stdout.log',
                    stderrRef: 'compare.stderr.log',
                } : null,
                visualOracle: (visual === null || visual === void 0 ? void 0 : visual.summary) || null,
                success: [
                    validation.success,
                    gateReport.success,
                    (args === null || args === void 0 ? void 0 : args.repairCheck) === false || (repair === null || repair === void 0 ? void 0 : repair.success) === true,
                    (args === null || args === void 0 ? void 0 : args.compare) === false || !referencePath || !fs.existsSync(referencePath) || (compare === null || compare === void 0 ? void 0 : compare.success) === true,
                    (args === null || args === void 0 ? void 0 : args.visualOracle) !== true || ((_a = visual === null || visual === void 0 ? void 0 : visual.summary) === null || _a === void 0 ? void 0 : _a.success) === true,
                ].every(Boolean),
            };
            manifest.validation = evaluation;
            jsonArtifact(manifest, 'reference-evaluation.json', evaluation, 'reference-evaluation', 'Frozen reference evaluation report', options);
            return toolResponse(successJobResponse(manifest, options));
        }
        catch (error) {
            return failedJob(manifest, error, options);
        }
    });
}
function inspectPptxFeatureSignals(pptxPath) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!fs.existsSync(pptxPath)) {
            return { success: false, issues: [`File not found: ${pptxPath}`] };
        }
        const zip = yield JSZip.loadAsync(fs.readFileSync(pptxPath));
        const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
        const slideFiles = files
            .filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))
            .sort((a, b) => { var _a, _b; return Number(((_a = a.match(/slide(\d+)\.xml$/)) === null || _a === void 0 ? void 0 : _a[1]) || 0) - Number(((_b = b.match(/slide(\d+)\.xml$/)) === null || _b === void 0 ? void 0 : _b[1]) || 0); });
        const chartFiles = files.filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
        const chartExFiles = files.filter(name => /^ppt\/charts\/chartEx\d+\.xml$/.test(name));
        const slideXml = (yield Promise.all(slideFiles.map(name => zip.file(name).async('string')))).join('\n');
        const chartXml = (yield Promise.all(chartFiles.map(name => zip.file(name).async('string')))).join('\n');
        const chartExXml = (yield Promise.all(chartExFiles.map(name => zip.file(name).async('string')))).join('\n');
        const allXml = `${slideXml}\n${chartXml}\n${chartExXml}`;
        const mediaParts = files.filter(name => /^ppt\/media\//.test(name) && !/\.(png|jpg|jpeg|gif|svg)$/i.test(name));
        const model3dParts = files.filter(name => /^ppt\/media\/.*\.glb$/i.test(name));
        const count = (needle) => needle ? allXml.split(needle).length - 1 : 0;
        return {
            success: true,
            slideCount: slideFiles.length,
            chartParts: chartFiles.length,
            legacyChartParts: chartFiles.length,
            chartExParts: chartExFiles.length,
            totalChartParts: chartFiles.length + chartExFiles.length,
            mediaParts: mediaParts.length,
            model3dParts: model3dParts.length,
            timingNodes: count('<p:cTn') + count('<p:anim') + count('<p:cmd'),
            animationNodes: count('<p:anim'),
            motionNodes: count('<p:animMotion'),
            mediaCommands: count('<p:cmd'),
            wordArtWarps: count('prstTxWarp'),
            text3DNodes: count('<a:scene3d') + count('<a:sp3d'),
            shape3DNodes: count('<a:sp3d'),
            gradients: count('<a:gradFill'),
            shadows: count('outerShdw') + count('innerShdw'),
            glows: count('<a:glow'),
            reflections: count('<a:reflection'),
            chartSeries: count('<c:ser>') + count('<c:ser ') + count('<cx:series>') + count('<cx:series '),
            chartExSeries: count('<cx:series>') + count('<cx:series '),
            chartExDataPoints: count('<cx:pt>') + count('<cx:pt '),
        };
    });
}
function evaluateReferenceGates(signals, gates) {
    const failures = [];
    const checks = {};
    const check = (gateName, signalName) => {
        const expected = gates[gateName];
        if (typeof expected !== 'number')
            return;
        const actual = Number((signals === null || signals === void 0 ? void 0 : signals[signalName]) || 0);
        const passed = actual >= expected;
        checks[gateName] = { signal: signalName, expected, actual, passed };
        if (!passed)
            failures.push(`${String(gateName)} expected >= ${expected}, actual ${actual}`);
    };
    check('minSlides', 'slideCount');
    check('minTimingNodes', 'timingNodes');
    check('minMotionNodes', 'motionNodes');
    check('minMediaCommands', 'mediaCommands');
    check('minWordArtWarps', 'wordArtWarps');
    check('minText3DNodes', 'text3DNodes');
    check('minShape3DNodes', 'shape3DNodes');
    check('minGradients', 'gradients');
    check('minShadows', 'shadows');
    check('minCharts', 'totalChartParts');
    check('minChartSeries', 'chartSeries');
    check('minMediaParts', 'mediaParts');
    check('minModel3DParts', 'model3dParts');
    return { success: failures.length === 0, checks, failures };
}
function parseXml(xml, issues, label) {
    const parseIssues = [];
    const parser = new DOMParser({
        errorHandler: {
            warning: () => undefined,
            error: message => parseIssues.push(String(message)),
            fatalError: message => parseIssues.push(String(message)),
        },
    });
    const doc = parser.parseFromString(xml, 'application/xml');
    if (parseIssues.length)
        issues.push(`${label}: ${parseIssues.join('; ')}`);
    return doc;
}
function localElementName(node) {
    return node.localName || node.nodeName.split(':').pop() || node.nodeName;
}
function validateIntegerAttributeRange(node, file, attr, min, max, issues) {
    const raw = node.getAttribute(attr);
    if (raw === null || raw === undefined || raw === '')
        return;
    const value = Number(raw);
    if (!Number.isInteger(value) || value < min || value > max) {
        issues.push(`${file}: <${node.nodeName}> ${attr} out of OOXML range ${min}..${max}: ${raw}`);
    }
}
function validateOoxmlNumericRanges(doc, file, issues) {
    const nodes = doc.getElementsByTagName('*');
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes.item(i);
        if (!node)
            continue;
        const name = localElementName(node);
        if (name === 'alpha')
            validateIntegerAttributeRange(node, file, 'val', 0, 100000, issues);
        if (name === 'reflection') {
            validateIntegerAttributeRange(node, file, 'stA', 0, 100000, issues);
            validateIntegerAttributeRange(node, file, 'endA', 0, 100000, issues);
            validateIntegerAttributeRange(node, file, 'stPos', 0, 100000, issues);
            validateIntegerAttributeRange(node, file, 'endPos', 0, 100000, issues);
        }
    }
}
function validatePptxPackage(pptxPath_1) {
    return __awaiter(this, arguments, void 0, function* (pptxPath, opts = {}) {
        const issues = [];
        const warnings = [];
        if (!fs.existsSync(pptxPath)) {
            return { success: false, issues: [`File not found: ${pptxPath}`], warnings, brand: CLAUDEPPTXMCP_BRAND };
        }
        let zip;
        try {
            zip = yield JSZip.loadAsync(fs.readFileSync(pptxPath));
        }
        catch (error) {
            return { success: false, issues: [`Invalid zip/package: ${error instanceof Error ? error.message : String(error)}`], warnings, brand: CLAUDEPPTXMCP_BRAND };
        }
        const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
        for (const required of ['[Content_Types].xml', '_rels/.rels', 'ppt/presentation.xml', 'docProps/core.xml', 'docProps/app.xml']) {
            if (!zip.file(required))
                issues.push(`Missing required part: ${required}`);
        }
        for (const file of files.filter(name => name.endsWith('.xml') || name.endsWith('.rels'))) {
            const xml = yield zip.file(file).async('string');
            const doc = parseXml(xml, issues, file);
            validateOoxmlNumericRanges(doc, file, issues);
        }
        yield validateContentTypes(zip, issues);
        yield validateRelationships(zip, issues);
        const coreXml = zip.file('docProps/core.xml') ? yield zip.file('docProps/core.xml').async('string') : '';
        const appXml = zip.file('docProps/app.xml') ? yield zip.file('docProps/app.xml').async('string') : '';
        const metadataContainsBrand = coreXml.includes(CLAUDEPPTXMCP_BRAND) || appXml.includes(CLAUDEPPTXMCP_BRAND);
        if (opts.expectClaudePptxMcpMetadata && !metadataContainsBrand) {
            issues.push(`Generated PPTX metadata does not contain ${CLAUDEPPTXMCP_BRAND}`);
        }
        return {
            success: issues.length === 0,
            brand: CLAUDEPPTXMCP_BRAND,
            path: path.basename(pptxPath),
            partCount: files.length,
            mediaCount: files.filter(name => name.startsWith('ppt/media/')).length,
            xmlPartCount: files.filter(name => name.endsWith('.xml')).length,
            relsPartCount: files.filter(name => name.endsWith('.rels')).length,
            metadataContainsBrand,
            issues,
            warnings,
        };
    });
}
function validateContentTypes(zip, issues) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const part = zip.file('[Content_Types].xml');
        if (!part)
            return;
        const xml = yield part.async('string');
        const doc = parseXml(xml, issues, '[Content_Types].xml');
        const overrides = doc.getElementsByTagName('Override');
        for (let i = 0; i < overrides.length; i++) {
            const partName = (_a = overrides.item(i)) === null || _a === void 0 ? void 0 : _a.getAttribute('PartName');
            if (!partName)
                continue;
            const zipPath = partName.startsWith('/') ? partName.slice(1) : partName;
            if (!zip.file(zipPath))
                issues.push(`Content-type override points to missing part: ${partName}`);
        }
    });
}
function relationshipBaseDir(relsPath) {
    if (relsPath === '_rels/.rels')
        return '';
    const marker = '/_rels/';
    const index = relsPath.indexOf(marker);
    if (index < 0)
        return path.posix.dirname(relsPath);
    const sourceDir = relsPath.slice(0, index);
    const relName = relsPath.slice(index + marker.length).replace(/\.rels$/, '');
    return path.posix.dirname(path.posix.join(sourceDir, relName));
}
function validateRelationships(zip, issues) {
    return __awaiter(this, void 0, void 0, function* () {
        const rels = Object.keys(zip.files).filter(name => name.endsWith('.rels') && !zip.files[name].dir);
        for (const relPath of rels) {
            const xml = yield zip.file(relPath).async('string');
            const doc = parseXml(xml, issues, relPath);
            const relNodes = doc.getElementsByTagName('Relationship');
            const baseDir = relationshipBaseDir(relPath);
            for (let i = 0; i < relNodes.length; i++) {
                const rel = relNodes.item(i);
                if (!rel)
                    continue;
                const target = rel.getAttribute('Target');
                const mode = rel.getAttribute('TargetMode');
                if (!target || mode === 'External')
                    continue;
                if (target.startsWith('http:') || target.startsWith('https:') || target.startsWith('mailto:'))
                    continue;
                const normalized = path.posix.normalize(path.posix.join(baseDir, target));
                if (normalized.startsWith('../')) {
                    issues.push(`${relPath}: relationship target escapes package root: ${target}`);
                    continue;
                }
                if (!zip.file(normalized))
                    issues.push(`${relPath}: dangling relationship target: ${target} -> ${normalized}`);
            }
        }
    });
}
function packageSnapshot(pptxPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const zip = yield JSZip.loadAsync(fs.readFileSync(pptxPath));
        const files = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort();
        const mediaHashes = {};
        for (const file of files.filter(name => name.startsWith('ppt/media/'))) {
            const data = yield zip.file(file).async('nodebuffer');
            mediaHashes[file] = crypto.createHash('sha256').update(data).digest('hex');
        }
        return {
            brand: CLAUDEPPTXMCP_BRAND,
            file: path.basename(pptxPath),
            parts: files,
            counts: {
                parts: files.length,
                xml: files.filter(name => name.endsWith('.xml')).length,
                rels: files.filter(name => name.endsWith('.rels')).length,
                media: Object.keys(mediaHashes).length,
            },
            mediaHashes,
            validation: yield validatePptxPackage(pptxPath),
        };
    });
}
function validateChartPackageParts(zip, files, focus) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const issues = [];
        const warnings = [];
        const shouldValidateCharts = focus === 'full' || focus === 'ultimate' || focus === 'chart-capability-lab' || focus === 'charts';
        const chartFiles = files
            .filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name))
            .sort((a, b) => { var _a, _b; return Number(((_a = a.match(/chart(\d+)\.xml$/)) === null || _a === void 0 ? void 0 : _a[1]) || 0) - Number(((_b = b.match(/chart(\d+)\.xml$/)) === null || _b === void 0 ? void 0 : _b[1]) || 0); });
        const chartExFiles = files
            .filter(name => /^ppt\/charts\/chartEx\d+\.xml$/.test(name))
            .sort((a, b) => { var _a, _b; return Number(((_a = a.match(/chartEx(\d+)\.xml$/)) === null || _a === void 0 ? void 0 : _a[1]) || 0) - Number(((_b = b.match(/chartEx(\d+)\.xml$/)) === null || _b === void 0 ? void 0 : _b[1]) || 0); });
        const embeddedWorkbooks = files.filter(name => name.startsWith('ppt/embeddings/') && /\.xlsx$/i.test(name));
        const chartDetails = [];
        const chartExDetails = [];
        for (const chartFile of chartFiles) {
            const xml = yield zip.file(chartFile).async('string');
            const localIssues = [];
            const doc = parseXml(xml, localIssues, chartFile);
            if (localIssues.length)
                issues.push(...localIssues);
            const chartTypeTags = ['areaChart', 'barChart', 'bar3DChart', 'bubbleChart', 'doughnutChart', 'lineChart', 'pieChart', 'radarChart', 'scatterChart'];
            const types = chartTypeTags.filter(tag => doc.getElementsByTagName(`c:${tag}`).length || doc.getElementsByTagName(tag).length);
            const count = (tag) => doc.getElementsByTagName(`c:${tag}`).length + doc.getElementsByTagName(tag).length;
            const series = count('ser');
            const points = count('pt');
            const xPoints = Array.from(doc.getElementsByTagName('c:xVal'))
                .reduce((sum, node) => sum + node.getElementsByTagName('c:pt').length + node.getElementsByTagName('pt').length, 0);
            const yPoints = Array.from(doc.getElementsByTagName('c:yVal'))
                .reduce((sum, node) => sum + node.getElementsByTagName('c:pt').length + node.getElementsByTagName('pt').length, 0);
            const bubbleSizes = Array.from(doc.getElementsByTagName('c:bubbleSize'))
                .reduce((sum, node) => sum + node.getElementsByTagName('c:pt').length + node.getElementsByTagName('pt').length, 0);
            chartDetails.push({ file: chartFile, types, series, points, xPoints, yPoints, bubbleSizes });
            if (shouldValidateCharts && types.length && series === 0)
                issues.push(`${chartFile}: native chart has zero c:ser entries`);
            if (shouldValidateCharts && types.includes('scatterChart') && (xPoints === 0 || yPoints === 0))
                issues.push(`${chartFile}: scatter chart lacks numeric x/y cache data`);
            if (shouldValidateCharts && types.includes('bubbleChart') && (xPoints === 0 || yPoints === 0 || bubbleSizes === 0))
                issues.push(`${chartFile}: bubble chart lacks numeric x/y/size cache data`);
        }
        for (const chartExFile of chartExFiles) {
            const xml = yield zip.file(chartExFile).async('string');
            const localIssues = [];
            const doc = parseXml(xml, localIssues, chartExFile);
            if (localIssues.length)
                issues.push(...localIssues);
            const count = (tag) => doc.getElementsByTagName(`cx:${tag}`).length + doc.getElementsByTagName(tag).length;
            const seriesNodes = [
                ...Array.from(doc.getElementsByTagName('cx:series')),
                ...Array.from(doc.getElementsByTagName('series')),
            ].filter((node, index, arr) => arr.indexOf(node) === index);
            const layoutIds = Array.from(new Set(seriesNodes.map(node => node.getAttribute('layoutId')).filter((value) => !!value)));
            const relsPath = `ppt/charts/_rels/${path.posix.basename(chartExFile)}.rels`;
            const relsXml = zip.file(relsPath) ? yield zip.file(relsPath).async('string') : '';
            let hasStyleRel = false;
            let hasColorRel = false;
            if (relsXml) {
                const relIssues = [];
                const relDoc = parseXml(relsXml, relIssues, relsPath);
                if (relIssues.length)
                    issues.push(...relIssues);
                const relNodes = relDoc.getElementsByTagName('Relationship');
                for (let i = 0; i < relNodes.length; i++) {
                    const type = ((_a = relNodes.item(i)) === null || _a === void 0 ? void 0 : _a.getAttribute('Type')) || '';
                    if (type.endsWith('/chartStyle'))
                        hasStyleRel = true;
                    if (type.endsWith('/chartColorStyle'))
                        hasColorRel = true;
                }
            }
            const detail = {
                file: chartExFile,
                layoutIds,
                series: count('series'),
                points: count('pt'),
                hasRels: !!relsXml,
                hasStyleRel,
                hasColorRel,
            };
            chartExDetails.push(detail);
            if (shouldValidateCharts && detail.series === 0)
                issues.push(`${chartExFile}: chartEx part has zero cx:series entries`);
            if (shouldValidateCharts && detail.layoutIds.length === 0)
                issues.push(`${chartExFile}: chartEx part has no series layoutId`);
            if (shouldValidateCharts && !detail.hasRels)
                issues.push(`${chartExFile}: chartEx relationship part is missing`);
            if (shouldValidateCharts && detail.hasRels && (!detail.hasStyleRel || !detail.hasColorRel))
                issues.push(`${chartExFile}: chartEx style/color relationships are incomplete`);
        }
        if (shouldValidateCharts && chartFiles.length + chartExFiles.length === 0)
            issues.push('No native chart XML parts found');
        if (shouldValidateCharts && chartFiles.length > 0 && embeddedWorkbooks.length === 0)
            issues.push('Legacy native charts exist but embedded workbook relationships are missing');
        if (shouldValidateCharts && !chartDetails.some(item => item.types.includes('scatterChart')))
            issues.push('Focused chart coverage is missing scatter chart XML');
        if (shouldValidateCharts && !chartDetails.some(item => item.types.includes('bubbleChart')))
            issues.push('Focused chart coverage is missing bubble chart XML');
        return {
            success: issues.length === 0,
            chartCount: chartFiles.length,
            legacyChartCount: chartFiles.length,
            chartExCount: chartExFiles.length,
            totalChartCount: chartFiles.length + chartExFiles.length,
            embeddedWorkbookCount: embeddedWorkbooks.length,
            details: chartDetails,
            chartExDetails,
            issues,
            warnings,
        };
    });
}
function validateAutoplayPlayback(pptxPath, playback) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a, _b, _c, _d, _e, _f;
        const issues = [];
        const warnings = [];
        if (((_a = playback === null || playback === void 0 ? void 0 : playback.summary) === null || _a === void 0 ? void 0 : _a.mode) !== 'autoplay') {
            return { success: true, brand: CLAUDEPPTXMCP_BRAND, mode: ((_b = playback === null || playback === void 0 ? void 0 : playback.summary) === null || _b === void 0 ? void 0 : _b.mode) || 'audit', issues, warnings };
        }
        const focus = ((_c = playback === null || playback === void 0 ? void 0 : playback.summary) === null || _c === void 0 ? void 0 : _c.verificationFocus) || ((_d = playback === null || playback === void 0 ? void 0 : playback.summary) === null || _d === void 0 ? void 0 : _d.focus) || 'full';
        const isUltimate = focus === 'full' || focus === 'ultimate';
        const zip = yield JSZip.loadAsync(fs.readFileSync(pptxPath));
        const files = Object.keys(zip.files).filter(name => !zip.files[name].dir);
        const presPropsXml = zip.file('ppt/presProps.xml') ? yield zip.file('ppt/presProps.xml').async('string') : '';
        if (!presPropsXml) {
            issues.push('Missing ppt/presProps.xml');
        }
        else {
            const doc = parseXml(presPropsXml, issues, 'ppt/presProps.xml');
            const showPr = doc.getElementsByTagName('p:showPr').item(0) || doc.getElementsByTagName('showPr').item(0);
            if (!showPr) {
                issues.push('Missing p:showPr slideshow settings');
            }
            else {
                if (showPr.getAttribute('useTimings') !== '1')
                    issues.push('p:showPr useTimings is not enabled');
                if (showPr.getAttribute('showAnimation') !== '1')
                    issues.push('p:showPr showAnimation is not enabled');
                if (showPr.getAttribute('loop') === '1')
                    issues.push('p:showPr loop should be disabled for unattended one-shot showcase');
            }
        }
        const slideFiles = files
            .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
            .sort((a, b) => { var _a, _b; return Number(((_a = a.match(/slide(\d+)\.xml$/)) === null || _a === void 0 ? void 0 : _a[1]) || 0) - Number(((_b = b.match(/slide(\d+)\.xml$/)) === null || _b === void 0 ? void 0 : _b[1]) || 0); });
        let timedSlides = 0;
        let timingSlides = 0;
        let contentTimedSlides = 0;
        let mediaCommandCount = 0;
        let onClickConditionCount = 0;
        let prstTxWarpCount = 0;
        let scene3dCount = 0;
        let sp3dCount = 0;
        let bevelCount = 0;
        let extrusionCount = 0;
        const shapeBuiltPresetCounts = { trapezoid: 0, arc: 0, blockArc: 0, chord: 0, pie: 0, pieWedge: 0 };
        const transitionOnlySlides = [];
        const slideContentTiming = [];
        const liveDynamics = Array.isArray(playback === null || playback === void 0 ? void 0 : playback.liveDynamics) ? playback.liveDynamics : [];
        const liveDynamicsBySlide = liveDynamics.reduce((acc, cue) => {
            const index = Number(cue === null || cue === void 0 ? void 0 : cue.slideIndex);
            if (!Number.isFinite(index))
                return acc;
            if (!acc.has(index))
                acc.set(index, []);
            acc.get(index).push(cue);
            return acc;
        }, new Map());
        const liveDynamicsByKind = liveDynamics.reduce((acc, cue) => {
            const kind = String((cue === null || cue === void 0 ? void 0 : cue.dynamicKind) || 'unknown');
            acc[kind] = (acc[kind] || 0) + 1;
            return acc;
        }, {});
        for (const slideFile of slideFiles) {
            const xml = yield zip.file(slideFile).async('string');
            prstTxWarpCount += xml.split('<a:prstTxWarp').length - 1;
            scene3dCount += xml.split('<a:scene3d').length - 1;
            sp3dCount += xml.split('<a:sp3d').length - 1;
            bevelCount += xml.split('<a:bevelT').length - 1;
            extrusionCount += xml.split('extrusionH=').length - 1;
            for (const preset of Object.keys(shapeBuiltPresetCounts)) {
                shapeBuiltPresetCounts[preset] += xml.split(`prst="${preset}"`).length - 1;
            }
            const slideIndex = Number(((_e = slideFile.match(/slide(\d+)\.xml$/)) === null || _e === void 0 ? void 0 : _e[1]) || 0);
            const doc = parseXml(xml, issues, slideFile);
            const transitions = [
                ...Array.from(doc.getElementsByTagName('p:transition')),
                ...Array.from(doc.getElementsByTagName('transition')),
            ].filter((node, index, arr) => arr.indexOf(node) === index);
            if (!transitions.length) {
                issues.push(`${slideFile}: missing transition timing`);
            }
            else {
                const allTimed = transitions.every((node) => node.getAttribute('advClick') === '0' && !!node.getAttribute('advTm'));
                if (!allTimed)
                    issues.push(`${slideFile}: transition is not fully autoplay timed`);
                else
                    timedSlides += 1;
            }
            const timingNodes = doc.getElementsByTagName('p:timing').length + doc.getElementsByTagName('timing').length;
            if (timingNodes)
                timingSlides += 1;
            const countTags = (names) => names.reduce((sum, name) => sum + doc.getElementsByTagName(name).length, 0);
            const cmdNodes = countTags(['p:cmd', 'cmd']);
            const contentTimingCount = countTags([
                'p:animEffect', 'animEffect',
                'p:animClr', 'animClr',
                'p:animScale', 'animScale',
                'p:animMotion', 'animMotion',
                'p:animRot', 'animRot',
                'p:anim', 'anim',
                'p:set', 'set',
                'p:cmd', 'cmd',
            ]);
            mediaCommandCount += cmdNodes;
            const liveCount = ((_f = liveDynamicsBySlide.get(slideIndex)) === null || _f === void 0 ? void 0 : _f.length) || 0;
            if (contentTimingCount > 0)
                contentTimedSlides += 1;
            slideContentTiming.push({ slide: slideFile, slideIndex, contentTimingCount, liveDynamicsCount: liveCount });
            if (contentTimingCount === 0)
                transitionOnlySlides.push(slideFile);
            if (xml.includes('evt="onClick"'))
                onClickConditionCount += 1;
        }
        const mediaFiles = files.filter(name => name.startsWith('ppt/media/'));
        const hasMp4 = mediaFiles.some(name => name.toLowerCase().endsWith('.mp4'));
        const hasMp3 = mediaFiles.some(name => name.toLowerCase().endsWith('.mp3'));
        const hasWav = mediaFiles.some(name => name.toLowerCase().endsWith('.wav'));
        const hasGlb = mediaFiles.some(name => name.toLowerCase().endsWith('.glb'));
        if (isUltimate) {
            if (!hasMp4)
                issues.push('Missing embedded sample MP4 media');
            if (!hasMp3)
                issues.push('Missing embedded sample MP3 media');
            if (!hasWav)
                issues.push('Missing embedded narration WAV media');
            if (!hasGlb)
                issues.push('Missing embedded native GLB 3D model');
            if (mediaCommandCount < 3)
                issues.push('Expected timed media play/pause/stop commands were not found');
        }
        if (focus === 'audio-lab') {
            if (!hasMp3 && !hasWav)
                issues.push('Audio lab is missing embedded audio media');
            if (mediaCommandCount < 3)
                issues.push('Audio lab expected timed play/pause/stop commands');
        }
        if (focus === 'voice-lab') {
            if (!hasWav)
                issues.push('Voice lab is missing embedded narration WAV media');
        }
        if (focus === 'media-3d-lab') {
            if (!hasMp4)
                issues.push('Media/3D lab is missing embedded sample MP4 media');
            if (!hasMp3)
                issues.push('Media/3D lab is missing embedded sample MP3 media');
            if (!hasGlb)
                issues.push('Media/3D lab is missing embedded native GLB 3D model');
        }
        if (focus === 'animation-lab') {
            if (!hasMp4)
                issues.push('Animation lab is missing embedded media for media command animation coverage');
            if (mediaCommandCount < 1)
                issues.push('Animation lab expected at least one media command animation');
        }
        if (focus === 'full' || focus === 'ultimate' || focus === 'wordart-lab' || focus === 'wordart') {
            if (prstTxWarpCount === 0)
                issues.push('WordArt validation failed: no a:prstTxWarp text warp transforms found');
            if (scene3dCount === 0 || sp3dCount === 0 || bevelCount === 0 || extrusionCount === 0)
                issues.push('WordArt/3D validation failed: expected a:scene3d, a:sp3d, bevel, and extrusion XML');
        }
        if (focus === 'full' || focus === 'ultimate' || focus === 'shape-style-lab' || focus === 'shape-styles') {
            if (scene3dCount === 0 || sp3dCount === 0 || bevelCount === 0)
                issues.push('Shape 3D validation failed: expected a:scene3d, a:sp3d, and bevel XML');
        }
        if (focus === 'full' || focus === 'ultimate' || focus === 'chart-capability-lab' || focus === 'charts') {
            const missingShapeBuilt = Object.entries(shapeBuiltPresetCounts).filter(([, count]) => count === 0).map(([name]) => name);
            if (missingShapeBuilt.length)
                issues.push(`Shape-built chart validation failed: missing preset shape fixture(s): ${missingShapeBuilt.join(', ')}`);
        }
        if (transitionOnlySlides.length)
            issues.push(`Autoplay showcase has ${transitionOnlySlides.length} transition-only slide(s) without content-level timing: ${transitionOnlySlides.slice(0, 12).join(', ')}${transitionOnlySlides.length > 12 ? ', ...' : ''}`);
        if (onClickConditionCount > 0)
            issues.push(`${onClickConditionCount} slide(s) still contain onClick timing conditions; autoplay content demos must use afterPrevious/withPrevious.`);
        const requiredDynamicKindsByFocus = {
            full: ['text', 'shape', 'wordart', 'wordart3d', 'data', 'chartNative', 'chartFixture', 'smartart', 'color', 'transform', 'shape3d', 'media', 'audio', 'voice', 'model3d', 'model3dPoster', 'morph', 'motionPath', 'narration', 'sampleObject', 'shapeIcon'],
            ultimate: ['text', 'shape', 'wordart', 'wordart3d', 'data', 'chartNative', 'chartFixture', 'smartart', 'color', 'transform', 'shape3d', 'media', 'audio', 'voice', 'model3d', 'model3dPoster', 'morph', 'motionPath', 'narration', 'sampleObject', 'shapeIcon'],
            'wordart-lab': ['wordart', 'wordart3d'],
            wordart: ['wordart', 'wordart3d'],
            'shape-style-lab': ['shape', 'color', 'transform', 'shape3d'],
            'shape-styles': ['shape', 'color', 'transform', 'shape3d'],
            'chart-capability-lab': ['data', 'chartNative', 'chartFixture'],
            charts: ['data', 'chartNative', 'chartFixture'],
            'transition-scenes-lab': ['shape', 'transform', 'morph'],
            transitions: ['shape', 'transform', 'morph'],
            'animation-lab': ['shape', 'color', 'transform', 'media', 'motionPath'],
            'audio-lab': ['audio', 'media'],
            'voice-lab': ['voice', 'narration'],
            'media-3d-lab': ['media', 'model3d', 'model3dPoster'],
            'sample-object-lab': ['sampleObject'],
            'shape-icons-lab': ['shapeIcon', 'color'],
        };
        const requiredDynamicKinds = requiredDynamicKindsByFocus[focus] || requiredDynamicKindsByFocus.full;
        for (const kind of requiredDynamicKinds) {
            if (!liveDynamicsByKind[kind])
                issues.push(`Missing live dynamics gate: ${kind}`);
        }
        const chartValidation = yield validateChartPackageParts(zip, files, focus);
        if (!chartValidation.success)
            issues.push(...chartValidation.issues);
        warnings.push(...chartValidation.warnings);
        const clickDrivenDynamics = liveDynamics.filter((cue) => String((cue === null || cue === void 0 ? void 0 : cue.trigger) || '').toLowerCase() === 'onclick');
        if (clickDrivenDynamics.length)
            issues.push(`${clickDrivenDynamics.length} live dynamic cue(s) are click-triggered instead of autoplay-triggered`);
        if (playback.summary.gates && Object.entries(playback.summary.gates).some(([, value]) => value === false)) {
            issues.push('Playback timeline gates are not all satisfied');
        }
        return {
            success: issues.length === 0,
            brand: CLAUDEPPTXMCP_BRAND,
            mode: 'autoplay',
            verificationFocus: focus,
            focus,
            file: path.basename(pptxPath),
            slideCount: slideFiles.length,
            timedSlides,
            timingSlides,
            contentTimedSlides,
            mediaCommandCount,
            onClickConditionCount,
            transitionOnlySlides,
            slideContentTiming,
            liveDynamics: {
                count: liveDynamics.length,
                byKind: liveDynamicsByKind,
                clickDrivenDynamics: clickDrivenDynamics.length,
            },
            media: { hasMp4, hasMp3, hasWav, hasGlb },
            wordArtAnd3D: { prstTxWarpCount, scene3dCount, sp3dCount, bevelCount, extrusionCount },
            shapeBuiltPresetCounts,
            charts: chartValidation,
            playback: playback.summary,
            issues,
            warnings,
        };
    });
}
function normalizeCanonicalXml(fileName, xml) {
    if (fileName === 'docProps/core.xml') {
        return xml
            .replace(/<dcterms:created[^>]*>.*?<\/dcterms:created>/g, '<dcterms:created/>')
            .replace(/<dcterms:modified[^>]*>.*?<\/dcterms:modified>/g, '<dcterms:modified/>');
    }
    return xml.replace(/\r\n/g, '\n').trim();
}
function canonicalPackageHash(pptxPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const zip = yield JSZip.loadAsync(fs.readFileSync(pptxPath));
        const files = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort();
        const hash = crypto.createHash('sha256');
        for (const file of files) {
            hash.update(file);
            if (file.endsWith('.xml') || file.endsWith('.rels')) {
                hash.update(normalizeCanonicalXml(file, yield zip.file(file).async('string')));
            }
            else {
                hash.update(yield zip.file(file).async('nodebuffer'));
            }
        }
        return {
            file: path.basename(pptxPath),
            sha256: hash.digest('hex'),
            partCount: files.length,
            xmlPartCount: files.filter(name => name.endsWith('.xml')).length,
            relsPartCount: files.filter(name => name.endsWith('.rels')).length,
        };
    });
}
function exportVisualOracle(pptxPath, outDir, slides) {
    return __awaiter(this, void 0, void 0, function* () {
        ensureDir(outDir);
        if (process.platform !== 'win32') {
            return { summary: { success: false, runtimeAvailable: false, reason: 'PowerPoint visual oracle requires Windows PowerPoint COM' }, files: [] };
        }
        const scriptPath = path.join(os.tmpdir(), `claudepptxmcp-visual-oracle-${Date.now()}-${crypto.randomBytes(3).toString('hex')}.ps1`);
        const slidesLiteral = slides.join(',');
        const script = [
            'param([string]$PptxPath,[string]$OutDir)',
            "$ErrorActionPreference='Stop'",
            '$app=New-Object -ComObject PowerPoint.Application',
            '$app.DisplayAlerts=1',
            '$files=@()',
            'try {',
            '  $pres=$app.Presentations.Open([IO.Path]::GetFullPath($PptxPath),$true,$false,$false)',
            `  $slides=@(${slidesLiteral})`,
            '  foreach ($i in $slides) {',
            '    if ($i -le $pres.Slides.Count) {',
            '      $out=[IO.Path]::Combine([IO.Path]::GetFullPath($OutDir),("slide-{0}.png" -f $i))',
            '      $pres.Slides.Item($i).Export($out,"PNG",1280,720)',
            '      $files += $out',
            '    }',
            '  }',
            '  $pres.Close()',
            '  @{ success=$true; runtimeAvailable=$true; files=$files } | ConvertTo-Json -Compress',
            '} finally {',
            '  $app.Quit()',
            '}',
        ].join('\n');
        fs.writeFileSync(scriptPath, script);
        const proc = yield runProcess('pwsh.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-PptxPath', path.resolve(pptxPath), '-OutDir', path.resolve(outDir)], process.cwd(), 120000);
        fs.rmSync(scriptPath, { force: true });
        const files = fs.existsSync(outDir) ? fs.readdirSync(outDir).filter(name => name.endsWith('.png')).map(name => path.join(outDir, name)) : [];
        let parsed = null;
        try {
            parsed = proc.stdout.trim() ? JSON.parse(proc.stdout.trim()) : null;
        }
        catch (_a) {
            parsed = null;
        }
        return {
            summary: parsed || {
                success: proc.exitCode === 0 && files.length > 0,
                runtimeAvailable: proc.exitCode === 0,
                exitCode: proc.exitCode,
                stdout: proc.stdout,
                stderr: proc.stderr,
            },
            files,
        };
    });
}
function findArtifactById(artifactId, options) {
    const root = jobsRoot(options);
    if (!fs.existsSync(root))
        return null;
    for (const jobDirName of fs.readdirSync(root)) {
        const manifestPath = path.join(root, jobDirName, 'manifest.json');
        if (!fs.existsSync(manifestPath))
            continue;
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const artifact = manifest.artifacts.find(item => item.id === artifactId);
            if (artifact)
                return Object.assign(Object.assign({}, artifact), { filePath: resolveSerializedArtifactPath(artifact, options) });
        }
        catch (_a) {
            continue;
        }
    }
    return null;
}
function getArtifact(args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        const artifactId = String((args === null || args === void 0 ? void 0 : args.artifactId) || '');
        if (!artifactId)
            return errorResult('INVALID_INPUT', 'artifactId is required');
        const artifact = findArtifactById(artifactId, options);
        if (!artifact)
            return errorResult('NOT_FOUND', `Artifact not found: ${artifactId}`);
        if (!fs.existsSync(artifact.filePath))
            return errorResult('NOT_FOUND', `Artifact file is missing: ${artifactId}`);
        const publicRecord = publicArtifact(artifact, options);
        const result = { artifact: publicRecord };
        if ((args === null || args === void 0 ? void 0 : args.includeBase64) === true) {
            result.base64 = fs.readFileSync(artifact.filePath).toString('base64');
        }
        return toolResponse(result);
    });
}
export function callClaudePptxMcpTool(name_1) {
    return __awaiter(this, arguments, void 0, function* (name, args = {}, options = {}) {
        try {
            if (name.startsWith('pptx.')) {
                return errorResult('BRAND_BLOCKED', `Public MCP tools are branded claudepptxmcp.*. Use ${name.replace(/^pptx\./, 'claudepptxmcp.')}.`);
            }
            if (name.startsWith('claudepptxmcp.internal.') && !options.developerTools) {
                return errorResult('SECURITY_BLOCKED', 'Internal tools require --developer-tools or admin auth.');
            }
            if (name === 'claudepptxmcp.capabilities.query')
                return toolResponse(queryCapabilities(args));
            if (name === 'claudepptxmcp.recipe.list')
                return toolResponse({ brand: CLAUDEPPTXMCP_BRAND, recipes: listRecipes(args) });
            if (name === 'claudepptxmcp.recipe.preview') {
                const recipe = recipeById(String((args === null || args === void 0 ? void 0 : args.id) || ''));
                if (!recipe)
                    return errorResult('NOT_FOUND', `Recipe not found: ${args === null || args === void 0 ? void 0 : args.id}`);
                return toolResponse({ brand: CLAUDEPPTXMCP_BRAND, recipe });
            }
            if (name === 'claudepptxmcp.chart.recommend') {
                if ((args === null || args === void 0 ? void 0 : args.chartPresetId) && !chartPresetById(String(args.chartPresetId)))
                    return errorResult('NOT_FOUND', `Chart preset not found: ${args.chartPresetId}`);
                return toolResponse(chartRecommend(args));
            }
            if (name === 'claudepptxmcp.table.recommend') {
                if ((args === null || args === void 0 ? void 0 : args.tablePresetId) && !tablePresetById(String(args.tablePresetId)))
                    return errorResult('NOT_FOUND', `Table preset not found: ${args.tablePresetId}`);
                return toolResponse(tableRecommend(args));
            }
            if (name === 'claudepptxmcp.recipe.compose')
                return toolResponse(composeDynamicRecipe(args));
            if (name === 'claudepptxmcp.recipe.apply') {
                const mode = (args === null || args === void 0 ? void 0 : args.mode) === 'expressive' ? 'expressive' : 'design-system';
                const prepared = prepareGenerativeSpec(args, mode);
                if ((args === null || args === void 0 ? void 0 : args.render) === true) {
                    return createDeckJob(Object.assign(Object.assign({}, args), { mode, spec: prepared.spec, outputName: (args === null || args === void 0 ? void 0 : args.outputName) || 'claudepptxmcp-recipe-applied.pptx', emitCoverageReport: true }), options);
                }
                return toolResponse(Object.assign({ brand: CLAUDEPPTXMCP_BRAND, mode }, prepared));
            }
            if (name === 'claudepptxmcp.reference.list')
                return toolResponse(referenceList(args));
            if (name === 'claudepptxmcp.reference.brief') {
                const brief = referenceBrief(args);
                if (!brief)
                    return errorResult('NOT_FOUND', `Reference target not found: ${args === null || args === void 0 ? void 0 : args.id}`);
                return toolResponse(brief);
            }
            if (name === 'claudepptxmcp.reference.evaluate')
                return referenceEvaluateJob(args, options);
            if (name === 'claudepptxmcp.presentation.create')
                return createDeckJob(args, options);
            if (name === 'claudepptxmcp.presentation.create_from_code')
                return createFromCodeJob(args, options);
            if (name === 'claudepptxmcp.artifact.get')
                return getArtifact(args, options);
            if (name === 'claudepptxmcp.component.list') {
                const category = (args === null || args === void 0 ? void 0 : args.category) ? String(args.category) : '';
                const components = listComponents().filter(component => !category || component.category === category);
                return toolResponse({ brand: CLAUDEPPTXMCP_BRAND, components });
            }
            if (name === 'claudepptxmcp.component.validate')
                return toolResponse(Object.assign({ brand: CLAUDEPPTXMCP_BRAND }, validateComponent(String((args === null || args === void 0 ? void 0 : args.name) || ''), (args === null || args === void 0 ? void 0 : args.slots) || {})));
            if (name === 'claudepptxmcp.component.preview')
                return componentPreviewJob(args, options);
            if (name === 'claudepptxmcp.asset.list' || name === 'claudepptxmcp.assets.catalog')
                return toolResponse(publicAssetCatalog(args));
            if (name === 'claudepptxmcp.asset.preview')
                return assetPreviewJob(args, options);
            if (name === 'claudepptxmcp.asset.generate')
                return assetGenerateJob(args, options);
            if (name === 'claudepptxmcp.narration.generate')
                return narrationGenerateJob(args, options);
            if (name === 'claudepptxmcp.geometry.generate')
                return geometryGenerateJob(args, options);
            if (name === 'claudepptxmcp.brandkit.register')
                return registerBrandKit(args, options);
            if (name === 'claudepptxmcp.brandkit.list')
                return listBrandKits(options);
            if (name === 'claudepptxmcp.deck.fromOutline')
                return deckFromOutlineJob(args, options);
            if (name === 'claudepptxmcp.deck.refine')
                return editExistingJob('edit', Object.assign(Object.assign({}, args), { goals: (args === null || args === void 0 ? void 0 : args.feedback) || (args === null || args === void 0 ? void 0 : args.goals), editSpec: (args === null || args === void 0 ? void 0 : args.editSpec) || { feedback: args === null || args === void 0 ? void 0 : args.feedback } }), options);
            if (name === 'claudepptxmcp.presentation.validate')
                return validateJob(args, options);
            if (name === 'claudepptxmcp.presentation.snapshot' || name === 'claudepptxmcp.internal.package_snapshot')
                return snapshotJob(args, options);
            if (name === 'claudepptxmcp.presentation.compare') {
                return toolResponse(yield comparePresentations(Object.assign(Object.assign({}, args), { referencePath: resolveInputPath(String(args === null || args === void 0 ? void 0 : args.referencePath), options), generatedPath: resolveInputPath(String(args === null || args === void 0 ? void 0 : args.generatedPath), options) })));
            }
            if (name === 'claudepptxmcp.presentation.repair_check')
                return toolResponse(yield repairCheck(resolveInputPath(String(args === null || args === void 0 ? void 0 : args.pptxPath), options), args === null || args === void 0 ? void 0 : args.timeoutMs));
            if (name === 'claudepptxmcp.internal.decypher')
                return toolResponse(toPublicBrand(yield decypherToGenerator(Object.assign(Object.assign({}, args), { includeGeneratorCode: (args === null || args === void 0 ? void 0 : args.includeGeneratorCode) !== false }))));
            if (name === 'claudepptxmcp.internal.regenerate')
                return toolResponse(toPublicBrand(yield regenerateFromGenerator(args)));
            if (name === 'claudepptxmcp.internal.visual_oracle') {
                const visual = yield exportVisualOracle(resolveInputPath(String(args === null || args === void 0 ? void 0 : args.pptxPath), options), path.join(jobsRoot(options), `visual-${Date.now()}`), (args === null || args === void 0 ? void 0 : args.slides) || [1, 2, 3]);
                return toolResponse(visual);
            }
            const editMatch = name.match(/^claudepptxmcp\.presentation\.(improve|edit|restyle|apply_brand|animate|upgrade)$/);
            if (editMatch)
                return editExistingJob(editMatch[1], args, options);
            if ([
                'claudepptxmcp.slide.add_with_transition',
                'claudepptxmcp.object.insert_3d_asset',
                'claudepptxmcp.object.insert_media',
                'claudepptxmcp.object.apply_animation',
                'claudepptxmcp.object.apply_motion_path',
                'claudepptxmcp.object.insert_smartart',
                'claudepptxmcp.object.apply_wordart',
                'claudepptxmcp.object.apply_action',
                'claudepptxmcp.chart.add',
                'claudepptxmcp.table.add',
            ].includes(name))
                return focusedFeatureJob(name, args, options);
            return errorResult('UNKNOWN_TOOL', `Unknown tool: ${name}`);
        }
        catch (error) {
            return errorResult('INTERNAL_ERROR', error instanceof Error ? error.message : String(error));
        }
    });
}
export function callRemoteClaudePptxMcpTool(name, args, options) {
    return __awaiter(this, void 0, void 0, function* () {
        if (!options.remoteEndpoint)
            return errorResult('INVALID_INPUT', 'Gateway endpoint is required');
        const endpoint = new URL('/v1/tools/call', options.remoteEndpoint);
        const payload = JSON.stringify({ name, arguments: args || {} });
        return new Promise(resolve => {
            const req = http.request(endpoint, {
                method: 'POST',
                headers: Object.assign({ 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }, (options.apiKey ? { authorization: `Bearer ${options.apiKey}` } : {})),
            }, res => {
                let body = '';
                res.setEncoding('utf8');
                res.on('data', chunk => { body += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        resolve(toolResponse(parsed.structuredContent || parsed, parsed.isError === true || res.statusCode >= 400));
                    }
                    catch (_a) {
                        resolve(errorResult('REMOTE_ERROR', `Invalid remote response: HTTP ${res.statusCode}`, body));
                    }
                });
            });
            req.on('error', err => resolve(errorResult('REMOTE_ERROR', err.message)));
            req.write(payload);
            req.end();
        });
    });
}
export function artifactFilePath(artifactId, options) {
    const artifact = findArtifactById(artifactId, options);
    return (artifact === null || artifact === void 0 ? void 0 : artifact.filePath) && fs.existsSync(artifact.filePath) ? artifact.filePath : null;
}
export function listJobManifest(jobId, options) {
    const manifestPath = resolveContained(jobsRoot(options), path.join(jobId, 'manifest.json'));
    if (!fs.existsSync(manifestPath))
        return null;
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
}
export function getWorkspaceRoot(options) {
    const root = workspaceRoot(options);
    ensureDir(root);
    return root;
}
//# sourceMappingURL=engine.js.map