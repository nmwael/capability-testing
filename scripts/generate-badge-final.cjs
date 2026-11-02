#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Simple glob pattern expander using minimatch-like logic
function expandGlob(pattern) {
  const results = [];
  const isGlob = pattern.includes('*') || pattern.includes('**') || pattern.includes('?') || pattern.includes('[');
  
  if (!isGlob) {
    if (fs.existsSync(pattern)) {
      return [pattern];
    }
    return [];
  }
  
  // Split pattern into directory parts
  const parts = pattern.split('/');
  let currentDirs = ['.'];
  
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLast = i === parts.length - 1;
    const nextDirs = [];
    
    for (const dir of currentDirs) {
      if (!fs.existsSync(dir)) continue;
      
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      if (part === '**') {
        // Recursive directory match
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const fullPath = path.join(dir, entry.name);
            nextDirs.push(fullPath);
            // Also search recursively
            function walkRecursive(d) {
              try {
                const subEntries = fs.readdirSync(d, { withFileTypes: true });
                for (const subEntry of subEntries) {
                  if (subEntry.isDirectory()) {
                    nextDirs.push(path.join(d, subEntry.name));
                    walkRecursive(path.join(d, subEntry.name));
                  }
                }
              } catch (e) {}
            }
            walkRecursive(fullPath);
          }
        }
        // Also include current dir for ** matching zero directories
        if (!isLast) {
          nextDirs.push(dir);
        }
      } else if (part.includes('*') || part.includes('?') || part.includes('[')) {
        // Pattern match on filenames
        const regex = new RegExp('^' + part
          .replace(/\./g, '\\.')
          .replace(/\*/g, '.*')
          .replace(/\?/g, '.')
          .replace(/\[([^\]]+)\]/g, '[$1]') + '$');
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (regex.test(entry.name)) {
            if (isLast) {
              if (entry.isFile()) results.push(fullPath);
            } else if (entry.isDirectory()) {
              nextDirs.push(fullPath);
            }
          }
        }
      } else {
        // Exact match
        const fullPath = path.join(dir, part);
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          if (isLast) {
            if (stat.isFile()) results.push(fullPath);
          } else if (stat.isDirectory()) {
            nextDirs.push(fullPath);
          }
        }
      }
    }
    
    if (nextDirs.length === 0) break;
    currentDirs = [...new Set(nextDirs)]; // deduplicate
  }
  
  return [...new Set(results)]; // deduplicate
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    surefire: null,
    vitest: null,
    cucumber: null,
    jacoco: null,
    frontendCoverage: null,
    pit: null,
    features: null,
    out: null,
    summary: false,
  };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--surefire' && args[i + 1]) {
      result.surefire = args[++i];
    } else if (arg === '--vitest' && args[i + 1]) {
      result.vitest = args[++i];
    } else if (arg === '--cucumber' && args[i + 1]) {
      result.cucumber = args[++i];
    } else if (arg === '--jacoco' && args[i + 1]) {
      result.jacoco = args[++i];
    } else if (arg === '--frontend-coverage' && args[i + 1]) {
      result.frontendCoverage = args[++i];
    } else if (arg === '--pit' && args[i + 1]) {
      result.pit = args[++i];
    } else if (arg === '--features' && args[i + 1]) {
      result.features = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      result.out = args[++i];
    } else if (arg === '--summary') {
      result.summary = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: coverage-report.js [options]');
      console.log('Options:');
      console.log('  --surefire <path>          Path to surefire XML output (glob supported)');
      console.log('  --vitest <path>            Path to vitest XML output (glob supported)');
      console.log('  --cucumber <path>          Path to cucumber XML output (glob supported)');
      console.log('  --jacoco <path>            Path to jacoco XML output (glob supported)');
      console.log('  --frontend-coverage <path> Path to frontend coverage JSON (glob supported)');
      console.log('  --pit <path>               Path to PIT mutation XML (glob supported)');
      console.log('  --out <dir>                Output directory for HTML report');
      console.log('  --summary                  Include summary section');
      console.log('  --help, -h                 Show this help');
      console.log('  --features <path>          Path to feature directory for scenario extraction');
      process.exit(0);
    }
    i++;
  }
  return result;
}

