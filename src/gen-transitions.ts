/**
 * PptxGenJS: Animation & Transition Generation methods
 * @see https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation
 * @see https://ooxml.info/docs/19/19.5/
 */

import { SLIDE_OBJECT_TYPES } from './core-enums'
import { AnimationProps, PresSlide, TransitionProps } from './core-interfaces'

/**
 * Preset ID values for common animations (from ECMA-376 spec)
 * @see https://ooxml.info/docs/19/19.5/19.5.33/ (presetID attribute)
 */
const PRESET_IDS = {
    // Entrance effects
    appear: 1,
    fly: 2,
    blinds: 3,
    box: 4,
    checkerboard: 5,
    circle: 6,
    diamond: 7,
    dissolve: 8,
    fade: 10,       // Fade entrance
    flash: 11,
    peekIn: 12,
    randomBars: 13,
    split: 14,
    strips: 15,
    wedge: 16,
    wheel: 17,
    wipe: 18,
    zoom: 19,
    randomEffect: 20,
    expand: 21,
    floatIn: 42,
    // Emphasis effects
    pulse: 26,
    colorPulse: 27,
    teeter: 30,
    spin: 28,
    growShrink: 25,
    // Exit effects
    disappear: 1,  // Same as appear but with exit presetClass
    fadeOut: 10,   // Same as fade but with exit presetClass
}

/**
 * Preset class types
 * @see https://ooxml.info/docs/19/19.7/19.7.44/
 */
const PRESET_CLASS = {
    entrance: 'entr',
    emphasis: 'emph',
    exit: 'exit',
    motion: 'path',
}

/**
 * Perform a switch on the transition type and return the appropriate XML
 * @param {TransitionProps} transition - Transition properties
 * @return {string} XML string
 */
