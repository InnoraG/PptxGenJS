/**
 * PptxGenJS: Media Animation Support (interactiveSeq)
 *
 * This module handles media-specific animation structures:
 * - interactiveSeq: Click-on-media triggers (e.g., click video to pause)
 * - <p:video>: Media node definition in timing XML
 *
 * ISOLATION PRINCIPLE:
 * This module is ONLY invoked when a slide has media animations.
 * Non-media slides (Batches 1-6) are completely unaffected.
 *
 * Reference: Focused_Media_Showcase_BATCH7_MANUALLYFROZEN.pptx
 */
import { getNextAnimationId } from './gen-animations-ids';
import { SLIDE_OBJECT_TYPES } from './core-enums';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { normalizeMediaCommand } from './gen-animations-builder';
function getMediaShapeId(obj, idx) {
    var _a;
    const explicitSpid = (_a = obj.options) === null || _a === void 0 ? void 0 : _a.spid;
    return Number.isFinite(Number(explicitSpid)) ? Number(explicitSpid) : idx + 2;
}
function findMediaObjectBySpid(slideObjects, spid) {
    if (!slideObjects)
        return null;
    return slideObjects.find((obj, idx) => obj._type === SLIDE_OBJECT_TYPES.media && getMediaShapeId(obj, idx) === spid) || null;
}
function getNativeNarrationMedia(slideObjects) {
    if (!slideObjects)
        return [];
    return slideObjects
        .map((obj, idx) => ({ obj, spid: getMediaShapeId(obj, idx) }))
        // PowerPoint Record Studio marks either an audio recording or a camera
        // recording as native narration. A talking-head MP4 therefore owns the
        // same slide-start clock as narration audio; restricting this helper to
        // audio makes narrated video wait behind unrelated entrance animations.
        .filter(item => { var _a; return item.obj._type === SLIDE_OBJECT_TYPES.media && ((_a = item.obj.options) === null || _a === void 0 ? void 0 : _a.isNarration) === true; });
}
export function hasNativeNarrationMedia(slideObjects) {
    return getNativeNarrationMedia(slideObjects).length > 0;
}
export function getNativeNarrationMediaSpids(slideObjects) {
    return getNativeNarrationMedia(slideObjects).map(item => item.spid);
}
/**
 * Check if a slide has any media animations
 * Media animations have type='media' or effect starting with 'media'
 * Also returns true for any animation targeting a video/audio object
 */
