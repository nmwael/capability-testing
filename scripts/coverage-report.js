#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    surefire: null,
    vitest: null,
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
    } else if (arg === '--features' && args[i + 1]) {
      result.features = args[++i];
    } else if (arg === '--out' && args[i + 1]) {
      result.out = args[++i];
    } else if (arg === '--summary') {
      result.summary = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log('Usage: coverage-report.js [options]');
      console.log('Options:');
      console.log('  --surefire <path>   Path to surefire XML output');
      console.log('  --vitest <path>     Path to vitest XML output');
      console.log('  --out <dir>         Output directory for HTML report');
      console.log('  --summary           Include summary section');
      console.log('  --help, -h          Show this help');
      console.log('  --features <path>   Path to feature directory for scenario extraction');
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
  return stripped.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/_/g, '');
}

// Match test names to scenarios
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
  
  for (const test of tests) {
    const normalizedTest = normalizeTestName(test.name);
    let matched = false;
    
    for (const [scenarioId, scenarioData] of scenarioTestsMap) {
      const normalizedScenario = normalizeTestName(scenarioData.name);
      if (normalizedTest === normalizedScenario) {
        scenarioData.tests.push(test);
        matched = true;
        break;
      }
    }
    
    if (!matched) {
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
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Coverage Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    h1 { color: #333; }
    h2 { color: #555; margin-top: 20px; }
    .test-entry { margin: 10px 0; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .test-name { font-weight: bold; }
    .test-scenario { color: #1565c0; font-size: 0.9em; }
    .test-file { color: #666; font-size: 0.8em; }
    .test-req { color: #d32f2f; font-size: 0.8em; }
    .coverage { color: #2e7d32; font-weight: bold; }
    .missing { color: #ef5350; font-weight: bold; }
    .summary { background: #e3f2fd; padding: 15px; margin: 20px 0; border-radius: 4px; }
    .summary h2 { margin: 0 0 10px 0; }
    .summary-stats { display: flex; gap: 30px; }
    .summary-stats span { font-weight: bold; }
    .uncovered { background: #ffebee; border-left: 3px solid #ef5350; }
    .uncovered h3 { margin: 0 0 5px 0; color: #ef5350; }
    .no-tests { background: #fff3e0; border-left: 3px solid #ff9800; }
    .no-tests h3 { margin: 0 0 5px 0; color: #ff9800; }
    .orphan { background: #e8f5e9; border-left: 3px solid #43a047; }
    .orphan h3 { margin: 0 0 5px 0; color: #43a047; }
  </style>
</head>
<body>
  <h1>Coverage Report</h1>
  ${summary ? '<div class="summary"><h2>Summary</h2><div class="summary-stats"><span>Tests: ' + entries.length + '</span><span>Covered: ' + entries.filter(e => e.coverage).length + '</span><span>Scenarios with Tests: ' + (scenarioTestsMap.size - unmatchedScenarios.length) + '</span><span>Scenarios without Tests: ' + unmatchedScenarios.length + '</span><span>Tests without Traceability: ' + unmatchedTests.length + '</span></div></div>' : ''}
  <h2>Test Coverage</h2>
  ${entries.map(e => {
    const scenario = scenarioTestsMap.get(e.name);
    const scenarioId = scenario ? scenario.scenarioId : '';
    const reqIds = scenario ? scenario.reqIds.join(', ') : '';
    return `
      <div class="test-entry">
        <div class="test-name">${escapeHtml(e.name)}</div>
        ${scenarioId ? '<div class="test-scenario">Scenario: ' + escapeHtml(scenarioId) + '</div>' : ''}
        ${reqIds ? '<div class="test-req">Requirements: ' + escapeHtml(reqIds) + '</div>' : ''}
        ${e.coverage ? '<div class="coverage">Coverage: ' + e.coverage + '%</div>' : '<div class="missing">No matching test found</div>'}
      </div>`;
  }).join('')}
  
  ${unmatchedScenarios.length > 0 ? '<h2>Scenarios Without Test Coverage</h2>' + 
    unmatchedScenarios.map(s => `
      <div class="uncovered">
        <h3>${escapeHtml(s.name)}</h3>
        <div class="test-scenario">Scenario ID: ${escapeHtml(s.scenarioId)}</div>
        ${s.reqIds.length > 0 ? '<div class="test-req">Requirements: ' + escapeHtml(s.reqIds.join(', ')) + '</div>' : ''}
      </div>`
    ).join('') : ''}
  
  ${unmatchedTests.length > 0 ? '<h2>Tests Without Scenario Traceability</h2>' + 
    unmatchedTests.map(t => `
      <div class="orphan">
        <h3>${escapeHtml(t.name)}</h3>
      </div>`
    ).join('') : ''}
</body>
</html>`;

  fs.mkdirSync(outDir, { recursive: true });
  const outputPath = path.join(outDir, 'index.html');
  fs.writeFileSync(outputPath, html, 'utf-8');
}

// Escape HTML special characters
function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Main function
function main() {
  const args = parseArgs();

  const entries = [];

  if (args.surefire) {
    const surefireEntries = parseSurefireXml(args.surefire);
    entries.push(...surefireEntries);
  }

  if (args.vitest) {
    const vitestEntries = parseVitestXml(args.vitest);
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