export function genXmlTransition(transition: TransitionProps): string {
    if (!transition || !transition.type || transition.type === 'none') return ''

    const normalizeSpeed = (speed?: string): '' | 'slow' | 'med' | 'fast' => {
        if (!speed) return ''
        if (speed === 'medium') return 'med'
        if (speed === 'slow' || speed === 'med' || speed === 'fast') return speed

        console.warn(`Warning: transition.speed must be one of: slow, medium, med, fast. Ignoring invalid value: ${speed}`)
        return ''
    }
    const speed = normalizeSpeed(transition.speed)

    // XML Namespaces
    const MC = 'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"'
    const P14 = 'xmlns:p14="http://schemas.microsoft.com/office/powerpoint/2010/main"'
    const P15 = 'xmlns:p15="http://schemas.microsoft.com/office/powerpoint/2012/main"'
    const P159 = 'xmlns:p159="http://schemas.microsoft.com/office/powerpoint/2015/09/main"'

    // 1. Build the opening <p:transition> tag with attributes
    let attrs = ''
    if (speed) attrs += ` spd="${speed}"`
    if (transition.advanceOnClick === false) attrs += ` advClick="0"`
    if (transition.advanceAfterTime) attrs += ` advTm="${transition.advanceAfterTime}"`
    
    // P14 duration attribute (only added inside Choice when using createExt)
    const p14DurAttr = transition.duration ? ` p14:dur="${transition.duration}"` : ''

    // Direction mapping
    const isVert = transition.direction === 'vert'
    const dirMap: { [key: string]: string } = { 'up': 'u', 'down': 'd', 'left': 'l', 'right': 'r' }
    const stdDir = dirMap[transition.direction || ''] || 'r'

    // 2. Helper to build a complete <p:transition>...</p:transition> block
    const buildTrans = (content: string) => `<p:transition${attrs}>${content}</p:transition>`

    // 3. Helper for standard (legacy) transitions - PRESERVE EXISTING LOGIC
    const createStd = (content: string) => buildTrans(content)

    // 4. Helper for Extended (p14/p15/p159) transitions - WRAP IN AlternateContent
    // Reference file structure: xmlns on AlternateContent, Fallback has xmlns=""
    // Choice can have p14:dur, Fallback should not
    const createExt = (ns: 'p14' | 'p15' | 'p159', content: string, useDuration: boolean = false) => {
        const xmlns = ns === 'p14' ? P14 : ns === 'p15' ? P15 : P159
        
        // Build transition with p14:dur in Choice if duration is specified and useDuration is true
        const choiceAttrs = attrs + (useDuration && p14DurAttr ? p14DurAttr : '')
        const choiceTrans = `<p:transition${choiceAttrs}>${content}</p:transition>`
        const choice = `<mc:Choice Requires="${ns}">${choiceTrans}</mc:Choice>`
        
        // Fallback must be a legacy p:* transition. Reusing p14/p15 content
        // inside mc:Fallback makes PowerPoint repair or reject the package.
        const fallback = `<mc:Fallback xmlns="">${buildTrans('<p:fade/>')}</mc:Fallback>`
        return `<mc:AlternateContent ${MC} ${xmlns}>${choice}${fallback}</mc:AlternateContent>`
    }

    // P15 Preset (Curtains, Wind, etc.)
    const createP15Preset = (preset: string, dir?: string, invX?: boolean, invY?: boolean) => {
        const d = dir ? ` dir="${dir}"` : ''
        const ix = invX ? ' invX="1"' : ''
        const iy = invY ? ' invY="1"' : ''
        return createExt('p15', `<p15:prstTrans prst="${preset}"${d}${ix}${iy}/>`)
    }

    // P14 Specific tags (Vortex, Cube, etc.)
    const createP14Tag = (tag: string, dir: string) => {
        return createExt('p14', `<p14:${tag} dir="${dir}"/>`)
    }

    // Main Switch
    switch (transition.type) {
        // --- SUBTLE (Standard) ---
        case 'fade': {
            const thruBlk = transition.throughBlack ? ' thruBlk="1"' : ''
            return createStd(`<p:fade${thruBlk}/>`)
        }
        case 'cut': {
            const thruBlk = transition.throughBlack ? ' thruBlk="1"' : ''
            return createStd(`<p:cut${thruBlk}/>`)
        }
        case 'dissolve': return createStd('<p:dissolve/>')
        case 'newsflash': return createStd('<p:newsflash/>')
        case 'random': return createStd('<p:random/>')
        case 'push': {
            // Push direction is opposite: "from bottom" = dir="u" (pushes up)
            const dir = transition.direction ? stdDir : 'r'
            return createStd(`<p:push dir="${dir}"/>`)
        }
        case 'wipe': {
            // Wipe: no direction = default (from right), otherwise use provided direction
            const dir = transition.direction ? ` dir="${stdDir}"` : ''
            return createStd(`<p:wipe${dir}/>`)
        }
        case 'cover': {
            const thruBlk = transition.throughBlack ? ' thruBlk="1"' : ''
            let dir = transition.direction ? (transition.direction as string) : ''
            
            // Map full direction names to short codes (same as uncover)
            const dirMap: { [key: string]: string } = {
                'up': 'd',      // cover from top covers down
                'down': 'u',    // cover from bottom covers up
                'left': 'r',    // cover from left covers right
                'right': ''     // cover from right is default (no dir)
            }
            
            // Apply mapping if direction is in the map
            if (dirMap.hasOwnProperty(dir)) {
                dir = dirMap[dir]
            }
            
            const dirAttr = dir ? ` dir="${dir}"` : ''
            return createStd(`<p:cover${dirAttr}${thruBlk}/>`)
        }
        case 'uncover': {
            const thruBlk = transition.throughBlack ? ' thruBlk="1"' : ''
            let dir = transition.direction ? (transition.direction as string) : ''
            
            // Map full direction names to short codes (used by diagonals already: ld, lu, rd, ru)
            const dirMap: { [key: string]: string } = {
                'up': 'd',      // uncover from top pulls down
                'down': 'u',    // uncover from bottom pulls up  
                'left': 'r',    // uncover from left pulls right
                'right': ''     // uncover from right is default (no dir)
            }
            
            // Apply mapping if direction is in the map
            if (dirMap.hasOwnProperty(dir)) {
                dir = dirMap[dir]
            }
            
            const dirAttr = dir ? ` dir="${dir}"` : ''
            return createStd(`<p:pull${dirAttr}${thruBlk}/>`)
        }
        case 'split': {
            // Split can use orient, dir, or both depending on the variant
            const orient = (transition.direction === 'vert' || transition.direction === 'horz') ? transition.direction : ''
            const dir = transition.splitDirection || ''
            let attrs = ''
            if (orient) attrs += ` orient="${orient}"`
            if (dir) attrs += ` dir="${dir}"`
            return createStd(`<p:split${attrs}/>`)
        }
        case 'reveal': {
            const thruBlk = transition.throughBlack ? ' thruBlk="1"' : ''
            return createExt('p14', `<p14:reveal dir="${stdDir === 'r' ? 'r' : 'l'}"${thruBlk}/>`)
        }
        case 'randomBar': return createStd(`<p:randomBar dir="${isVert ? 'vert' : 'horz'}"/>`)
        case 'shape': {
            // 5 variants: circle, diamond, plus, wedge (not zoom - that's separate!)
            const shapeType = transition.pattern || 'circle'
            return createStd(`<p:${shapeType}/>`)
        }
        case 'circle': return createExt('p14', '<p:circle/>', true)
        case 'diamond': return createExt('p14', '<p:diamond/>', true)
        case 'plus': return createStd('<p:plus/>')
        case 'wedge': return createStd('<p:wedge/>')
        case 'wheel': {
            const spokes = transition.spokes || 4
            // Counter-clockwise uses p14:wheelReverse instead of wheel with dir="ccw"
            if (transition.clockwise === false) {
                return createExt('p14', `<p14:wheelReverse spokes="${spokes}"/>`)
            }
            return createStd(`<p:wheel spokes="${spokes}"/>`)
        }
        case 'comb': return createStd(`<p:comb dir="${isVert ? 'vert' : 'horz'}"/>`)
        case 'zoom': {
            const requestedDir = transition.zoomFrom || transition.direction
            const dir = requestedDir === 'in' || requestedDir === 'out' ? requestedDir : ''
            const dirAttr = dir ? ` dir="${dir}"` : ''
            return createExt('p14', `<p:zoom${dirAttr}/>`, true)
        }
        case 'strips': {
            const requestedDir = transition.direction || 'ld'
            const dir = ['ld', 'lu', 'rd', 'ru'].includes(requestedDir) ? requestedDir : 'ld'
            return createStd(`<p:strips dir="${dir}"/>`)
        }
        case 'checkerboard':
        case 'checker': return createStd(`<p:checker dir="${isVert ? 'vert' : 'horz'}"/>`)
        case 'blinds': return createStd(`<p:blinds dir="${isVert ? 'vert' : 'horz'}"/>`)
        case 'flash': return createExt('p14', '<p14:flash/>')

        // --- SUBTLE (Morph - special p159/Office 2019) ---
        case 'morph': {
            const option = transition.option || 'byObject'
            const durAttr = transition.p14dur ? ` p14:dur="${transition.p14dur}"` : ''
            // Morph transition uses mc:AlternateContent at the p:sld level (after p:clrMapOvr)
            // mc:Choice: morph for modern PowerPoint
            // mc:Fallback: plain fade transition for older PowerPoint (xmlns="" resets namespace)
            // xmlns:mc, xmlns:p14, xmlns:p159 are declared at <p:sld> root level - no inline re-declaration needed
            const choiceTransition = `<p:transition${attrs}${durAttr}><p159:morph option="${option}"/></p:transition>`
            const fallbackTransition = `<p:transition${attrs}><p:fade/></p:transition>`
            return `<mc:AlternateContent><mc:Choice Requires="p159">${choiceTransition}</mc:Choice><mc:Fallback xmlns="">${fallbackTransition}</mc:Fallback></mc:AlternateContent>`
        }

        // --- EXCITING (p15 Presets) ---
        case 'curtains': return createP15Preset('curtains', undefined, transition.invX, transition.invY)
        case 'drape': return createP15Preset('drape', undefined, transition.invX, transition.invY)
        case 'wind': return createP15Preset('wind', undefined, transition.invX, transition.invY)
        case 'prestige': return createP15Preset('prestige', undefined, transition.invX, transition.invY)
        case 'fracture': return createP15Preset('fracture', undefined, transition.invX, transition.invY)
        case 'crush': return createP15Preset('crush', undefined, transition.invX, transition.invY)
        case 'peelOff': return createP15Preset('peelOff', undefined, transition.invX, transition.invY)
        case 'pageCurl': return createP15Preset('pageCurl', undefined, transition.invX, transition.invY)
        case 'pageCurlDouble': return createP15Preset('pageCurlDouble', undefined, transition.invX, transition.invY)
        case 'pageCurlSingle': return createP15Preset('pageCurlSingle', undefined, transition.invX, transition.invY)
        case 'airplane': return createP15Preset('airplane', undefined, transition.invX, transition.invY)
        case 'origami': return createP15Preset('origami', undefined, transition.invX, transition.invY)
        case 'fallOver': return createP15Preset('fallOver', undefined, transition.invX, transition.invY)
        case 'clock': {
            const dir = transition.clockwise === false ? 'ccw' : 'cw'
            return createP15Preset('clock', dir, transition.invX, transition.invY)
        }

        // --- DYNAMIC CONTENT (p14) ---
        case 'ripple': {
            // 5 variants based on pattern:
            // - center: no attributes (default)
            // - fromBottomLeft: dir="ru"
            // - fromBottomRight: dir="lu"  
            // - fromTopRight: dir="ld"
            // - fromTopLeft: dir="rd"
            const patternName = transition.pattern || ''
            
            const patternMap: { [key: string]: string } = {
                'fromBottomLeft': 'ru',
                'fromBottomRight': 'lu',
                'fromTopRight': 'ld',
                'fromTopLeft': 'rd'
            }
            
            const dir = patternMap[patternName] || ''
            const dirAttr = dir ? ` dir="${dir}"` : ''
            
            return createExt('p14', `<p14:ripple${dirAttr}/>`)
        }
        case 'honeycomb': return createExt('p14', '<p14:honeycomb/>')
        case 'glitter': {
            // 8 variants - hexagon/diamond with directions
            // Hexagon: left (no dir), right (u), top (r), bottom (d)
            // Diamond: left (no attrs), right (u), top (r), bottom (d)
            const pattern = transition.pattern || 'hexagon'
            const dir = transition.direction || ''
            
            let patternAttr = ''
            let dirAttr = ''
            
            if (pattern === 'hexagon') {
                patternAttr = ' pattern="hexagon"'
                // Hexagon from left has no dir, others need mapping
                if (dir === 'r') dirAttr = ' dir="u"'
                else if (dir === 'u') dirAttr = ' dir="r"'
                else if (dir === 'd') dirAttr = ' dir="d"'
                // 'l' or empty = no dir
            } else {
                // Diamond: no pattern attribute, just dir for non-left
                if (dir === 'r') dirAttr = ' dir="u"'
                else if (dir === 'u') dirAttr = ' dir="r"'
                else if (dir === 'd') dirAttr = ' dir="d"'
                // 'l' or empty = no dir
            }
            
            return createExt('p14', `<p14:glitter${patternAttr}${dirAttr}/>`)
        }
        case 'shred': {
            // 4 variants based on pattern:
            // - stripsIn: no pattern, no dir (default)
            // - stripsOut: no pattern, dir="out"
            // - particlesIn: pattern="rectangle", no dir
            // - particlesOut: pattern="rectangle", dir="out"
            const patternName = transition.pattern || ''
            
            let patternAttr = ''
            let dirAttr = ''
            
            if (patternName === 'stripsOut') {
                dirAttr = ' dir="out"'
            } else if (patternName === 'particlesIn') {
                patternAttr = ' pattern="rectangle"'
            } else if (patternName === 'particlesOut') {
                patternAttr = ' pattern="rectangle"'
                dirAttr = ' dir="out"'
            }
            // stripsIn or empty = no attributes (default)
            
            return createExt('p14', `<p14:shred${patternAttr}${dirAttr}/>`)
        }
        case 'vortex': {
            // 4 variants - directions are INVERTED from names
            // "from left" → dir="r", "from top" → dir="d"
            // "from right" → no dir (default), "from bottom" → dir="u"
            const dir = transition.direction || ''
            const dirMap: { [key: string]: string } = {
                'l': 'r',
                'u': 'd',
                'r': '',    // right is default
                'd': 'u'
            }
            const mappedDir = dirMap.hasOwnProperty(dir) ? dirMap[dir] : dir
            const dirAttr = mappedDir ? ` dir="${mappedDir}"` : ''
            return createExt('p14', `<p14:vortex${dirAttr}/>`)
        }
        case 'switch': {
            // 2 variants: directions are DIRECT (r→r, l→l)
            const dir = transition.direction === 'right' || transition.direction === 'r' ? 'r' : 'l'
            return createExt('p14', `<p14:switch dir="${dir}"/>`)
        }
        case 'flip': {
            // 2 variants: directions are DIRECT (r→r, l→l)
            const dir = transition.direction === 'right' || transition.direction === 'r' ? 'r' : 'l'
            return createExt('p14', `<p14:flip dir="${dir}"/>`)
        }
        case 'gallery': {
            // 2 variants: directions are INVERTED
            // "from right" → dir="l", "from left" → dir="r"
            const dir = transition.direction || ''
            const mappedDir = (dir === 'r' || dir === 'right') ? 'l' : 'r'
            return createExt('p14', `<p14:gallery dir="${mappedDir}"/>`)
        }
        case 'prism': return createExt('p14', '<p14:prism/>')
        case 'cube': {
            // 4 variants - INVERTED directions
            // right (r) → no dir, bottom (d) → u, left (l) → r, top (u) → d
            const dir = transition.direction || ''
            const dirMap: { [key: string]: string } = { 'r': '', 'd': 'u', 'l': 'r', 'u': 'd' }
            const mappedDir = dirMap.hasOwnProperty(dir) ? dirMap[dir] : dir
            const dirAttr = mappedDir ? ` dir="${mappedDir}"` : ''
            return createExt('p14', `<p14:prism${dirAttr}/>`)
        }
        case 'box': {
            // 4 variants - INVERTED directions, isInverted="1"
            const dir = transition.direction || ''
            const dirMap: { [key: string]: string } = { 'r': '', 'd': 'u', 'l': 'r', 'u': 'd' }
            const mappedDir = dirMap.hasOwnProperty(dir) ? dirMap[dir] : dir
            const dirAttr = mappedDir ? ` dir="${mappedDir}"` : ''
            return createExt('p14', `<p14:prism${dirAttr} isInverted="1"/>`)
        }
        case 'rotate': {
            // 4 variants - INVERTED directions, isContent="1"
            const dir = transition.direction || ''
            const dirMap: { [key: string]: string } = { 'r': '', 'd': 'u', 'l': 'r', 'u': 'd' }
            const mappedDir = dirMap.hasOwnProperty(dir) ? dirMap[dir] : dir
            const dirAttr = mappedDir ? ` dir="${mappedDir}"` : ''
            return createExt('p14', `<p14:prism${dirAttr} isContent="1"/>`)
        }
        case 'orbit': {
            // 4 variants - INVERTED directions, isContent="1" isInverted="1"
            const dir = transition.direction || ''
            const dirMap: { [key: string]: string } = { 'r': '', 'd': 'u', 'l': 'r', 'u': 'd' }
            const mappedDir = dirMap.hasOwnProperty(dir) ? dirMap[dir] : dir
            const dirAttr = mappedDir ? ` dir="${mappedDir}"` : ''
            return createExt('p14', `<p14:prism${dirAttr} isContent="1" isInverted="1"/>`)
        }
        case 'doors': {
            // vertical → dir="vert", horizontal → no dir (default)
            const orient = transition.direction || ''
            const dirAttr = (orient === 'vert') ? ' dir="vert"' : ''
            return createExt('p14', `<p14:doors${dirAttr}/>`)
        }
        case 'warp': {
            const dir = (transition.direction as string) === 'out' ? 'out' : 'in'
            return createExt('p14', `<p14:warp dir="${dir}"/>`)
        }
        case 'pan': {
            // 4 variants - MIXED mapping
            // from bottom (u) → dir="u" (DIRECT), from left (l) → dir="r" (INVERTED)
            // from right (r) → no dir (default), from top (d) → dir="d" (DIRECT)
            const dir = transition.direction || ''
            const dirMap: { [key: string]: string } = { 'u': 'u', 'l': 'r', 'r': '', 'd': 'd' }
            const mappedDir = dirMap.hasOwnProperty(dir) ? dirMap[dir] : dir
            const dirAttr = mappedDir ? ` dir="${mappedDir}"` : ''
            return createExt('p14', `<p14:pan${dirAttr}/>`)
        }
        case 'ferrisWheel': {
            // 2 variants - INVERTED: from right (r) → dir="l", from left (l) → dir="r"
            const dir = transition.direction || ''
            const mappedDir = (dir === 'r' || dir === 'right') ? 'l' : 'r'
            return createExt('p14', `<p14:ferris dir="${mappedDir}"/>`)
        }
        case 'conveyor': {
            // 2 variants - INVERTED: from right (r) → dir="l", from left (l) → dir="r"
            const dir = transition.direction || ''
            const mappedDir = (dir === 'r' || dir === 'right') ? 'l' : 'r'
            return createExt('p14', `<p14:conveyor dir="${mappedDir}"/>`)
        }
        case 'window': {
            // 2 variants: vertical → dir="vert", horizontal → no dir (default)
            const orient = transition.direction || ''
            const dirAttr = (orient === 'vert') ? ' dir="vert"' : ''
            return createExt('p14', `<p14:window${dirAttr}/>`)
        }
        case 'flyThrough': {
            // 4 variants: in (no dir), out (dir="out"), in+bounce, out+bounce
            const dir = transition.direction || ''
            const dirAttr = (dir === 'out') ? ' dir="out"' : ''
            const bounce = (transition.pattern as string) === 'bounce' ? ' hasBounce="1"' : ''
            return createExt('p14', `<p14:flythrough${dirAttr}${bounce}/>`)
        }

        default: return ''
    }
}

