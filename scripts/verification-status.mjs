#!/usr/bin/env node
// Verification Status Report - 5-Dimensional Status Calculator
// Calculates: Specification, Implementation, Automation, Execution, Freshness
// Dependency-free, deterministic, advisory only

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const requirementsArg = argValue('--requirements');
const featuresArg = argValue('--features');
const surefireArg = argValue('--surefire');
const vitestArg = argValue('--vitest');
const outputArg = argValue('--output');
const format = argValue('--format') || 'markdown';

const requirementsPath = requirementsArg
  ? path.resolve(ROOT, requirementsArg)
  : path.join(ROOT, 'requirements', 'requirements.yml');
const featuresDir = featuresArg ? path.resolve(ROOT, featuresArg) : path.join(ROOT, 'features');
const capabilitiesPath = path.join(ROOT, 'capabilities', 'capabilities.yml');
const tombstonePath = path.join(ROOT, 'features', '.retired-ids.yml');

// ---- tiny YAML subset for requirements.yml ----
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

function parseCapabilitiesYaml(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const capabilities = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'capabilities:') continue;
    if (trimmed === 'plans:') continue;

    const idMatch = trimmed.match(/^ {2}- id:\s*(.+)$/);
    if (idMatch) {
      if (current && current.id) capabilities.push(current);
      current = {
        id: idMatch[1].replace(/^['"]|['"]$/g, ''),
        verifiedBy: [],
        owner: '',
        status: '',
        since: ''
      };
      continue;
    }

    if (!current) continue;

    const vb = trimmed.match(/^verified_by:\s*$/);
    if (vb) { current._inVb = true; continue; }

    const field = trimmed.match(/^(\w+):\s*(.*)$/);
    if (field) {
      current._inVb = false;
      const key = field[1];
      let val = field[2].trim();
      val = val.split('#')[0].trim();
      if (val.startsWith('#')) val = '';
      if (val === '') {
        current._inVb = key === 'verified_by';
        if (current._inVb) current.verified_by = [];
        currentKey = key;
        continue;
      }
      val = val.replace(/^['"]|['"]$/g, '');
      current[key] = val;
      continue;
    }

    if (current._inVb) {
      const listItem = trimmed.match(/^ {6}- \s*(.+)$/);
      if (listItem) {
        let v = listItem[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
        if (v) current.verifiedBy.push(v);
        continue;
      } else {
        current._inVb = false;
      }
    }
    
    // Handle lanes array
    const lanesMatch = trimmed.match(/^ {4}lanes:\s*\[(.+)\]$/);
    if (lanesMatch) {
      const lanesStr = lanesMatch[1];
      current.lanes = lanesStr.split(',').map(l => l.trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
  }

  if (current && current.id) {
    capabilities.push(current);
  }
  return capabilities;
}

// Parse feature files for scenarios and tags
function parseFeatureFile(featurePath) {
  const text = fs.readFileSync(featurePath, 'utf8');
  const lines = text.split('\n');
  const scenarios = [];
  let inDocString = false;
  let docMarker = '';
  let currentCapId = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const lineNo = i + 1;

    // Handle doc strings
    const docMatch = trimmed.match(/^("""|```)/);
    if (inDocString) {
      if (trimmed === docMarker) { inDocString = false; docMarker = ''; }
      continue;
    }
    if (docMatch) { inDocString = true; docMarker = docMatch[1]; continue; }

    if (!trimmed) continue;
    if (/^(#|\/\/)/.test(trimmed)) continue;

    // Extract @cap: tag before skipping @ lines
    const capTagMatch = trimmed.match(/^@cap:([\w:.-]+)/);
    if (capTagMatch) {
      currentCapId = capTagMatch[1];
      continue;
    }

    if (trimmed.startsWith('@')) continue;

    const feature = trimmed.match(/^Feature:\s*(.+)$/);
    if (feature) continue;

    const scenario = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+)$/);
    if (scenario) {
      let j = i - 1;
      let scenarioId = null;
      let reqId = null;
      let capId = currentCapId;
      while (j >= 0 && lines[j].match(/^\s*@/)) {
        const tagLine = lines[j].trim();
        const sid = tagLine.match(/^@scenario:(SC-\S+)/);
        const rid = tagLine.match(/^@req:(REQ-\S+)/);
        const cid = tagLine.match(/^@cap:(\S+)/);
        if (sid) scenarioId = sid[1];
        if (rid) reqId = rid[1];
        if (cid) capId = cid[1];
        j--;
      }
      scenarios.push({
        name: scenario[1].trim(),
        scenarioId,
        reqId,
        capId,
        line: lineNo
      });
    }
  }
  return scenarios;
}

// Scan all feature files
function scanFeatureFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...scanFeatureFiles(full));
    } else if (e.name.endsWith('.feature')) {
      results.push(full);
    }
  }
  return results;
}

// Extract scenario IDs and req IDs from test files
function extractTestScenarioIds(testFilePath) {
  const content = fs.readFileSync(testFilePath, 'utf8');
  const scenarioIds = new Set();
  const reqIds = new Set();

  // Look for @scenario:SC-XXX patterns
  const scMatches = content.match(/@scenario:(SC-\w+)/g);
  if (scMatches) scMatches.forEach(m => scenarioIds.add(m.replace('@scenario:', '')));

  // Look for @req:REQ- patterns
  const reqMatches = content.match(/@req:(REQ-\S+)/g);
  if (reqMatches) reqMatches.forEach(m => reqIds.add(m.replace('@req:', '')));

  // Look for @cap: patterns
  const capMatches = content.match(/@cap:(\S+)/g);
  if (capMatches) capMatches.forEach(m => scenarioIds.add('cap:' + m.replace('@cap:', '')));

  return { scenarioIds: Array.from(scenarioIds), reqIds: Array.from(reqIds) };
}

// Parse JUnit XML for test results
function parseJunitXml(xmlPath) {
  if (!fs.existsSync(xmlPath)) return [];
  const text = fs.readFileSync(xmlPath, 'utf8');
  const results = [];

  const testcaseRegex = /<testcase[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*time="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g;
  const selfClosingRegex = /<testcase[^>]*name="([^"]*)"[^>]*classname="([^"]*)"[^>]*time="([^"]*)"[^>]*\/>/g;

  let match;
  while ((match = testcaseRegex.exec(text)) !== null) {
    const name = match[1];
    const classname = match[2];
    const body = match[4];
    const failed = body.includes('<failure') || body.includes('<error');
    results.push({ name, classname, failed, status: failed ? 'failed' : 'passed' });
  }
  while ((match = selfClosingRegex.exec(text)) !== null) {
    const name = match[1];
    const classname = match[2];
    results.push({ name, classname, failed: false, status: 'passed' });
  }
  return results;
}

// Calculate verification status for a capability
function calculateCapabilityStatus(capability, specs, testResults, execHistory) {
  const capScenarios = specs.filter(s => s.capId === capability.id);
  const capTests = testResults.filter(t => t.capability === capability.id);

  // Specification status
  const specStatus = capScenarios.length > 0 ? 'Defined' : 'Missing';

  // Implementation status
  const implStatus = capability.verified_by && capability.verified_by.length > 0 ? 'Implemented' : 'Not Implemented';

  // Automation status
  const autoStatus = capTests.length > 0 ? 'Automated' : 'Not Automated';

  // Execution status
  let execStatus = 'Not Executed';
  if (capTests.length > 0) {
    const failed = capTests.some(t => t.failed);
    const skipped = capTests.some(t => t.status === 'skipped');
    if (failed) execStatus = 'Failed';
    else if (skipped) execStatus = 'Skipped';
    else execStatus = 'Passed';
  }

  // Freshness
  let freshness = 'Unknown';
  if (execHistory && execHistory.length > 0) {
    const latest = execHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const daysSince = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) freshness = 'Current';
    else if (daysSince <= 30) freshness = 'Stale';
    else freshness = 'Stale';
  }

  return {
    capability: capability.id,
    specification: specStatus,
    implementation: implStatus,
    automation: autoStatus,
    execution: execStatus,
    freshness,
    scenarios: capScenarios.length,
    tests: capTests.length,
    failedTests: capTests.filter(t => t.failed).length
  };
}

// Calculate verification status for a requirement
function calculateRequirementStatus(req, specs, testResults, execHistory) {
  const reqScenarios = specs.filter(s => s.reqId === req.id);
  const reqTests = testResults.filter(t => t.reqIds?.includes(req.id) || t.scenarioIds?.some(s => specs.find(sp => sp.scenarioId === s && sp.reqId === req.id)));

  const specStatus = reqScenarios.length > 0 ? 'Defined' : 'Missing';
  const implStatus = reqScenarios.some(s => specs.find(sp => sp.cap === s.cap)?.verified_by?.length > 0) ? 'Implemented' : 'Not Implemented';
  const autoStatus = reqTests.length > 0 ? 'Automated' : 'Not Automated';

  let execStatus = 'Not Executed';
  if (reqTests.length > 0) {
    const failed = reqTests.some(t => t.failed);
    if (failed) execStatus = 'Failed';
    else execStatus = 'Passed';
  }

  let freshness = 'Unknown';
  if (execHistory && execHistory.length > 0) {
    const latest = execHistory.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    const daysSince = (Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 7) freshness = 'Current';
    else if (daysSince <= 30) freshness = 'Stale';
    else freshness = 'Stale';
  }

  return {
    requirement: req.id,
    capability: req.capability,
    specification: specStatus,
    implementation: implStatus,
    automation: autoStatus,
    execution: execStatus,
    freshness,
    scenarios: reqScenarios.length,
    tests: reqTests.length,
    failedTests: reqTests.filter(t => t.failed).length
  };
}

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

  for (const file of featureFiles) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    
    // Parse feature-level @cap: tag
    const head = text.split(/^[ \t]*Feature:/m)[0];
    const capTags = head.match(/^@cap:(\S+)/gm);
    let capId = null;
    if (capTags) {
      if (capTags.length > 1) {
        // multiple @cap: tags - this is an error but we'll use the first
      }
      capId = capTags[0].slice('@cap:'.length);
    }

    // Scan scenario lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sm = line.match(/^  Scenario:/);
      if (!sm) continue;

      // Collect scenario-level tags immediately above this scenario
      let j = i - 1;
      let scenarioId = null;
      let reqId = null;
      while (j >= 0 && lines[j].match(/^  @/)) {
        const tagLine = lines[j];
        const sid = tagLine.match(/^  @scenario:(SC-\S+)/);
        const rid = tagLine.match(/^  @req:(REQ-\S+)/);
        if (sid) scenarioId = sid[1];
        if (rid) reqId = rid[1];
        j--;
      }

      if (reqId) {
        const coverage = reqCoverage.get(reqId);
        if (coverage) {
          coverage.scenarioCount++;
          coverage.scenarios.push({
            scenarioId: scenarioId,
            file: file,
            line: i + 1
          });
        }
      }
    }
  }

  return Array.from(reqCoverage.values());
}

function main() {
  const args = process.argv.slice(2);
  const outputArg = argValue('--output');
  const format = argValue('--format') || 'markdown';
  const surefireArg = argValue('--surefire');
  const vitestArg = argValue('--vitest');
  const surefire = surefireArg;
  const vitest = vitestArg;
  const capsText = fs.readFileSync(capabilitiesPath, 'utf8');
  const capabilities = parseCapabilitiesYaml(capsText);

  const reqText = fs.readFileSync(requirementsPath, 'utf8');
  const requirements = parseRequirementsYaml(reqText);

  const featureFiles = scanFeatureFiles(featuresDir);
  console.log("DEBUG: Feature files found:", featureFiles.length);
  featureFiles.forEach((f, i) => console.log(`DEBUG:   [${i}] ${f}`));
  const specs = [];
  for (const file of featureFiles) {
    const fullPath = file;
    const scenarios = parseFeatureFile(fullPath);
    console.log("DEBUG: File", file, "-> scenarios:", scenarios ? scenarios.length : "null");
    if (scenarios) {
      for (const s of scenarios) {
        specs.push({
          scenarioId: s.scenarioId,
          reqId: s.reqId,
          capId: s.capId,
          name: s.name,
          line: s.line,
          file: file
        });
      }
    }
  }

  // Parse test results if provided
  let testResults = null;
  if (surefire || vitest) {
    testResults = parseTestResults(surefire, vitest);
  }

  const requirementsCoverage = countScenariosPerRequirement(featureFiles, requirements);

  const report = render(capabilities, specs, testResults, requirementsCoverage);

  if (outputArg) {
    fs.writeFileSync(outputArg, report, 'utf8');
    console.log(`Verification status report written to ${outputArg}`);
  } else {
    console.log(report);
  }
}

main();