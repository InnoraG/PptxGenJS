import { getNextAnimationId } from '../gen-animations-ids';
import { AnimationBuildContext } from './types'
import { getNodeTypeFromTrigger } from './utils';

/**
 * Build Bounce animation (presetID=26)
 * ENTRANCE: 15 elements total
 *   - 1 set (visibility)
 *   - 1 animEffect (wipe down)
 *   - 5 anim (1 for ppt_x horizontal slide, 4 for ppt_y with sine wave bounces)
 *   - 8 animScale (squash/stretch bounce effect)
 * EXIT: 17 elements total
 *   - 1 set (visibility)
 *   - 1 animEffect (wipe up)
 *   - 7 anim (2 for ppt_x, 4 for ppt_y bounces with explicit keyframes, 1 final drop)
 *   - 8 animScale (squash/stretch bounce effect)
 * Reference: Focused_EntranceExit_Showcase_BATCH3_BASE_v8_ZOOMVP.pptx slide8.xml
 */
export function buildBounceAnimation(ctx: AnimationBuildContext): string {
  const { shapeId, animation, config, type, ids, target, sequence } = ctx;
  const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);

  const duration = animation.duration || config.defaultDuration || 700;
  const delay = animation.delay ?? config.defaultDelay ?? 0
  const isEntrance = type === 'entrance';
  const presetClass = isEntrance ? 'entr' : 'exit';
  const visibilityValue = isEntrance ? 'visible' : 'hidden';

  // Calculate scaling factor for proportional choreography
  // Default Bounce duration is 700ms - scale all internal timing proportionally
  const DEFAULT_DURATION = 700;
  const scaleFactor = duration / DEFAULT_DURATION;

  // Build target XML based on sequence mode
  let targetXml = `<p:spTgt spid="${shapeId}"/>`;
  if (target?.type === 'background') {
    targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
  } else if (target?.type === 'paragraph' && target.paragraphIndex !== undefined) {
    const idx = target.paragraphIndex;
    targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
  }

  // Generate unique IDs for all 15 elements
  const setId = getNextAnimationId();
  const effectId = getNextAnimationId();
  const animXId = getNextAnimationId();
  const animY1Id = getNextAnimationId();
  const animY2Id = getNextAnimationId();
  const animY3Id = getNextAnimationId();
  const animY4Id = getNextAnimationId();
  const scale1Id = getNextAnimationId();
  const scale2Id = getNextAnimationId();
  const scale3Id = getNextAnimationId();
  const scale4Id = getNextAnimationId();
  const scale5Id = getNextAnimationId();
  const scale6Id = getNextAnimationId();
  const scale7Id = getNextAnimationId();
  const scale8Id = getNextAnimationId();

  // Base timing values from reference - different for entrance vs exit
  // These will be scaled proportionally by scaleFactor
  // Entrance: effectDur=203, Exit: effectDur=63 with accel="50000"
  const baseEffectDur = isEntrance ? 203 : 63;
  const baseAnimXDur = 638;
  const baseAnimY1Dur = 232;
  const baseAnimY2Dur = 232;
  const baseAnimY3Dur = 116;
  const baseAnimY4Dur = 57;
  
  // Apply scaling to durations
  const effectDur = Math.round(baseEffectDur * scaleFactor);
  const animXDur = Math.round(baseAnimXDur * scaleFactor);
  const animY1Dur = Math.round(baseAnimY1Dur * scaleFactor);
  const animY2Dur = Math.round(baseAnimY2Dur * scaleFactor);
  const animY3Dur = Math.round(baseAnimY3Dur * scaleFactor);
  const animY4Dur = Math.round(baseAnimY4Dur * scaleFactor);

  // For entrance: moves from left (#ppt_x-0.25) to position (#ppt_x)
  // For exit: moves from position (ppt_x) to right (#ppt_x+0.25)
  const xFrom = isEntrance ? '#ppt_x-0.25' : 'ppt_x';
  const xTo = isEntrance ? '#ppt_x' : '#ppt_x+0.25';

  // Build visibility setter
  // For Entrance: delay 0 (visible immediately)
  // For Exit: delay duration-1 (visible until end)
  const setDelay = isEntrance ? 0 : duration - 1;

  const setElement = `
  <p:set>
    <p:cBhvr>
      <p:cTn id="${setId}" dur="1" fill="hold">
        <p:stCondLst><p:cond delay="${setDelay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:to><p:strVal val="${visibilityValue}"/></p:to>
  </p:set>`;

  // Build animEffect (wipe down for both entrance and exit - object bounces away downward)
  // Exit uses accel="50000" and delay="637" (from frozen reference)
  const effectAccel = isEntrance ? '' : ' accel="50000"';
  const baseEffectDelay = isEntrance ? 0 : 637;
  const effectDelay = Math.round(baseEffectDelay * scaleFactor);
  const animEffectElement = `
  <p:animEffect transition="${isEntrance ? 'in' : 'out'}" filter="wipe(down)">
    <p:cBhvr>
      <p:cTn id="${effectId}" dur="${effectDur}"${effectAccel}>
        <p:stCondLst><p:cond delay="${effectDelay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
  </p:animEffect>`;

  // Build horizontal slide animation (ppt_x)
  // Note: entrance uses tmFilter with 0.36, exit uses 0.31
  // For exit: first ppt_x anim has delay=0, the second (animX2) has delay=638
  const tmFilterX = isEntrance ? '0,0; 0.14,0.36; 0.43,0.73; 0.71,0.91; 1.0,1.0' : '0,0; 0.14,0.31; 0.43,0.73; 0.71,0.91; 1.0,1.0';
  const animXElement = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animXId}" dur="${animXDur}" tmFilter="${tmFilterX}">
        <p:stCondLst><p:cond delay="0"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="${xFrom}"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="${xTo}"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

  // Generate IDs for additional exit-only anim elements
  const animX2Id = isEntrance ? null : getNextAnimationId();
  const animY5Id = isEntrance ? null : getNextAnimationId();

  // Build vertical bounce animations
  // ENTRANCE: Uses sine wave formulas (4 bounces)
  // EXIT: Uses explicit keyframes (4 bounces + 2 additional anims)
  let animY1Element = '';
  let animY2Element = '';
  let animY3Element = '';
  let animY4Element = '';
  let animX2Element = '';
  let animY5Element = '';

  if (isEntrance) {
    // ENTRANCE: 4 bounces with sine wave formulas
    const yFormula1 = '#ppt_y-sin(pi*$)/3';
    const yFormula2 = '#ppt_y-sin(pi*$)/9';
    const yFormula3 = '#ppt_y-sin(pi*$)/27';
    const yFormula4 = '#ppt_y-sin(pi*$)/81';

    animY1Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY1Id}" dur="${animY1Dur}" tmFilter="0.0,0.0; 0.25,0.07; 0.50,0.2; 0.75,0.467; 1.0,1.0">
        <p:stCondLst><p:cond delay="0"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0" fmla="${yFormula1}"><p:val><p:fltVal val="0.5"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    animY2Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY2Id}" dur="${animY2Dur}" tmFilter="0, 0; 0.125,0.2665; 0.25,0.4; 0.375,0.465; 0.5,0.5;  0.625,0.535; 0.75,0.6; 0.875,0.7335; 1,1">
        <p:stCondLst><p:cond delay="${animY1Dur}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0" fmla="${yFormula2}"><p:val><p:fltVal val="0"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    animY3Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY3Id}" dur="${animY3Dur}" tmFilter="0, 0; 0.125,0.2665; 0.25,0.4; 0.375,0.465; 0.5,0.5;  0.625,0.535; 0.75,0.6; 0.875,0.7335; 1,1">
        <p:stCondLst><p:cond delay="${Math.round(463 * scaleFactor)}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0" fmla="${yFormula3}"><p:val><p:fltVal val="0"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    animY4Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY4Id}" dur="${animY4Dur}" tmFilter="0, 0; 0.125,0.2665; 0.25,0.4; 0.375,0.465; 0.5,0.5;  0.625,0.535; 0.75,0.6; 0.875,0.7335; 1,1">
        <p:stCondLst><p:cond delay="${animY1Dur + animY2Dur + animY3Dur}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0" fmla="${yFormula4}"><p:val><p:fltVal val="0"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;
  } else {
    // EXIT: Additional ppt_x anim (stays at ppt_x) - delay=638, NO accel (from frozen reference)
    const animX2Dur = Math.round(62 * scaleFactor);
    const animX2Delay = Math.round(638 * scaleFactor);
    animX2Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animX2Id}" dur="${animX2Dur}">
        <p:stCondLst><p:cond delay="${animX2Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="ppt_x"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    // EXIT: 4 bounces with explicit keyframes
    animY1Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY1Id}" dur="${animY1Dur}" tmFilter="0.0,0.0;0.25,0.07;0.50,0.2;0.75,0.467;1.0,1.0">
        <p:stCondLst><p:cond delay="0"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
      <p:tav tm="5000"><p:val><p:strVal val="ppt_y+0.026"/></p:val></p:tav>
      <p:tav tm="10000"><p:val><p:strVal val="ppt_y+0.052"/></p:val></p:tav>
      <p:tav tm="15000"><p:val><p:strVal val="ppt_y+0.078"/></p:val></p:tav>
      <p:tav tm="20000"><p:val><p:strVal val="ppt_y+0.103"/></p:val></p:tav>
      <p:tav tm="30000"><p:val><p:strVal val="ppt_y+0.151"/></p:val></p:tav>
      <p:tav tm="40000"><p:val><p:strVal val="ppt_y+0.196"/></p:val></p:tav>
      <p:tav tm="50000"><p:val><p:strVal val="ppt_y+0.236"/></p:val></p:tav>
      <p:tav tm="60000"><p:val><p:strVal val="ppt_y+0.270"/></p:val></p:tav>
      <p:tav tm="70000"><p:val><p:strVal val="ppt_y+0.297"/></p:val></p:tav>
      <p:tav tm="80000"><p:val><p:strVal val="ppt_y+0.317"/></p:val></p:tav>
      <p:tav tm="90000"><p:val><p:strVal val="ppt_y+0.329"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="ppt_y+0.333"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    animY2Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY2Id}" dur="${animY2Dur}" tmFilter="0, 0; 0.125,0.2665; 0.25,0.4; 0.375,0.465; 0.5,0.5;  0.625,0.535; 0.75,0.6; 0.875,0.7335; 1,1">
        <p:stCondLst><p:cond delay="${animY1Dur}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
      <p:tav tm="10000"><p:val><p:strVal val="ppt_y-0.034"/></p:val></p:tav>
      <p:tav tm="20000"><p:val><p:strVal val="ppt_y-0.065"/></p:val></p:tav>
      <p:tav tm="30000"><p:val><p:strVal val="ppt_y-0.090"/></p:val></p:tav>
      <p:tav tm="40000"><p:val><p:strVal val="ppt_y-0.106"/></p:val></p:tav>
      <p:tav tm="50000"><p:val><p:strVal val="ppt_y-0.111"/></p:val></p:tav>
      <p:tav tm="60000"><p:val><p:strVal val="ppt_y-0.106"/></p:val></p:tav>
      <p:tav tm="70000"><p:val><p:strVal val="ppt_y-0.090"/></p:val></p:tav>
      <p:tav tm="80000"><p:val><p:strVal val="ppt_y-0.065"/></p:val></p:tav>
      <p:tav tm="90000"><p:val><p:strVal val="ppt_y-0.034"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    animY3Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY3Id}" dur="${animY3Dur}" tmFilter="0, 0; 0.125,0.2665; 0.25,0.4; 0.375,0.465; 0.5,0.5;  0.625,0.535; 0.75,0.6; 0.875,0.7335; 1,1">
        <p:stCondLst><p:cond delay="${Math.round(463 * scaleFactor)}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
      <p:tav tm="10000"><p:val><p:strVal val="ppt_y-0.011"/></p:val></p:tav>
      <p:tav tm="20000"><p:val><p:strVal val="ppt_y-0.022"/></p:val></p:tav>
      <p:tav tm="30000"><p:val><p:strVal val="ppt_y-0.030"/></p:val></p:tav>
      <p:tav tm="40000"><p:val><p:strVal val="ppt_y-0.035"/></p:val></p:tav>
      <p:tav tm="50000"><p:val><p:strVal val="ppt_y-0.037"/></p:val></p:tav>
      <p:tav tm="60000"><p:val><p:strVal val="ppt_y-0.035"/></p:val></p:tav>
      <p:tav tm="70000"><p:val><p:strVal val="ppt_y-0.030"/></p:val></p:tav>
      <p:tav tm="80000"><p:val><p:strVal val="ppt_y-0.022"/></p:val></p:tav>
      <p:tav tm="90000"><p:val><p:strVal val="ppt_y-0.011"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    animY4Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY4Id}" dur="${animY4Dur}" tmFilter="0, 0; 0.125,0.2665; 0.25,0.4; 0.375,0.465; 0.5,0.5;  0.625,0.535; 0.75,0.6; 0.875,0.7335; 1,1">
        <p:stCondLst><p:cond delay="${animY1Dur + animY2Dur + animY3Dur}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
      <p:tav tm="10000"><p:val><p:strVal val="ppt_y-0.004"/></p:val></p:tav>
      <p:tav tm="20000"><p:val><p:strVal val="ppt_y-0.007"/></p:val></p:tav>
      <p:tav tm="30000"><p:val><p:strVal val="ppt_y-0.010"/></p:val></p:tav>
      <p:tav tm="40000"><p:val><p:strVal val="ppt_y-0.012"/></p:val></p:tav>
      <p:tav tm="50000"><p:val><p:strVal val="ppt_y-0.0123"/></p:val></p:tav>
      <p:tav tm="60000"><p:val><p:strVal val="ppt_y-0.012"/></p:val></p:tav>
      <p:tav tm="70000"><p:val><p:strVal val="ppt_y-0.010"/></p:val></p:tav>
      <p:tav tm="80000"><p:val><p:strVal val="ppt_y-0.007"/></p:val></p:tav>
      <p:tav tm="90000"><p:val><p:strVal val="ppt_y-0.004"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;

    // EXIT: Final drop off screen - delay=637, accel=50000 from frozen reference
    const animY5Dur = Math.round(63 * scaleFactor);
    const animY5Delay = Math.round(637 * scaleFactor);
    animY5Element = `
  <p:anim calcmode="lin" valueType="num">
    <p:cBhvr>
      <p:cTn id="${animY5Id}" dur="${animY5Dur}" accel="50000">
        <p:stCondLst><p:cond delay="${animY5Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
      <p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
    </p:cBhvr>
    <p:tavLst>
      <p:tav tm="0"><p:val><p:strVal val="ppt_y"/></p:val></p:tav>
      <p:tav tm="100000"><p:val><p:strVal val="ppt_y+ppt_h"/></p:val></p:tav>
    </p:tavLst>
  </p:anim>`;
  }

  // Build 8 scale animations (squash/stretch bounce effect)
  // These create the visual "bounce" by scaling vertically at specific times
  // Note: Entrance and Exit have SAME scale timing values (from frozen reference)
  // Scale all timing proportionally
  const baseScale1Delay = isEntrance ? 227 : 217;
  const scale1Delay = Math.round(baseScale1Delay * scaleFactor);
  const scaleDur = Math.round(9 * scaleFactor);
  const scale1Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale1Id}" dur="${scaleDur}">
        <p:stCondLst><p:cond delay="${scale1Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="60000"/>
  </p:animScale>`;

  // Scale2: delay needs to be 226 for exit (matches scale1 which also adjusted)
  const baseScale2Delay = isEntrance ? 237 : 226;
  const scale2Delay = Math.round(baseScale2Delay * scaleFactor);
  const scale2Dur = Math.round(58 * scaleFactor);
  const scale2Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale2Id}" dur="${scale2Dur}" decel="50000">
        <p:stCondLst><p:cond delay="${scale2Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="100000"/>
  </p:animScale>`;

  const scale3Delay = Math.round(459 * scaleFactor);
  const scale3Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale3Id}" dur="${scaleDur}">
        <p:stCondLst><p:cond delay="${scale3Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="80000"/>
  </p:animScale>`;

  const scale4Delay = Math.round(468 * scaleFactor);
  const scale4Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale4Id}" dur="${scale2Dur}" decel="50000">
        <p:stCondLst><p:cond delay="${scale4Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="100000"/>
  </p:animScale>`;

  const scale5Delay = Math.round(575 * scaleFactor);
  const scale5Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale5Id}" dur="${scaleDur}">
        <p:stCondLst><p:cond delay="${scale5Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="90000"/>
  </p:animScale>`;

  const scale6Delay = Math.round(584 * scaleFactor);
  const scale6Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale6Id}" dur="${scale2Dur}" decel="50000">
        <p:stCondLst><p:cond delay="${scale6Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="100000"/>
  </p:animScale>`;

  const scale7Delay = Math.round(633 * scaleFactor);
  const scale7Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale7Id}" dur="${scaleDur}">
        <p:stCondLst><p:cond delay="${scale7Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="95000"/>
  </p:animScale>`;

  const scale8Delay = Math.round(642 * scaleFactor);
  const scale8Element = `
  <p:animScale>
    <p:cBhvr>
      <p:cTn id="${scale8Id}" dur="${scale2Dur}" decel="50000">
        <p:stCondLst><p:cond delay="${scale8Delay}"/></p:stCondLst>
      </p:cTn>
      <p:tgtEl>${targetXml}</p:tgtEl>
    </p:cBhvr>
    <p:to x="100000" y="100000"/>
  </p:animScale>`;

  // Assemble elements in exact order from reference
  // ENTRANCE: 15 elements (set, animEffect, animX, 4x animY, 8x animScale)
  // EXIT: 17 elements (set, animEffect, animX, animX2, 4x animY, animY5, 8x animScale)
  // Element order: Entrance (set->effect), Exit (effect->set)
  const childElements = isEntrance ? `
    ${setElement}
    ${animEffectElement}
    ${animXElement}
    ${animY1Element}
    ${animY2Element}
    ${animY3Element}
    ${animY4Element}
    ${scale1Element}
    ${scale2Element}
    ${scale3Element}
    ${scale4Element}
    ${scale5Element}
    ${scale6Element}
    ${scale7Element}
    ${scale8Element}` : `
    ${animEffectElement}
    ${animXElement}
    ${animX2Element}
    ${animY1Element}
    ${animY2Element}
    ${animY3Element}
    ${animY4Element}
    ${animY5Element}
    ${scale1Element}
    ${scale2Element}
    ${scale3Element}
    ${scale4Element}
    ${scale5Element}
    ${scale6Element}
    ${scale7Element}
    ${scale8Element}
    ${setElement}`;


  // Wrap in main par structure
  return `<p:par>
  <p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="0" fill="hold" grpId="${ctx.grpId ?? 0}" nodeType="${nodeType}">
    <p:stCondLst>
      <p:cond delay="${delay}"/>
    </p:stCondLst>
    <p:childTnLst>${childElements}
    </p:childTnLst>
  </p:cTn>
</p:par>`;
}