// Parse coverage XML and extract test entries
function parseSurefireXml(xmlPath) {
  const content = fs.readFileSync(xmlPath, 'utf-8');
  const entries = [];
  const pattern = /<testcase[^>]*>([\s\S]*?)<\/testcase>/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const fullMatch = match[0];
    const name = fullMatch.match(/name="([^"]*)"/)?.[1] || '';
    
    // Extract scenario name from system-out CDATA content
    // Surefire Cucumber reports put the scenario name in system-out as "Scenario: <name>"
    // followed by ANSI escape codes and file references (&#27; or &amp#27;)
    const systemOutMatch = fullMatch.match(/<system-out[^>]*>[\s\S]*?Scenario:\s*([^\n<]+?)(?:\s*(?:&#27;|&amp#27;|\[90m|#\s+[^\s]+\.feature)|$)/);
    const scenarioName = systemOutMatch ? systemOutMatch[1].trim() : null;
    
    entries.push({
      name: scenarioName || name,
      rawName: name,
      coverage: fullMatch.match(/coverage="([0-9.]+)%?"|coverage="([0-9.]+)"/)?.[1] || fullMatch.match(/coverage="([0-9.]+)"/)?.[1],
    });
  }
  return entries;
}

// Parse vitest coverage XML and extract test entries
function parseVitestXml(xmlPath) {
  const content = fs.readFileSync(xmlPath, 'utf-8');
  const entries = [];
  const pattern = /<testcase[^>]*name="[^"]*"[^>]*>/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    entries.push({
      name: match[0].match(/name="([^"]*)"/)?.[1],
    });
  }
  return entries;
}

// Parse feature file to extract scenarios with @scenario: IDs and @req: tags
function parseFeatureFile(featurePath) {
  const content = fs.readFileSync(featurePath, 'utf-8');
  const scenarios = [];
  const scenarioRegex = /^(\s*)@scenario:SC-[\w-]+/gm;
  const reqRegex = /^(\s*)@req:[\w-]+/gm;
  const scenarioTextRegex = /^(\s*)Scenario: .+$/gm;

  // Collect all scenario matches with their positions in content
  const scenarioMatches = [];
  let match;
  while ((match = scenarioRegex.exec(content)) !== null) {
    const scenarioId = match[0].match(/@scenario:SC-[\w-]+/)?.[0];
    if (scenarioId) {
      scenarioMatches.push({
        scenarioId,
        index: match.index,
        name: '',
        reqIds: [],
      });
    }
  }

  // For each scenario, find @req: tags that appear after it but before the next scenario
  for (let i = 0; i < scenarioMatches.length; i++) {
    const scenario = scenarioMatches[i];
    const endIndex = i + 1 < scenarioMatches.length ? scenarioMatches[i + 1].index : content.length;

    let reqMatch;
    reqRegex.lastIndex = scenario.index;
    while ((reqMatch = reqRegex.exec(content)) !== null && reqMatch.index < endIndex) {
      const reqId = reqMatch[0].match(/@req:[\w-]+/)?.[0];
      if (reqId) {
        scenario.reqIds.push(reqId);
      }
    }
  }

  // Parse scenario names from Scenario: lines
  let scenarioTextMatch;
  let scenarioIdx = 0;
  while ((scenarioTextMatch = scenarioTextRegex.exec(content)) !== null) {
    if (scenarioIdx < scenarioMatches.length) {
      scenarioMatches[scenarioIdx].name = scenarioTextMatch[0].replace(/^(\s*)Scenario: /, '');
    }
    scenarioIdx++;
  }

  return scenarioMatches;
}

