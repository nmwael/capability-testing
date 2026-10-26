#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Parse command line arguments
function parseArgs(args) {
  const result = {
    capabilities: null,
    surefire: null,
    vitest: null,
    out: null,
    summary: null
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      const value = eq === -1 ? (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null) : arg.slice(eq + 1);
      
      if (key === 'capabilities') result.capabilities = value;
      else if (key === 'surefire') result.surefire = value;
      else if (key === 'vitest') result.vitest = value;
      else if (key === 'out') result.out = value;
      else if (key === 'summary') result.summary = value;
      else i++;
    }
  }
  
  return result;
}

// Simple YAML parser for capabilities.yml format
function parseCapabilitiesYml(content) {
  const capList = [];
  const lines = content.split('\n');
  let inCapability = false;
  let currentCapability = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (line === 'verified_by:') {
      inCapability = true;
      continue;
    }
    
    if (inCapability) {
      if (line.startsWith('- ')) {
        const entry = line.substring(2);
        if (currentCapability) {
          let type;
          if (entry.endsWith('.feature')) {
            type = 'feature';
          } else if (path.extname(entry) === '.ts' || path.extname(entry) === '.tsx') {
            type = 'file';
          } else {
            type = 'java';
          }
          currentCapability.verifiedBy.push({ type, entry });
        }
      } else if (line === '' || line.startsWith('   -')) {
        continue;
      } else if (line && !line.startsWith('- ')) {
        if (currentCapability) {
          capList.push(currentCapability);
        }
        currentCapability = null;
        inCapability = false;
      }
    } else if (line.startsWith('- id:')) {
      if (currentCapability) {
        capList.push(currentCapability);
      }
      currentCapability = {
        id: line.match(/id:\s*(\S+)/)?.[1],
        intent: '',
        owner: '',
        status: '',
        since: '',
        verifiedBy: []
      };
      i += 6;
    }
  }
  
  if (currentCapability) {
    capList.push(currentCapability);
  }
  
  return capList;
}

// Parse Surefire XML test results
function parseSurefireXML(xmlContent) {
  const tests = [];
  let pos = 0;
  
  while (true) {
    const start = xmlContent.indexOf('<testcase', pos);
    if (start === -1) break;
    const end = xmlContent.indexOf('</testcase>', start);
    if (end === -1) break;
    
    const testcase = xmlContent.substring(start, end + 12);
    const testNameMatch = testcase.match(/name\s*=\s*"([^"]*)"/);
    const classnameMatch = testcase.match(/classname\s*=\s*"([^"]*)"/);
    const timeMatch = testcase.match(/time\s*=\s*"([^"]*)"/);
    
    const testName = testNameMatch ? testNameMatch[1] : '';
    const classname = classnameMatch ? classnameMatch[1] : '';
    const time = timeMatch ? parseFloat(timeMatch[1]) : 0;
    
    let status = 'pass';
    if (testcase.match(/<failure[^>]*>/) || testcase.match(/<error[^>]*>/)) {
      status = 'failure';
    } else if (testcase.match(/<skipped[^>]*>/)) {
      status = 'skipped';
    }
    
    tests.push({ classname, name: testName, status, time });
    pos = end + 1;
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
      const testMatches = filesSection.match(/<test-case[^>]*\sname\s*=\s*"([^"]*)"[^>]*\sclassname\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/test-case>/g) || [];
      
      testMatches.forEach(test => {
        const nameMatch = test.match(/name\s*=\s*"([^"]*)"/);
        const classMatch = test.match(/classname\s*=\s*"([^"]*)"/);
        
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
      const testNameMatch = testcase.match(/name\s*=\s*"([^"]*)"/);
      const classnameMatch = testcase.match(/classname\s*=\s*"([^"]*)"/);
      
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

// Match feature path to test file by dirname
function matchFeaturePathToTestFile(featurePath, vitestTests) {
  const dirName = path.dirname(featurePath);
  
  for (const test of vitestTests) {
    const testClass = path.basename(test.classname.replace('.test.tsx', ''));
    if (testClass === dirName) {
      return test;
    }
  }
  
  return null;
}

// Generate coverage report HTML
function generateCoverageHTML(caps, surefireTests, vitestTests, outputDir) {
  const unmatched = [];
  const matched = {};
  
  for (const cap of caps) {
    const verifiedBy = cap.verifiedBy || [];
    
    for (const entry of verifiedBy) {
      let match = null;
      
      if (entry.type === 'java') {
        for (const test of surefireTests) {
          const suffix = test.classname.split('/').pop();
          const entrySuffix = entry.entry.split('/').pop().replace('.java', '');
          if (suffix === entrySuffix) {
            match = test;
            break;
          }
        }
      } else if (entry.type === 'file' || entry.type === 'feature') {
        match = matchFeaturePathToTestFile(entry.entry, vitestTests);
      }
      
      if (match) {
        matched[entry.entry] = match;
      } else {
        unmatched.push({ entry, type: entry.type });
      }
    }
  }
  
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
    <p>Intent: ${cap.intent}</p>
    <p>Owner: ${cap.owner}</p>
    <p>Status: ${cap.status}</p>
  </div>`;
    
    const verifiedBy = cap.verifiedBy || [];
    
    for (const entry of verifiedBy) {
      let match = matched[entry.entry];
      let status = 'unmatch';
      let msg = 'no matching test found';
      
      if (match) {
        status = 'match';
        msg = `${match.name} (${match.classname})`;
      }
      
      html += `
    <div class="${status}">
      <strong>${entry.entry}</strong>: ${msg}
      ${entry.type === 'java' ? ' (java)' : ''}
      ${entry.type === 'file' || entry.type === 'feature' ? ' (file)' : ''}
    </div>`;
    }
    
    html += '  </div>\n';
  }
  
  if (unmatched.length > 0) {
    html += '<h2>Unmatched Verified By Entries</h2>\n';
    
    for (const u of unmatched) {
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
  } else if (path.extname(fileName) === 'xml') {
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

// Main function
function main() {
  const args = process.argv.slice(2);
  const { capabilities: caps, surefire, vitest, out, summary } = parseArgs(args);
  
  if (!caps) {
    console.error('Error: --capabilities is required');
    process.exit(1);
  }
  
  const capabilitiesYml = fs.readFileSync(caps, 'utf8');
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
  
  if (out) {
    const outputPath = generateCoverageHTML(caps, surefireTests, vitestTests, out);
    console.log(`Coverage report generated: ${outputPath}`);
  }
  
  if (summary) {
    const summaryPath = summary;
    fs.writeFileSync(summaryPath, 'CAP Coverage Summary\n');
    console.log(`Summary written to: ${summaryPath}`);
  }
  
  const matchedCount = Object.keys(matched).length;
  const unmatchedCount = unmatched.length;
  
  console.log('Capabilities with matched tests:', matchedCount);
  console.log('Capabilities with unmatched entries:', unmatchedCount);
  
  process.exit(0);
}

main();
