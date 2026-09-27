/**
 * AnimationParser - Parse animations from slide XML timing tree
 */
import * as fs from 'fs';
import * as path from 'path';
import { ANIMATION_REGISTRY_MERGED } from '../../gen-animations-registry-merged.js';
// Build PRESET_ID_MAP dynamically from the library's animation registry
// This ensures the decypher is ALWAYS in sync with the library
// Uses composite key "presetId_presetClass" to disambiguate entrance vs exit (same presetIDs)
function buildPresetIdMap() {
    const map = {};
    for (const [effectName, config] of Object.entries(ANIMATION_REGISTRY_MERGED)) {
        const presetId = config.presetId;
        // Check if effect has explicit presetClass (e.g., emphasis, path)
        if (config.presetClass) {
            const compositeKey = `${presetId}_${config.presetClass}`;
            map[compositeKey] = effectName;
        }
        else {
            // For entrance/exit effects WITHOUT explicit presetClass, 
            // they work for BOTH entrance and exit
            // Register them under BOTH 'entr' and 'exit'
            const entrKey = `${presetId}_entr`;
            const exitKey = `${presetId}_exit`;
            map[entrKey] = effectName;
            map[exitKey] = effectName;
        }
    }
    return map;
}
// Build per-effect direction map: effectName_type → (presetSubtype → directionName)
// Direction names depend on BOTH effect AND animation type (entrance vs exit)
// Example: wipe presetSubtype=8 means 'fromLeft' for entrance, 'toLeft' for exit
function buildDirectionMaps() {
    const maps = {};
    for (const [effectName, config] of Object.entries(ANIMATION_REGISTRY_MERGED)) {
        if (config.directions && config.directions.length > 0) {
            // Separate entrance and exit directions by their name prefix
            const entrMap = {};
            const exitMap = {};
            for (const dir of config.directions) {
                // Directions starting with 'to' are for exits, 'from' are for entrances
                if (dir.name.startsWith('to')) {
                    exitMap[dir.presetSubtype] = dir.name;
                }
                else if (dir.name.startsWith('from')) {
                    entrMap[dir.presetSubtype] = dir.name;
                }
                else {
                    // Non-directional names (e.g., 'in', 'out', 'horizontal') - use for both
                    entrMap[dir.presetSubtype] = dir.name;
                    exitMap[dir.presetSubtype] = dir.name;
                }
            }
            // Store with type suffix
            if (Object.keys(entrMap).length > 0) {
                maps[`${effectName}_entrance`] = entrMap;
            }
            if (Object.keys(exitMap).length > 0) {
                maps[`${effectName}_exit`] = exitMap;
            }
        }
    }
    return maps;
}
const PRESET_ID_MAP = buildPresetIdMap();
const DIRECTION_MAPS = buildDirectionMaps();
// Direction maps built successfully
// ============================================================================
// OLD HARDCODED MAP - REMOVED (kept for reference, will delete after testing)
// ============================================================================
/*
const PRESET_ID_MAP_OLD: { [key: string]: string } = {
    // ========================================================================
    // ENTRANCE EFFECTS (presetClass="entr")
    // ========================================================================
    '1_entr': 'appear',
    '2_entr': 'fly',
    '3_entr': 'blinds',
    '4_entr': 'box',
    '5_entr': 'checkerboard',
    '6_entr': 'circle',
    '7_entr': 'crawl',
    '8_entr': 'diamond',
    '9_entr': 'dissolve',
    '10_entr': 'fade',
    '12_entr': 'flashOnce',
    '13_entr': 'peek',
    '14_entr': 'plus',
    '15_entr': 'randomBars',
    '16_entr': 'spiral',
    '17_entr': 'split',
    '18_entr': 'strips',
    '19_entr': 'wedge',
    '20_entr': 'wheel',
    '21_entr': 'wipe',
    '22_entr': 'zoom',
    '23_entr': 'randomEffects',
    '24_entr': 'boomerang',
    '25_entr': 'bounce',
    '26_entr': 'colorReveal',
    '27_entr': 'creditsIntro',
    '28_entr': 'ease',
    '29_entr': 'float',
    '30_entr': 'glide',
    '31_entr': 'growAndTurn',
    '34_entr': 'lightSpeed',
    '35_entr': 'pinwheel',
    '37_entr': 'riseUp',
    '38_entr': 'swivel',
    '39_entr': 'threadedCrawl',
    '40_entr': 'unfold',
    '41_entr': 'whip',
    '42_entr': 'ascend',
    '43_entr': 'centerRevolve',
    '45_entr': 'compress',
    '47_entr': 'descend',
    '48_entr': 'fadedSwivel',
    '49_entr': 'fadedZoom',
    '50_entr': 'stretchy',
    '51_entr': 'stretch',
    '52_entr': 'expand',
    '53_entr': 'basicSwivel',
    '54_entr': 'arcUp',
    '55_entr': 'sling',
    '56_entr': 'spinner',
    '58_entr': 'swish',

    // ========================================================================
    // EXIT EFFECTS (presetClass="exit") - Same presetIDs, different class
    // ========================================================================
    '1_exit': 'appear',
    '2_exit': 'fly',
    '3_exit': 'blinds',
    '4_exit': 'box',
    '5_exit': 'checkerboard',
    '6_exit': 'circle',
    '7_exit': 'crawl',
    '8_exit': 'diamond',
    '9_exit': 'dissolve',
    '10_exit': 'fade',
    '12_exit': 'flashOnce',
    '13_exit': 'peek',
    '14_exit': 'plus',
    '15_exit': 'randomBars',
    '16_exit': 'spiral',
    '17_exit': 'split',
    '18_exit': 'strips',
    '19_exit': 'wedge',
    '20_exit': 'wheel',
    '21_exit': 'wipe',
    '22_exit': 'zoom',
    '23_exit': 'randomEffects',
    '24_exit': 'boomerang',
    '25_exit': 'bounce',
    '26_exit': 'colorReveal',
    '27_exit': 'creditsIntro',
    '28_exit': 'ease',
    '29_exit': 'float',
    '30_exit': 'glide',
    '31_exit': 'growAndTurn',
    '34_exit': 'lightSpeed',
    '35_exit': 'pinwheel',
    '37_exit': 'riseUp',
    '38_exit': 'swivel',
    '39_exit': 'threadedCrawl',
    '40_exit': 'unfold',
    '41_exit': 'whip',
    '42_exit': 'ascend',
    '43_exit': 'centerRevolve',
    '45_exit': 'compress',
    '47_exit': 'descend',
    '48_exit': 'fadedSwivel',
    '49_exit': 'fadedZoom',
    '50_exit': 'stretchy',
    '51_exit': 'stretch',
    '52_exit': 'expand',
    '53_exit': 'basicSwivel',
    '54_exit': 'arcUp',
    '55_exit': 'sling',
    '56_exit': 'spinner',

    // ========================================================================
    // EMPHASIS EFFECTS (presetClass="emph")
    // ========================================================================
    '1_emph': 'changeFillColor',
    '2_emph': 'changeFont',
    '3_emph': 'changeFontColor',
    '4_emph': 'changeFontSize',
    '5_emph': 'changeFontStyle',
    '6_emph': 'growShrink',
    '7_emph': 'changeLineColor',
    '8_emph': 'spin',
    '9_emph': 'transparency',
    '10_emph': 'boldFlash',
    '14_emph': 'blast',
    '15_emph': 'boldReveal',
    '16_emph': 'brushColor',
    '18_emph': 'brushOnUnderline',
    '19_emph': 'objectColor',
    '20_emph': 'colorWave',
    '21_emph': 'complementaryColor',
    '22_emph': 'complementaryColor2',
    '23_emph': 'contrastingColor',
    '24_emph': 'darken',
    '25_emph': 'desaturate',
    '26_emph': 'pulse',
    '27_emph': 'flicker',
    '28_emph': 'growWithColor',
    '30_emph': 'lighten',
    '31_emph': 'styleEmphasis',
    '32_emph': 'teeter',
    '33_emph': 'verticalGrow',
    '34_emph': 'wave',

    // ========================================================================
    // MOTION PATH EFFECTS (presetClass="path")
    // ========================================================================
    '0_path': 'custom',
    '1_path': 'circlePath',
    '2_path': 'rightTriangle',
    '3_path': 'diamondPath',
    '4_path': 'hexagon',
    '5_path': 'fivePointStar',
    '6_path': 'crescentMoon',
    '7_path': 'square',
    '8_path': 'trapezoid',
    '9_path': 'heart',
    '10_path': 'octagon',
    '11_path': 'sixPointStar',
    '12_path': 'football',
    '13_path': 'equalTriangle',
    '14_path': 'parallelogram',
    '15_path': 'pentagon',
    '16_path': 'fourPointStar',
    '17_path': 'eightPointStar',
    '18_path': 'teardrop',
    '19_path': 'pointyStar',
    '20_path': 'curvedSquare',
    '21_path': 'curvedX',
    '22_path': 'verticalFigure8',
    '23_path': 'horizontalFigure8',
    '24_path': 'loopDeLoop',
    '25_path': 'buzzsaw',
    '26_path': 'bean',
    '27_path': 'plus',
    '28_path': 'invertedTriangle',
    '29_path': 'invertedSquare',
    '30_path': 'left',
    '31_path': 'turnRight',
    '32_path': 'arcDown',
    '33_path': 'zigzag',
    '34_path': 'sShape',
    '35_path': 'sineWave',
    '36_path': 'bounceLeft',
    '37_path': 'down',
    '38_path': 'turnUp',
    '39_path': 'arcUp',
    '40_path': 'heartbeat',
    '41_path': 'spiralRight',
    '42_path': 'wave',
    '43_path': 'diagonalDownRight',
    '44_path': 'turnDown',
    '45_path': 'arcLeft',
    '46_path': 'funnel',
    '47_path': 'spring',
    '48_path': 'bounceRight',
    '49_path': 'diagonalUpRight',
    '50_path': 'right',
    '51_path': 'turnLeft',
    '52_path': 'arcRight',
    '53_path': 'sCurve1',
    '54_path': 'decayingWave',
    '55_path': 'staircaseDown',
    '56_path': 'up',
    '57_path': 'curvedRight',
    '58_path': 'spiralLeft',
    '59_path': 'diagonalUpLeft',
    '60_path': 'sCurve2',
    '61_path': 'neutron',
    '62_path': 'staircaseUp',
    '63_path': 'peanut',
    '64_path': 'swoop',
}
*/
// ============================================================================
// END OF OLD HARDCODED MAP
// ============================================================================
// Map presetSubtype to direction names
const SUBTYPE_DIRECTION_MAP = {
    0: 'default',
    1: 'fromBottom',
    2: 'fromRight',
    3: 'fromTop',
    4: 'fromLeft',
    5: 'fromTopRight',
    6: 'fromTopLeft',
    7: 'fromBottomRight',
    8: 'fromBottomLeft',
    9: 'horizontal',
    10: 'vertical',
    16: 'in',
    32: 'out',
    272: 'inHorizontal',
    288: 'outHorizontal'
};
export class AnimationParser {
    constructor() {
        this.warnings = [];
    }
    /**
     * Extract target SPID from animation content using DOM parsing
     */
    extractTargetSpid(animContent) {
        try {
            // Wrap in root element for parsing
            const xml = `<root>${animContent}</root>`;
            const parser = new (require('xmldom').DOMParser)();
            const doc = parser.parseFromString(xml, 'text/xml');
            // Find <p:spTgt spid="...">
            const spTgtNodes = doc.getElementsByTagName('p:spTgt');
            if (spTgtNodes.length > 0) {
                const spidAttr = spTgtNodes[0].getAttribute('spid');
                if (spidAttr) {
                    return parseInt(spidAttr, 10);
                }
            }
        }
        catch (error) {
            // Fallback to regex if DOM parsing fails
            const match = animContent.match(/<p:spTgt\s+spid="(\d+)"/);
            if (match)
                return parseInt(match[1], 10);
        }
        return null;
    }
    /**
     * Extract duration from animation XML using DOM parsing
     * For entrance/exit/emphasis: Extract from <p:animEffect> child element
     * For motion paths: Extract from <p:animMotion> child element
     * For media: Use default 1ms (instantaneous)
     */
    extractDuration(fullMatch) {
        if (!fullMatch)
            return 500; // Default duration
        try {
            // Parse the full animation structure
            const parser = new (require('xmldom').DOMParser)();
            const doc = parser.parseFromString(fullMatch, 'text/xml');
            // Try to find <p:animEffect> first (entrance/exit/emphasis animations)
            const animEffectNodes = doc.getElementsByTagName('p:animEffect');
            if (animEffectNodes.length > 0) {
                // Get the <p:cTn> child of <p:animEffect>
                const cBhvrNodes = animEffectNodes[0].getElementsByTagName('p:cBhvr');
                if (cBhvrNodes.length > 0) {
                    const cTnNodes = cBhvrNodes[0].getElementsByTagName('p:cTn');
                    if (cTnNodes.length > 0) {
                        const durAttr = cTnNodes[0].getAttribute('dur');
                        if (durAttr) {
                            return parseInt(durAttr, 10);
                        }
                    }
                }
            }
            // Try <p:animMotion> for motion path animations
            const animMotionNodes = doc.getElementsByTagName('p:animMotion');
            if (animMotionNodes.length > 0) {
                const cBhvrNodes = animMotionNodes[0].getElementsByTagName('p:cBhvr');
                if (cBhvrNodes.length > 0) {
                    const cTnNodes = cBhvrNodes[0].getElementsByTagName('p:cTn');
                    if (cTnNodes.length > 0) {
                        const durAttr = cTnNodes[0].getAttribute('dur');
                        if (durAttr) {
                            return parseInt(durAttr, 10);
                        }
                    }
                }
            }
            // Fallback: check outer <p:cTn> (for media or other special cases)
            const cTnNodes = doc.getElementsByTagName('p:cTn');
            if (cTnNodes.length > 0) {
                const durAttr = cTnNodes[0].getAttribute('dur');
                if (durAttr) {
                    return parseInt(durAttr, 10);
                }
            }
        }
        catch (error) {
            // Fallback to regex if DOM parsing fails
            // Try to match dur inside animEffect first
            const effectMatch = fullMatch.match(/<p:animEffect[^>]*>[\s\S]*?<p:cTn[^>]*dur="(\d+)"/);
            if (effectMatch)
                return parseInt(effectMatch[1], 10);
            // Try animMotion
            const motionMatch = fullMatch.match(/<p:animMotion[^>]*>[\s\S]*?<p:cTn[^>]*dur="(\d+)"/);
            if (motionMatch)
                return parseInt(motionMatch[1], 10);
            // Generic fallback
            const match = fullMatch.match(/dur="(\d+)"/);
            if (match)
                return parseInt(match[1], 10);
        }
        return 500; // Default if no dur attribute found
    }
    /**
     * Extract delay from <p:cond delay="..."> using DOM parsing
     */
    extractDelay(animContent) {
        try {
            // Wrap in root element for parsing
            const xml = `<root>${animContent}</root>`;
            const parser = new (require('xmldom').DOMParser)();
            const doc = parser.parseFromString(xml, 'text/xml');
            // Find <p:cond delay="...">
            const condNodes = doc.getElementsByTagName('p:cond');
            if (condNodes.length > 0) {
                const delayAttr = condNodes[0].getAttribute('delay');
                if (delayAttr) {
                    return parseInt(delayAttr, 10);
                }
            }
        }
        catch (error) {
            // Fallback to regex if DOM parsing fails
            const match = animContent.match(/<p:cond\s+delay="(\d+)"/);
            if (match)
                return parseInt(match[1], 10);
        }
        // Return 0 if no delay attribute found (explicit 0, not undefined)
        return 0;
    }
    /**
     * Parse all animations from slide XML
     */
    parseAll(xml, shapes, slideNum, outputFolder) {
        const animations = [];
        // Find timing tree
        const timingMatch = xml.match(/<p:timing>([\s\S]*?)<\/p:timing>/);
        if (!timingMatch)
            return animations;
        const timingXml = timingMatch[1];
        // Find all animation entries (par elements with presetID)
        // NOTE: We only match <p:cTn> elements that have presetID attribute
        const parMatches = timingXml.matchAll(/<p:par>\s*(<p:cTn[^>]*presetID="[^"]*"[^>]*>[\s\S]*?<\/p:cTn>)\s*<\/p:par>/g);
        const animMatches = [];
        for (const parMatch of parMatches) {
            const cTnFullXml = parMatch[1];
            const openingTagMatch = cTnFullXml.match(/<p:cTn([^>]*)>/);
            if (!openingTagMatch)
                continue;
            const attrs = openingTagMatch[1];
            const presetIdMatch = attrs.match(/presetID="(\d+)"/);
            const presetClassMatch = attrs.match(/presetClass="(\w+)"/);
            const presetSubtypeMatch = attrs.match(/presetSubtype="(\d+)"/);
            if (!presetIdMatch || !presetClassMatch)
                continue;
            const presetId = parseInt(presetIdMatch[1]);
            const presetClass = presetClassMatch[1];
            const presetSubtype = presetSubtypeMatch ? parseInt(presetSubtypeMatch[1]) : 0;
            const contentMatch = cTnFullXml.match(/<p:cTn[^>]*>([\s\S]*)<\/p:cTn>/);
            const animContent = contentMatch ? contentMatch[1] : '';
            animMatches.push({
                presetId,
                presetClass,
                presetSubtype,
                animContent,
                fullMatch: cTnFullXml
            });
        }
        // Animation order preserved from XML document order
        // Track if we should skip the current mediacall (if inside interactiveSeq)
        animLoop: for (const match of animMatches) {
            // Handle mediacall animations inline to preserve document order
            if (match.presetClass === 'mediacall') {
                // Simple detection: interactiveSeq mediacalls have specific cmd structure
                // Check if there's an unclosed <p:seq nodeType="interactiveSeq"> before this mediacall
                const matchPos = timingXml.indexOf(match.fullMatch);
                if (matchPos !== -1) {
                    const beforeMatch = timingXml.substring(0, matchPos);
                    // Find last <p:seq> opening
                    const lastSeqStart = beforeMatch.lastIndexOf('<p:seq');
                    const lastSeqEnd = beforeMatch.lastIndexOf('</p:seq>');
                    // If there's an unclosed seq, check if it's interactiveSeq
                    if (lastSeqStart > lastSeqEnd) {
                        const seqTag = beforeMatch.substring(lastSeqStart, lastSeqStart + 200);
                        if (seqTag.includes('nodeType="interactiveSeq"')) {
                            continue animLoop; // Skip this mediacall - library auto-generates it
                        }
                    }
                }
                // Parse mediacall animation
                const animation = this.parseMediacallAnimation(match.presetId, match.animContent, match.fullMatch, shapes, slideNum, outputFolder);
                if (animation) {
                    animations.push(animation);
                }
            }
            else {
                // Regular animation (entrance/exit/emphasis/motion)
                const animation = this.parseAnimation(match.presetId, match.presetClass, match.presetSubtype, match.animContent, shapes, slideNum, outputFolder, match.fullMatch // Pass full XML so we can extract nodeType
                );
                if (animation) {
                    animations.push(animation);
                }
            }
        }
        // NOTE: <p:audio>, <p:video>, and <p:seq nodeType="interactiveSeq"> are NOT parsed here
        // The library auto-generates these elements when media objects are present
        // See src/gen-animations-media.ts for the auto-generation logic
        return animations;
    }
    /**
     * Parse a mediacall animation (media commands like play/pause/stop)
     */
    parseMediacallAnimation(presetId, animContent, fullMatch, shapes, slideNum, outputFolder) {
        // Map presetID to media effect names
        const MEDIA_PRESET_MAP = {
            1: 'mediaplay', // playFrom(0.0)
            2: 'mediapause', // togglePause
            3: 'mediastop' // stop
        };
        const spidMatch = animContent.match(/<p:spTgt\s+spid="(\d+)"/);
        const targetSpid = spidMatch ? parseInt(spidMatch[1]) : 0;
        const targetShape = shapes.find(s => s.id === targetSpid);
        const targetName = (targetShape === null || targetShape === void 0 ? void 0 : targetShape.name) || `mediacall_${targetSpid}`;
        // Extract delay
        const delayMatch = animContent.match(/<p:cond\s+delay="(\d+)"/);
        const delay = delayMatch ? parseInt(delayMatch[1]) : 0;
        // Determine trigger from nodeType
        const nodeTypeMatch = fullMatch.match(/nodeType="(\w+)"/);
        const nodeType = nodeTypeMatch ? nodeTypeMatch[1] : 'clickEffect';
        let trigger = 'onClick';
        if (nodeType === 'withEffect') {
            trigger = 'withPrevious';
        }
        else if (nodeType === 'afterEffect') {
            trigger = 'afterPrevious';
        }
        // Extract the actual cmd attribute value (e.g., "playFrom(3.8)", "stop", "togglePause")
        const cmdMatch = animContent.match(/<p:cmd\s+type="call"\s+cmd="([^"]+)"/);
        const cmdValue = cmdMatch ? cmdMatch[1] : null;
        // Map presetID to effect name (default behavior)
        let effect = MEDIA_PRESET_MAP[presetId];
        if (effect) {
            const animation = {
                target: targetName,
                targetId: targetSpid,
                type: 'media',
                effect,
                presetId,
                presetSubtype: 0,
                sequence: undefined,
                delay,
                trigger,
                duration: 1 // Media commands are instantaneous
            };
            // Add mediaCommand if present (library supports this via mediaCommand parameter)
            // Examples: "playFrom(3.8)", "stop", "togglePause"
            if (cmdValue) {
                animation.mediaCommand = cmdValue;
            }
            return animation;
        }
        else {
            // Unknown media command - save as passthrough
            const passthroughPath = this.savePassthrough(fullMatch, slideNum, targetSpid, presetId, outputFolder);
            this.warnings.push({
                type: 'passthrough',
                location: `slide${slideNum}.animation.mediacall.spid${targetSpid}`,
                message: `Unknown media presetID=${presetId} saved as passthrough`,
                details: `delay=${delay}`
            });
            return {
                target: targetName,
                targetId: targetSpid,
                type: '__passthrough__',
                passthrough: {
                    reason: `Media animation: command`,
                    sourceXmlPath: passthroughPath,
                    originalType: 'mediacall'
                }
            };
        }
        return null;
    }
    /**
     * Parse a single animation
     */
    parseAnimation(presetId, presetClass, presetSubtype, animContent, shapes, slideNum, outputFolder, fullMatch // Full XML including <p:cTn> tag with attributes
    ) {
        // Find target shape using DOM parsing
        const targetSpid = this.extractTargetSpid(animContent);
        if (!targetSpid)
            return null;
        const targetShape = shapes.find(s => s.id === targetSpid);
        const targetName = (targetShape === null || targetShape === void 0 ? void 0 : targetShape.name) || `Shape_${targetSpid}`;
        // Map presetID + presetClass to effect name (composite key)
        const compositeKey = `${presetId}_${presetClass}`;
        const effectName = PRESET_ID_MAP[compositeKey];
        // Determine animation type
        let type;
        if (presetClass === 'entr') {
            type = 'entrance';
        }
        else if (presetClass === 'exit') {
            type = 'exit';
        }
        else if (presetClass === 'emph') {
            type = 'emphasis';
        }
        else if (presetClass === 'path') {
            type = 'motion';
        }
        else {
            type = '__passthrough__';
        }
        // If we don't recognize the effect, mark as passthrough
        if (!effectName && type !== '__passthrough__') {
            const passthroughPath = this.savePassthrough(animContent, slideNum, targetSpid, presetId, outputFolder);
            this.warnings.push({
                type: 'passthrough',
                location: `slide${slideNum}.animation.spid${targetSpid}`,
                message: `Unknown presetID=${presetId} (${presetClass}) saved as passthrough`,
                details: `compositeKey=${compositeKey}, presetSubtype=${presetSubtype}`
            });
            return {
                target: targetName,
                targetId: targetSpid,
                type: '__passthrough__',
                presetId,
                presetSubtype,
                passthrough: {
                    reason: `Unknown presetID: ${presetId} (${presetClass})`,
                    sourceXmlPath: passthroughPath,
                    originalType: presetClass
                }
            };
        }
        // Extract duration and delay from XML using DOM parsing
        const duration = this.extractDuration(fullMatch);
        const delay = this.extractDelay(animContent);
        // Map direction using per-effect direction map from registry
        // presetSubtype numbers are per-effect, not global!
        // Direction also depends on animation type (entrance vs exit)
        let direction;
        if (effectName) {
            const mapKey = `${effectName}_${type}`;
            if (DIRECTION_MAPS[mapKey]) {
                direction = DIRECTION_MAPS[mapKey][presetSubtype];
            }
        }
        // Fallback: if no direction found but presetSubtype exists, use generic name
        if (!direction && presetSubtype !== 0) {
            direction = `direction${presetSubtype}`;
        }
        // Determine sequence mode from target structure
        let sequence = 'asOneObject';
        if (animContent.includes('<p:txEl>')) {
            if (animContent.includes('<p:pRg')) {
                sequence = 'byParagraph';
            }
        }
        if (animContent.includes('<p:bg/>')) {
            sequence = 'allAtOnce';
        }
        // Extract motion path data for path animations
        let motionPath;
        let motionPathData;
        if (type === 'motion') {
            // Named motion path from the registry
            motionPath = effectName || `motionPath${presetId}`;
            // Extract raw SVG path data from <p:animMotion path="...">
            const pathDataMatch = animContent.match(/<p:animMotion[^>]*\spath="([^"]+)"/);
            if (pathDataMatch) {
                motionPathData = pathDataMatch[1];
            }
        }
        // Extract emphasis animation parameters
        let emphasisColor;
        let emphasisScale;
        let emphasisTo;
        let emphasisBy;
        if (type === 'emphasis') {
            // Extract <p:to> — target value (color, font, etc.)
            const toMatch = animContent.match(/<p:to>([^<]*)<\/p:to>/);
            if (toMatch) {
                emphasisTo = toMatch[1];
            }
            // Extract <p:by> — relative change value
            const byMatch = animContent.match(/<p:by>([^<]*)<\/p:by>/);
            if (byMatch) {
                emphasisBy = byMatch[1];
            }
            // Extract color from <a:srgbClr> or <a:schemeClr> inside animClr
            const clrMatch = animContent.match(/<p:animClr[^>]*>[\s\S]*?<a:srgbClr\s+val="([^"]+)"/);
            if (clrMatch) {
                emphasisColor = clrMatch[1];
            }
            // Extract scale from <p:by> with x/y attributes (for growShrink)
            const scaleMatch = animContent.match(/<p:by\s+x="(\d+)"\s+y="(\d+)"/);
            if (scaleMatch) {
                emphasisScale = parseInt(scaleMatch[1]) / 100000; // OOXML uses 100000ths
            }
        }
        // Detect trigger type from nodeType attribute (in <p:cTn> tag) or evt attribute
        // Check fullMatch first (has nodeType attribute), fall back to animContent (has evt attribute)
        const xmlToCheck = fullMatch || animContent;
        let trigger;
        if (xmlToCheck.includes('nodeType="afterEffect"') || animContent.includes('evt="onEnd"')) {
            trigger = 'afterPrevious';
        }
        else if (xmlToCheck.includes('nodeType="withEffect"') || animContent.includes('evt="onBegin"')) {
            trigger = 'withPrevious';
        }
        else if (xmlToCheck.includes('nodeType="clickEffect"')) {
            trigger = 'onClick';
        }
        // Leave trigger as undefined if no nodeType/evt detected (library will handle default)
        const result = {
            target: targetName,
            targetId: targetSpid,
            type,
            presetId,
            presetSubtype,
            sequence,
            duration,
            delay,
            trigger
        };
        // Only set direction if it exists and is not 'default'
        if (direction && direction !== 'default') {
            result.direction = direction;
        }
        // Set effect or motionPath based on animation type
        if (type === 'motion') {
            result.motionPath = motionPath;
            if (motionPathData) {
                result.motionPathData = motionPathData;
            }
        }
        else {
            result.effect = effectName || `preset${presetId}`;
        }
        // Set emphasis parameters
        if (type === 'emphasis') {
            if (emphasisColor)
                result.emphasisColor = emphasisColor;
            if (emphasisScale)
                result.emphasisScale = emphasisScale;
            if (emphasisTo)
                result.emphasisTo = emphasisTo;
            if (emphasisBy)
                result.emphasisBy = emphasisBy;
        }
        return result;
    }
    /**
     * Save animation as passthrough
     */
    savePassthrough(xml, slideNum, targetSpid, presetId, outputFolder) {
        const fileName = `slide${slideNum}_anim_spid${targetSpid}_preset${presetId}.xml`;
        const filePath = path.join(outputFolder, 'passthrough', fileName);
        // Wrap in par element for context
        const wrappedXml = `<p:par>\n${xml}\n</p:par>`;
        fs.writeFileSync(filePath, wrappedXml);
        return `./passthrough/${fileName}`;
    }
    getWarnings() {
        return this.warnings;
    }
    clearWarnings() {
        this.warnings = [];
    }
}
//# sourceMappingURL=AnimationParser.js.map