// Normalize test name to match scenario names
function normalizeTestName(testName) {
  // Strip Vitest prefix like "frontend toolchain > " or "alert-flow frontend spec > "
  const stripped = testName.split('>').pop() || testName;
  // Keep spaces for similarity, normalize punctuation
  return stripped.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Compute similarity between two strings using keyword overlap (Jaccard-like)
function computeSimilarity(str1, str2) {
  const words1 = new Set(str1.split(/\s+/).filter(w => w.length > 1));
  const words2 = new Set(str2.split(/\s+/).filter(w => w.length > 1));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  
  const union = words1.size + words2.size - intersection;
  return intersection / union;
}

// Match test names to scenarios using fuzzy matching
function matchTestsToScenarios(tests, scenarios) {
  const scenarioTestsMap = new Map(); // scenarioId -> {name, tests: []}
  const unmatchedTests = [];
  const unmatchedScenarios = [];
  
  for (const scenario of scenarios) {
    scenarioTestsMap.set(scenario.scenarioId, {
      scenarioId: scenario.scenarioId,
      name: scenario.name || '(unnamed)',
      reqIds: scenario.reqIds || [],
      tests: [],
    });
  }
  
  // Track which tests have already been matched to avoid duplicates
  const matchedTestKeys = new Set();
  
  for (const test of tests) {
    const normalizedTest = normalizeTestName(test.name);
    let bestMatch = null;
    let bestScore = 0;
    
    for (const [scenarioId, scenarioData] of scenarioTestsMap) {
      const normalizedScenario = normalizeTestName(scenarioData.name);
      
      // Try exact match first (after normalization)
      if (normalizedTest === normalizedScenario) {
        bestMatch = scenarioId;
        bestScore = 1;
        break;
      }
      
      // Fuzzy match using keyword similarity
      const score = computeSimilarity(normalizedTest, normalizedScenario);
      if (score > bestScore && score >= 0.25) { // Increased threshold from 0.15 to 0.25 to reduce false positives
        bestScore = score;
        bestMatch = scenarioId;
      }
    }
    
    if (bestMatch) {
      // Create a unique key for this test-scenario combination to avoid duplicates
      const testKey = `${test.name}::${bestMatch}`;
      if (!matchedTestKeys.has(testKey)) {
        scenarioTestsMap.get(bestMatch).tests.push(test);
        matchedTestKeys.add(testKey);
      }
    } else {
      unmatchedTests.push(test);
    }
  }
  
  // Find scenarios without tests
  for (const [scenarioId, scenarioData] of scenarioTestsMap) {
    if (scenarioData.tests.length === 0) {
      unmatchedScenarios.push({
        scenarioId,
        name: scenarioData.name,
        reqIds: scenarioData.reqIds,
      });
    }
  }
  
  return {
    scenarioTestsMap,
    unmatchedTests,
    unmatchedScenarios,
  };
}


// Generate HTML report - matching the main site design exactly
function generateHtmlReport(entries, scenarioTestsMap, unmatchedTests, unmatchedScenarios, summary, outDir) {
  // Group scenarios by capability
  const capabilityMap = new Map();
  for (const [scenarioId, scenarioData] of scenarioTestsMap) {
    // Extract capability ID from scenario ID (e.g., SC-ALERT-001 -> alert)
    const capabilityMatch = scenarioId.match(/SC-([A-Z]+)-\d+/);
    const capability = capabilityMatch ? capabilityMatch[1].toLowerCase() : 'unknown';
    if (!capabilityMap.has(capability)) {
      capabilityMap.set(capability, []);
    }
    capabilityMap.get(capability).push({ scenarioId, scenarioData });
  }

  // Sort capabilities
  const sortedCapabilities = Array.from(capabilityMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  // Calculate summary stats
  const totalTests = entries.length;
  const coveredTests = entries.filter(e => e.coverage).length;
  const scenariosWithTests = scenarioTestsMap.size - unmatchedScenarios.length;
  const scenariosWithoutTests = unmatchedScenarios.length;
  const testsWithoutTraceability = unmatchedTests.length;
  
  // Calculate capability health scores
  const capabilityStats = new Map();
  for (const [capability, scenarios] of capabilityMap) {
    let totalTests = 0;
    let matchedTests = 0;
    let totalCoverage = 0;
    let coverageCount = 0;
    let totalMutation = 0;
    let mutationCount = 0;
    let totalFlakiness = 0;
    let flakinessCount = 0;
    let latestRun = null;
    
    for (const { scenarioData } of scenarios) {
      totalTests += scenarioData.tests.length;
      for (const test of scenarioData.tests) {
        if (test.coverage !== undefined) {
          const cov = parseInt(test.coverage);
          if (!isNaN(cov)) { totalCoverage += cov; coverageCount++; }
        }
        if (test.mutation_score !== undefined) {
          const v = parseInt(test.mutation_score);
          if (!isNaN(v)) { totalMutation += v; mutationCount++; }
        }
        if (test.flakiness !== undefined) {
          const v = parseFloat(test.flakiness);
          if (!isNaN(v)) { totalFlakiness += v; flakinessCount++; }
        }
        if (test.last_run) {
          const d = new Date(test.last_run);
          if (!isNaN(d.getTime()) && (!latestRun || d > latestRun)) latestRun = d;
        }
      }
      matchedTests += scenarioData.tests.length;
    }
    if (coverageCount === 0 && mutationCount === 0) return null;
    
    const coverageAvg = coverageCount > 0 ? totalCoverage / coverageCount : 50;
    const mutationAvg = mutationCount > 0 ? totalMutation / mutationCount : 50;
    const flakinessAvg = flakinessCount > 0 ? totalFlakiness / flakinessCount : 0.1;
    
    let freshness = 1.0;
    if (latestRun) {
      const daysSinceRun = (Date.now() - latestRun.getTime()) / (1000 * 60 * 60 * 24);
      freshness = Math.max(0, 1 - daysSinceRun / 365);
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

  function readCapabilities() {
    const capsPath = '/workspaces/capability-testing/capabilities/capabilities.yml';
    const text = readFileSync(capsPath, 'utf8');
    const lines = text.split('\n');
    const caps = [];
    let currentCap = null;
    let inVerifiedBy = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      if (trimmed === 'capabilities:') continue;
      if (trimmed === 'plans:') continue;
      
      const capMatch = trimmed.match(/^-\s+id:\s*(.+)$/);
      if (capMatch) {
        currentCap = { verified_by: [] };
        currentCap.id = capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
        inVerifiedBy = false;
        caps.push(currentCap);
        continue;
      }
      if (!currentCap) continue;
      
      const lanesMatch = line.match(/^ {4}lanes:\s*\[(.+)\]/);
      if (lanesMatch) { currentCap.lanes = lanesMatch[1].split(',').map(l => l.trim().replace(/^['"]|['"]$/g, '')); continue; }
      const depsMatch = line.match(/^ {4}dependencies:\s*\[(.+)\]/);
      if (depsMatch) { currentCap.dependencies = depsMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, '')); continue; }
      const lifecycleMatch = line.match(/^ {4}lifecycle_state:\s*(.*)$/);
      if (lifecycleMatch) { let val = lifecycleMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.lifecycle_state = val; } continue; }
      const githubMatch = line.match(/^ {4}github_team:\s*(.*)$/);
      if (githubMatch) { let val = githubMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.github_team = val; } continue; }
      const kv = line.match(/^ {4}(\w+):\s*(.*)$/);
      if (kv) { currentCap._inVb = false; const key = kv[1]; let val = kv[2].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val === '') { inVerifiedBy = key === 'verified_by'; if (inVerifiedBy) currentCap.verified_by = []; continue; } val = val.replace(/^['"]|['"]$/g, ''); currentCap[key] = val; inVerifiedBy = false; continue; }
      if (inVerifiedBy && trimmed.startsWith('-')) {
        const item = trimmed.replace(/^-\s*/, '').trim();
        if (item.startsWith('type:')) {
          const obj = {};
          const parts = item.split(',').map(p => p.trim());
          for (const part of parts) {
            const kvMatch = part.match(/^(\w+):\s*(.+)$/);
            if (kvMatch) {
              obj[kvMatch[1].trim()] = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');
            }
          }
          currentCap.verified_by.push(obj);
          currentCap._vbObjMode = true;
        } else {
          currentCap.verified_by.push({ type: 'unknown', ref: item.replace(/^['"]|['"]$/g, '').replace(/\s*#.*$/, '').trim() });
          currentCap._vbObjMode = false;
        }
        continue;
      }
      if (currentCap._vbObjMode && line.startsWith('      ') && !trimmed.startsWith('-')) {
        const fieldMatch = line.match(/^ {8}(\w+):\s*(.*)$/);
        if (fieldMatch && currentCap.verified_by.length > 0) {
          const key = fieldMatch[1];
          let val = fieldMatch[2].replace(/^['"]|['"]$/g, '').trim();
          if (val) {
            const lastEntry = currentCap.verified_by[currentCap.verified_by.length - 1];
            if (lastEntry && typeof lastEntry === 'object') {
              lastEntry[key] = val;
            }
        }
        continue;
      }
      if (currentCap._vbObjMode && !line.startsWith('        ')) {
        currentCap._vbObjMode = false;
      }
      inVerifiedBy = false;
    }
  }
  return caps;
}

function computeHealth(cap) {
  const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
  let cs = 0, ms = 0, fl = 0, cc = 0, mc = 0, fc = 0, lr = null;
  
  for (const e of vb) {
    if (!e || typeof e !== 'object') continue;
    if (e.coverage !== undefined) { const v = parseInt(e.coverage); if (!isNaN(v)) { cs += v; cc++; } }
    if (e.mutation_score !== undefined) { const v = parseInt(e.mutation_score); if (!isNaN(v)) { ms += v; mc++; } }
    if (e.flakiness !== undefined) { const v = parseFloat(e.flakiness); if (!isNaN(v)) { fl += v; fc++; } }
    if (e.last_run) { const d = new Date(e.last_run); if (!isNaN(d.getTime()) && (!lr || d > lr)) lr = d; }
  }
  if (cc === 0 && mc === 0) return null;
  const ca = cc > 0 ? cs / cc : 50;
  const ma = mc > 0 ? ms / mc : 50;
  const fa = fc > 0 ? fl / fc : 0.1;
  let fr = 1;
  if (lr) { const ds = (Date.now() - lr.getTime()) / (1000 * 60 * 60 * 24); fr = Math.max(0, 1 - ds / 365); }
  const hs = Math.round(ca * 0.4 + ma * 0.3 + (1 - fa) * 100 * 0.2 + fr * 100 * 0.1);
  return Math.max(0, Math.min(100, hs));
}

function readCapabilities() {
  const capsPath = '/workspaces/capability-testing/capabilities/capabilities.yml';
  const text = fs.readFileSync(capsPath, 'utf8');
  const lines = text.split('\n');
  const caps = [];
  let currentCap = null;
  let inVerifiedBy = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'capabilities:') continue;
    if (trimmed === 'plans:') continue;
    
    const capMatch = line.match(/^ {2}- id:\s*(.+)$/);
    if (capMatch) {
      currentCap = { verified_by: [] };
      currentCap.id = capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
      inVerifiedBy = false;
      caps.push(currentCap);
      continue;
    }
    if (!currentCap) continue;
    
    const lanesMatch = line.match(/^ {4}lanes:\s*\[(.+)\]/);
    if (lanesMatch) { currentCap.lanes = lanesMatch[1].split(',').map(l => l.trim().replace(/^['"]|['"]$/g, '')); continue; }
    const depsMatch = line.match(/^ {4}dependencies:\s*\[(.+)\]/);
    if (depsMatch) { currentCap.dependencies = depsMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, '')); continue; }
    const lifecycleMatch = line.match(/^ {4}lifecycle_state:\s*(.*)$/);
    if (lifecycleMatch) { let val = lifecycleMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.lifecycle_state = val; } continue; }
    const githubMatch = line.match(/^ {4}github_team:\s*(.*)$/);
    if (githubMatch) { let val = githubMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.github_team = val; } continue; }
    const kv = line.match(/^ {4}(\w+):\s*(.*)$/);
    if (kv) { const key = kv[1]; let val = kv[2].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val === '') { inVerifiedBy = key === 'verified_by'; if (inVerifiedBy) currentCap.verified_by = []; continue; } val = val.replace(/^['"]|['"]$/g, ''); currentCap[key] = val; inVerifiedBy = false; continue; }
    if (inVerifiedBy) {
      const listItem = line.match(/^ {6}- \s*(.+)$/);
      if (listItem) {
        let v = listItem[1].trim();
        if (v.startsWith('type:')) {
          const obj = {};
          const parts = v.split(',').map(p => p.trim());
          for (const part of parts) {
            const kvMatch = part.match(/^(\w+):\s*(.+)$/);
            if (kvMatch) {
              obj[kvMatch[1].trim()] = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');
            }
          }
          currentCap.verified_by.push(obj);
          currentCap._vbObjMode = true;
        } else {
          currentCap.verified_by.push({ type: 'unknown', ref: item.replace(/^['"]|['"]$/g, '').replace(/\s*#.*$/, '').trim() });
          currentCap._vbObjMode = false;
        }
        continue;
      }
      if (currentCap._vbObjMode && line.startsWith('      ') && !trimmed.startsWith('-')) {
        const fieldMatch = line.match(/^ {8}(\w+):\s*(.*)$/);
        if (fieldMatch && currentCap.verified_by.length > 0) {
          const key = fieldMatch[1];
          let val = fieldMatch[2].replace(/^['"]|['"]$/g, '').trim();
          if (val) {
            const lastEntry = currentCap.verified_by[currentCap.verified_by.length - 1];
            if (lastEntry && typeof lastEntry === 'object') {
              lastEntry[key] = val;
            }
          }
          continue;
      }
      if (currentCap._vbObjMode && !line.startsWith('      ')) {
        currentCap._vbObjMode = false;
      }
      inVerifiedBy = false;
    }
  }
  return caps;
}

function computeHealth(cap) {
  const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
  let cs = 0, ms = 0, fl = 0, cc = 0, mc = 0, fc = 0, lr = null;
  
  for (const e of vb) {
    if (!e || typeof e !== 'object') continue;
    if (e.coverage !== undefined) { const v = parseInt(e.coverage); if (!isNaN(v)) { cs += v; cc++; } }
    if (e.mutation_score !== undefined) { const v = parseInt(e.mutation_score); if (!isNaN(v)) { ms += v; mc++; } }
    if (e.flakiness !== undefined) { const v = parseFloat(e.flakiness); if (!isNaN(v)) { fl += v; fc++; } }
    if (e.last_run) { const d = new Date(e.last_run); if (!isNaN(d.getTime()) && (!lr || d > lr)) lr = d; }
  }
  if (cc === 0 && mc === 0) return null;
  const ca = cc > 0 ? cs / cc : 50;
  const ma = mc > 0 ? ms / mc : 50;
  const fa = fc > 0 ? fl / fc : 0.1;
  let fr = 1;
  if (lr) { const ds = (Date.now() - lr.getTime()) / (1000 * 60 * 60 * 24); fr = Math.max(0, 1 - ds / 365); }
  const hs = Math.round(ca * 0.4 + ma * 0.3 + (1 - fa) * 100 * 0.2 + fr * 100 * 0.1);
  return Math.max(0, Math.min(100, hs));
}

function getCurrentHealth() {
  const caps = readCapabilities();
  const health = {};
  for (const cap of caps) {
    const score = computeHealth(cap);
    if (score !== null) health[cap.id] = score;
  }
  return health;
}

const BASELINE_FILE = '/workspaces/capability-testing/.capability-baseline.json';
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('fs');
const { resolve } = require('path');

function loadBaseline() { if (existsSync(BASELINE_FILE)) return JSON.parse(readFileSync(BASELINE_FILE, 'utf8')); return {}; }
function saveBaseline(health) { writeFileSync('/workspaces/capability-testing/.capability-baseline.json', JSON.stringify(health, null, 2)); }

function checkRegression(current, baseline) {
  const regressions = [];
  for (const [id, currentScore] of Object.entries(current)) {
    const baselineScore = baseline[id];
    if (baselineScore !== undefined) {
      const drop = baselineScore - currentScore;
      if (drop > 5) {
        console.log(`REGRESSION: ${id} health dropped ${drop}% (${baselineScore} -> ${currentScore})`);
        regressions.push({ id, type: 'health_drop', baseline: baselineScore, current: currentScore, drop });
      }
    }
    if (baselineScore === undefined) console.log(`NEW CAPABILITY: ${id} (health: ${currentScore})`);
  }
  for (const id of Object.keys(baseline)) { if (!current[id]) console.log(`REMOVED CAPABILITY: ${id}`); }
  return regressions;
}

function main() {
  console.log('Generating badge...');
  const health = getCurrentHealth();
  console.log('Health scores:', health);

  const scores = Object.values(health);
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

  const color = avg >= 80 ? 'brightgreen' : avg >= 60 ? 'yellow' : 'red';

  const badge = {
    schemaVersion: 1,
    label: 'Capability Health',
    message: `${avg}%`,
    color: color,
    labelColor: '555',
    isError: false,
    namedLogo: 'github',
    link: 'https://nmwael.github.io/capability-testing/coverage/'
  };

  const { writeFileSync, mkdirSync } = require('fs');
  const { resolve } = require('path');
  mkdirSync(resolve('/workspaces/capability-testing/docs/coverage'), { recursive: true });
  writeFileSync('/workspaces/capability-testing/docs/coverage/badge.json', JSON.stringify(badge, null, 2));

  console.log(`Badge generated: ${avg}% (${color})`);
  console.log(`Written to docs/coverage/badge.json`);
}

main();}

}
