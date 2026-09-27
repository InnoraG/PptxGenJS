import { getNextAnimationId } from '../gen-animations-ids';
import { getNodeTypeFromTrigger } from './utils';
/**
 * Build Spiral animation (presetID 15)
 * Entrance: Parametric formula with (1-$) scaling
 * Exit: 20 discrete keyframes with pre-calculated rotation values
 * Verified from Focused_EntranceExit_Showcase_WHEELFIX_v7.pptx slide23.xml
 */
export function buildSpiralAnimation(ctx) {
    var _a, _b;
    const { shapeId, animation, config, type, ids, target, sequence } = ctx;
    const nodeType = ctx.nodeType || getNodeTypeFromTrigger(animation.trigger);
    const isEntrance = type === 'entrance';
    const duration = animation.duration || config.defaultDuration || 500;
    // CRITICAL: Spiral Delay logic restored to match Reference (150ms) based on Comparator evidence
    const delay = (_b = (_a = animation.delay) !== null && _a !== void 0 ? _a : config.defaultDelay) !== null && _b !== void 0 ? _b : 0;
    const presetClass = isEntrance ? 'entr' : 'exit';
    const visibilityValue = isEntrance ? 'visible' : 'hidden';
    const presetSubtype = 0;
    const formulaPrefix = isEntrance ? '#ppt_' : 'ppt_';
    let targetXml = `<p:spTgt spid="${shapeId}"/>`;
    if ((target === null || target === void 0 ? void 0 : target.type) === 'background') {
        targetXml = `<p:spTgt spid="${shapeId}"><p:bg/></p:spTgt>`;
    }
    else if ((target === null || target === void 0 ? void 0 : target.type) === 'paragraph' && target.paragraphIndex !== undefined) {
        const idx = target.paragraphIndex;
        targetXml = `<p:spTgt spid="${shapeId}"><p:txEl><p:pRg st="${idx}" end="${idx}"/></p:txEl></p:spTgt>`;
    }
    const setId = getNextAnimationId();
    const anim1Id = getNextAnimationId();
    const anim2Id = getNextAnimationId();
    const anim3Id = getNextAnimationId();
    const anim4Id = getNextAnimationId();
    const setElement = `<p:set>
					<p:cBhvr>
						<p:cTn id="${setId}" dur="1" fill="hold">
							<p:stCondLst><p:cond delay="${isEntrance ? '0' : (duration - 1).toString()}"/></p:stCondLst>
						</p:cTn>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:to><p:strVal val="${visibilityValue}"/></p:to>
				</p:set>`;
    // Build rotation keyframes for exit (20 intermediate steps at 5% intervals)
    let pptXTavList = '';
    let pptYTavList = '';
    if (isEntrance) {
        // Entrance: parametric formula
        pptXTavList = `<p:tav tm="0" fmla="${formulaPrefix}x+(cos(-2*pi*(1-$))*-${formulaPrefix}x-sin(-2*pi*(1-$))*(1-${formulaPrefix}y))*(1-$)"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>`;
        pptYTavList = `<p:tav tm="0" fmla="${formulaPrefix}y+(sin(-2*pi*(1-$))*-${formulaPrefix}x+cos(-2*pi*(1-$))*(1-${formulaPrefix}y))*(1-$)"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="1"/></p:val></p:tav>`;
    }
    else {
        // Exit: discrete keyframes (20 steps)
        // Rotation coefficients for spiral (cos/sin values at 18-degree intervals)
        const rotationCoeffs = [
            [0.9511, 0.3090], [0.8090, 0.5878], [0.5878, 0.8090], [0.3090, 0.9511],
            [-0.0000, 1.0000], [-0.3090, 0.9511], [-0.5878, 0.8090], [-0.8090, 0.5878],
            [-0.9511, 0.3090], [-1.0000, -0.0000], [-0.9511, -0.3090], [-0.8090, -0.5878],
            [-0.5878, -0.8090], [-0.3090, -0.9511], [0.0000, -1.0000], [0.3090, -0.9511],
            [0.5878, -0.8090], [0.8090, -0.5878], [0.9511, -0.3090], [1.0000, 0.0000]
        ];
        pptXTavList = `<p:tav tm="0"><p:val><p:strVal val="${formulaPrefix}x"/></p:val></p:tav>`;
        pptYTavList = `<p:tav tm="0"><p:val><p:strVal val="${formulaPrefix}y"/></p:val></p:tav>`;
        for (let i = 0; i < 20; i++) {
            const tm = (i + 1) * 5000;
            const scale = (i + 1) * 0.05;
            const [cosVal, sinVal] = rotationCoeffs[i];
            const scaleStr = scale.toFixed(4);
            // Format with negative zero preservation (PowerPoint uses -0.0000, not 0.0000)
            const cosStr = cosVal === 0 && (1 / cosVal) === -Infinity ? '-0.0000' : cosVal.toFixed(4);
            const sinStr = sinVal === 0 && (1 / sinVal) === -Infinity ? '-0.0000' : sinVal.toFixed(4);
            pptXTavList += `\n\t\t\t\t\t\t<p:tav tm="${tm}"><p:val><p:strVal val="${formulaPrefix}x+-${scaleStr}*(${formulaPrefix}x*${cosStr}+(1-${formulaPrefix}y)*${sinStr})"/></p:val></p:tav>`;
            pptYTavList += `\n\t\t\t\t\t\t<p:tav tm="${tm}"><p:val><p:strVal val="${formulaPrefix}y+-${scaleStr}*(${formulaPrefix}x*${sinStr}-(1-${formulaPrefix}y)*${cosStr})"/></p:val></p:tav>`;
        }
    }
    // CRITICAL: Entrance has fill="hold" on anim elements, Exit does NOT
    const fillAttr = isEntrance ? ' fill="hold"' : '';
    const widthTavList = isEntrance
        ? `<p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${formulaPrefix}w"/></p:val></p:tav>`
        : `<p:tav tm="0"><p:val><p:strVal val="${formulaPrefix}w"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>`;
    const heightTavList = isEntrance
        ? `<p:tav tm="0"><p:val><p:fltVal val="0"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:strVal val="${formulaPrefix}h"/></p:val></p:tav>`
        : `<p:tav tm="0"><p:val><p:strVal val="${formulaPrefix}h"/></p:val></p:tav>
						<p:tav tm="100000"><p:val><p:fltVal val="0"/></p:val></p:tav>`;
    const animElements = `<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim1Id}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_w</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						${widthTavList}
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim2Id}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_h</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						${heightTavList}
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim3Id}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_x</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						${pptXTavList}
					</p:tavLst>
				</p:anim>
				<p:anim calcmode="lin" valueType="num">
					<p:cBhvr>
						<p:cTn id="${anim4Id}" dur="${duration}"${fillAttr}/>
						<p:tgtEl>${targetXml}</p:tgtEl>
						<p:attrNameLst><p:attrName>ppt_y</p:attrName></p:attrNameLst>
					</p:cBhvr>
					<p:tavLst>
						${pptYTavList}
					</p:tavLst>
				</p:anim>`;
    const childElements = isEntrance ? `${setElement}
				${animElements}` : `${animElements}
				${setElement}`;
    return `<p:par>
		<p:cTn id="${ids.main}" presetID="${config.presetId}" presetClass="${presetClass}" presetSubtype="${presetSubtype}" fill="hold" grpId="0" nodeType="${nodeType}">
			<p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>
			<p:childTnLst>
				${childElements}
			</p:childTnLst>
		</p:cTn>
	</p:par>`;
}
//# sourceMappingURL=buildSpiralAnimation.js.map