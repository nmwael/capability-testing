import { readFileSync, writeFileSync } from 'fs';
const xsd = readFileSync('backend/common/src/main/resources/cap-v1.2.xsd', 'utf8');
const elements = [...xsd.matchAll(/<element name\s*=\s*"([^"]+)"/g)].map(m => m[1]);
// Get unique in order of first appearance
const seen = new Set();
const ordered = [];
for (const e of elements) {
  if (!seen.has(e)) { seen.add(e); ordered.push(e); }
}
// For each element, find its type
const catalogue = {};
for (const name of ordered) {
  // Try to find element declaration
  const re = new RegExp(`<element name\\s*=\\s*"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"([^>]*)>`, 's');
  const m = xsd.match(re);
  if (!m) { catalogue[name] = {type: 'string'}; continue; }
  const attrs = m[1];
  const typeMatch = attrs.match(/type\s*=\s*"([^"]+)"/);
  if (typeMatch) {
    const t = typeMatch[1];
    if (t === 'xs:dateTime') catalogue[name] = {type: 'dateTime'};
    else if (t === 'xs:anyURI') catalogue[name] = {type: 'anyURI'};
    else if (t === 'xs:integer') catalogue[name] = {type: 'integer'};
    else if (t === 'xs:decimal') catalogue[name] = {type: 'decimal'};
    else if (t === 'xs:language') catalogue[name] = {type: 'language'};
    else catalogue[name] = {type: 'string'};
  } else {
    // Check if it has inline simpleType with enumeration
    const blockRe = new RegExp(`<element name\\s*=\\s*"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>[\\s\\S]*?<\\/element>`, 's');
    const block = xsd.match(blockRe);
    if (block) {
      const enums = [...block[0].matchAll(/<enumeration value\s*=\s*"([^"]+)"/g)].map(em => em[1]);
      if (enums.length > 0) {
        catalogue[name] = {type: 'string', values: enums};
      } else if (block[0].includes('xs:dateTime')) {
        catalogue[name] = {type: 'dateTime'};
      } else {
        catalogue[name] = {type: 'string'};
      }
    } else {
      catalogue[name] = {type: 'string'};
    }
  }
}
writeFileSync('backend/common/src/main/resources/cap-fields.json', JSON.stringify(catalogue, null, 2));
console.log(Object.keys(catalogue).length);
