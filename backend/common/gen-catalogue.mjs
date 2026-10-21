import { readFileSync, writeFileSync } from 'fs';
import { DOMParser } from '@xmldom/xmldom';

// Read the XSD file
const xsdContent = readFileSync('/workspaces/capability-testing/backend/common/src/main/resources/cap-v1.2.xsd', 'utf8');
const parser = new DOMParser();
const xmlDoc = parser.parseFromString(xsdContent, 'application/xml');

// Get the target namespace and create namespace map
const targetNs = 'urn:oasis:names:tc:emergency:cap:1.2';
const nsMap = { cap: targetNs };

// Parse XSD to extract field information
const catalog = {};

// Find the alert element which contains the complexType with sequence
const alertElements = Array.from(xmlDoc.getElementsByTagName('element'));
const alertElement = alertElements.find(
  el => el.getAttribute('name') === 'alert'
);
if (!alertElement) {
  console.error('Could not find alert element in XSD');
  process.exit(1);
}

const alertComplexType = alertElement.getElementsByTagName('complexType')[0];
if (!alertComplexType) {
  console.error('Could not find complexType in alert element');
  process.exit(1);
}

const sequence = alertComplexType.getElementsByTagName('sequence')[0];
if (!sequence) {
  console.error('Could not find sequence in complexType');
  process.exit(1);
}

// Get all direct element elements (top-level fields)
const topLevelElements = Array.from(
  sequence.getElementsByTagName('element')
).filter(
  child => child.localName === 'element'
);

// Process each top-level element
topLevelElements.forEach(element => {
  const name = element.getAttribute('name');
  
  // Skip valueName and value as they are referenced elements
  if (name === 'valueName' || name === 'value') return;
  
  // Get the type
  let type = 'string';
  const typeAttr = element.getAttribute('type');
  
  if (typeAttr) {
    // Handle xs: prefixed types
    if (typeAttr.startsWith('xs:')) {
      type = typeAttr.substring(3); // Remove "xs:" prefix
    } else {
      type = typeAttr;
    }
  } else {
    // Check for complexType with sequence inside
    const seq = element.getElementsByTagName('sequence')[0];
    if (seq) {
      const seqElements = Array.from(seq.children).filter(
        child => child.localName === 'element'
      );
      
      if (seqElements.length > 0) {
        // Look for first simpleType to get type info
        for (const seqE of seqElements) {
          const simpleType = seqE.getElementsByTagName('simpleType')[0];
          if (simpleType) {
            const restriction = simpleType.getElementsByTagName('restriction')[0];
            if (restriction) {
              const base = restriction.getAttribute('base');
              if (base) {
                // Handle xs: prefixed types
                if (base.startsWith('xs:')) {
                  type = base.substring(3);
                } else {
                  type = base;
                }
                break;
              }
            }
          }
        }
      }
    }
  }
  
  // Get values for simpleType with restriction/enumeration
  let values = [];
  const simpleType = element.getElementsByTagName('simpleType')[0];
  if (simpleType) {
    const restriction = simpleType.getElementsByTagName('restriction')[0];
    if (restriction) {
      const enumerations = Array.from(restriction.children).filter(
        child => child.localName === 'enumeration'
      );
      values = enumerations.map(e => e.getAttribute('value'));
    }
  }
  
  catalog[name] = {
    type: type,
    ...(values.length > 0 ? { values: values } : {})
  };
});

// Write the JSON output
writeFileSync('cap-fields.json', JSON.stringify(catalog, null, 2));

console.log('Catalogue generated successfully!');
console.log('Total fields:', Object.keys(catalog).length);