/**
 * Get animation preset ID and class based on effect type
 */
function getAnimPreset(anim: AnimationProps): { presetID: number; presetClass: string; presetSubtype: number } {
    const type = anim.type || 'entrance'
    const effect = (type === 'motion' ? anim.motionPath : anim.effect) || 'fadeIn'

    // Determine preset class
    let presetClass = PRESET_CLASS.entrance
    if (type === 'exit') presetClass = PRESET_CLASS.exit
    else if (type === 'emphasis') presetClass = PRESET_CLASS.emphasis
    else if (type === 'motion') presetClass = PRESET_CLASS.motion

    // Determine preset ID based on effect
    let presetID = PRESET_IDS.fade // Default to fade
    let presetSubtype = 0

    switch (effect) {
        case 'appear':
        case 'disappear':
            presetID = PRESET_IDS.appear
            break
        case 'fadeIn':
        case 'fadeOut':
            presetID = PRESET_IDS.fade
            break
        case 'flyIn':
        case 'flyOut':
            presetID = PRESET_IDS.fly
            presetSubtype = 4 // From bottom by default
            break
        case 'wipeIn':
        case 'wipeOut':
            presetID = PRESET_IDS.wipe
            break
        case 'randomBars':
            presetID = PRESET_IDS.randomBars
            break
        case 'zoom':
        case 'zoomOut':
            presetID = PRESET_IDS.zoom
            break
        case 'spin':
            presetID = PRESET_IDS.spin
            break
        case 'pulse':
            presetID = PRESET_IDS.pulse
            break
        case 'growShrink':
            presetID = PRESET_IDS.growShrink
            break
        case 'floatIn':
        case 'floatOut':
            presetID = PRESET_IDS.floatIn
            break
        case 'circle':
        case 'custom':
            // Motion paths use presetID 1
            presetID = 1
            break
        default:
            // Default to appear for entrance, fadeOut for exit, 1 for motion
            if (type === 'motion') presetID = 1
            else presetID = type === 'exit' ? PRESET_IDS.fade : PRESET_IDS.fade
    }

    return { presetID, presetClass, presetSubtype }
}

