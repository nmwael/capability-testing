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


// Generate HTML report
function generateHtmlReport(entries, scenarioTestsMap, unmatchedTests, unmatchedScenarios, summary, outDir) {
  // Group scenarios by capability
  const capabilityMap = new Map();
  for (const [scenarioId, scenarioData] of scenarioTestsMap) {
    // Extract capability ID from scenario ID (e.g., SC-ALERT-001 -> alert.route)
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
    for (const { scenarioData } of scenarios) {
      totalTests += scenarioData.tests.length;
      matchedTests += scenarioData.tests.length;
      for (const test of scenarioData.tests) {
        if (test.coverage) {
          totalCoverage += parseFloat(test.coverage);
          coverageCount++;
        }
      }
    }
    const avgCoverage = coverageCount > 0 ? Math.round(totalCoverage / coverageCount) : 0;
    capabilityStats.set(capability, {
      totalScenarios: scenarios.length,
      coveredScenarios: scenarios.filter(s => s.scenarioData.tests.length > 0).length,
      totalTests,
      matchedTests,
      avgCoverage: coverageCount > 0 ? Math.round(totalCoverage / coverageCount) : 0,
    });
  }

  // Calculate overall stats
  const totalScenarios = scenarioTestsMap.size;
  const coveredScenarios = scenarioTestsMap.size - unmatchedScenarios.length;
  const totalTests = entries.length;
  const testsWithCoverage = entries.filter(e => e.coverage).length;
  const avgCoverage = entries.filter(e => e.coverage).length > 0 
    ? Math.round(entries.filter(e => e.coverage).reduce((sum, e) => sum + parseFloat(e.coverage), 0) / entries.filter(e => e.coverage).length) 
    : 0;

  // Generate capability cards
  const capabilityCards = sortedCapabilities.map(([capability, scenarios]) => {
    const stats = capabilityStats.get(capability);
    const displayName = capability.charAt(0).toUpperCase() + capability.slice(1);
    const covered = scenarios.filter(s => s.scenarioData.tests.length > 0).length;
    const total = scenarios.length;
    const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
    const color = percentage >= 80 ? '#4caf50' : percentage >= 50 ? '#ff9800' : '#f44336';
    
    let scenarioRows = scenarios.map(({ scenarioId, scenarioData }) => {
      const hasTests = scenarioData.tests.length > 0;
      const testCount = scenarioData.tests.length;
      const reqIds = scenarioData.reqIds.length > 0 ? scenarioData.reqIds.join(', ') : 'None';
      const coverage = scenarioData.tests.find(t => t.coverage) ? scenarioData.tests.find(t => t.coverage).coverage : 'N/A';
      
      return `
        <div class="scenario-row ${scenarioData.tests.length === 0 ? 'uncovered' : ''}">
          <div class="scenario-id">${escapeHtml(scenarioId)}</div>
          <div class="scenario-name">${escapeHtml(scenarioData.name || '(unnamed)')}</div>
          <div class="scenario-reqs">Req: ${escapeHtml(reqIds)}</div>
          <div class="scenario-tests">${testCount} test(s)</div>
          <div class="scenario-coverage">Coverage: ${coverage}</div>
          <div class="scenario-status ${scenarioData.tests.length === 0 ? 'uncovered' : 'covered'}">
            ${scenarioData.tests.length === 0 ? '⚠ No tests' : '✓ Covered'}
          </div>
        </div>
      `;
    }).join('');
    
    return `
      <div class="capability-card">
        <div class="capability-header" style="border-left: 4px solid ${color};">
          <h3>${escapeHtml(displayName)}</h3>
          <div class="capability-stats">
            <span class="stat"><strong>${covered}/${total}</strong> scenarios covered</span>
            <span class="stat"><strong>${stats.totalTests}</strong> tests</span>
            <span class="stat"><strong>${stats.avgCoverage}%</strong> avg coverage</span>
            <span class="stat percentage" style="color: ${color};">${percentage}%</span>
          </div>
        </div>
        <div class="scenario-list">
          ${scenarioRows}
        </div>
      </div>
    `;
  }).join('');

  // Generate unmatched scenarios section
  const unmatchedScenariosHtml = unmatchedScenarios.length > 0 ? `
    <div class="section">
      <h2>Scenarios Without Test Coverage</h2>
      <div class="unmatched-list">
        ${unmatchedScenarios.map(s => `
          <div class="uncovered-item">
            <h4>${escapeHtml(s.scenarioId)} - ${escapeHtml(s.name)}</h4>
            <div class="reqs">Requirements: ${escapeHtml(s.reqIds.join(', ') || 'None')}</div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  // Generate unmatched tests section
  const unmatchedTestsHtml = unmatchedTests.length > 0 ? `
    <div class="section">
      <h2>Tests Without Scenario Traceability (${unmatchedTests.length})</h2>
      <div class="unmatched-list">
        ${unmatchedTests.map(t => `
          <div class="orphan-item">
            <h4>${escapeHtml(t.name)}</h4>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Capability Coverage Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #fafafa; color: #333; line-height: 1.5; }
    .header { 
      display: flex; justify-content: space-between; align-items: center; 
      padding: 16px 20px; background: #fff; border-bottom: 1px solid #e0e0e0; 
      position: sticky; top: 0; z-index: 100; box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    }
    .header h1 { margin: 0; font-size: 1.5rem; color: #333; }
    .nav-links { display: flex; gap: 16px; }
    .nav-links a { color: #1976d2; text-decoration: none; font-weight: 500; }
    .nav-links a:hover { text-decoration: underline; }
    .back-link { background: #1976d2; color: white; padding: 8px 16px; border-radius: 4px; text-decoration: none; font-weight: 500; }
    .back-link:hover { background: #1565c0; }
    
    .container { max-width: 1200px; margin: 0 auto; padding: 20px; }
    
    .summary-dashboard {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 24px;
      border-radius: 12px;
      margin-bottom: 24px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    .summary-dashboard h2 { margin: 0 0 16px 0; font-size: 1.25rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
    .stat-card { background: rgba(255,255,255,0.15); padding: 16px; border-radius: 8px; backdrop-filter: blur(10px); }
    .stat-value { font-size: 2rem; font-weight: 700; line-height: 1; }
    .stat-label { font-size: 0.85rem; opacity: 0.9; margin-top: 4px; }
    
    .search-box {
      margin-bottom: 24px;
      position: relative;
    }
    .search-box input {
      width: 100%; padding: 12px 16px; font-size: 1rem;
      border: 2px solid #e0e0e0; border-radius: 8px;
      font-family: inherit; transition: border-color 0.2s;
    }
    .search-box input:focus { outline: none; border-color: #1976d2; }
    
    .capability-tabs {
      display: flex; gap: 8px; margin-bottom: 24px; flex-wrap: wrap;
      border-bottom: 2px solid #e0e0e0; padding-bottom: 8px;
    }
    .capability-tab {
      padding: 10px 20px; background: #f5f5f5; border: none; border-radius: 6px;
      cursor: pointer; font-weight: 500; color: #666;
      transition: all 0.2s; font-size: 0.9rem;
    }
    .capability-tab:hover { background: #e8eaf6; color: #3f51b5; }
    .capability-tab.active { background: #3f51b5; color: white; }
    
    .capability-panel { display: none; }
    .capability-panel.active { display: block; animation: fadeIn 0.2s ease; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    
    .capability-card {
      background: white; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 20px; overflow: hidden; border: 1px solid #eee;
    }
    .capability-header {
      padding: 16px 20px; font-weight: 600; font-size: 1.1rem;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #eee;
    }
    .capability-stats {
      display: flex; gap: 20px; flex-wrap: wrap; margin-top: 8px;
      font-size: 0.85rem; color: #666;
    }
    .capability-stats .stat { display: flex; align-items: center; gap: 4px; }
    .capability-stats strong { color: #333; }
    
    .scenario-list { padding: 0 20px 20px; }
    .scenario-row {
      display: grid; grid-template-columns: 140px 1fr 200px 120px 100px 100px;
      gap: 16px; align-items: center; padding: 12px 0;
      border-bottom: 1px solid #f0f0f0; font-size: 0.85rem;
    }
    .scenario-row:last-child { border-bottom: none; }
    .scenario-row.uncovered { background: #fff8f0; }
    .scenario-id { font-family: monospace; font-size: 0.8rem; color: #666; }
    .scenario-name { font-weight: 500; color: #333; }
    .scenario-reqs { font-size: 0.75rem; color: #d32f2f; font-family: monospace; }
    .scenario-tests { color: #1976d2; font-weight: 500; }
    .scenario-coverage { font-family: monospace; color: #666; }
    .scenario-status { font-weight: 500; }
    .scenario-status.covered { color: #4caf50; }
    .scenario-status.uncovered { color: #ff9800; }
    
    .section { margin-top: 32px; }
    .section h2 { font-size: 1.25rem; color: #333; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid #e0e0e0; }
    
    .unmatched-list, .orphan-list { display: flex; flex-direction: column; gap: 12px; }
    .uncovered-item, .orphan-item {
      background: #fff8e1; border-left: 4px solid #ff9800;
      padding: 16px; border-radius: 4px;
    }
    .uncovered-item h4, .orphan-item h4 { margin: 0 0 8px 0; color: #e65100; }
    .reqs { font-size: 0.85rem; color: #d32f2f; font-family: monospace; }
    
    .test-entry { background: #f5f5f5; border-radius: 6px; padding: 12px; margin: 8px 0; }
    .test-name { font-weight: 600; margin-bottom: 4px; }
    .test-scenario { color: #1565c0; font-size: 0.85rem; }
    .coverage { color: #2e7d32; font-weight: 600; }
    .missing { color: #ef5350; font-weight: 600; }
    
    .summary { background: #e3f2fd; padding: 20px; margin: 24px 0; border-radius: 8px; border-left: 4px solid #1976d2; }
    .summary h2 { margin: 0 0 12px 0; }
    .summary-stats { display: flex; flex-wrap: wrap; gap: 24px; }
    .summary-stats span { font-weight: 600; color: #1565c0; }
    
    .uncovered { background: #fff3e0; border-left: 4px solid #ff9800; padding: 16px; margin: 16px 0; border-radius: 4px; }
    .uncovered h3 { margin: 0 0 8px 0; color: #e65100; }
    .uncovered h4 { margin: 8px 0 4px 0; color: #e65100; }
    .reqs { font-size: 0.85rem; color: #d32f2f; font-family: monospace; margin: 4px 0; }
    
    .orphan { background: #e8f5e9; border-left: 4px solid #43a047; padding: 16px; margin: 16px 0; border-radius: 4px; }
    .orphan h3 { margin: 0 0 8px 0; color: #2e7d32; }
    
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e0e0e0; text-align: center; color: #999; font-size: 0.85rem; }
    
    .hidden { display: none !important; }
    
    @media (max-width: 768px) {
      .scenario-row { grid-template-columns: 1fr; gap: 8px; }
      .scenario-id, .scenario-reqs, .scenario-tests, .scenario-coverage, .scenario-status { display: none; }
      .capability-stats { flex-direction: column; gap: 4px; }
      .header { flex-direction: column; gap: 12px; align-items: flex-start; }
    }
  </style>
  <script>
    function showTab(tabName) {
      document.querySelectorAll('.capability-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.capability-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('panel-' + tabName).classList.add('active');
      document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
    }
    
    function filterScenarios(input) {
      const filter = input.value.toLowerCase();
      document.querySelectorAll('.scenario-row').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.classList.toggle('hidden', !text.includes(filter));
      });
      document.querySelectorAll('.capability-panel.active .scenario-row').forEach(row => {
        const hasVisible = !row.classList.contains('hidden');
        const panel = row.closest('.capability-panel');
        if (panel) {
          const visibleRows = panel.querySelectorAll('.scenario-row:not(.hidden)');
          const header = panel.querySelector('.capability-header');
          if (header) {
            const count = visibleRows.length;
            const total = panel.querySelectorAll('.scenario-row').length;
            if (count !== total) {
              header.textContent = header.textContent.replace(/\\d+\\/\\d+/, count + '/' + total);
            }
          }
        }
      });
    }
    
    document.addEventListener('DOMContentLoaded', () => {
      // Initialize first tab
      const firstTab = document.querySelector('.capability-tab');
      if (firstTab) {
        const firstPanel = firstTab.dataset.tab;
        showTab(firstPanel);
      }
    });
  </script>
</head>
<body>
  <header class="header">
    <h1>Capability Coverage Report</h1>
    <nav class="nav-links">
      <a href="/capability-testing/" class="back-link">← Back to Home</a>
      <a href="/capability-testing/capabilities">Capabilities</a>
      <a href="/capability-testing/reports">CI & Reports</a>
      <a href="/capability-testing/governance">Governance</a>
    </nav>
  </header>
  
  <div class="container">
    <div class="header-actions">
      <a href="/capability-testing/" class="back-link">← Back to Home</a>
    </div>
    
    <div class="summary-dashboard">
      <h2>Coverage Summary</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${totalScenarios}</div>
          <div class="stat-label">Total Scenarios</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${coveredScenarios}</div>
          <div class="stat-label">Covered</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${unmatchedScenarios.length}</div>
          <div class="stat-label">Uncovered</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${totalTests}</div>
          <div class="stat-label">Total Tests</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${avgCoverage}%</div>
          <div class="stat-label">Avg Coverage</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${unmatchedTests.length}</div>
          <div class="stat-label">Orphan Tests</div>
        </div>
      </div>
    </div>
    
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="🔍 Search scenarios by name, ID, or requirement..." oninput="filterScenarios(this)" placeholder="🔍 Search scenarios by name, ID, or requirement...">
    </div>
    
    <div class="capability-tabs" role="tablist">
      ${sortedCapabilities.map(([capability, scenarios]) => {
        const displayName = capability.charAt(0).toUpperCase() + capability.slice(1);
        const covered = scenarios.filter(s => s.scenarioData.tests.length > 0).length;
        const total = scenarios.length;
        const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
        const isActive = capability === sortedCapabilities[0][0];
        const tabClass = `capability-tab${isActive ? ' active' : ''}`;
        return `<button class="${tabClass}" data-tab="${capability}" role="tab" onclick="showTab('${capability}')">${escapeHtml(displayName)} <span style="opacity:0.7;">(${covered}/${total})</span></button>`;
      }).join('')}
    </div>
    
    ${capabilityCards}
    
    ${unmatchedScenariosHtml}
    ${unmatchedTestsHtml}
    
    <footer class="footer">
      Generated by Capability Coverage Report • ${new Date().toISOString().split('T')[0]} • 
      <a href="https://github.com/nmwael/capability-testing" target="_blank">GitHub</a>
    </footer>
  </div>
  
  <script>
    function showTab(tabName) {
      document.querySelectorAll('.capability-panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.capability-tab').forEach(t => t.classList.remove('active'));
      document.getElementById('panel-' + tabName).classList.add('active');
      document.querySelector('[data-tab="' + tabName + '"]').classList.add('active');
    }
    
    function filterScenarios(input) {
      const filter = input.value.toLowerCase();
      document.querySelectorAll('.scenario-row').forEach(row => {
        const text = row.textContent.toLowerCase();
        row.classList.toggle('hidden', !text.includes(filter));
      });
      document.querySelectorAll('.capability-panel.active .scenario-row').forEach(row => {
        const hasVisible = !row.classList.contains('hidden');
        const panel = row.closest('.capability-panel');
        if (panel) {
          const visibleRows = panel.querySelectorAll('.scenario-row:not(.hidden)');
          const header = panel.querySelector('.capability-header');
          if (header) {
            const count = visibleRows.length;
            const total = panel.querySelectorAll('.scenario-row').length;
            if (count !== total) {
              header.textContent = header.textContent.replace(/\\d+\\/\\d+/, count + '/' + total);
            }
          }
        });
      });
    }
    
    document.addEventListener('DOMContentLoaded', () => {
      // Initialize first tab
      const firstTab = document.querySelector('.capability-tab');
      if (firstTab) {
        const firstPanel = firstTab.dataset.tab;
        showTab(firstPanel);
      }
    });
  </script>
</body>
</html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');
}

// Escape HTML special characters
function escapeHtml(str) {
  return str.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>').replace(/"/g, '"');
}

// Main function
function main() {
  const args = parseArgs();
  const entries = [];
  const repoRoot = process.cwd();
  
  // Expand globs for all file path arguments
  const surefireFiles = args.surefire ? expandGlob(args.surefire) : [];
  const vitestFiles = args.vitest ? expandGlob(args.vitest) : [];
  const cucumberFiles = args.cucumber ? expandGlob(args.cucumber) : [];
  const jacocoFiles = args.jacoco ? expandGlob(args.jacoco) : [];
  const frontendCoverageFiles = args.frontendCoverage ? expandGlob(args.frontendCoverage) : [];
  const pitFiles = args.pit ? expandGlob(args.pit) : [];

  // Parse surefire XML files
  for (const file of surefireFiles) {
    const surefireEntries = parseSurefireXml(file);
    entries.push(...surefireEntries);
  }

  // Parse vitest XML files
  for (const file of vitestFiles) {
    const vitestEntries = parseVitestXml(file);
    entries.push(...vitestEntries);
  }

  const outDir = args.out;

  if (!args.out) {
    console.error('Error: --out is required');
    process.exit(1);
  }

  // Parse feature files to get scenario IDs and @req: tags
  let scenarioTestsMap = new Map();
  let unmatchedTests = [];
  let unmatchedScenarios = [];
  
  if (args.features) {
    const featureDir = path.resolve(args.features);
    
    // Recursively find all .feature files
    const featureFiles = [];
    function walkDir(dir) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.name.endsWith('.feature')) {
          featureFiles.push(fullPath);
        }
      }
      return featureFiles;
    }
    walkDir(featureDir);
    
    for (const featurePath of featureFiles) {
      const scenarios = parseFeatureFile(featurePath);
      
      for (const scenario of scenarios) {
        scenarioTestsMap.set(scenario.scenarioId, {
          scenarioId: scenario.scenarioId,
          name: scenario.name || '(unnamed)',
          reqIds: scenario.reqIds || [],
          tests: [],
        });
      }
    }
  }

  // Match tests to scenarios
  const matchResult = matchTestsToScenarios(entries, Array.from(scenarioTestsMap.values()));
  scenarioTestsMap = matchResult.scenarioTestsMap;
  unmatchedTests = matchResult.unmatchedTests;
  unmatchedScenarios = matchResult.unmatchedScenarios;

  generateHtmlReport(entries, scenarioTestsMap, unmatchedTests, unmatchedScenarios, args.summary, outDir);

  console.log(`Coverage report generated at ${outDir}/index.html`);
  console.log(`Total entries: ${entries.length}`);
  console.log(`Scenarios with Tests: ${scenarioTestsMap.size - unmatchedScenarios.length}`);
  console.log(`Scenarios without Tests: ${unmatchedScenarios.length}`);
  console.log(`Tests without Traceability: ${unmatchedTests.length}`);
  process.exit(0);
}

main();