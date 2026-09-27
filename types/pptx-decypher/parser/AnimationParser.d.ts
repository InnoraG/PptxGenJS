/**
 * AnimationParser - Parse animations from slide XML timing tree
 */
import { AnimationModel, ShapeModel, DecypherWarning } from '../types.js';
export declare class AnimationParser {
    private warnings;
    /**
     * Extract target SPID from animation content using DOM parsing
     */
    private extractTargetSpid;
    /**
     * Extract duration from animation XML using DOM parsing
     * For entrance/exit/emphasis: Extract from <p:animEffect> child element
     * For motion paths: Extract from <p:animMotion> child element
     * For media: Use default 1ms (instantaneous)
     */
    private extractDuration;
    /**
     * Extract delay from <p:cond delay="..."> using DOM parsing
     */
    private extractDelay;
    /**
     * Parse all animations from slide XML
     */
    parseAll(xml: string, shapes: ShapeModel[], slideNum: number, outputFolder: string): AnimationModel[];
    /**
     * Parse a mediacall animation (media commands like play/pause/stop)
     */
    private parseMediacallAnimation;
    /**
     * Parse a single animation
     */
    private parseAnimation;
    /**
     * Save animation as passthrough
     */
    private savePassthrough;
    getWarnings(): DecypherWarning[];
    clearWarnings(): void;
}