/**
 * Generate timing/animation XML following OOXML spec
 * @param {PresSlide} slide - Slide object
 * @return {string} XML string
 * @see https://learn.microsoft.com/en-us/office/open-xml/presentation/working-with-animation
 */
export function genXmlTiming(slide: PresSlide): string {
    const animatedObjects: { id: number, anim: AnimationProps | AnimationProps[] }[] = []
    let intTableNum = 1

    // 1. Identification Phase: Find animated objects and verify valid IDs
    slide._slideObjects.forEach((obj, idx) => {
        let id = idx + 2 // Default: Shape, Text, Image, Chart

        if (obj._type === SLIDE_OBJECT_TYPES.table) {
            id = intTableNum * slide._slideNum + 1
            intTableNum++
        } else if (obj._type === SLIDE_OBJECT_TYPES.media) {
            id = (obj.mediaRid || 0) + 2
        }

        const anim = obj.animation || obj.options?.animation
        
        if (anim) {
            animatedObjects.push({ id, anim })
        }
    })

    if (animatedObjects.length === 0) return ''

    let strXml = '<p:timing>'
    strXml += '<p:tnLst>'

    // Root Parallel Time Node
    strXml += '<p:par>'
    strXml += '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">'
    strXml += '<p:childTnLst>'

    // Main Sequence
    strXml += '<p:seq concurrent="1" nextAc="seek">'
    strXml += '<p:cTn id="2" dur="indefinite" nodeType="mainSeq">'
    strXml += '<p:childTnLst>'

    let tnId = 3 // Start Time Node ID counter

    // Loop through animated objects and generate click sequences
    animatedObjects.forEach(item => {
        const anims = Array.isArray(item.anim) ? item.anim : [item.anim]

        anims.forEach(anim => {
            const { presetID, presetClass, presetSubtype } = getAnimPreset(anim)
            const dur = anim.duration || 500

            // Each click effect needs proper nesting:
            // p:par > p:cTn (with stCondLst) > p:childTnLst > p:par > p:cTn (presets) > p:childTnLst > effect

            const clickParId = tnId++
            const intermediateParId = tnId++  // NEW: Intermediate wrapper
            const effectParId = tnId++
            const effectCtnId = tnId++
            const behaviorId = tnId++

            // Outer click wrapper
            strXml += '<p:par>'
            strXml += `<p:cTn id="${clickParId}" fill="hold">`
            strXml += '<p:stCondLst>'
            strXml += '<p:cond delay="indefinite"/>'  // Wait for click
            strXml += '</p:stCondLst>'
            strXml += '<p:childTnLst>'

            // FIX BUG #1: Add intermediate wrapper that PowerPoint requires
            strXml += '<p:par>'
            strXml += `<p:cTn id="${intermediateParId}" fill="hold">`
            strXml += '<p:stCondLst>'
            strXml += '<p:cond delay="0"/>'
            strXml += '</p:stCondLst>'
            strXml += '<p:childTnLst>'

            // Effect container with presetID/presetClass
            strXml += '<p:par>'
            // Add acceleration/deceleration for motion paths
            const accelDecel = anim.type === 'motion' ? ' accel="50000" decel="50000"' : ''
            strXml += `<p:cTn id="${effectParId}" presetID="${presetID}" presetClass="${presetClass}" presetSubtype="${presetSubtype}"${accelDecel} fill="hold">`
            strXml += '<p:stCondLst>'
            strXml += '<p:cond delay="0"/>'
            strXml += '</p:stCondLst>'
            strXml += '<p:childTnLst>'

            // The actual animation effect
            strXml += genXmlAnimEffect(effectCtnId, behaviorId, item.id, anim, dur)

            strXml += '</p:childTnLst>'
            strXml += '</p:cTn>'
            strXml += '</p:par>'

            // Close intermediate wrapper
            strXml += '</p:childTnLst>'
            strXml += '</p:cTn>'
            strXml += '</p:par>'

            strXml += '</p:childTnLst>'
            strXml += '</p:cTn>'
            strXml += '</p:par>'
        })
    })

    strXml += '</p:childTnLst>'
    strXml += '</p:cTn>'

    // Prev/Next conditions for main sequence
    strXml += '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>'
    strXml += '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>'

    strXml += '</p:seq>'

    // FIX BUG #3: Add second interactive sequence that PowerPoint requires
    // This sequence handles interactive playback and is needed for animations to work properly
    strXml += '<p:seq concurrent="1" nextAc="seek">'
    strXml += `<p:cTn id="${tnId++}" dur="indefinite" nodeType="mainSeq">`
    strXml += '<p:childTnLst>'

    // Add effect entries for each animated object in the interactive sequence
    animatedObjects.forEach(item => {
        const anims = Array.isArray(item.anim) ? item.anim : [item.anim]

        anims.forEach(anim => {
            const { presetID, presetClass, presetSubtype } = getAnimPreset(anim)
            const dur = anim.duration || 500

            strXml += '<p:par>'
            strXml += `<p:cTn id="${tnId++}" fill="hold">`
            strXml += '<p:stCondLst>'
            strXml += '<p:cond delay="indefinite"/>'
            strXml += '</p:stCondLst>'
            strXml += '<p:childTnLst>'

            // Generate the animation effect for interactive sequence
            const type = anim.type || 'entrance'
            const effect = anim.effect || 'fadeIn'
            const transition = type === 'exit' || effect.endsWith('Out') ? 'out' : 'in'
            
            strXml += `<p:animEffect transition="${transition}" filter="fade">`
            strXml += `<p:cBhvr>`
            strXml += `<p:cTn id="${tnId++}" dur="${dur}"/>`
            strXml += `<p:tgtEl><p:spTgt spid="${item.id}"/></p:tgtEl>`
            strXml += `</p:cBhvr>`
            strXml += `</p:animEffect>`

            strXml += '</p:childTnLst>'
            strXml += '</p:cTn>'
            strXml += '</p:par>'
        })
    })

    strXml += '</p:childTnLst>'
    strXml += '</p:cTn>'

    // Interactive sequence conditions (onBegin instead of onPrev/onNext)
    strXml += '<p:prevCondLst><p:cond evt="onBegin" delay="0"/></p:prevCondLst>'
    strXml += '<p:nextCondLst><p:cond evt="onBegin" delay="0"/></p:nextCondLst>'

    strXml += '</p:seq>'

    strXml += '</p:childTnLst>'
    strXml += '</p:cTn>'
    strXml += '</p:par>'

    strXml += '</p:tnLst>'
    strXml += '</p:timing>'

    return strXml
}

