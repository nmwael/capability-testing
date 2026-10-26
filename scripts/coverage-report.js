#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    surefire: null,
    vitest: null,
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
      process.exit(0);
    }
    i++;
  }
  return result;
}

// Default values
const DEFAULT_CAPABILITIES = 'capabilities/capabilities.yml';
const DEFAULT_OUT = 'wip/covout';

// Simple YAML parser for capabilities.yml format
function parseCapabilitiesYml(content) {
  const capList = [];
  const lines = content.split('\n');
  let currentCapability = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Check for new capability entry (indented - id:)
    if (line.match(/^\s*- id:/)) {
      if (currentCapability) capList.push(currentCapability);
      const idMatch = line.match(/id:\s*(\S+)/);
      if (idMatch) {
        currentCapability = {
          id: idMatch[1],
          intent: '',
          owner: '',
          status: '',
          since: '',
          verifiedBy: []
        };
      }
      continue;
    }
    
    // Collect fields for current capability
    if (currentCapability) {
      // Check if we've moved to a new capability
      if (line.match(/^\s*- id:/)) {
        if (currentCapability) capList.push(currentCapability);
        const idMatch = line.match(/id:\s*(\S+)/);
        if (idMatch) {
          currentCapability = {
            id: idMatch[1],
            intent: '',
            owner: '',
            status: '',
            since: '',
            verifiedBy: []
          };
        }
        continue;
      }
      
      // Check for verified_by start (indented)
      if (line.match(/^\s*verified_by:/)) {
        continue;
      }
      
      // Collect fields - check for key: patterns with indentation
      if (line.match(/^\s*intent:/)) {
        const valueMatch = line.match(/intent:\s*(.*)/);
        if (valueMatch) {
          currentCapability.intent = valueMatch[1].trim().replace(/^"|"$/g, '');
        }
        continue;
      }
      if (line.match(/^\s*owner:/)) {
        const valueMatch = line.match(/owner:\s*(.*)/);
        if (valueMatch) {
          currentCapability.owner = valueMatch[1].trim().replace(/^"|"$/g, '');
        }
        continue;
      }
      if (line.match(/^\s*status:/)) {
        const valueMatch = line.match(/status:\s*(.*)/);
        if (valueMatch) {
          currentCapability.status = valueMatch[1].trim().replace(/^"|"$/g, '');
        }
        continue;
      }
      if (line.match(/^\s*since:/)) {
        const valueMatch = line.match(/since:\s*(.*)/);
        if (valueMatch) {
          currentCapability.since = valueMatch[1].trim().replace(/^"|"$/g, '');
        }
        continue;
      }
      
      // Collect verified_by entries
      if (line.match(/^\s*-\s/)) {
        let entry = line.substring(line.indexOf('- ') + 2);
        // Strip inline comment
        const commentIdx = entry.indexOf('#');
        if (commentIdx !== -1) entry = entry.substring(0, commentIdx).trim();
        // Strip surrounding quotes if present
        if (entry.startsWith('"') && entry.endsWith('"')) {
          entry = entry.slice(1, -1);
        }
        currentCapability.verifiedBy.push(entry);
      }
    }
  }
  
  if (currentCapability) capList.push(currentCapability);
  
  return capList;
}

// Parse Surefire XML test results (handles both closed and self-closing tags)
function parseSurefireXML(xmlContent) {
  const tests = [];
  
  // Match all testcase elements (can be self-closing or closed)
  const testcasePattern = /<testcase[^>]*\/?>/g;
  let match;
  while ((match = testcasePattern.exec(xmlContent)) !== null) {
    const testcase = match[0];
    const testNameMatch = testcase.match(/\bname\s*=\s*"([^"]*)"/);
    const classnameMatch = testcase.match(/\bclassname\s*=\s*"([^"]*)"/);
    
    if (testNameMatch && classnameMatch) {
      tests.push({
        classname: classnameMatch[1],
        name: testNameMatch[1],
        status: 'pass',
        time: 0
      });
    }
  }
  
  return tests;
}

