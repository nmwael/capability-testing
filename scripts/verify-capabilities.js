#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function readYamlSimple(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
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
    
    if (line.match(/^capabilities:\s*$/)) {
      continue;
    }
    
    const capMatch = line.match(/^ {2}- id:\s*(.+)$/);
    if (capMatch) {
      currentCap = { verified_by: [] };
      let idVal = capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
      currentCap.id = idVal;
      inVerifiedBy = false;
      result.capabilities.push(currentCap);
      continue;
    }
    
    if (!currentCap) continue;
    
    const kv = line.match(/^ {4}(\w+):\s*(.*)$/);
    if (kv) {
      const key = kv[1];
      let val = kv[2].trim();
      val = val.split('#')[0].trim();
      if (val.startsWith('#')) val = '';
      if (val === '') {
        inVerifiedBy = key === 'verified_by';
        if (inVerifiedBy) currentCap.verified_by = [];
        currentKey = key;
        continue;
      }
      val = val.replace(/^['"]|['"]$/g, '');
      currentCap[key] = val;
      inVerifiedBy = false;
      continue;
    }
    
    if (inVerifiedBy) {
      const listItem = line.match(/^ {6}- \s*(.+)$/);
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
    for (let j = 0; j < entries.length; j++) {
      const e = entries[j];
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full);
      } else {
        if (pattern.test(full)) results.push(path.relative(baseDir, full).replace(/\\/g, '/'));
      }
    }
  }
  walk(baseDir);
  return results;
}

