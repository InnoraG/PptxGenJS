import { AppliedSpecimenRecord, CapabilityLedger } from './capability-ledger.js';
export declare const BETTERPPTX_MCP_BRAND = "betterpptx-mcp";
export declare const BETTERPPTX_MCP_SHOWCASE_NAME = "betterpptx-mcp-ultimate-mcp-showcase.pptx";
export type DeckProfile = 'ultimate-showcase' | 'executive-boardroom' | 'investor-pitch' | 'sales-proposal' | 'product-launch' | 'consulting-strategy' | 'data-storytelling' | 'financial-dashboard' | 'technical-architecture' | 'training-course' | 'conference-keynote' | 'brand-guidelines' | 'portfolio-agency' | 'interactive-kiosk' | 'accessibility-first';
export type VerificationFocus = 'full' | 'wordart-lab' | 'shape-style-lab' | 'chart-capability-lab' | 'transition-scenes-lab' | 'animation-lab' | 'audio-lab' | 'voice-lab' | 'media-3d-lab' | 'sample-object-lab' | 'shape-icons-lab';
export type ShowcaseFocus = 'ultimate' | 'wordart' | 'shape-styles' | 'charts' | 'transitions' | 'animations' | 'audio' | 'voice' | 'media-3d' | 'sample-objects' | 'shape-icons';
export declare const BETTERPPTX_MCP_SHOWCASE_NAMES: Record<VerificationFocus, string>;
export declare const BETTERPPTX_MCP_DECK_PROFILES: DeckProfile[];
export declare const BETTERPPTX_MCP_VERIFICATION_FOCI: VerificationFocus[];
export type ShowcaseThemeMode = 'light' | 'dark';
export type ShowcasePlaybackMode = 'autoplay' | 'audit';
export type ShowcaseSection = 'core' | 'enterprise' | 'shapes' | 'shape-style' | 'geometry' | 'shape-types' | 'legacy-shapes' | 'wordart' | 'charts' | 'animations' | 'animations-entrance' | 'animations-exit' | 'animations-emphasis' | 'animations-media' | 'animations-motion' | 'motion-paths' | 'media-3d' | 'audio' | 'voice' | 'sample-objects' | 'shape-icons' | 'morph' | 'transitions' | 'ledger';
export interface PlaybackCue {
    featureId?: string;
    category?: string;
    slideIndex: number;
    slideTitle: string;
    objectName?: string;
    cueType: string;
    startMs: number;
    endMs: number;
    detail?: string;
}
export interface LiveDynamicsSpecimen {
    featureId?: string;
    category?: string;
    slideIndex: number;
    slideTitle: string;
    objectName?: string;
    dynamicKind: string;
    trigger: string;
    effect: string;
    startMs: number;
    durationMs: number;
    validationOracle: string[];
    fallback?: boolean;
    detail?: string;
}
export interface PlaybackSlideTiming {
    slideIndex: number;
    slideTitle: string;
    section: string;
    dwellMs: number;
    transitionType: string;
    specimenCount: number;
    cueCount: number;
    risk: 'normal' | 'dense' | 'media' | 'model3d' | 'morph' | 'transition' | 'validation';
}
export interface PlaybackSummary {
    brand: string;
    mode: ShowcasePlaybackMode;
    deckProfile: DeckProfile;
    verificationFocus: VerificationFocus;
    focus: VerificationFocus;
    targetRuntimeMinutes: number | null;
    estimatedRuntimeMs: number;
    estimatedRuntimeMinutes: number;
    slideCount: number;
    cueCount: number;
    contentCueCount: number;
    contentDynamicSlideCount: number;
    transitionOnlySlideCount: number;
    mediaCueCount: number;
    model3dCueCount: number;
    morphCueCount: number;
    narrationCueCount: number;
    liveDynamicsByKind: Record<string, number>;
    unattended: boolean;
    warnings: string[];
    gates: Record<string, boolean>;
}
export interface ShowcasePlaybackMetadata {
    summary: PlaybackSummary;
    slides: PlaybackSlideTiming[];
    cues: PlaybackCue[];
    liveDynamics: LiveDynamicsSpecimen[];
}
export declare function loadBetterPptxMcpPresentationEngine(): Promise<any>;
export interface ShowcaseBuildResult {
    pptxPath: string;
    sourcePath: string;
    assetDir: string;
    features: string[];
    slideCount: number;
    themeMode: ShowcaseThemeMode;
    capabilityLedger: CapabilityLedger;
    coverageReport: any;
    semanticHash: string;
    appliedSpecimens: AppliedSpecimenRecord[];
    playback: ShowcasePlaybackMetadata;
    liveDynamics: LiveDynamicsSpecimen[];
}
export declare function buildBetterPptxMcpShowcase(outputPath: string, sourcePath: string, repoRoot: string, options?: {
    themeMode?: ShowcaseThemeMode;
    playbackMode?: ShowcasePlaybackMode;
    targetRuntimeMinutes?: number;
    capabilities?: any;
    sections?: ShowcaseSection[];
    deckProfile?: DeckProfile;
    verificationFocus?: VerificationFocus;
    showcaseFocus?: ShowcaseFocus;
}): Promise<ShowcaseBuildResult>;
