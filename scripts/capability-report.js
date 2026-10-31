#!/usr/bin/env node
// Capability report: what capabilities exist, how far along they are, and what
// is still unwritten. Advisory only — it never fails a build.
//
//   node scripts/capability-report.js                  # matrix to stdout
//   node scripts/capability-report.js --summary FILE   # append to a job summary
//   node scripts/capability-report.js --surefire FILE  # include surefire XML
//   node scripts/capability-report.js --vitest FILE   # include vitest JUnit XML
//
// Progress is measured from the specs: a scenario counts as *implemented* once
// its @todo tag is gone. @todo at Feature level covers every scenario in that
// file; @todo directly above a Scenario covers just that one.
//
// Test failures from Surefire and vitest JUnit XML are collected and shown in
// the unified matrix.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const LANES = ['frontend', 'publication', 'alerting', 'docs'];

function unquote(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

// --- registry -------------------------------------------------------------
// Parsed here rather than shared with the gate on purpose: that one validates,
// this one describes, and keeping them independent means neither grows the
// other's concerns.

function readRegistry(file) {
  const caps = [];
  let cap = null;
  for (const raw of fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const id = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (id) {
      cap = { id: unquote(id[1].split('#')[0]), verified_by: [] };
      caps.push(cap);
      continue;
    }
    if (!cap) continue;

    const kv = line.match(/^\s{2,}(\w+):\s*(.*)$/);
    if (kv) {
      const v = kv[2].split('#')[0].trim();
      cap[kv[1]] = v === '' ? [] : unquote(v);
      continue;
    }
    const li = line.match(/^\s{4,}-\s*(.+)$/);
    if (li) {
      const v = unquote(li[1].split('#')[0].trim());
      if (v) cap.verified_by.push(v);
    }
  }
  return caps;
}

// --- requirements coverage ------------------------------------------------
// Simple YAML parser for requirements.yml to extract requirements with capability and status

function parseRequirementsYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const requirements = [];
  let inList = false;
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trimEnd();
    if (!line.trim()) continue;

    if (line.match(/^requirements:/)) {
      inList = true;
      continue;
    }
    if (!inList) continue;

    const item = line.match(/^ {2,}- (\w+):\s*(.*)$/);
    if (item) {
      if (current && current.id) requirements.push(current);
      current = { [item[1]]: item[2].trim().replace(/^['"]|['"]$/g, '') };
      continue;
    }
    const nested = line.match(/^ {4,}(\w+):\s*(.*)$/);
    if (nested && current) {
      current[nested[1]] = nested[2].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }
  }
  if (current && current.id) requirements.push(current);
  return requirements;
}

// Count scenarios per requirement from feature files
function countScenariosPerRequirement(featureFiles, requirements) {
  const reqCoverage = new Map();
  
  for (const req of requirements) {
    reqCoverage.set(req.id, {
      id: req.id,
      capability: req.capability,
      scenarioCount: 0,
      scenarios: []
    });
  }

  // Parse feature files for scenarios
  for (const file of featureFiles) {
    const text = fs.readFileSync(path.isAbsolute(file) ? file : path.join(ROOT, file), 'utf8');
    const lines = text.split('\n');

    // Parse feature-level @cap: tag
    const head = text.split(/^[ \t]*Feature:/m)[0];
    const capTags = head.match(/^@cap:(\S+)/gm);
    const capId = capTags ? capTags[0].slice('@cap:'.length) : null;

    // Scan for scenarios with their @req: tags
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sm = line.match(/^  Scenario:/);
      if (!sm) continue;

      // Collect scenario-level tags immediately above this scenario
      let j = i - 1;
      let reqId = null;
      while (j >= 0 && lines[j].match(/^  @/)) {
        const tagLine = lines[j];
        const rid = tagLine.match(/^  @req:(REQ-\S+)/);
        if (rid) reqId = rid[1];
        j--;
      }

      if (reqId) {
        const coverage = reqCoverage.get(reqId);
        if (coverage) {
          coverage.scenarioCount++;
          coverage.scenarios.push({
            scenarioId: lines[j-1]?.match(/^  @scenario:(SC-\S+)/)?.[1] || 'unknown',
            file: file,
            line: i + 1
          });
        }
      }
    }
  }

  return Array.from(reqCoverage.values());
}

// --- specs ----------------------------------------------------------------

function readFeature(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const head = text.split(/^[ \t]*Feature:/m)[0];
  const headTags = head.match(/^@[\w:.-]+/gm) || [];
  const capTag = headTags.find(t => t.startsWith('@cap:'));

  let scenarios = 0;
  let todo = 0;
  let tags = [];
  for (const line of text.split('\n')) {
    const tag = line.match(/^\s*@([\w:.-]+)\s*$/);
    if (tag) { tags.push(tag[1]); continue; }
    if (/^[ \t]*Scenario(?: Outline)?:/.test(line)) {
      scenarios++;
      if (headTags.includes('@todo') || tags.includes('todo')) todo++;
      tags = [];
      continue;
    }
    // A blank line, comment or step ends the tag block.
    tags = [];
  }
  return { cap: capTag ? capTag.slice('@cap:'.length) : null, scenarios, todo };
}

// --- parse test results ----------------------------------------------------

function parseJUnitXML(xmlPath) {
  if (!fs.existsSync(xmlPath)) return null;
  const text = fs.readFileSync(xmlPath, 'utf8');
  return parseJUnitText(text);
}

function parseSurefire(xmlPath) {
  if (!fs.existsSync(xmlPath)) return {};
  const text = fs.readFileSync(xmlPath, 'utf8');
  return parseJUnitText(text);
}

function parseJUnitText(text, featureMap, reportType = 'surefire') {
  // Extract test names and failure counts from JUnit XML
  const perCap = new Map();
  const capFiles = new Map();
  
  // Build feature name to capability map if not provided
  if (!featureMap) {
    featureMap = new Map();
    try {
      const featuresDir = path.join(ROOT, 'features');
      if (fs.existsSync(featuresDir)) {
        for (const lane of fs.readdirSync(featuresDir)) {
          const dir = path.join(featuresDir, lane);
          if (!fs.statSync(dir).isDirectory()) continue;
          for (const file of fs.readdirSync(dir)) {
            if (!file.endsWith('.feature')) continue;
            const filePath = path.join(dir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              const match = lines[i].match(/^\s*Feature:\s*(.+)$/);
              if (match) {
                const featureName = match[1].trim();
                // Read capability tag from above
                for (let j = i - 1; j >= 0 && j > i - 10; j--) {
                  const capMatch = lines[j].match(/@cap:(\S+)/);
                  if (capMatch) {
                    featureMap.set(featureName, capMatch[1]);
                    break;
                  }
                }
                break;
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore errors
    }
  }
  
  function processTest(testName, classname, content, perCap, capFiles, featureMap) {
    let capability = null;
    let failures = 0;
    
    // Check for failures in content
    if (content.includes('<failure')) failures++;
    
    // Try to extract capability from content (@cap: tags)
    const capMatch = content.match(/@cap:([^\s"'><]+)/);
    if (capMatch) {
      capability = capMatch[1];
    } else if (reportType === 'vitest') {
      // Map Vitest test files to capabilities via filename
      const fileName = path.basename(classname, '.test.tsx');
      const fileNameLower = fileName.toLowerCase();
      if (fileNameLower.includes('alertruleedit')) capability = 'alert.rule-edit';
      else if (fileNameLower.includes('alertflow')) capability = 'alert.flow';
      else if (fileNameLower.includes('alertrule-designer') || fileNameLower.includes('alertrule')) capability = 'alert.rule-design';
      else if (fileNameLower.includes('cap-catalogue')) capability = 'alert.cap-fields';
      else if (fileNameLower.includes('smoke')) capability = 'alert.publish';
      else {
        // Try to extract from test name
        if (testName.toLowerCase().includes('alert-flow')) capability = 'alert.flow';
        else if (testName.toLowerCase().includes('rule-designer')) capability = 'alert.rule-design';
        else if (testName.toLowerCase().includes('rule-edit')) capability = 'alert.rule-edit';
      }
    } else if (featureMap.has(classname)) {
      capability = featureMap.get(classname);
    } else {
      // Try to infer from classname
      const parts = classname.split('.');
      if (parts.length >= 3) {
        const pkg = parts[2] || '';
        if (pkg === 'alerting') capability = 'alert.route';
        else if (pkg === 'publication') capability = 'alert.publish';
        else capability = parts[parts.length - 2] || 'unknown';
      } else {
        capability = 'unknown';
      }
    }
    
    if (capability && capability !== 'unknown') {
      const capKey = `${reportType}:${capability}`;
      if (!perCap.has(capKey)) {
        perCap.set(capKey, { failures: 0 });
      }
      perCap.get(capKey).failures += failures;
      if (!capFiles.has(capKey)) {
        capFiles.set(capKey, new Set());
      }
      capFiles.get(capKey).add(classname);
    }
  }
  
  // For simple parsing, use regex to extract testcase blocks
  const testcaseRegex = /<testcase[^>]*?classname="([^"]+)"[^>]*?name="([^"]+)"[^>]*?time="[^"]*"[^>]*?\/>/g;
  const testcaseWithContentRegex = /<testcase[^>]*?classname="([^"]+)"[^>]*?name="([^"]+)"[^>]*?time="[^"]*"[^>]*?>([\s\S]*?)<\/testcase>/g;
  const testcaseNameFirstRegex = /<testcase[^>]*?name="([^"]+)"[^>]*?classname="([^"]+)"[^>]*?time="[^"]*"[^>]*?\/>/g;
  const testcaseNameFirstWithContentRegex = /<testcase[^>]*?name="([^"]+)"[^>]*?classname="([^"]+)"[^>]*?time="[^"]*"[^>]*?>([\s\S]*?)<\/testcase>/g;
  
  let match;
  // Process self-closing testcases (classname-first order)
  while ((match = testcaseRegex.exec(text)) !== null) {
    const classname = match[1];
    const testName = match[2];
    processTest(testName, classname, '', perCap, capFiles, featureMap);
  }
  // Process self-closing testcases (name-first order)
  while ((match = testcaseNameFirstRegex.exec(text)) !== null) {
    const testName = match[1];
    const classname = match[2];
    processTest(testName, classname, '', perCap, capFiles, featureMap);
  }
  
  // Process testcases with content (classname-first order)
  while ((match = testcaseWithContentRegex.exec(text)) !== null) {
    const classname = match[1];
    const testName = match[2];
    const content = match[3];
    processTest(testName, classname, content, perCap, capFiles, featureMap);
  }
  
  // Process testcases with content (name-first order)
  while ((match = testcaseNameFirstWithContentRegex.exec(text)) !== null) {
    const testName = match[1];
    const classname = match[2];
    const content = match[3];
    processTest(testName, classname, content, perCap, capFiles, featureMap);
  }
  
  return { perCap, capFiles };
}
function parseTestResults(surefirePath, vitestPath) {
  const perCap = new Map();
  const capFiles = new Map();

  // Parse surefire reports
  if (fs.existsSync(surefirePath)) {
    const surefireDir = path.join(ROOT, surefirePath);
    if (fs.existsSync(surefireDir) && fs.statSync(surefireDir).isDirectory()) {
      for (const file of fs.readdirSync(surefireDir).filter(f => f.startsWith('TEST-'))) {
        const fileStats = fs.statSync(path.join(surefireDir, file));
        if (!fileStats.isFile()) continue;
        
        const text = fs.readFileSync(path.join(surefireDir, file), 'utf8');
        const { perCap: filePerCap, capFiles: fileCapFiles } = parseJUnitText(text, null, 'surefire');
        
        for (const [key, data] of filePerCap.entries()) {
          perCap.set(key, (perCap.get(key) || 0) + data.failures);
          const existingFiles = capFiles.get(key) || [];
          const newFiles = fileCapFiles.get(key) ? Array.from(fileCapFiles.get(key)) : [file];
          capFiles.set(key, [...existingFiles, ...newFiles]);
        }
      }
    }
  }

  // Parse vitest JUnit XML
  if (fs.existsSync(vitestPath)) {
    const text = fs.readFileSync(vitestPath, 'utf8');
    const { perCap: filePerCap, capFiles: fileCapFiles } = parseJUnitText(text, null, 'vitest');
    
    for (const [key, data] of filePerCap.entries()) {
      perCap.set(key, (perCap.get(key) || 0) + data.failures);
      const existingFiles = capFiles.get(key) || [];
      const newFiles = fileCapFiles.get(key) ? Array.from(fileCapFiles.get(key)) : ['vitest'];
      capFiles.set(key, [...existingFiles, ...newFiles]);
    }
  }

  return { perCap, capFiles };
}

function scanSpecs(featuresDir) {
  const found = [];
  if (!fs.existsSync(featuresDir)) return found;
  for (const lane of fs.readdirSync(featuresDir)) {
    const dir = path.join(featuresDir, lane);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.feature')) continue;
      const rel = path.posix.join('features', lane, file);
      found.push(Object.assign({ rel, lane }, readFeature(path.join(dir, file))));
    }
  }
  return found;
}

// --- report ---------------------------------------------------------------

const dash = n => (n ? String(n) : '–');

function render(caps, specs, testResults, requirementsCoverage) {
  const per = new Map(caps.map(c => [c.id, { sc: {}, total: 0, todoTotal: 0 }]));
  for (const s of specs) {
    const a = per.get(s.cap);
    if (!a) continue;
    a.sc[s.lane] = (a.sc[s.lane] || 0) + s.scenarios;
    a.total += s.scenarios;
    a.todoTotal += s.todo;
  }

  // Add test failure counts
  if (testResults && testResults.perCap) {
    for (const [key, failures] of testResults.perCap) {
      const capId = key.split(':')[1];
      const a = per.get(capId);
      if (a) {
        a.testFailures = (a.testFailures || 0) + failures;
      }
    }
  }

  let total = 0;
  let todoTotal = 0;
  for (const a of per.values()) { total += a.total; todoTotal += a.todoTotal; }
  const pct = total ? Math.round(((total - todoTotal) / total) * 100) : 0;

  // Build capability to requirements coverage map
  const capCoverage = new Map();
  for (const coverage of requirementsCoverage) {
    capCoverage.set(coverage.capability, {
      covered: coverage.scenarioCount,
      uncovered: coverage.scenarioCount === 0,
      scenarios: coverage.scenarios.length
    });
  }

  const L = [];
  L.push('## Capability report');
  L.push('');
  L.push(`**${caps.length} capabilities** · **${total} scenarios** · `
    + `**${total - todoTotal} implemented** · **${todoTotal} to do** · **${pct}%**`);
  L.push('');
  L.push('| Capability | Intent | Owner | Status | Frontend | Publication | Alerting | To do | Scenarios | Test | Req Coverage |');
  L.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const c of caps) {
    const a = per.get(c.id);
    const lane = l => (a.sc[l] ? String(a.sc[l]) : '–');
    const test = a.testFailures !== undefined ? String(a.testFailures) : '–';
    const coverage = capCoverage.get(c.id) || { covered: 0, uncovered: true, scenarios: 0 };
    const reqStatus = coverage.uncovered ? 'NO SCENARIOS' : `${coverage.covered} scenarios`;
    L.push(`| ${c.id} | ${(c.intent || '–').replace(/\|/g, '\\|')} `
      + `| ${c.owner || '–'} | ${c.status || '–'} `
      + `| ${lane('frontend')} | ${lane('publication')} | ${lane('alerting')} `
      + `| ${dash(a.todoTotal)} | ${dash(a.total)} |`
      + `| ${test} |`
      + `| ${reqStatus} |`);
  }

  const remaining = caps.filter(c => per.get(c.id).todoTotal > 0);
  if (remaining.length) {
    L.push('');
    L.push('### Still `@todo`');
    L.push('');
    for (const c of remaining) {
      const a = per.get(c.id);
      const done = a.total - a.todoTotal;
      L.push(`- **${c.id}** — ${a.todoTotal} of ${a.total} scenarios (${done} done)`);
    }
  }

  const known = new Set(caps.map(c => c.id));
  const unplaced = specs.filter(s => !s.cap || !known.has(s.cap));
  if (unplaced.length) {
    L.push('');
    L.push('### Specs the registry does not cover');
    L.push('');
    for (const s of unplaced) {
      L.push(`- \`${s.rel}\` — ${s.cap ? `@cap:${s.cap} is not in capabilities.yml` : 'no `@cap:` tag'}`);
    }
  }

  // Requirements coverage summary
  const totalRequirements = requirementsCoverage.length;
  const requirementsWithScenarios = requirementsCoverage.filter(r => r.scenarioCount > 0).length;
  const requirementsWithoutScenarios = totalRequirements - requirementsWithScenarios;
  const totalScenarios = total;
  const scenariosWithRequirements = requirementsCoverage.reduce((sum, r) => sum + r.scenarioCount, 0);
  const scenariosWithoutRequirements = totalScenarios - scenariosWithRequirements;

  L.push('');
  L.push('### Requirements Coverage Summary');
  L.push('');
  L.push(`- Total requirements: ${totalRequirements}`);
  L.push(`- Requirements with scenarios: ${requirementsWithScenarios}`);
  L.push(`- Requirements without scenarios: ${requirementsWithoutScenarios}`);
  L.push(`- Total scenarios: ${totalScenarios}`);
  L.push(`- Scenarios with requirements: ${scenariosWithRequirements}`);
  L.push(`- Scenarios without requirements: ${scenariosWithoutRequirements}`);

  return L.join('\n') + '\n';
}

// --- entry ----------------------------------------------------------------

function main() {
  const summary = process.argv.includes('--summary')
    ? process.argv[process.argv.indexOf('--summary') + 1] : null;
  const surefire = process.argv.includes('--surefire')
    ? process.argv[process.argv.indexOf('--surefire') + 1] : null;
  const vitest = process.argv.includes('--vitest')
    ? process.argv[process.argv.indexOf('--vitest') + 1] : null;

  const registryPath = path.join(ROOT, 'capabilities', 'capabilities.yml');
  const requirementsPath = path.join(ROOT, 'requirements', 'requirements.yml');
  if (!fs.existsSync(registryPath) || !fs.existsSync(requirementsPath)) {
    console.error(`capability report: ${registryPath} or ${requirementsPath} not found`);
    process.exit(1);
  }

  const specs = scanSpecs(path.join(ROOT, 'features'));
  const featureFiles = specs.map(s => path.join(ROOT, s.rel));
  
  const requirements = parseRequirementsYaml(fs.readFileSync(requirementsPath, 'utf8'));
  let testResults = null;
  let requirementsCoverage = null;
  if (surefire || vitest) {
    testResults = parseTestResults(surefire, vitest);
  }
  if (requirements && featureFiles.length > 0) {
    requirementsCoverage = countScenariosPerRequirement(featureFiles, requirements);
  }

  const text = render(readRegistry(registryPath), specs, testResults, requirementsCoverage);

  if (summary) {
    fs.appendFileSync(summary, text, 'utf8');
    console.log(`Capability report appended to ${summary} (${text.length} bytes)`);
  } else {
    process.stdout.write(text);
  }
}

main();