function checkQuarterPast(qstr) {
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

const LANE_TAGS = { publication: '@backend', alerting: '@backend', frontend: '@frontend', docs: '@docs' };

function readTagsBeforeFeature(text) {
  const head = text.split(/^[ \t]*Feature:/m)[0];
  const tags = [];
  const tagRegex = /@[\w:.-]+/g;
  let match;
  while ((match = tagRegex.exec(head)) !== null) {
    tags.push(match[0]);
  }
  return tags;
}

function extractCapTags(text) {
  const head = text.split(/^[ \t]*Feature:/m)[0];
  const capTags = head.match(/@cap:([\w:.-]+)/gm);
  return capTags ? capTags.map(t => t.replace('@cap:', '').trim()) : [];
}

function validateCapTags(repoRoot, capabilities, errors) {
  const featureFiles = findFiles(repoRoot, /\.(feature)$/);
  
  for (let k = 0; k < featureFiles.length; k++) {
    const file = featureFiles[k];
    const filePath = path.join(repoRoot, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const capIds = extractCapTags(content);
    
    if (capIds.length !== 1) {
      errors.push(`features/${file}: expected exactly one @cap: tag, found ${capIds.length}`);
    }
    
    for (let m = 0; m < capIds.length; m++) {
      const capId = capIds[m];
      let exists = false;
      for (let n = 0; n < capabilities.length; n++) {
        if (capabilities[n].id === capId) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        errors.push(`features/${file}: @cap:${capId} references unknown capability`);
      }
    }
  }
}

function checkLaneTags(repoRoot, errors) {
  const featuresDir = path.join(repoRoot, 'features');
  if (!fs.existsSync(featuresDir)) return;

  const lanes = fs.readdirSync(featuresDir);
  for (let k = 0; k < lanes.length; k++) {
    const lane = lanes[k];
    const laneDir = path.join(featuresDir, lane);
    if (!fs.statSync(laneDir).isDirectory()) {
      if (lane.endsWith('.feature')) {
        errors.push(`features/${lane}: a feature file must live in a lane directory`);
      }
      continue;
    }

    const expected = LANE_TAGS[lane];
    const filesInLane = fs.readdirSync(laneDir);
    for (let m = 0; m < filesInLane.length; m++) {
      const file = filesInLane[m];
      if (!file.endsWith('.feature')) continue;
      const rel = `features/${lane}/${file}`;
      const tags = readTagsBeforeFeature(fs.readFileSync(path.join(laneDir, file), 'utf8'));

      const capTags = tags.filter(t => t.startsWith('@cap:'));
      if (capTags.length !== 1) {
        errors.push(`${rel}: expected exactly one @cap: tag, found ${capTags.length}`);
      }

      const laneTags = tags.filter(t => t === '@frontend' || t === '@backend' || t === '@docs');
      if (!expected) {
        errors.push(`${rel}: no lane mapping for 'features/${lane}/' (add it to LANE_TAGS)`);
      } else if (laneTags.length === 0) {
        errors.push(`${rel}: missing its lane tag (expected ${expected})`);
      } else if (laneTags.length > 1) {
        errors.push(`${rel}: more than one lane tag (${laneTags.join(', ')}); a file is one side`);
      } else if (laneTags[0] !== expected) {
        errors.push(`${rel}: lane tag ${laneTags[0]} does not match features/${lane}/ (expected ${expected})`);
      }
    }
  }
}

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

const STATUS_VALUES = ['active', 'deprecated', 'retired', 'draft'];

function main() {
  const repoRoot = process.cwd();
  const capsArg = argValue('--caps');
  const capsPath = capsArg ? path.resolve(repoRoot, capsArg) : path.join(repoRoot, 'capabilities', 'capabilities.yml');
  if (!fs.existsSync(capsPath)) {
    console.error(`ERROR: ${path.relative(repoRoot, capsPath)} not found`);
    process.exit(1);
  }
  const data = readYamlSimple(capsPath);
  const errors = [];
  const warnings = [];

  const parsedCapabilities = data.capabilities || [];
  for (let k = 0; k < parsedCapabilities.length; k++) {
    const cap = parsedCapabilities[k];
    const status = (cap.status || 'active').trim();
    if (!STATUS_VALUES.includes(status.toLowerCase())) {
      warnings.push(`Invalid status '${status}' for capability '${cap.id || 'unknown'}'`);
    }
  }

  const ids = [];
  if (data.capabilities && data.capabilities.length > 0) {
    for (let k = 0; k < data.capabilities.length; k++) {
      ids.push(data.capabilities[k].id);
    }
  }
  const uniqueIds = [];
  for (let k = 0; k < ids.length; k++) {
    const id = ids[k];
    if (uniqueIds.indexOf(id) === -1) {
      uniqueIds.push(id);
    }
  }
  if (ids.length !== uniqueIds.length) {
    const duplicates = [];
    let seen = {};
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      if (seen[id]) {
        duplicates.push(id);
      } else {
        seen[id] = true;
      }
    }
    const dupList = duplicates.join(', ');
    errors.push(`Duplicate capability IDs found: ${dupList}`);
  }

  if (!Array.isArray(data.capabilities) || data.capabilities.length === 0) {
    errors.push('no capabilities parsed — the manifest is empty or its indentation changed');
  }

  // Lane validation improvements

  // Helper function to filter out build artifact files
  const isBuildArtifact = (file) => file.includes('target/test-classes') || file.includes('wip/');

  // 1) Validate that all lane values are non-empty and not just whitespace
  const validateLaneValues = () => {
    const laneValueErrors = [];
    const featureFiles = findFiles(repoRoot, /\.(feature)$/);
    
    for (let k = 0; k < featureFiles.length; k++) {
      const file = featureFiles[k];
      // Skip build artifacts
      if (isBuildArtifact(file)) continue;
      
      const filePath = path.join(repoRoot, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const tags = readTagsBeforeFeature(content);
      const laneTags = tags.filter(t => t === '@frontend' || t === '@backend' || t === '@docs');
      
      if (laneTags.length > 0) {
        for (let m = 0; m < laneTags.length; m++) {
          const tag = laneTags[m];
          // Check for empty or whitespace-only lane tags
          if (tag === '' || /^\s*$/.test(tag)) {
            laneValueErrors.push(`${file}: lane tag is empty or whitespace-only`);
          }
        }
      }
    }
    
    if (laneValueErrors.length > 0) {
      errors.push(`Lane validation failed: ${laneValueErrors.join('; ')}`);
    }
    
    return laneValueErrors.length === 0;
  };

  // 2) Ensure lane references are consistent across capability entries
  const validateLaneConsistency = () => {
    const consistencyErrors = [];
    const featureFiles = findFiles(repoRoot, /\.(feature)$/);
    
    const VALID_LANE_DIRS = ['publication', 'alerting', 'frontend', 'docs'];
    
    for (let k = 0; k < featureFiles.length; k++) {
      const file = featureFiles[k];
      // Skip build artifacts
      if (isBuildArtifact(file)) continue;
      
      const pathParts = file.split('/');
      // Feature files must be at features/<lane>/<file>
      if (pathParts.length < 3 || pathParts[0] !== 'features') {
        consistencyErrors.push(`${file}: feature file must live in features/<lane>/ directory`);
        continue;
      }
      const laneDir = pathParts[1];
      if (!VALID_LANE_DIRS.includes(laneDir)) {
        consistencyErrors.push(`${file}: unknown lane directory '${laneDir}' (expected one of: ${VALID_LANE_DIRS.join(', ')})`);
      }
    }
    
    if (consistencyErrors.length > 0) {
      errors.push(`Lane consistency failed: ${consistencyErrors.join('; ')}`);
    }
    
    return consistencyErrors.length === 0;
  };

  // 3) Add check for deprecated capabilities that should have specific lane values
  const validateDeprecatedCapabilityLanes = () => {
    const deprecatedLaneErrors = [];
    const deprecatedCaps = data.capabilities.filter(c => (c.status || 'active').trim() === 'deprecated');
    
    const OWNER_TO_LANE_DIR = {
      publication: 'publication',
      alerting: 'alerting',
      frontend: 'frontend',
      docs: 'docs'
    };
    
    for (let k = 0; k < deprecatedCaps.length; k++) {
      const cap = deprecatedCaps[k];
      const capId = cap.id;
      const owner = (cap.owner || 'unknown').trim();
      const expectedLaneDir = OWNER_TO_LANE_DIR[owner];
      
      if (!expectedLaneDir) continue;
      
      // Find feature files for this capability
      const featureFiles = findFiles(repoRoot, /\.(feature)$/);
      
      for (let f = 0; f < featureFiles.length; f++) {
        const file = featureFiles[f];
        // Skip build artifacts
        if (isBuildArtifact(file)) continue;
        
        const filePath = path.join(repoRoot, file);
        const content = fs.readFileSync(filePath, 'utf8');
        const capTags = extractCapTags(content);
        
        if (capTags.length === 1 && capTags[0].replace('@cap:', '') === capId) {
          // Get the actual directory from the file path
          const pathParts = file.split('/');
          const actualLaneDir = pathParts.length > 1 ? pathParts[1] : pathParts[0];
          
          if (actualLaneDir !== expectedLaneDir) {
            deprecatedLaneErrors.push(`${file}: deprecated capability '${capId}' should be in directory 'features/${expectedLaneDir}/' but is in 'features/${actualLaneDir}/'`);
          }
        }
      }
    }
    
    if (deprecatedLaneErrors.length > 0) {
      errors.push(`Deprecated capability lane validation failed: ${deprecatedLaneErrors.join('; ')}`);
    }
    
    return deprecatedLaneErrors.length === 0;
  };

  // Run the new validations
  if (!validateLaneValues()) {
    // Already added error above
  }
  if (!validateLaneConsistency()) {
    // Already added error above
  }
  if (!validateDeprecatedCapabilityLanes()) {
    // Already added error above
  }
  
  const featureFiles = findFiles(repoRoot, /\.(feature)$/);
  const testFiles = findFiles(repoRoot, /(IT|Test)\.java$/);
  
  // Detect orphaned feature files
  const verifiedByRefs = [];
  const caps = data.capabilities || [];
  for (let k = 0; k < caps.length; k++) {
    const cap = caps[k];
    const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
    for (let m = 0; m < vb.length; m++) {
      verifiedByRefs.push(vb[m]);
    }
  }
  
  const referencedFeaturePaths = [];
  for (let k = 0; k < verifiedByRefs.length; k++) {
    const ref = verifiedByRefs[k];
    if (ref.endsWith('.feature') || ref.startsWith('features/')) {
      referencedFeaturePaths.push(ref);
    }
  }
  
  const orphanedFeatures = [];
  for (let k = 0; k < featureFiles.length; k++) {
    const f = featureFiles[k];
    if (f.includes('target/test-classes') || f.includes('wip/')) continue;
    
    let isReferenced = false;
    for (let m = 0; m < referencedFeaturePaths.length; m++) {
      const ref = referencedFeaturePaths[m];
      if (ref === f) {
        isReferenced = true;
        break;
      }
    }
    
    if (!isReferenced) {
      orphanedFeatures.push(f);
    }
  }
  
  for (let k = 0; k < orphanedFeatures.length; k++) {
    const orphan = orphanedFeatures[k];
    const displayPath = orphan.startsWith('features/') ? orphan : `features/${orphan}`;
    warnings.push(`Orphaned feature file not referenced by any capability: ${displayPath}`);
  }
  
  for (let k = 0; k < caps.length; k++) {
    const cap = caps[k];
    const status = (cap.status || 'active').trim();
    if (status === 'retired') {
      if (cap.restore_after && checkQuarterPast(cap.restore_after)) {
        errors.push(`RETIRED capability '${cap.id}' has restore_after=${cap.restore_after} which is in the past`);
      }
      continue;
    }
    const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];

    if (vb.length === 0) {
      if (status !== 'retired') {
        errors.push(`Active capability '${cap.id}' has empty verified_by`);
      }
      continue;
    }
    for (let m = 0; m < vb.length; m++) {
      const ref = vb[m];
      let exists = false;
      for (let n = 0; n < featureFiles.length; n++) {
        const featureFile = featureFiles[n];
        if (featureFile.endsWith(ref) || ref.endsWith(featureFile) || featureFile === ref || featureFile.endsWith('/' + ref) || featureFile.startsWith(ref + '/')) {
          exists = true;
          break;
        }
      }
      if (!exists) {
        for (let p = 0; p < testFiles.length; p++) {
          const testFile = testFiles[p];
          if (testFile.endsWith(ref) || ref.endsWith(testFile) || testFile === ref || testFile.endsWith('/' + ref.split('.')[0]) || testFile.startsWith(ref.split('.')[0] + '/')) {
            exists = true;
            break;
          }
        }
      }
      if (!exists) {
        for (let p = 0; p < testFiles.length; p++) {
          const testFile = testFiles[p];
          if (testFile.includes(ref.replace(/\./g, '/'))) {
            exists = true;
            break;
          }
        }
      }
      if (!exists) {
        errors.push(`Reference not found for capability '${cap.id}': ${ref}`);
      }
    }
    
    // Verify that verified_by paths actually exist on filesystem
    const verifyPathsExist = (repoRoot, paths, type) => {
      const missing = [];
      for (let p = 0; p < paths.length; p++) {
        const pth = paths[p];
        let found = false;
        if (type === 'feature') {
          for (let f = 0; f < featureFiles.length; f++) {
            const ff = featureFiles[f];
            if (ff === pth || ff.endsWith('/' + pth) || pth.endsWith('/' + ff)) {
              found = true;
              break;
            }
          }
        } else if (type === 'test') {
          for (let f = 0; f < testFiles.length; f++) {
            const tf = testFiles[f];
            if (tf === pth || tf.endsWith('/' + pth) || pth.endsWith('/' + tf) || tf.includes(pth.replace(/\./g, '/'))) {
              found = true;
              break;
            }
          }
        }
        if (!found) {
          missing.push({ path: pth, type: type });
        }
      }
      return missing;
    };
    
    const missingFeatures = verifyPathsExist(repoRoot, referencedFeaturePaths, 'feature');
    const testRefs = vb.filter(ref => !ref.endsWith('.feature') && !ref.startsWith('features/'));
    const missingTests = verifyPathsExist(repoRoot, testRefs, 'test');
    
    for (let k = 0; k < missingFeatures.length; k++) {
      const mf = missingFeatures[k];
      warnings.push(`Feature file referenced by verified_by does not exist: ${mf.path} (capability: ${cap.id})`);
    }
    
    for (let k = 0; k < missingTests.length; k++) {
      const mt = missingTests[k];
      warnings.push(`Test file referenced by verified_by does not exist: ${mt.path} (capability: ${cap.id})`);
    }
  }
  
  checkLaneTags(repoRoot, errors);
  
  validateCapTags(repoRoot, data.capabilities, errors);
  
  // Additional lane validation checks
  validateLaneValues();
  validateLaneConsistency();
  validateDeprecatedCapabilityLanes();

  if (warnings.length > 0) {
    console.warn('Capability traceability check has warnings:');
    for (let k = 0; k < warnings.length; k++) {
      const w = warnings[k];
      console.warn('  - ' + w);
    }
  }

  if (errors.length > 0) {
    console.error('Capability traceability check FAILED:');
    for (let k = 0; k < errors.length; k++) {
      const e = errors[k];
      console.error('  - ' + e);
    }
    process.exit(1);
  }
  console.log(`Capability traceability check PASSED (${data.capabilities.length} capabilities)`);
  process.exit(0);
}

main();