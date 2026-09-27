import { getNextAnimationId } from './gen-animations-ids';
import { generateMediaTimingAdditions } from './gen-animations-media';
import { genXmlBuildList } from './gen-animations-buildlist';
/**
 * Generate timing structure wrapper
 *
 * @param allAnimationsItems - Array of { xml, anim, subIndex } objects
 * @param hasMultipleAnimationsPerShape - Flag for Multiple Animation Principle
 * @param wrapInSingleClickGroup - When true, wrap all animations in ONE click group (for auto-play)
 * @param shapeIdsToSkipBldP - Set of shapeIds that should not have bldP entries
 */
export function genXmlTimingStructure(allAnimationsItems, hasMultipleAnimationsPerShape = false, wrapInSingleClickGroup = false, shapeIdsToSkipBldP = new Set(), slideObjects) {
    var _a, _b;
    // Reconstruct the original animations array for bldLst generation
    // We use a Map to deduplicate since allAnimationsItems contains multiple entries for sequence expansions
    const animationsMap = new Map();
    allAnimationsItems.forEach(item => animationsMap.set(item.index, item.anim));
    const animations = Array.from(animationsMap.values());
    const buildListXml = animations ? genXmlBuildList(animations, false, shapeIdsToSkipBldP) : '';
    // Generate media timing additions (interactiveSeq + p:video) if slide has media
    const mediaTimingXml = generateMediaTimingAdditions(animations, slideObjects);
    let mainSeqContent;
    if (wrapInSingleClickGroup) {
        // AUTO-PLAY: All animations share ONE click group
        // Structure matches reference: par > cTn(indefinite) > par > cTn(delay=0) > [animations]
        const id1 = getNextAnimationId();
        const id2 = getNextAnimationId();
        mainSeqContent = `
								<p:par>
									<p:cTn id="${id1}" fill="hold">
										<p:stCondLst>
											<p:cond delay="indefinite"/>
											<p:cond evt="onBegin" delay="0">
												<p:tn val="2"/>
											</p:cond>
										</p:stCondLst>
										<p:childTnLst>
											<p:par>
												<p:cTn id="${id2}" fill="hold">
													<p:stCondLst>
														<p:cond delay="0"/>
													</p:stCondLst>
													<p:childTnLst>
														${allAnimationsItems.map(item => item.xml).join('\n')}
													</p:childTnLst>
												</p:cTn>
											</p:par>
										</p:childTnLst>
									</p:cTn>
								</p:par>`;
    }
    else {
        // GROUP ANIMATIONS BY CLICK GROUPS
        const clickGroups = [];
        let currentGroupItems = [];
        let pendingWithPrevious = [];
        let currentGroupHasOnClick = false;
        for (const item of allAnimationsItems) {
            const trigger = ((_a = item.anim.animation) === null || _a === void 0 ? void 0 : _a.trigger) || 'onClick';
            const sequence = ((_b = item.anim.animation) === null || _b === void 0 ? void 0 : _b.sequence) || 'asOneObject';
            const subIndex = item.subIndex;
            let effectiveTrigger = trigger;
            // TRUTH TABLE IMPLEMENTATION (v3)
            // Source: SEQUENCE_TRIGGER_TRUTH_TABLE_DEFINITIVE.md
            if (sequence === 'allAtOnce' && subIndex > 0) {
                // Rule 2: allAtOnce
                // 1st item matches trigger (click/after/with)
                // Subsequent items are ALWAYS withPrevious (simultaneous)
                effectiveTrigger = 'withPrevious';
            }
            else if (sequence === 'byParagraph') {
                // Rule 3: byParagraph
                // All items match the trigger type
                // onClick -> onClick
                // afterPrevious -> afterPrevious
                // withPrevious -> withPrevious
                effectiveTrigger = trigger;
            }
            if (effectiveTrigger === 'onClick') {
                // Push any completed group
                if (currentGroupItems.length > 0) {
                    clickGroups.push({ items: currentGroupItems, trigger: 'onClick' }); // trigger is decorative here
                    currentGroupHasOnClick = false;
                }
                // Start new group with onClick, and merge any pending withPrevious
                if (pendingWithPrevious.length > 0) {
                    currentGroupItems = [...pendingWithPrevious, item];
                    pendingWithPrevious = [];
                }
                else {
                    currentGroupItems = [item];
                }
                currentGroupHasOnClick = true;
            }
            else if (effectiveTrigger === 'withPrevious' && !currentGroupHasOnClick) {
                // withPrevious before any onClick in current group - save for later merge
                pendingWithPrevious.push(item);
            }
            else {
                // afterPrevious, or withPrevious after an onClick
                currentGroupItems.push(item);
            }
        }
        // Push final group
        if (currentGroupItems.length > 0) {
            clickGroups.push({ items: currentGroupItems, trigger: 'onClick' });
        }
        // Generate XML for each click group
        const groupXmlParts = [];
        for (const group of clickGroups) {
            const groupItems = group.items;
            if (groupItems.length === 0)
                continue;
            const firstItem = groupItems[0];
            const firstXml = firstItem.xml;
            const hasIndefiniteWrapper = firstXml.includes('delay="indefinite"');
            if (hasIndefiniteWrapper && groupItems.length === 1) {
                groupXmlParts.push(firstXml);
            }
            else if (hasIndefiniteWrapper) {
                // V3 engine wrapped the first item with delay="indefinite".
                // REFERENCE PATTERN: All followers (afterPrevious/withPrevious) must go INSIDE
                // the existing par[delay=0] inner container alongside the first animation.
                // Their timing is encoded by nodeType on each animation's own cTn.
                //
                // Structure of firstXml (from V3 engine):
                //   <p:par>
                //     <p:cTn fill="hold">
                //       <p:stCondLst><p:cond delay="indefinite"/>[onBegin]</p:stCondLst>
                //       <p:childTnLst>
                //         <p:par>
                //           <p:cTn fill="hold">
                //             <p:stCondLst><p:cond delay="0"/></p:stCondLst>
                //             <p:childTnLst>
                //               <p:par>..first anim..</p:par>  ← insert followers here as siblings
                //             </p:childTnLst>
                //           </p:cTn>
                //         </p:par>
                //       </p:childTnLst>
                //     </p:cTn>
                //   </p:par>
                if (groupItems.length === 1) {
                    // No followers - just push as-is (already handled above, but keep for clarity)
                    groupXmlParts.push(firstXml);
                }
                else {
                    // Find the inner </p:childTnLst> (the one inside par[delay=0])
                    // We inject all followers as siblings inside that childTnLst.
                    // Strategy: find the SECOND-TO-LAST </p:childTnLst> which closes the delay=0 par.
                    const followerXmls = groupItems.slice(1).map(item => item.xml);
                    // Find insertion point: the closing of the inner par[delay=0]'s childTnLst.
                    // The firstXml structure ends with (ignoring whitespace):
                    //   ..anim content..
                    //   </p:childTnLst>   ← INNER close (delay=0 par) - INSERT HERE
                    //   </p:cTn></p:par>
                    //   </p:childTnLst>   ← OUTER close (indefinite par)
                    //   </p:cTn></p:par>
                    //
                    // Strategy: find the second-to-last </p:childTnLst> in the XML.
                    const innerCloseTag = '</p:childTnLst>';
                    const lastPos = firstXml.lastIndexOf(innerCloseTag);
                    // Find the second-to-last occurrence
                    const secondToLastPos = lastPos > 0 ? firstXml.lastIndexOf(innerCloseTag, lastPos - 1) : -1;
                    if (secondToLastPos !== -1) {
                        // Insert all followers before the second-to-last </p:childTnLst>
                        const rebuilt = firstXml.slice(0, secondToLastPos) +
                            '\n' + followerXmls.join('\n') + '\n' +
                            firstXml.slice(secondToLastPos);
                        groupXmlParts.push(rebuilt);
                    }
                    else {
                        // Fallback: just concatenate
                        groupXmlParts.push(groupItems.map(g => g.xml).join('\n'));
                    }
                }
            }
            else {
                // No wrapper (most common for complex sequences). Build structure.
                // REFERENCE PATTERN: All items in a click group go into a SINGLE par[delay=0].
                // Timing between items is encoded via nodeType (withEffect/afterEffect) on each
                // animation's own cTn - NOT via separate sibling par[delay=N] wrappers.
                //
                // Reference structure:
                //   par[delay=indefinite] + evt=onBegin(tn val=2)
                //   └── par[delay=0]
                //       ├── par[nodeType=withEffect, spid=A]   ← first (onClick) item
                //       ├── par[nodeType=afterEffect, spid=B]  ← afterPrevious items
                //       └── par[nodeType=afterEffect, spid=C]
                const id1 = getNextAnimationId();
                const id2 = getNextAnimationId();
                // All items go directly inside the single par[delay=0]
                const innerItems = groupItems.map(item => item.xml);
                const clickGroupXml = `
<p:par>
<p:cTn id="${id1}" fill="hold">
<p:stCondLst>
<p:cond delay="indefinite"/>
<p:cond evt="onBegin" delay="0">
<p:tn val="2"/>
</p:cond>
</p:stCondLst>
<p:childTnLst>
<p:par>
<p:cTn id="${id2}" fill="hold">
<p:stCondLst>
<p:cond delay="0"/>
</p:stCondLst>
<p:childTnLst>
${innerItems.join('\n')}
</p:childTnLst>
</p:cTn>
</p:par>
</p:childTnLst>
</p:cTn>
</p:par>`;
                groupXmlParts.push(clickGroupXml);
            }
        }
        mainSeqContent = groupXmlParts.join('\n');
    }
    return `
		<p:timing>
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
								<p:prevCondLst>
									<p:cond evt="onPrev" delay="0">
										<p:tgtEl><p:sldTgt/></p:tgtEl>
									</p:cond>
								</p:prevCondLst>
								<p:nextCondLst>
									<p:cond evt="onNext" delay="0">
										<p:tgtEl><p:sldTgt/></p:tgtEl>
									</p:cond>
								</p:nextCondLst>
							</p:seq>${mediaTimingXml}
						</p:childTnLst>
					</p:cTn>
				</p:par>
			</p:tnLst>
			${buildListXml}
		</p:timing>
	`.trim();
}
//# sourceMappingURL=genXmlTimingStructure.js.map