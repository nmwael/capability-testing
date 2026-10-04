#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readYamlSimple(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  // Very simple YAML parser for the structure we use (arrays, maps, basic values)
  // Not production-grade, but sufficient for this example
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const result = { capabilities: [] };
  let i = 0;
  let currentCap = null;
  let currentKey = null;
  let inVerifiedBy = false;
  
  while (i < lines.length) {
    const line = lines[i];
    i++;
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    // Top level
    if (line.match(/^capabilities:\s*$/)) {
      continue;
    }
    
    // New capability item
    const capMatch = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (capMatch) {
      currentCap = { verified_by: [] };
      let idVal = capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
      currentCap.id = idVal;
      inVerifiedBy = false;
      result.capabilities.push(currentCap);
      continue;
    }
    
    if (!currentCap) continue;
    
    // Key-value pairs
    const kv = line.match(/^\s{2,}(\w+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let val = kv[2].trim();
      // strip inline comment
      val = val.split('#')[0].trim();
      if (val.startsWith('#')) val = '';
      if (val === '') {
        // Could be list start
        if (key === 'verified_by') {
          inVerifiedBy = true;
          currentCap.verified_by = [];
        }
        currentKey = key;
        continue;
      }
      // Remove quotes
      val = val.replace(/^['"]|['"]$/g, '');
      currentCap[key] = val;
      inVerifiedBy = false;
      continue;
    }
    
    // List items under verified_by
    if (inVerifiedBy) {
      const listItem = line.match(/^\s{4,}-\s*(.+)$/);
      if (listItem) {
        let v = listItem[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
        if (v) currentCap.verified_by.push(v);
        continue;
      } else {
        inVerifiedBy = false;
      }
    }
  }
  return result;
}

function findFiles(baseDir, pattern) {
  const results = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else {
        // simple match for feature, IT/java files
        if (pattern.test(full)) results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(baseDir);
  return results;
}

function checkQuarterPast(qstr) {
  // simple check like 2027-Q1 vs now (Oct 2026)
  const m = qstr.match(/(\d{4})-Q([1-4])/);
  if (!m) return false;
  const year = parseInt(m[1]);
  const q = parseInt(m[2]);
  const now = new Date();
  const qNow = Math.floor((now.getMonth()) / 3) + 1;
  if (year > now.getFullYear()) return false;
  if (year < now.getFullYear()) return true;
  return q < qNow;
}

function main() {
  const repoRoot = process.cwd();
  const capsPath = path.join(repoRoot, 'capabilities', 'capabilities.yml');
  if (!fs.existsSync(capsPath)) {
    console.error('ERROR: capabilities/capabilities.yml not found');
    process.exit(1);
  }
  const data = readYamlSimple(capsPath);
  const errors = [];
  const warnings = [];
  
  // Find all feature files and test classes
  const featureFiles = findFiles(repoRoot, /\.(feature)$/);
  const testFiles = findFiles(repoRoot, /(IT|Test)\.java$/);
  
  for (const cap of data.capabilities || []) {
    const status = (cap.status || 'active').trim();
    if (status === 'retired') {
      if (cap.restore_after && checkQuarterPast(cap.restore_after)) {
        errors.push(`RETIRED capability '${cap.id}' has restore_after=${cap.restore_after} which is in the past`);
      }
      continue; // don't enforce verified_by for retired
    }
    // active or deprecated
    const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
    if (vb.length === 0) {
      errors.push(`Active capability '${cap.id}' has empty verified_by`);
      continue;
    }
    for (const ref of vb) {
      // try to find file/class reference
      const exists = featureFiles.some(f => f === ref || f.endsWith(ref) || ref.endsWith(f)) ||
                     testFiles.some(f => f === ref || f.endsWith(ref) || ref.endsWith(f)) ||
                     testFiles.some(f => f.includes(ref.replace(/\./g, '/')));
      if (!exists) {
        errors.push(`Reference not found for capability '${cap.id}': ${ref}`);
      }
    }
  }
  
  if (errors.length > 0) {
    console.error('Capability traceability check FAILED:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }
  console.log('Capability traceability check PASSED');
  process.exit(0);
}

main();