// Parse Vitest XML test results
function parseVitestXML(xmlContent) {
  const tests = [];
  
  const filesStart = xmlContent.indexOf('<test-files>');
  if (filesStart !== -1) {
    const filesEnd = xmlContent.indexOf('</test-files>');
    if (filesEnd !== -1) {
      const filesSection = xmlContent.substring(filesStart, filesEnd);
      const testMatches = filesSection.match(/<testcase[^>]*\bname\s*=\s*["']([^"']*)["'][^>]*\bclassname\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/testcase>/g) || [];
      
      testMatches.forEach(test => {
        const nameMatch = test.match(/\bname\s*=\s*["']([^"']*)["']/);
        const classMatch = test.match(/\bclassname\s*=\s*["']([^"']*)["']/);
        
        if (nameMatch && classMatch) {
          tests.push({
            classname: classMatch[1],
            name: nameMatch[1],
            status: 'pass',
            time: 0
          });
        }
      });
    }
  }
  
  if (tests.length === 0) {
    let pos = 0;
    while (true) {
      const start = xmlContent.indexOf('<testcase', pos);
      if (start === -1) break;
      const end = xmlContent.indexOf('</testcase>', start);
      if (end === -1) break;
      
      const testcase = xmlContent.substring(start, end + 12);
      const testNameMatch = testcase.match(/\bname\s*=\s*["']([^"']*)["']/);
      const classnameMatch = testcase.match(/\bclassname\s*=\s*["']([^"']*)["']/);
      
      if (testNameMatch && classnameMatch) {
        tests.push({
          classname: classnameMatch[1],
          name: testNameMatch[1],
          status: 'pass',
          time: 0
        });
      }
      pos = end + 1;
    }
  }
  
  return tests;
}

// Extract class name from a full classname (strip path and .test.tsx)
function getClassName(classname) {
  const parts = classname.split('/');
  const namePart = parts[parts.length - 1];
  const match = namePart.match(/(\w+)\.test\.tsx?/);
  return match ? match[1] : namePart;
}

// Extract class name from a feature path entry
function getEntryClassName(entry) {
  const withoutFeature = entry.replace(/\.feature$/, '');
  const parts = withoutFeature.split('/');
  const lastPart = parts[parts.length - 1];
  const cleaned = lastPart.replace(/\.feature$/, '');
  return cleaned;
}

// Match verified_by entry to a test using multiple strategies
function matchVerifiedByEntryToTest(entry, tests) {
  // For IT entries, match by classname suffix (e.g., AlertPublishIT matches AlertPublishIT)
  if (entry.endsWith('IT')) {
    for (const test of tests) {
      const testSuffix = test.classname.split('.').pop();
      if (testSuffix === entry) {
        return test;
      }
    }
  }
  
  // For .feature entries, match by multiple strategies
  const entryClassName = getEntryClassName(entry);
  
  for (const test of tests) {
    const testClassName = getClassName(test.classname);
    
    // Try matching by classname substring (case-insensitive)
    const entryClassLower = entryClassName.toLowerCase();
    const testClassLower = testClassName.toLowerCase();
    if (entryClassLower.includes(testClassLower) || testClassLower.includes(entryClassLower)) {
      return test;
    }
    
    // Try matching by test name substring (case-insensitive)
    if (entryClassLower.includes(test.name.toLowerCase()) || test.name.toLowerCase().includes(entryClassLower)) {
      return test;
    }
    
    // Try dash-stripped form (alert-rule-designer -> alertrulerdesigner)
    const dashStripped = entryClassName.replace(/-/g, '');
    const testSuffixDashStripped = testClassName.replace(/-/g, '');
    if (dashStripped.toLowerCase() === testSuffixDashStripped.toLowerCase()) {
      return test;
    }
    
    // Try camel-cased form (alert-rule-designer -> alertRuleDesigner)
    const camelCased = entryClassName.replace(/-([a-z])/g, (match, letter) => match.toUpperCase() + letter);
    if (camelCased.toLowerCase() === testClassName.toLowerCase()) {
      return test;
    }
  }
  
  return null;
}

