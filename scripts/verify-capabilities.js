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
    
    // Handle lanes array first (before general kv parsing)
    const lanesMatch = line.match(/^ {4}lanes:\s*\[(.+)\]/);
    if (lanesMatch) {
      const lanesStr = lanesMatch[1];
      currentCap.lanes = lanesStr.split(",").map(l => l.trim().replace(/^['"]|['"]$/g, ""));
      continue;
    }

    // Handle dependencies array
    const depsMatch = line.match(/^ {4}dependencies:\s*\[(.+)\]/);
    if (depsMatch) {
      const depsStr = depsMatch[1];
      currentCap.dependencies = depsStr.split(",").map(d => d.trim().replace(/^['"]|['"]$/g, ""));
      continue;
    }

    // Handle lifecycle_state field
    const lifecycleMatch = line.match(/^ {4}lifecycle_state:\s*(.*)$/);
    if (lifecycleMatch) {
      let val = lifecycleMatch[1].trim();
      val = val.split('#')[0].trim();
      if (val.startsWith('#')) val = '';
      if (val !== '') {
        val = val.replace(/^['"]|['"]$/g, '');
        currentCap.lifecycle_state = val;
      }
      continue;
    }

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
      // Check if this looks like an object start (key: value on same line after key)
      // For verified_by, we handle objects in the list parsing below
      val = val.replace(/^['"]|['"]$/g, '');
      currentCap[key] = val;
      inVerifiedBy = false;
      continue;
    }

    // Handle verified_by list items - supports both string and object formats
    if (inVerifiedBy) {
      const listItem = line.match(/^ {6}- \s*(.+)$/);
      if (listItem) {
        let v = listItem[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
        if (v) {
          // Check if it's an object format starting with type:
          if (v.startsWith('type:')) {
            // Inline object format: type: X, ref: Y, ...
            const obj = {};
            const parts = v.split(',').map(p => p.trim());
            for (const part of parts) {
              const kvMatch = part.match(/^(\w+):\s*(.+)$/);
              if (kvMatch) {
                obj[kvMatch[1].trim()] = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');
              }
            }
            if (obj.type && !EVIDENCE_TYPES.includes(obj.type)) {
              warnings.push(`Unknown evidence type '${obj.type}' in capability '${currentCap.id}'`);
            }
            currentCap.verified_by.push(obj);
            currentCap._vbObjMode = true;  // Flag for multi-line object parsing
          } else {
            // Backward compatible: plain string
            currentCap.verified_by.push({ type: 'unknown', ref: v });
            currentCap._vbObjMode = false;
          }
        }
        continue;
      }
      
      // Handle multi-line object fields (indented 8 spaces under verified_by item)
      const objFieldMatch = line.match(/^ {8}(\w+):\s*(.*)$/);
      if (objFieldMatch && currentCap._vbObjMode && currentCap.verified_by.length > 0) {
        const key = objFieldMatch[1];
        let val = objFieldMatch[2].trim();
        val = val.split('#')[0].trim();
        if (val.startsWith('#')) val = '';
        if (val !== '') {
          val = val.replace(/^['"]|['"]$/g, '');
          // Add to last verified_by entry
          const lastEntry = currentCap.verified_by[currentCap.verified_by.length - 1];
          if (lastEntry && typeof lastEntry === 'object') {
            lastEntry[key] = val;
          }
        }
        continue;
      }
      
      if (!objFieldMatch) {
        currentCap._vbObjMode = false;
      }
      
      inVerifiedBy = false;
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

// Helper to skip build artifacts and test fixtures
const isBuildArtifact = (file) => file.includes('target/test-classes') || file.includes('wip/');

function validateCapTags(repoRoot, capabilities, errors) {
  const featureFiles = findFiles(repoRoot, /\.(feature)$/);
  
  for (let k = 0; k < featureFiles.length; k++) {
    const file = featureFiles[k];
    if (isBuildArtifact(file)) continue;
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

const EVIDENCE_TYPES = [
  'unit_test', 'integration_test', 'bdd_feature', 'contract_test',
  'mutation_test', 'e2e_test', 'static_analysis', 'manual_review', 'audit'
];

// Lifecycle state machine: valid transitions from -> to
const LIFECYCLE_TRANSITIONS = {
  'draft': ['active'],
  'active': ['deprecated', 'retired'],
  'deprecated': ['retired', 'active'],  // Can reactivate
  'retired': []  // Terminal state
};

// Health thresholds
const HEALTH_THRESHOLDS = {
  draft_to_active: 70,      // Minimum health to transition draft->active
  active_deprecated: 50,    // Health below this triggers active->deprecated
  deprecated_retired: 30,   // Health below this triggers deprecated->retired
  warning: 60,              // Health warning threshold
  critical: 40              // Health critical threshold
};

const TRANSITION_TIME_WINDOWS = {
  active_to_deprecated_days: 30,    // Days below threshold before active->deprecated
  deprecated_to_retired_days: 60    // Days below threshold before deprecated->retired
};

// Parse CODEOWNERS file
function parseCodeOwners(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const rules = [];
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    
    const pattern = parts[0];
    const owners = parts.slice(1);
    rules.push({ pattern, owners });
  }
  
  return rules;
}

// Match file path against CODEOWNERS pattern
function matchCodeOwnersPattern(pattern, filePath) {
  // Normalize pattern - remove leading slash if present
  let normalizedPattern = pattern.startsWith('/') ? pattern.slice(1) : pattern;
  
  // If pattern ends with /, it matches that directory and all subdirectories
  const isDirectoryPattern = normalizedPattern.endsWith('/');
  
  // Convert glob pattern to regex
  let regexPattern = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  
  if (isDirectoryPattern) {
    // Directory pattern matches the directory and all files under it
    regexPattern = regexPattern.slice(0, -1) + '(/.*)?$';
  } else {
    regexPattern = '^' + regexPattern + '$';
  }
  
  const regex = new RegExp(regexPattern);
  return regex.test(filePath);
}

// Get CODEOWNERS for a file path
function getCodeOwnersForPath(rules, filePath) {
  // CODEOWNERS uses last matching pattern (like gitignore)
  let matchedOwners = [];
  for (const rule of rules) {
    if (matchCodeOwnersPattern(rule.pattern, filePath)) {
      matchedOwners = rule.owners;
    }
  }
  return matchedOwners;
}

// 8) Validate CODEOWNERS coverage
const validateCodeOwners = (repoRoot, data, errors, warnings) => {
  const codeOwnersPath = path.join(repoRoot, '.github', 'CODEOWNERS');
  if (!fs.existsSync(codeOwnersPath)) {
    warnings.push('No .github/CODEOWNERS file found');
    return true; // Not an error, just a warning
  }
  
  const rules = parseCodeOwners(codeOwnersPath);
  const caps = data.capabilities || [];
  const codeOwnerErrors = [];
  const codeOwnerWarnings = [];
  
  // Check each capability has github_team and corresponding CODEOWNERS entry
  for (let k = 0; k < caps.length; k++) {
    const cap = caps[k];
    const capId = cap.id;
    const githubTeam = cap.github_team;
    
    if (!githubTeam) {
      codeOwnerWarnings.push(`Capability '${capId}' missing github_team field`);
      continue;
    }
    
    // Find feature files for this capability
    const capFeatureFiles = [];
    const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
    for (const entry of vb) {
      const ref = (entry && typeof entry === 'object' && entry.ref) ? entry.ref : entry;
      if (ref && (ref.endsWith('.feature') || ref.startsWith('features/'))) {
        capFeatureFiles.push(ref);
      }
    }
    
    if (capFeatureFiles.length === 0) {
      codeOwnerWarnings.push(`Capability '${capId}' has no feature files to validate CODEOWNERS`);
      continue;
    }
    
    // Check each feature file has CODEOWNERS matching capability's github_team
    for (const featureFile of capFeatureFiles) {
      const owners = getCodeOwnersForPath(rules, featureFile);
      if (owners.length === 0) {
        codeOwnerErrors.push(`Feature file '${featureFile}' for capability '${capId}' has no CODEOWNERS entry`);
      } else if (!owners.includes(githubTeam)) {
        codeOwnerErrors.push(`Feature file '${featureFile}' for capability '${capId}' owned by '${owners.join(', ')}' but capability requires '${githubTeam}'`);
      }
    }
  }
  
  // Check critical files have CODEOWNERS
  const criticalFiles = [
    'capabilities/capabilities.yml',
    'scripts/verify-capabilities.js'
  ];
  
  for (const criticalFile of criticalFiles) {
    const owners = getCodeOwnersForPath(rules, criticalFile);
    if (owners.length === 0) {
      codeOwnerErrors.push(`Critical file '${criticalFile}' has no CODEOWNERS entry`);
    }
  }
  
  if (codeOwnerWarnings.length > 0) {
    for (const w of codeOwnerWarnings) warnings.push(w);
  }
  if (codeOwnerErrors.length > 0) {
    for (const e of codeOwnerErrors) errors.push(e);
  }
  
  return codeOwnerErrors.length === 0;
};

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
    // Validate lifecycle_state if present
    const lifecycleState = cap.lifecycle_state;
    if (lifecycleState) {
      const ls = lifecycleState.trim().toLowerCase();
      if (!STATUS_VALUES.includes(ls)) {
        warnings.push(`Invalid lifecycle_state '${lifecycleState}' for capability '${cap.id || 'unknown'}'`);
      }
    }
    // Validate verified_by entries
    const verifiedBy = cap.verified_by;
    if (Array.isArray(verifiedBy)) {
      for (let v = 0; v < verifiedBy.length; v++) {
        const entry = verifiedBy[v];
        if (entry && typeof entry === 'object') {
          if (entry.type && !EVIDENCE_TYPES.includes(entry.type)) {
            warnings.push(`Capability '${cap.id}' verified_by[${v}]: unknown evidence type '${entry.type}'`);
          }
          // Validate quality fields if present
          if (entry.coverage !== undefined) {
            const cov = parseInt(entry.coverage, 10);
            if (isNaN(cov) || cov < 0 || cov > 100) {
              warnings.push(`Capability '${cap.id}' verified_by[${v}]: coverage must be 0-100`);
            }
          }
          if (entry.mutation_score !== undefined) {
            const ms = parseInt(entry.mutation_score, 10);
            if (isNaN(ms) || ms < 0 || ms > 100) {
              warnings.push(`Capability '${cap.id}' verified_by[${v}]: mutation_score must be 0-100`);
            }
          }
          if (entry.flakiness !== undefined) {
            const fl = parseFloat(entry.flakiness);
            if (isNaN(fl) || fl < 0 || fl > 1) {
              warnings.push(`Capability '${cap.id}' verified_by[${v}]: flakiness must be 0-1`);
            }
          }
        }
      }
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
    
    const OWNER_TO_LANE_DIR = {
      publication: 'publication',
      alerting: 'alerting',
      frontend: 'frontend',
      docs: 'docs'
    };
    
    for (let k = 0; k < featureFiles.length; k++) {
      const file = featureFiles[k];
      // Skip build artifacts
      if (isBuildArtifact(file)) continue;
      
      const filePath = path.join(repoRoot, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const capTags = extractCapTags(content);
      
      if (capTags.length === 1) {
        const capId = capTags[0].replace('@cap:', '').trim().replace(/^['"]|['"]$/g, '');
        
        const capability = data.capabilities.find(c => c.id === capId);
        if (capability) {
          // Support both single owner and multiple lanes
          const validLanes = capability.lanes ? (Array.isArray(capability.lanes) ? capability.lanes : [capability.lanes]) : [capability.owner];
          const expectedLaneDirs = validLanes.map(lane => OWNER_TO_LANE_DIR[lane]).filter(Boolean);
          
          if (expectedLaneDirs.length === 0) {
            consistencyErrors.push(`${file}: capability '${capId}' has no valid lane mapping`);
            continue;
          }
          
          const pathParts = file.split('/');
          const actualLaneDir = pathParts.length > 1 ? pathParts[1] : pathParts[0];
          
          if (!expectedLaneDirs.includes(actualLaneDir)) {
            consistencyErrors.push(`${file}: capability '${capId}' has valid lanes [${validLanes.join(', ')}] (expected directories [${expectedLaneDirs.join(', ')}]) but file is in 'features/${actualLaneDir}/'`);
          }
        }
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
  }
  // 4) Validate dependencies (existence + circular detection)
  const validateDependencies = () => {
    const depErrors = [];
    const caps = data.capabilities || [];
    const capIds = new Set(caps.map(c => c.id));
    
    // Check existence of all dependencies
    for (let k = 0; k < caps.length; k++) {
      const cap = caps[k];
      const deps = cap.dependencies || [];
      for (let d = 0; d < deps.length; d++) {
        const depId = deps[d].trim();
        if (!capIds.has(depId)) {
          depErrors.push(`Capability '${cap.id}' depends on unknown capability '${depId}'`);
        }
      }
    }
    
    // Check for circular dependencies using DFS
    const graph = {};
    for (let k = 0; k < caps.length; k++) {
      const cap = caps[k];
      graph[cap.id] = (cap.dependencies || []).map(d => d.trim());
    }
    
    function hasCycle(node, visited, recStack, path) {
      visited.add(node);
      recStack.add(node);
      path.push(node);
      
      const neighbors = graph[node] || [];
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (!visited.has(neighbor)) {
          if (hasCycle(neighbor, visited, recStack, path)) {
            return true;
          }
        } else if (recStack.has(neighbor)) {
          // Found cycle - construct cycle path
          const cycleStart = path.indexOf(neighbor);
          const cycle = path.slice(cycleStart).join(' -> ') + ' -> ' + neighbor;
          depErrors.push(`Circular dependency detected: ${cycle}`);
          return true;
        }
      }
      
      recStack.delete(node);
      path.pop();
      return false;
    }
    
    const visited = new Set();
    const recStack = new Set();
    for (let k = 0; k < caps.length; k++) {
      const capId = caps[k].id;
      if (!visited.has(capId)) {
        hasCycle(capId, visited, recStack, []);
      }
    }
    
    if (depErrors.length > 0) {
      errors.push(`Dependency validation failed: ${depErrors.join('; ')}`);
    }
    
    return depErrors.length === 0;
  };

  // 5) Validate lifecycle transitions
  const validateLifecycleTransitions = () => {
    const transitionErrors = [];
    const caps = data.capabilities || [];
    
    for (let k = 0; k < caps.length; k++) {
      const cap = caps[k];
      const currentState = (cap.lifecycle_state || 'active').trim().toLowerCase();
      const previousState = (cap.previous_lifecycle_state || '').trim().toLowerCase();
      
      if (previousState && LIFECYCLE_TRANSITIONS[previousState]) {
        const validTargets = LIFECYCLE_TRANSITIONS[previousState];
        if (!validTargets.includes(currentState)) {
          transitionErrors.push(`Capability '${cap.id}': invalid lifecycle transition from '${previousState}' to '${currentState}' (valid: ${validTargets.join(', ')})`);
        }
      }
      
      // Validate current state is known
      if (!LIFECYCLE_TRANSITIONS[currentState] && currentState !== 'retired') {
        warnings.push(`Capability '${cap.id}': unknown lifecycle_state '${currentState}'`);
      }
    }
    
    if (transitionErrors.length > 0) {
      errors.push(`Lifecycle transition validation failed: ${transitionErrors.join('; ')}`);
    }
    
    return transitionErrors.length === 0;
  };

  // 6) Validate health metrics
  const validateHealthMetrics = () => {
    const healthErrors = [];
    const healthWarnings = [];
    const caps = data.capabilities || [];
    
    for (let k = 0; k < caps.length; k++) {
      const cap = caps[k];
      const healthScore = computeHealthScore(cap);
      
      if (healthScore !== null) {
        if (healthScore < HEALTH_THRESHOLDS.critical) {
          healthErrors.push(`Capability '${cap.id}': health score ${healthScore} is below critical threshold (${HEALTH_THRESHOLDS.critical})`);
        } else if (healthScore < HEALTH_THRESHOLDS.warning) {
          healthWarnings.push(`Capability '${cap.id}': health score ${healthScore} is below warning threshold (${HEALTH_THRESHOLDS.warning})`);
        }
      }
    }
    
    for (const w of healthWarnings) {
      warnings.push(w);
    }
    for (const e of healthErrors) {
      errors.push(e);
    }
    
    return healthErrors.length === 0;
  };

  // 7) Validate lifecycle transition rules (advisory)
  const validateLifecycleRules = () => {
    const ruleWarnings = [];
    const caps = data.capabilities || [];
    
    for (let k = 0; k < caps.length; k++) {
      const cap = caps[k];
      const currentState = (cap.lifecycle_state || 'active').trim().toLowerCase();
      const healthScore = computeHealthScore(cap);
      const daysInState = computeDaysInState(cap);
      
      if (healthScore === null || daysInState === null) continue;
      
      // Rule: draft -> active requires health >= 70 and at least 2 verified_by entries
      if (currentState === 'draft') {
        const verifiedCount = Array.isArray(cap.verified_by) ? cap.verified_by.length : 0;
        if (healthScore >= HEALTH_THRESHOLDS.draft_to_active && verifiedCount >= 2) {
          ruleWarnings.push(`Capability '${cap.id}': draft capability meets criteria for activation (health: ${healthScore}, verified_by: ${Array.isArray(cap.verified_by) ? cap.verified_by.length : 0})`);
        }
      }
      
      // Rule: active -> deprecated after 30 days below health 50
      if (currentState === 'active' && healthScore < HEALTH_THRESHOLDS.active_deprecated) {
        if (daysInState >= TRANSITION_TIME_WINDOWS.active_to_deprecated_days) {
          ruleWarnings.push(`Capability '${cap.id}': active capability health (${healthScore}) below ${HEALTH_THRESHOLDS.active_deprecated} for ${daysInState} days - consider deprecation`);
        }
      }
      
      // Rule: deprecated -> retired after 60 days below health 30
      if (currentState === 'deprecated' && healthScore < HEALTH_THRESHOLDS.deprecated_retired) {
        if (daysInState >= TRANSITION_TIME_WINDOWS.deprecated_to_retired_days) {
          ruleWarnings.push(`Capability '${cap.id}': deprecated capability health (${healthScore}) below ${HEALTH_THRESHOLDS.deprecated_retired} for ${daysInState} days - consider retirement`);
        }
      }
      
      // Rule: deprecated can be reactivated if health improves
      if (currentState === 'deprecated' && healthScore >= HEALTH_THRESHOLDS.draft_to_active) {
        ruleWarnings.push(`Capability '${cap.id}': deprecated capability health (${healthScore}) recovered - consider reactivation to active`);
      }
      
      for (const w of ruleWarnings) {
        warnings.push(w);
      }
    }
    
    return true;  // Rules are advisory, never fail
  };

  // Helper: compute health score from verified_by evidence
  function computeHealthScore(cap) {
    const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
    if (vb.length === 0) return null;
    
    let coverageSum = 0, mutationSum = 0, flakinessSum = 0, coverageCount = 0, mutationCount = 0, flakinessCount = 0;
    let latestRun = null;
    
    for (let i = 0; i < vb.length; i++) {
      const entry = vb[i];
      if (!entry || typeof entry !== 'object') continue;
      
      if (entry.coverage !== undefined) {
        const cov = parseInt(entry.coverage, 10);
        if (!isNaN(cov)) { coverageSum += cov; coverageCount++; }
      }
      if (entry.mutation_score !== undefined) {
        const ms = parseInt(entry.mutation_score, 10);
        if (!isNaN(ms)) { mutationSum += ms; mutationCount++; }
      }
      if (entry.flakiness !== undefined) {
        const fl = parseFloat(entry.flakiness);
        if (!isNaN(fl)) { flakinessSum += fl; flakinessCount++; }
      }
      if (entry.last_run) {
        const runDate = new Date(entry.last_run);
        if (!isNaN(runDate.getTime()) && (!latestRun || runDate > latestRun)) {
          latestRun = runDate;
        }
      }
    }
    
    if (coverageCount === 0 && mutationCount === 0) return null;
    
    const coverageAvg = coverageCount > 0 ? coverageSum / coverageCount : 50;
    const mutationAvg = mutationCount > 0 ? mutationSum / mutationCount : 50;
    const flakinessAvg = flakinessCount > 0 ? flakinessSum / flakinessCount : 0.1;
    
    // Staleness factor (0-1, where 1 is fresh)
    let freshness = 1.0;
    if (latestRun) {
      const daysSinceRun = (Date.now() - latestRun.getTime()) / (1000 * 60 * 60 * 24);
      freshness = Math.max(0, 1 - daysSinceRun / 365);  // Decay over a year
    }
    
    // Weighted health score: coverage 40%, mutation 30%, (1-flakiness) 20%, freshness 10%
    const healthScore = Math.round(
      coverageAvg * 0.4 + 
      mutationAvg * 0.3 + 
      (1 - flakinessAvg) * 100 * 0.2 + 
      freshness * 100 * 0.1
    );
    
    return Math.max(0, Math.min(100, healthScore));
  }

  // Helper: compute days in current lifecycle state
  function computeDaysInState(cap) {
    if (cap.lifecycle_state_changed) {
      const changeDate = new Date(cap.lifecycle_state_changed);
      if (!isNaN(changeDate.getTime())) {
        return Math.floor((Date.now() - changeDate.getTime()) / (1000 * 60 * 60 * 24));
      }
    }
    // Fallback: use oldest verified_by last_run or git commit date
    const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
    let oldestRun = null;
    for (let i = 0; i < vb.length; i++) {
      const entry = vb[i];
      if (entry && entry.last_run) {
        const runDate = new Date(entry.last_run);
        if (!isNaN(runDate.getTime()) && (!oldestRun || runDate < oldestRun)) {
          oldestRun = runDate;
        }
      }
    }
    if (oldestRun) {
      return Math.floor((Date.now() - oldestRun.getTime()) / (1000 * 60 * 60 * 24));
    }
    return null;
  }

  ;

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
  
  // 4) Validate dependencies
  if (!validateDependencies()) {
    // Already added error above
  }

  // 5) Validate lifecycle transitions
  if (!validateLifecycleTransitions()) {
    // Already added error above
  }

  // 6) Validate health metrics
  if (!validateHealthMetrics()) {
    // Already added error above
  }

  // 7) Validate lifecycle rules (advisory)
  if (!validateLifecycleRules()) {
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
    const entry = verifiedByRefs[k];
    // Handle both string (legacy) and object formats
    const ref = (entry && typeof entry === 'object' && entry.ref) ? entry.ref : entry;
    if (ref && (ref.endsWith('.feature') || ref.startsWith('features/'))) {
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

    // Helper to extract reference string from verified_by entry
    const getRefString = (entry) => {
      if (!entry) return '';
      if (typeof entry === 'string') return entry;
      if (entry.ref) return entry.ref;
      return JSON.stringify(entry);
    };

    if (vb.length === 0) {
      if (status !== 'retired') {
        errors.push(`Active capability '${cap.id}' has empty verified_by`);
      }
      continue;
    }
    for (let m = 0; m < vb.length; m++) {
      const ref = getRefString(vb[m]);
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
        const pth = getRefString(paths[p]);
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
    const testRefs = vb.filter(entry => {
      const r = getRefString(entry);
      return !r.endsWith('.feature') && !r.startsWith('features/');
    });
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

  if (!validateCodeOwners(repoRoot, data, errors, warnings)) {
    // Already added error above
  }

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