/**
 * Generate specific animation effect XML
 * @see https://ooxml.info/docs/19/19.5/19.5.3/ (animEffect)
 * @see https://ooxml.info/docs/19/19.5/19.5.66/ (set)
 */
function genXmlAnimEffect(ctnId: number, bhvrId: number, spId: number, anim: AnimationProps, dur: number): string {
    const type = anim.type || 'entrance'
    const effect = (type === 'motion' ? anim.motionPath : anim.effect) as string || 'fadeIn'
    
    let xml = ''
    let currentBhvrId = bhvrId

    // FIX BUG #2: For entrance effects, FIRST set visibility, THEN apply animation
    // PowerPoint requires both elements for entrance animations to work
    if (type === 'entrance' && effect !== 'appear') {
        // First: Set visibility
        xml += `<p:set>`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="1" fill="hold">`
        xml += `<p:stCondLst><p:cond delay="0"/></p:stCondLst>`
        xml += `</p:cTn>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>`
        xml += `</p:cBhvr>`
        xml += `<p:to><p:strVal val="visible"/></p:to>`
        xml += `</p:set>`
        
        currentBhvrId++ // Increment for the animation effect
    }

    // "Appear" effect uses ONLY <p:set> to instantly show (no animation)
    if (effect === 'appear' || effect === 'disappear') {
        xml += `<p:set>`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="1" fill="hold">`
        xml += `<p:stCondLst><p:cond delay="0"/></p:stCondLst>`
        xml += `</p:cTn>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>`
        xml += `</p:cBhvr>`
        xml += `<p:to><p:strVal val="visible"/></p:to>`
        xml += `</p:set>`
        return xml
    }

    // Fade effects use <p:animEffect>
    if (effect === 'fadeIn' || effect === 'fadeOut') {
        const transition = type === 'exit' || effect === 'fadeOut' ? 'out' : 'in'
        xml += `<p:animEffect transition="${transition}" filter="fade">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animEffect>`
        return xml
    }

    // Wipe, blinds, and other filter-based effects
    if (effect === 'wipeIn' || effect === 'wipeOut') {
        const transition = type === 'exit' || effect === 'wipeOut' ? 'out' : 'in'
        xml += `<p:animEffect transition="${transition}" filter="wipe(down)">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animEffect>`
        return xml
    }

    if (effect === 'randomBars') {
        xml += `<p:animEffect transition="in" filter="randomBars(horizontal)">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animEffect>`
        return xml
    }

    // Zoom effect
    if (effect === 'zoom' || effect === 'zoomOut') {
        const transition = type === 'exit' || effect === 'zoomOut' ? 'out' : 'in'
        xml += `<p:animEffect transition="${transition}" filter="zoom">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animEffect>`
        return xml
    }

    // Float effects
    if (effect === 'floatIn' || effect === 'floatOut') {
        const transition = type === 'exit' || effect === 'floatOut' ? 'out' : 'in'
        xml += `<p:animEffect transition="${transition}" filter="fade">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animEffect>`
        return xml
    }

    // EMPHASIS EFFECTS - These use different XML elements than entrance/exit
    
    // Pulse effect - uses animEffect + animScale
    if (effect === 'pulse') {
        // Fade effect with time filter
        xml += `<p:animEffect transition="out" filter="fade">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" tmFilter="0, 0; .2, .5; .8, .5; 1, 0"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animEffect>`
        
        currentBhvrId++
        
        // Scale animation with auto-reverse
        xml += `<p:animScale>`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${Math.floor(dur/2)}" autoRev="1" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `<p:by x="105000" y="105000"/>`
        xml += `</p:animScale>`
        return xml
    }

    // Spin effect - uses animRot (rotation)
    if (effect === 'spin') {
        const rotation = anim.rotation || 360
        xml += `<p:animRot>`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `<p:by val="${rotation * 60000}"/>`
        xml += `</p:animRot>`
        return xml
    }

    // GrowShrink effect - uses animScale
    if (effect === 'growShrink') {
        const scale = anim.scale || 1.5
        const scalePercent = Math.floor(scale * 100000)
        xml += `<p:animScale>`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" autoRev="1" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `<p:by x="${scalePercent}" y="${scalePercent}"/>`
        xml += `</p:animScale>`
        return xml
    }

    // Teeter effect - uses animRot with specific values
    if (effect === 'teeter') {
        xml += `<p:animRot>`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" autoRev="1" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `<p:by val="1800000"/>`
        xml += `</p:animRot>`
        return xml
    }

    // ColorPulse effect - uses animClr (color animation)
    if (effect === 'colorPulse') {
        const color = anim.color || 'FFFF00'
        xml += `<p:animClr clrSpc="rgb">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" autoRev="1" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `<p:attrNameLst><p:attrName>fillcolor</p:attrName></p:attrNameLst>`
        xml += `</p:cBhvr>`
        xml += `<p:by>`
        xml += `<a:srgbClr val="${color}"/>`
        xml += `</p:by>`
        xml += `</p:animClr>`
        return xml
    }

    // MOTION PATH EFFECTS - Use animMotion with SVG path data
    
    // Circle motion path
    if (effect === 'circle' && type === 'motion') {
        // SVG path for a circle (relative coordinates)
        const circlePath = 'M 5.55112E-17 -3.33333E-6 C 0.06901 -3.33333E-6 0.125 0.07755 0.125 0.17338 C 0.125 0.26922 0.06901 0.34699 5.55112E-17 0.34699 C -0.06901 0.34699 -0.125 0.26922 -0.125 0.17338 C -0.125 0.07755 -0.06901 -3.33333E-6 5.55112E-17 -3.33333E-6 Z'
        xml += `<p:animMotion origin="layout" path="${circlePath}" pathEditMode="relative" rAng="0" ptsTypes="">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animMotion>`
        return xml
    }

    // Custom motion path (user provides SVG path data)
    if (effect === 'custom' && type === 'motion') {
        const pathData = anim.motionPathData || 'M 0 0 L 0.25 0 L 0.25 0.25 L 0 0.25 Z'
        xml += `<p:animMotion origin="layout" path="${pathData}" pathEditMode="relative" rAng="0" ptsTypes="">`
        xml += `<p:cBhvr>`
        xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
        xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
        xml += `</p:cBhvr>`
        xml += `</p:animMotion>`
        return xml
    }

    // Default: Generic fade in/out
    const transition = type === 'exit' ? 'out' : 'in'
    xml += `<p:animEffect transition="${transition}" filter="fade">`
    xml += `<p:cBhvr>`
    xml += `<p:cTn id="${currentBhvrId}" dur="${dur}" fill="hold"/>`
    xml += `<p:tgtEl><p:spTgt spid="${spId}"/></p:tgtEl>`
    xml += `</p:cBhvr>`
    xml += `</p:animEffect>`
    return xml
}