export function hasMediaAnimations(animations, slideObjects) {
    if (!animations || animations.length === 0)
        return false;
    // Check for direct media animations
    const hasDirectMedia = animations.some(anim => {
        var _a, _b, _c, _d;
        const type = ((_b = (_a = anim.animation) === null || _a === void 0 ? void 0 : _a.type) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
        const effect = ((_d = (_c = anim.animation) === null || _c === void 0 ? void 0 : _c.effect) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
        return type === 'media' || effect.startsWith('media');
    });
    if (hasDirectMedia)
        return true;
    // Check for any animation on media objects
    if (slideObjects) {
        return animations.some(anim => {
            const targetObj = findMediaObjectBySpid(slideObjects, anim.shapeId);
            return targetObj && targetObj._type === 'media';
        });
    }
    return false;
}
/**
 * Get all media shape IDs from animations
 * Returns unique SPIDs that have media animations
 */
export function getMediaShapeIds(animations, slideObjects) {
    var _a, _b, _c, _d;
    if (!animations || animations.length === 0)
        return [];
    const mediaShapeIds = new Set();
    for (const anim of animations) {
        const type = ((_b = (_a = anim.animation) === null || _a === void 0 ? void 0 : _a.type) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
        const effect = ((_d = (_c = anim.animation) === null || _c === void 0 ? void 0 : _c.effect) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
        // Direct media animations (type='media' or effect starts with 'media')
        if (type === 'media' || effect.startsWith('media')) {
            mediaShapeIds.add(anim.shapeId);
        }
        // Any animation targeting a video/audio slide object
        else if (slideObjects) {
            const targetObj = findMediaObjectBySpid(slideObjects, anim.shapeId);
            if (targetObj && targetObj._type === 'media') {
                mediaShapeIds.add(anim.shapeId);
            }
        }
    }
    return Array.from(mediaShapeIds);
}
/**
 * Generate interactiveSeq XML for media click triggers
 *
 * This creates a separate <p:seq> with nodeType="interactiveSeq" that:
 * - Triggers when user clicks on the media element
 * - Contains togglePause command for play/pause toggle
 *
 * Structure from frozen reference:
 * <p:seq concurrent="1" nextAc="seek">
 *   <p:cTn id="X" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq">
 *     <p:stCondLst>
 *       <p:cond evt="onClick" delay="0">
 *         <p:tgtEl><p:spTgt spid="MEDIA_SPID"/></p:tgtEl>
 *       </p:cond>
 *     </p:stCondLst>
 *     <p:endSync evt="end" delay="0"><p:rtn val="all"/></p:endSync>
 *     <p:childTnLst>
 *       ... togglePause command ...
 *     </p:childTnLst>
 *   </p:cTn>
 *   <p:nextCondLst>
 *     <p:cond evt="onClick" delay="0">
 *       <p:tgtEl><p:spTgt spid="MEDIA_SPID"/></p:tgtEl>
 *     </p:cond>
 *   </p:nextCondLst>
 * </p:seq>
 */
export function generateInteractiveSeq(mediaSpid) {
    const seqCtnId = getNextAnimationId();
    const parCtnId1 = getNextAnimationId();
    const parCtnId2 = getNextAnimationId();
    const cmdCtnId = getNextAnimationId();
    const cmdBhvrId = getNextAnimationId();
    return `
							<p:seq concurrent="1" nextAc="seek">
								<p:cTn id="${seqCtnId}" restart="whenNotActive" fill="hold" evtFilter="cancelBubble" nodeType="interactiveSeq">
									<p:stCondLst>
										<p:cond evt="onClick" delay="0">
											<p:tgtEl>
												<p:spTgt spid="${mediaSpid}"/>
											</p:tgtEl>
										</p:cond>
									</p:stCondLst>
									<p:endSync evt="end" delay="0">
										<p:rtn val="all"/>
									</p:endSync>
									<p:childTnLst>
										<p:par>
											<p:cTn id="${parCtnId1}" fill="hold">
												<p:stCondLst>
													<p:cond delay="0"/>
												</p:stCondLst>
												<p:childTnLst>
													<p:par>
														<p:cTn id="${parCtnId2}" fill="hold">
															<p:stCondLst>
																<p:cond delay="0"/>
															</p:stCondLst>
															<p:childTnLst>
																<p:par>
																	<p:cTn id="${cmdCtnId}" presetID="2" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="clickEffect">
																		<p:stCondLst>
																			<p:cond delay="0"/>
																		</p:stCondLst>
																		<p:childTnLst>
																			<p:cmd type="call" cmd="togglePause">
																				<p:cBhvr>
																					<p:cTn id="${cmdBhvrId}" dur="1" fill="hold"/>
																					<p:tgtEl>
																						<p:spTgt spid="${mediaSpid}"/>
																					</p:tgtEl>
																				</p:cBhvr>
																			</p:cmd>
																		</p:childTnLst>
																	</p:cTn>
																</p:par>
															</p:childTnLst>
														</p:cTn>
													</p:par>
												</p:childTnLst>
											</p:cTn>
										</p:par>
									</p:childTnLst>
								</p:cTn>
								<p:nextCondLst>
									<p:cond evt="onClick" delay="0">
										<p:tgtEl>
											<p:spTgt spid="${mediaSpid}"/>
										</p:tgtEl>
									</p:cond>
								</p:nextCondLst>
							</p:seq>`;
}
/**
 * Generate <p:video> element for media timing
 *
 * This creates the media node definition that PowerPoint needs:
 * <p:video>
 *   <p:cMediaNode vol="80000">
 *     <p:cTn id="X" [fill="hold"] display="0">
 *       <p:stCondLst><p:cond delay="indefinite"/></p:stCondLst>
 *     </p:cTn>
 *     <p:tgtEl><p:spTgt spid="MEDIA_SPID"/></p:tgtEl>
 *   </p:cMediaNode>
 * </p:video>
 *
 * @param mediaSpid - The shape ID of the media object
 * @param volume - Volume level (default 80000 = 80%)
 * @param fillHold - Whether to include fill="hold" attribute (default true for first media, false for subsequent)
 */
export function generateVideoNode(mediaSpid, volume = 80000, fillHold = true, options = {}) {
    const ctnId = getNextAnimationId();
    const fillAttr = fillHold ? ' fill="hold"' : '';
    const showWhenStoppedAttr = options.showWhenStopped !== undefined ? ` showWhenStopped="${options.showWhenStopped ? 1 : 0}"` : '';
    return `
							<p:video>
							<p:cMediaNode vol="${volume}"${showWhenStoppedAttr}>
									<p:cTn id="${ctnId}"${fillAttr} display="0">
										<p:stCondLst>
											<p:cond delay="indefinite"/>
										</p:stCondLst>
									</p:cTn>
									<p:tgtEl>
										<p:spTgt spid="${mediaSpid}"/>
									</p:tgtEl>
								</p:cMediaNode>
							</p:video>`;
}
/**
 * Generate <p:audio> element for media timing.
 */
export function generateAudioNode(mediaSpid, volume = 80000, fillHold = true, options = {}) {
    const ctnId = getNextAnimationId();
    const fillAttr = fillHold ? ' fill="hold"' : '';
    const isNarration = options.isNarration === true;
    const showWhenStopped = isNarration
        ? options.showWhenStopped === true
        : options.showWhenStopped;
    const audioAttrs = isNarration ? ' isNarration="1"' : '';
    const showWhenStoppedAttr = showWhenStopped !== undefined ? ` showWhenStopped="${showWhenStopped ? 1 : 0}"` : '';
    const endOnStopAudio = isNarration ? options.endOnStopAudio !== false : options.endOnStopAudio === true;
    const endCondXml = endOnStopAudio
        ? `
										<p:endCondLst>
											<p:cond evt="onStopAudio" delay="0">
												<p:tgtEl><p:sldTgt/></p:tgtEl>
											</p:cond>
										</p:endCondLst>`
        : '';
    return `
							<p:audio${audioAttrs}>
								<p:cMediaNode vol="${volume}"${showWhenStoppedAttr}>
									<p:cTn id="${ctnId}"${fillAttr} display="0">
										<p:stCondLst>
											<p:cond delay="indefinite"/>
										</p:stCondLst>${endCondXml}
									</p:cTn>
									<p:tgtEl>
										<p:spTgt spid="${mediaSpid}"/>
									</p:tgtEl>
								</p:cMediaNode>
							</p:audio>`;
}
/**
 * Merge a newly-added visual media animation into an imported slide's raw
 * timing tree. Imported slides keep their original timing XML verbatim, so
 * the normal animation serializer cannot add the companion video's play call.
 * This narrow structural merge preserves every existing 3D, audio, and shape
 * timing node and adds only each requested media carrier and command call.
 */
export function mergeRawTimingWithMediaAnimations(rawXml, animations, slideObjects) {
    var _a;
    if (!rawXml || !animations || animations.length === 0)
        return rawXml;
    const mediaAnimations = animations
        .filter(anim => {
        var _a, _b;
        const type = String(((_a = anim.animation) === null || _a === void 0 ? void 0 : _a.type) || '').toLowerCase();
        const effect = String(((_b = anim.animation) === null || _b === void 0 ? void 0 : _b.effect) || '').toLowerCase();
        return (type === 'media' || effect.startsWith('media')) && Boolean(findMediaObjectBySpid(slideObjects, anim.shapeId));
    });
    const mediaSpids = Array.from(new Set(mediaAnimations.map(anim => Number(anim.shapeId)).filter(spid => Number.isFinite(spid))));
    if (mediaSpids.length === 0)
        return rawXml;
    const doc = new DOMParser().parseFromString(rawXml, 'text/xml');
    const elementName = (node) => String((node === null || node === void 0 ? void 0 : node.nodeName) || '').split(':').pop() || '';
    const children = (node) => {
        const out = [];
        for (let i = 0; (node === null || node === void 0 ? void 0 : node.childNodes) && i < node.childNodes.length; i++)
            out.push(node.childNodes[i]);
        return out;
    };
    const direct = (node, name) => children(node).find(child => child.nodeType === 1 && elementName(child) === name) || null;
    const descendants = (node, name) => {
        const out = [];
        for (const child of children(node)) {
            if (child.nodeType !== 1)
                continue;
            if (elementName(child) === name)
                out.push(child);
            out.push(...descendants(child, name));
        }
        return out;
    };
    const tmRoot = descendants(doc.documentElement, 'cTn').find(node => node.getAttribute('nodeType') === 'tmRoot');
    if (!tmRoot)
        return rawXml;
    const tmChildList = direct(tmRoot, 'childTnLst');
    const mainSeq = descendants(tmRoot, 'seq').find(node => {
        const ctn = direct(node, 'cTn');
        return (ctn === null || ctn === void 0 ? void 0 : ctn.getAttribute('nodeType')) === 'mainSeq';
    });
    const mainSeqCtn = mainSeq ? direct(mainSeq, 'cTn') : null;
    const mainChildList = mainSeqCtn ? direct(mainSeqCtn, 'childTnLst') : null;
    if (!tmChildList || !mainChildList)
        return rawXml;
    let nextId = 1;
    for (const node of descendants(doc.documentElement, 'cTn')) {
        const id = Number(node.getAttribute('id'));
        if (Number.isFinite(id))
            nextId = Math.max(nextId, id + 1);
    }
    const allocateId = () => String(nextId++);
    // Locate the existing narration media call. Its surrounding child list is
    // the exact timing group used to start the source audio; placing the avatar
    // call beside it gives both media objects the same delay and trigger.
    const narrationSpids = new Set(getNativeNarrationMediaSpids(slideObjects));
    let narrationCall = null;
    for (const ctn of descendants(doc.documentElement, 'cTn')) {
        if (ctn.getAttribute('presetClass') !== 'mediacall')
            continue;
        const target = descendants(ctn, 'spTgt')[0];
        const spid = Number(target === null || target === void 0 ? void 0 : target.getAttribute('spid'));
        if (narrationSpids.has(spid)) {
            narrationCall = ctn;
            break;
        }
    }
    let syncChildList = mainChildList;
    if (narrationCall) {
        let cursor = narrationCall;
        while (cursor === null || cursor === void 0 ? void 0 : cursor.parentNode) {
            cursor = cursor.parentNode;
            if (elementName(cursor) !== 'childTnLst')
                continue;
            const parentCtn = cursor.parentNode;
            if (parentCtn && elementName(parentCtn) === 'cTn' && parentCtn.getAttribute('presetClass') !== 'mediacall') {
                syncChildList = cursor;
                break;
            }
        }
    }
    const existingMediaSpids = new Set();
    for (const mediaNode of [...descendants(doc.documentElement, 'audio'), ...descendants(doc.documentElement, 'video')]) {
        const target = descendants(mediaNode, 'spTgt')[0];
        const spid = Number(target === null || target === void 0 ? void 0 : target.getAttribute('spid'));
        if (Number.isFinite(spid))
            existingMediaSpids.add(spid);
    }
    for (const spid of mediaSpids) {
        // Add exactly one media definition of the correct carrier type. Imported
        // timing may already own the node, in which case only the command is added.
        if (existingMediaSpids.has(spid))
            continue;
        const mediaDoc = new DOMParser().parseFromString(`<root>${generateMediaNode(spid, slideObjects, true)}</root>`, 'text/xml');
        const mediaNode = descendants(mediaDoc.documentElement, 'audio')[0] || descendants(mediaDoc.documentElement, 'video')[0];
        if (mediaNode) {
            for (const ctn of descendants(mediaNode, 'cTn'))
                ctn.setAttribute('id', allocateId());
            tmChildList.appendChild(doc.importNode ? doc.importNode(mediaNode, true) : mediaNode.cloneNode(true));
            existingMediaSpids.add(spid);
        }
    }
    const commandFor = (animation) => {
        let command = animation === null || animation === void 0 ? void 0 : animation.mediaCommand;
        if (!command) {
            const effect = String((animation === null || animation === void 0 ? void 0 : animation.effect) || '').toLowerCase();
            command = effect === 'mediapause' || effect === 'pause' || effect === 'togglepause'
                ? 'togglePause'
                : effect === 'mediastop' || effect === 'stop' ? 'stop' : 'playFrom(0.0)';
        }
        return normalizeMediaCommand(command);
    };
    const commandPresetId = (command) => command === 'togglePause' ? '2' : command === 'stop' ? '3' : '1';
    const commandNodeType = (trigger) => trigger === 'withPrevious' ? 'withEffect' : trigger === 'afterPrevious' ? 'afterEffect' : 'clickEffect';
    const commandDuration = (animation, command) => {
        const authored = Number(animation === null || animation === void 0 ? void 0 : animation.duration);
        return command.startsWith('playFrom') && Number.isFinite(authored) && authored > 0 ? String(authored) : '1';
    };
    const createCommandPar = (animation, spid, command) => {
        const par = doc.createElement('p:par');
        const ctn = doc.createElement('p:cTn');
        ctn.setAttribute('id', allocateId());
        ctn.setAttribute('presetID', commandPresetId(command));
        ctn.setAttribute('presetClass', 'mediacall');
        ctn.setAttribute('presetSubtype', '0');
        ctn.setAttribute('fill', 'hold');
        ctn.setAttribute('nodeType', commandNodeType(animation === null || animation === void 0 ? void 0 : animation.trigger));
        const starts = doc.createElement('p:stCondLst');
        const condition = doc.createElement('p:cond');
        condition.setAttribute('delay', String(Number.isFinite(Number(animation === null || animation === void 0 ? void 0 : animation.delay)) ? Number(animation === null || animation === void 0 ? void 0 : animation.delay) : 0));
        starts.appendChild(condition);
        ctn.appendChild(starts);
        const childrenList = doc.createElement('p:childTnLst');
        const cmd = doc.createElement('p:cmd');
        cmd.setAttribute('type', 'call');
        cmd.setAttribute('cmd', command);
        const behavior = doc.createElement('p:cBhvr');
        const behaviorCtn = doc.createElement('p:cTn');
        behaviorCtn.setAttribute('id', allocateId());
        behaviorCtn.setAttribute('dur', commandDuration(animation, command));
        behaviorCtn.setAttribute('fill', 'hold');
        const targetElement = doc.createElement('p:tgtEl');
        const shapeTarget = doc.createElement('p:spTgt');
        shapeTarget.setAttribute('spid', String(spid));
        targetElement.appendChild(shapeTarget);
        behavior.appendChild(behaviorCtn);
        behavior.appendChild(targetElement);
        cmd.appendChild(behavior);
        childrenList.appendChild(cmd);
        ctn.appendChild(childrenList);
        par.appendChild(ctn);
        return par;
    };
    for (const animationRecord of mediaAnimations) {
        const spid = Number(animationRecord.shapeId);
        const command = commandFor(animationRecord.animation);
        // Clone the existing narration call when available. This preserves the
        // source deck's timing grammar and places the new media beside narration.
        let callPar = null;
        if (narrationCall) {
            const narrationPar = narrationCall.parentNode;
            callPar = narrationPar === null || narrationPar === void 0 ? void 0 : narrationPar.cloneNode(true);
            if (callPar) {
                for (const cloneCtn of descendants(callPar, 'cTn'))
                    cloneCtn.setAttribute('id', allocateId());
                for (const target of descendants(callPar, 'spTgt'))
                    target.setAttribute('spid', String(spid));
                const commands = descendants(callPar, 'cmd');
                if (!commands.length)
                    callPar = null;
                else {
                    for (const cmd of commands)
                        cmd.setAttribute('cmd', command);
                    for (const mediaCtn of descendants(callPar, 'cTn').filter(node => node.getAttribute('presetClass') === 'mediacall')) {
                        mediaCtn.setAttribute('presetID', commandPresetId(command));
                        mediaCtn.setAttribute('nodeType', commandNodeType((_a = animationRecord.animation) === null || _a === void 0 ? void 0 : _a.trigger));
                    }
                    for (const behavior of descendants(callPar, 'cBhvr')) {
                        const behaviorCtn = direct(behavior, 'cTn');
                        if (behaviorCtn)
                            behaviorCtn.setAttribute('dur', commandDuration(animationRecord.animation, command));
                    }
                }
            }
        }
        if (!callPar) {
            callPar = createCommandPar(animationRecord.animation, spid, command);
        }
        syncChildList.appendChild(callPar);
    }
    return new XMLSerializer().serializeToString(doc);
}
/**
 * Replace an imported slide's separate native narration audio with a video
 * whose MP4 already carries the narration audio. The existing visual timing
 * tree remains intact: the native audio media definition is replaced by a
 * video definition and every play-call target is retargeted to the video.
 * This avoids emitting sibling p:audio + p:video media nodes, which PowerPoint
 * rejects on some imported Recording Studio decks.
 */
export function replaceRawNarrationWithVideo(rawXml, narrationSpid, videoSpid) {
    var _a;
    if (!rawXml || !Number.isFinite(narrationSpid) || !Number.isFinite(videoSpid))
        return rawXml;
    const doc = new DOMParser().parseFromString(rawXml, 'text/xml');
    const elementName = (node) => String((node === null || node === void 0 ? void 0 : node.nodeName) || '').split(':').pop() || '';
    const children = (node) => {
        const out = [];
        for (let i = 0; (node === null || node === void 0 ? void 0 : node.childNodes) && i < node.childNodes.length; i++)
            out.push(node.childNodes[i]);
        return out;
    };
    const descendants = (node, name) => {
        const out = [];
        for (const child of children(node)) {
            if (child.nodeType !== 1)
                continue;
            if (elementName(child) === name)
                out.push(child);
            out.push(...descendants(child, name));
        }
        return out;
    };
    const allTargets = descendants(doc.documentElement, 'spTgt');
    const hasNarrationTarget = allTargets.some(target => Number(target.getAttribute('spid')) === narrationSpid);
    if (!hasNarrationTarget)
        return rawXml;
    let nextId = 1;
    for (const ctn of descendants(doc.documentElement, 'cTn')) {
        const id = Number(ctn.getAttribute('id'));
        if (Number.isFinite(id))
            nextId = Math.max(nextId, id + 1);
    }
    const audioNodes = descendants(doc.documentElement, 'audio');
    for (const audioNode of audioNodes) {
        const target = descendants(audioNode, 'spTgt')[0];
        if (Number(target === null || target === void 0 ? void 0 : target.getAttribute('spid')) !== narrationSpid)
            continue;
        const video = doc.createElement('p:video');
        const media = doc.createElement('p:cMediaNode');
        media.setAttribute('vol', '80000');
        const ctn = doc.createElement('p:cTn');
        ctn.setAttribute('id', String(nextId++));
        ctn.setAttribute('fill', 'hold');
        ctn.setAttribute('display', '0');
        const start = doc.createElement('p:stCondLst');
        const cond = doc.createElement('p:cond');
        cond.setAttribute('delay', 'indefinite');
        start.appendChild(cond);
        ctn.appendChild(start);
        media.appendChild(ctn);
        const targetEl = doc.createElement('p:tgtEl');
        const spTarget = doc.createElement('p:spTgt');
        spTarget.setAttribute('spid', String(videoSpid));
        targetEl.appendChild(spTarget);
        media.appendChild(targetEl);
        video.appendChild(media);
        (_a = audioNode.parentNode) === null || _a === void 0 ? void 0 : _a.removeChild(audioNode);
        const timingList = descendants(doc.documentElement, 'tnLst')[0];
        if (timingList)
            timingList.appendChild(video);
    }
    for (const target of descendants(doc.documentElement, 'spTgt')) {
        if (Number(target.getAttribute('spid')) === narrationSpid)
            target.setAttribute('spid', String(videoSpid));
    }
    return new XMLSerializer().serializeToString(doc);
}
function generateMediaNode(mediaSpid, slideObjects, fillHold) {
    var _a, _b, _c, _d, _e, _f;
    const targetObj = findMediaObjectBySpid(slideObjects, mediaSpid);
    const mtype = String((targetObj === null || targetObj === void 0 ? void 0 : targetObj.mtype) || '').toLowerCase();
    const rawVolume = (_b = (_a = targetObj === null || targetObj === void 0 ? void 0 : targetObj.options) === null || _a === void 0 ? void 0 : _a.mediaVolume) !== null && _b !== void 0 ? _b : (_c = targetObj === null || targetObj === void 0 ? void 0 : targetObj.options) === null || _c === void 0 ? void 0 : _c.volume;
    const volume = typeof rawVolume === 'number' && Number.isFinite(rawVolume)
        ? Math.max(0, Math.min(100000, Math.round(rawVolume)))
        : 80000;
    const timingOptions = {
        isNarration: ((_d = targetObj === null || targetObj === void 0 ? void 0 : targetObj.options) === null || _d === void 0 ? void 0 : _d.isNarration) === true,
        showWhenStopped: (_e = targetObj === null || targetObj === void 0 ? void 0 : targetObj.options) === null || _e === void 0 ? void 0 : _e.showWhenStopped,
        endOnStopAudio: (_f = targetObj === null || targetObj === void 0 ? void 0 : targetObj.options) === null || _f === void 0 ? void 0 : _f.endOnStopAudio,
    };
    return mtype === 'audio'
        ? generateAudioNode(mediaSpid, volume, fillHold, timingOptions)
        : generateVideoNode(mediaSpid, volume, fillHold, timingOptions);
}
export function generateNativeNarrationTiming(slideObjects) {
    const narrationMedia = getNativeNarrationMedia(slideObjects);
    if (narrationMedia.length === 0)
        return '';
    const mediaShapeIds = narrationMedia.map(item => item.spid);
    const mainSeqContent = mediaShapeIds.map(spid => {
        const groupId = getNextAnimationId();
        const innerId = getNextAnimationId();
        const callId = getNextAnimationId();
        const behaviorId = getNextAnimationId();
        return `<p:par>
<p:cTn id="${groupId}" fill="hold">
<p:stCondLst><p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond></p:stCondLst>
<p:childTnLst>
<p:par>
<p:cTn id="${innerId}" fill="hold">
<p:stCondLst><p:cond delay="0"/></p:stCondLst>
<p:childTnLst>
<p:par>
<p:cTn id="${callId}" presetID="1" presetClass="mediacall" presetSubtype="0" fill="hold" nodeType="afterEffect">
<p:stCondLst><p:cond delay="0"/></p:stCondLst>
<p:childTnLst>
<p:cmd type="call" cmd="playFrom(0.0)">
<p:cBhvr><p:cTn id="${behaviorId}" dur="1" fill="hold"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr>
</p:cmd>
</p:childTnLst>
</p:cTn>
</p:par>
</p:childTnLst>
</p:cTn>
</p:par>
</p:childTnLst>
</p:cTn>
</p:par>`;
    }).join('\n');
    const syntheticAnimations = mediaShapeIds.map(spid => ({ shapeId: spid, animation: { type: 'media', effect: 'mediaplay' } }));
    const mediaTimingXml = generateMediaTimingAdditions(syntheticAnimations, slideObjects);
    return `<p:timing>
<p:tnLst>
<p:par>
<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">
<p:childTnLst>
<p:seq concurrent="1" nextAc="seek">
<p:cTn id="2" dur="indefinite" nodeType="mainSeq">
<p:childTnLst>
${mainSeqContent}
</p:childTnLst>
</p:cTn>
<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>
<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>
</p:seq>${mediaTimingXml}
</p:childTnLst>
</p:cTn>
</p:par>
</p:tnLst>
</p:timing>`;
}
/**
 * Generate complete media timing additions for a slide
 *
 * This generates all media-specific XML that should be appended
 * INSIDE the <p:childTnLst> of the tmRoot <p:cTn>, AFTER the mainSeq.
 *
 * Returns empty string if no media animations present.
 *
 * For videos with type='media' animations: generates interactiveSeq + p:video (click-to-play)
 * For videos with regular animations (entrance/exit): generates just p:video (playback control)
 */
export function generateMediaTimingAdditions(animations, slideObjects) {
    var _a, _b, _c, _d, _e;
    if (!hasMediaAnimations(animations, slideObjects)) {
        return '';
    }
    let mediaXml = '';
    // Get all media animations (type='media' or effect='media*')
    const mediaShapeIds = new Set();
    for (const anim of animations) {
        const type = ((_b = (_a = anim.animation) === null || _a === void 0 ? void 0 : _a.type) === null || _b === void 0 ? void 0 : _b.toLowerCase()) || '';
        const effect = ((_d = (_c = anim.animation) === null || _c === void 0 ? void 0 : _c.effect) === null || _d === void 0 ? void 0 : _d.toLowerCase()) || '';
        if (type === 'media' || effect.startsWith('media')) {
            mediaShapeIds.add(anim.shapeId);
        }
    }
    // Track all shapes that will get p:video nodes (to avoid duplicates)
    const processedShapeIds = new Set();
    let isFirstVideo = true; // Track if this is the first video node (for fill="hold" attribute)
    // Generate media timing for each media shape
    // interactiveSeq is controlled by interactivePlayback property (default: true)
    // This is INDEPENDENT of whether there are inline triggers
    for (const spid of mediaShapeIds) {
        if (processedShapeIds.has(spid))
            continue;
        // Check if this media object has interactivePlayback disabled
        const targetObj = findMediaObjectBySpid(slideObjects, spid);
        const interactivePlayback = ((_e = targetObj === null || targetObj === void 0 ? void 0 : targetObj.options) === null || _e === void 0 ? void 0 : _e.interactivePlayback) !== false; // default true
        if (interactivePlayback) {
            mediaXml += generateInteractiveSeq(spid);
        }
        // First video gets fill="hold", subsequent ones don't (matches frozen reference pattern)
        mediaXml += generateMediaNode(spid, slideObjects, isFirstVideo);
        processedShapeIds.add(spid);
        isFirstVideo = false;
    }
    // For videos with regular animations (entrance/exit), generate just p:video
    // But only if they're NOT already handled above
    if (slideObjects) {
        for (const anim of animations) {
            if (processedShapeIds.has(anim.shapeId))
                continue;
            const targetObj = findMediaObjectBySpid(slideObjects, anim.shapeId);
            if (targetObj && targetObj._type === 'media') {
                // First video gets fill="hold", subsequent ones don't
                mediaXml += generateMediaNode(anim.shapeId, slideObjects, isFirstVideo);
                processedShapeIds.add(anim.shapeId);
                isFirstVideo = false;
            }
        }
    }
    return mediaXml;
}
//# sourceMappingURL=gen-animations-media.js.map