// Parse Surefire glob pattern
function parseSurefireGlob(pattern, globPath) {
  const tests = [];
  
  if (!pattern || pattern === '*') return tests;
  
  const fileName = path.basename(globPath);
  
  if (pattern.includes('*')) {
    // Glob pattern - search directory
    const globDir = path.dirname(globPath);
    try {
      const files = fs.readdirSync(globDir);
      for (const file of files) {
        if (file.includes('*')) continue;
        const filePath = path.join(globDir, file);
        if (file.startsWith(pattern.split('*')[0]) && file.endsWith(pattern.split('*')[1])) {
          const content = fs.readFileSync(filePath, 'utf8');
          const testCases = parseSurefireXML(content);
          testCases.forEach(t => (t.file = filePath));
          tests.push(...testCases);
        }
      }
    } catch (e) {
      console.error(`Error reading directory ${globDir}: ${e.message}`);
    }
  } else if (path.extname(fileName) === '.xml') {
    // Specific XML file - parse it
    try {
      const content = fs.readFileSync(globPath, 'utf8');
      const testCases = parseSurefireXML(content);
      testCases.forEach(t => (t.file = globPath));
      tests.push(...testCases);
    } catch (e) {
      console.error(`Error reading surefire file: ${e.message}`);
    }
  }
  
  return tests;
}

// Index surefire tests by classname suffix
function indexSurefireTests(tests) {
  const index = {};
  for (const test of tests) {
    const suffix = test.classname.split('.').pop();
    if (!index[suffix]) index[suffix] = [];
    index[suffix].push(test);
  }
  return index;
}

