/**
 * XML Injector for Iterate Element
 * 
 * Injects the <p:iterate> element into animation XML at the correct location.
 * The iterate element must be placed AFTER <p:stCondLst> and BEFORE <p:childTnLst>.
 * 
 * PowerPoint structure:
 * ```xml
 * <p:cTn id="X" presetID="Y" ...>
 *   <p:stCondLst>...</p:stCondLst>
 *   <p:iterate type="lt">...</p:iterate>   <!-- INJECT HERE -->
 *   <p:childTnLst>...</p:childTnLst>
 * </p:cTn>
 * ```
 * 
 * @module gen-animations-xml-injector
 */

/**
 * Inject iterate element into animation XML
 * 
 * This function uses structural XML parsing to find the correct injection point.
 * The iterate element must be placed after </p:stCondLst> and before <p:childTnLst>.
 * 
 * @param animationXml - The base animation XML (from animation builder)
 * @param iterateXml - The iterate element XML to inject
 * @returns Modified animation XML with iterate element injected
 */
export function injectIterateElement(animationXml: string, iterateXml: string): string {
  // If no iterate element to inject, return original
  if (!iterateXml || iterateXml.trim() === '') {
    return animationXml
  }

  // Find the injection point: after </p:stCondLst>
  // PowerPoint structure always has <p:stCondLst> before <p:iterate>
  const stCondLstEndTag = '</p:stCondLst>'
  const injectionIndex = animationXml.indexOf(stCondLstEndTag)

  if (injectionIndex === -1) {
    // If no stCondLst found, log warning and return original
    // This shouldn't happen in normal PowerPoint animations
    console.warn('[iterate-injector] No <p:stCondLst> found, cannot inject iterate element')
    return animationXml
  }

  // Calculate injection position (after the closing tag)
  const injectionPos = injectionIndex + stCondLstEndTag.length

  // Inject the iterate element
  const before = animationXml.substring(0, injectionPos)
  const after = animationXml.substring(injectionPos)
  
  return before + iterateXml + after
}

/**
 * Inject iterate element with validation
 * 
 * This version validates that the injection point is correct by checking
 * for the presence of required XML structure elements.
 * 
 * @param animationXml - The base animation XML
 * @param iterateXml - The iterate element XML to inject
 * @returns Modified animation XML with iterate element injected
 * @throws Error if required XML structure is missing
 */
export function injectIterateElementStrict(animationXml: string, iterateXml: string): string {
  if (!iterateXml || iterateXml.trim() === '') {
    return animationXml
  }

  // Validate required structure
  if (!animationXml.includes('<p:stCondLst>')) {
    throw new Error('[iterate-injector] Invalid animation XML: missing <p:stCondLst>')
  }

  if (!animationXml.includes('<p:childTnLst>')) {
    throw new Error('[iterate-injector] Invalid animation XML: missing <p:childTnLst>')
  }

  // Check that iterate doesn't already exist
  if (animationXml.includes('<p:iterate')) {
    console.warn('[iterate-injector] Animation already contains iterate element, skipping injection')
    return animationXml
  }

  return injectIterateElement(animationXml, iterateXml)
}

/**
 * Check if animation XML already has iterate element
 * 
 * @param animationXml - The animation XML to check
 * @returns True if iterate element is present
 */
export function hasIterateElement(animationXml: string): boolean {
  return animationXml.includes('<p:iterate')
}
