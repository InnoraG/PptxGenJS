/**
 * XML Utility Functions for Animation Generation
 *
 * ARCHITECTURAL PRINCIPLE: NO REGEX for XML manipulation!
 * All XML operations must be structural using proper parsing/building.
 *
 * These utilities provide safe, structural XML operations without regex.
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
/**
 * Parse XML string into a DOM Document
 */
function parseXml(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    // Check for parsing errors
    const parserError = doc.getElementsByTagName('parsererror')[0];
    if (parserError) {
        console.error('[parseXml] XML parsing error:', parserError.textContent);
        throw new Error('Invalid XML: ' + parserError.textContent);
    }
    return doc;
}
/**
 * Serialize DOM Document back to XML string
 */
function serializeXml(doc) {
    const serializer = new XMLSerializer();
    return serializer.serializeToString(doc);
}
/**
 * Add nodeType attribute to outer <p:cTn> elements (structural approach)
 *
 * OUTER elements are defined as <p:cTn> that are direct children of <p:par>.
 * We do NOT modify inner <p:cTn> elements (like those inside <p:cBhvr>).
 *
 * For allAtOnce animations with multiple blocks:
 * - First block: gets primaryNodeType
 * - Subsequent blocks: get 'withEffect'
 *
 * @param xmlString - Animation XML from builder (without nodeType)
 * @param primaryNodeType - The nodeType based on trigger
 * @returns XML with nodeType attributes added
 */
export function addNodeTypeStructural(xmlString, primaryNodeType) {
    const doc = parseXml(xmlString);
    // Find all <p:par> or <par> elements using getElementsByTagName (works in xmldom)
    const parElements = doc.getElementsByTagName('par');
    let blockIndex = 0;
    for (let i = 0; i < parElements.length; i++) {
        const parElement = parElements[i];
        // Find direct child <cTn> (not nested ones)
        let directCTn = null;
        for (let j = 0; j < parElement.childNodes.length; j++) {
            const child = parElement.childNodes[j];
            if (child.nodeType === 1 && (child.nodeName === 'cTn' || child.nodeName === 'p:cTn')) {
                directCTn = child;
                break;
            }
        }
        if (directCTn) {
            // This is an outer <p:cTn> - add nodeType
            const nodeType = blockIndex === 0 ? primaryNodeType : 'withEffect';
            directCTn.setAttribute('nodeType', nodeType);
            blockIndex++;
        }
    }
    return serializeXml(doc);
}
/**
 * Update grpId attributes in animation XML (structural approach)
 *
 * @param xmlString - Animation XML
 * @param newGrpId - New grpId value, or null to remove grpId
 * @returns XML with updated grpId
 */
export function updateGrpIdStructural(xmlString, newGrpId) {
    const doc = parseXml(xmlString);
    // Find all elements with grpId attribute by walking the tree
    function walkAndUpdate(node) {
        if (node.nodeType === 1) { // Element node
            const element = node;
            if (element.hasAttribute('grpId')) {
                if (newGrpId === null) {
                    element.removeAttribute('grpId');
                }
                else {
                    element.setAttribute('grpId', newGrpId.toString());
                }
            }
        }
        // Recursively process children
        for (let i = 0; i < node.childNodes.length; i++) {
            walkAndUpdate(node.childNodes[i]);
        }
    }
    walkAndUpdate(doc.documentElement);
    return serializeXml(doc);
}
/**
 * Renumber all id attributes in <p:cTn> elements (structural approach)
 *
 * @param xmlString - Animation XML
 * @param startId - Starting ID number
 * @returns Object with updated XML and next available ID
 */
export function renumberIdsStructural(xmlString, startId) {
    const doc = parseXml(xmlString);
    // Find all <cTn> elements
    const cTnElements = doc.getElementsByTagName('cTn');
    let currentId = startId;
    for (let i = 0; i < cTnElements.length; i++) {
        const element = cTnElements[i];
        if (element.hasAttribute('id')) {
            element.setAttribute('id', currentId.toString());
            currentId++;
        }
    }
    return {
        xml: serializeXml(doc),
        nextId: currentId
    };
}
/**
 * Check if XML contains any elements with a specific attribute
 *
 * @param xmlString - XML to check
 * @param attributeName - Attribute to look for
 * @returns true if attribute exists
 */
export function hasAttribute(xmlString, attributeName) {
    const doc = parseXml(xmlString);
    function hasAttrInTree(node) {
        if (node.nodeType === 1 && node.hasAttribute(attributeName)) {
            return true;
        }
        for (let i = 0; i < node.childNodes.length; i++) {
            if (hasAttrInTree(node.childNodes[i])) {
                return true;
            }
        }
        return false;
    }
    return hasAttrInTree(doc.documentElement);
}
/**
 * Count <p:par> elements (used to detect allAtOnce multi-block animations)
 *
 * @param xmlString - XML to search
 * @returns Number of <p:par> elements
 */
export function countParElements(xmlString) {
    const doc = parseXml(xmlString);
    return doc.getElementsByTagName('par').length;
}
//# sourceMappingURL=gen-animations-xml-utils.js.map