// Generate coverage report HTML
function generateCoverageHTML(caps, surefireTests, vitestTests, outputDir, matchedEntries, unmatchedEntries, surefireIndex) {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CAP Coverage Report</title>
  <style>
    body { font-family: sans-serif; margin: 20px; }
    h1 { color: #333; }
    h2 { color: #555; margin-top: 20px; }
    .capability { margin-bottom: 15px; padding: 10px; background: #f5f5f5; border-radius: 4px; }
    .capability-header { font-weight: bold; }
    .match { color: green; }
    .unmatch { color: red; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
    .status-pass { color: green; }
    .status-failure { color: red; }
  </style>
</head>
<body>
  <h1>CAP Coverage Report</h1>
`;
  
  for (const cap of caps) {
    html += `
  <h2>Capability: ${cap.id}</h2>
  <div class="capability">
    <div class="capability-header">${cap.id}</div>
    <p>Intent: ${cap.intent || ''}</p>
    <p>Owner: ${cap.owner || ''}</p>
    <p>Status: ${cap.status || ''}</p>
    <p>Since: ${cap.since || ''}</p>
  </div>`;
    
    const verifiedBy = cap.verifiedBy || [];
    
    for (const entry of verifiedBy) {
      let match = null;
      let status = 'unmatch';
      let msg = 'no matching test found';
      let details = '';
      
      if (entry.endsWith('IT')) {
        const suffix = entry;
        const tests = surefireIndex[suffix] || [];
        for (const test of tests) {
          const testSuffix = test.classname.split('.').pop();
          if (testSuffix === suffix) {
            match = test;
            break;
          }
        }
      } else if (entry.endsWith('.feature')) {
        // Check if already matched
        if (matchedEntries.includes(entry)) {
          // Already matched, find test by searching vitestTests directly
          const withoutFeature = entry.replace(/\.feature$/, '');
          const parts = withoutFeature.split('/');
          const lastPart = parts[parts.length - 1];
          const cleaned = lastPart.replace(/\.feature$/, '');
          const entryClassName = cleaned;
          const entryClassLower = entryClassName.toLowerCase();
          
          for (const test of vitestTests) {
            const parts = test.classname.split('/');
            const namePart = parts[parts.length - 1];
            const match = namePart.match(/(\w+)\.test\.tsx?/);
            const testClassName = match ? match[1] : namePart;
            const testClassLower = testClassName.toLowerCase();
            if (entryClassLower.includes(testClassLower) || testClassLower.includes(entryClassLower)) {
              match = test;
              break;
            }
          }
        } else {
          match = matchVerifiedByEntryToTest(entry, vitestTests);
        }
      }
      
      if (match) {
        status = 'match';
        msg = `${match.name}`;
        details = `(${match.classname})`;
      }
      
      html += `
    <div class="${status}">
      <strong>${entry}</strong>: ${msg}
      ${entry.endsWith('IT') ? ' (java)' : ''}
      ${entry.endsWith('.feature') ? ' (file)' : ''}
      ${details ? '<br><small>' + details + '</small>' : ''}
    </div>`;
    }
    
    html += '  </div>\n';
  }
  
  // Add unmatched entries section
  if (unmatchedEntries.length > 0) {
    html += '<h2>Unmatched Verified By Entries</h2>\n';
    
    for (const u of unmatchedEntries) {
      html += `
    <div class="unmatch">
      <strong>${u.entry}</strong>: ${u.type === 'java' ? ' (java)' : ' (file)'} - no matching test found
    </div>`;
    }
  }
  
  html += `
</body>
</html>`;
  
  // Write to output directory
  fs.mkdirSync(outputDir, { recursive: true });
  
  const outputPath = path.join(outputDir, 'index.html');
  fs.writeFileSync(outputPath, html);
  
  return outputPath;
}

// Match verified_by entries to tests
function matchVerifiedByEntries(caps, surefireTests, vitestTests) {
  const matchedEntries = new Set();
  const unmatchedEntries = [];
  
  // Index surefire tests by classname suffix
  const surefireTestsCount = surefireTests.length;
  const surefireIndex = indexSurefireTests(surefireTests);
  
  // Match each verified_by entry
  for (const cap of caps) {
    const verifiedBy = cap.verifiedBy || [];
    
    for (const entry of verifiedBy) {
      let match = null;
      let type = 'file'; // Default to file type
      
      if (entry.endsWith('IT')) {
        type = 'java';
      } else if (entry.endsWith('.feature')) {
        type = 'feature';
      }
      
      if (type === 'java') {
        const suffix = entry;
        const tests = surefireIndex[suffix] || [];
        for (const test of tests) {
          const testSuffix = test.classname.split('.').pop();
          if (testSuffix === suffix) {
            match = test;
            break;
          }
        }
      } else if (type === 'file' || type === 'feature') {
        match = matchVerifiedByEntryToTest(entry, vitestTests);
      }
      
      if (match) {
        matchedEntries.add(entry);
      } else {
        unmatchedEntries.push({ entry, type });
      }
    }
  }
  
  return { matchedEntries, unmatchedEntries, surefireIndex };
}

// Main function
function main() {
  const args = process.argv.slice(2);
  const { surefire, vitest, out, summary } = parseArgs(args);
  
  // Default values if not provided
  const capabilitiesFile = DEFAULT_CAPABILITIES;
  const outputFile = out || DEFAULT_OUT;
  
  const capabilitiesYml = fs.readFileSync(capabilitiesFile, 'utf8');
  const capList = parseCapabilitiesYml(capabilitiesYml);
  
  let surefireTests = [];
  if (surefire) {
    const globPath = surefire;
    const tests = parseSurefireGlob(surefire, globPath);
    surefireTests = surefireTests.concat(tests);
  }
  
  let vitestTests = [];
  if (vitest) {
    const vitestPaths = vitest.split(' ');
    for (const p of vitestPaths) {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const tests = parseVitestXML(content);
        vitestTests = vitestTests.concat(tests);
      }
    }
  }
  
  // Match entries to tests
  const { matchedEntries, unmatchedEntries, surefireIndex } = matchVerifiedByEntries(capList, surefireTests, vitestTests);
  
  // Build coverage summary data
  const coverageSummary = {
    report: matchedEntries.size === capList.length ? 1 : 0,
    matchedCount: matchedEntries.size,
    unmatchedCount: unmatchedEntries.length,
    totalCapabilities: capList.length
  };
  
  // Generate coverage report HTML if out directory specified
  if (out) {
    const outputPath = generateCoverageHTML(capList, surefireTests, vitestTests, out, [...matchedEntries], unmatchedEntries, surefireIndex);
    console.log(`Coverage report generated: ${outputPath}`);
  }
  
  // Print JSON summary to stdout
  console.log(JSON.stringify(coverageSummary, null, 2));
  
  // Exit with code 1 if coverage is missing (report !== 1)
  if (coverageSummary.report !== 1) {
    process.exit(1);
  }
  
  process.exit(0);
}

main();
