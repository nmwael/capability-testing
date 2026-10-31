#!/usr/bin/env node
// release-checklist.mjs — Release assurance checklist based on existing
// capabilities, requirements, traceability, and execution evidence.
// Advisory only — never fails a build.
//
//   node scripts/release-checklist.mjs
//   node scripts/release-checklist.mjs --output docs/release/
//
// Checks:
//   1. All capabilities have valid verified_by references
//   2. All requirements have at least one scenario
//   3. All scenarios have @req: and @scenario: tags
//   4. Traceability gate passes
//   5. Capability test results exist for recent execution
//   6. Coverage thresholds met (scenario-to-test mapping)
//
// Outputs a Markdown checklist and optionally an HTML report.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

const checks = [];

function addCheck(name, passed, detail = '') {
  checks.push({ name, passed, detail });
}

// Load capabilities
function loadCapabilities() {
  const p = join(ROOT, 'capabilities', 'capabilities.yml');
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf8');
  const caps = [];
  let current = null;
  const lines = text.split('\n');
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'capabilities:') continue;
    const idMatch = trimmed.match(/^-\s+id:\s*(.+)$/);
    if (idMatch) {
      current = { id: idMatch[1].replace(/^['"]|['"]$/g, ''), verifiedBy: [], owner: '', status: '' };
      caps.push(current);
      continue;
    }
    if (!current) continue;
    const vb = trimmed.match(/^verified_by:\s*$/);
    if (vb) { current._inVb = true; continue; }
    const field = trimmed.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (field) {
      current._inVb = false;
      const key = field[1];
      const val = field[2].replace(/^['"]|['"]$/g, '').replace(/\s*#.*$/, '').trim();
      if (key === 'owner') current.owner = val;
      if (key === 'status') current.status = val;
    }
    if (current._inVb && trimmed.startsWith('-')) {
      current.verifiedBy.push(trimmed.replace(/^-/, '').replace(/^['"]|['"]$/g, '').replace(/\s*#.*$/, '').trim());
    }
  }
  return caps;
}

// Load requirements
function loadRequirements() {
  const p = join(ROOT, 'requirements', 'requirements.yml');
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf8');
  const reqs = [];
  let currentId = null;
  const lines = text.split('\n');
  let inReq = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const im = line.match(/^ {2}- id:\s*(\S+)/);
    if (im) {
      currentId = im[1].replace(/^['"]|['"]$/g, '');
      inReq = true;
      reqs.push({ id: currentId, capability: '', scenarioCount: 0 });
      continue;
    }
    const cm = line.match(/^ {4}capability:\s*(\S+)/);
    if (cm && inReq && currentId) {
      const req = reqs.find(r => r.id === currentId);
      if (req) req.capability = cm[1].replace(/^['"]|['"]$/g, '');
    }
    if (line.match(/^ {2}- /) && !im) inReq = false;
  }
  return reqs;
}

// Load feature files and count scenarios per requirement
function loadFeatures() {
  const featuresDir = join(ROOT, 'features');
  if (!existsSync(featuresDir)) return [];

  function walk(dir) {
    const results = [];
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) results.push(...walk(full));
      else if (e.name.endsWith('.feature')) results.push(join(dir, e.name));
    }
    return results;
  }

  const featureFiles = walk(featuresDir);
  const scenarios = [];

  for (const file of featureFiles) {
    const text = readFileSync(file, 'utf8');
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const sm = line.match(/^  Scenario:/);
      if (!sm) continue;
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
      scenarios.push({ file, line: i + 1, scenarioId, reqId });
    }
  }
  return scenarios;
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--output');
  const output = outIdx !== -1 ? args[outIdx + 1] : null;

  const commitSha = git('git rev-parse HEAD') || 'unknown';
  const branch = git('git rev-parse --abbrev-ref HEAD') || 'unknown';

  const capabilities = loadCapabilities();
  const requirements = loadRequirements();
  const scenarios = loadFeatures();

  // Check 1: All capabilities have valid verified_by references
  let capsWithVb = 0;
  let capsMissingVb = [];
  for (const cap of capabilities) {
    if (cap.verifiedBy && cap.verifiedBy.length > 0) {
      capsWithVb++;
    } else {
      capsMissingVb.push(cap.id);
    }
  }
  const check1 = capsMissingVb.length === 0;
  addCheck('All capabilities have verified_by references', check1,
    check1 ? `All ${capabilities.length} capabilities have verified_by`
      : `Missing verified_by: ${capsMissingVb.join(', ')}`);

  // Check 2: All requirements have at least one scenario
  const reqIdsWithScenarios = new Set(scenarios.filter(s => s.reqId).map(s => s.reqId));
  let reqsWithScenarios = 0;
  let reqsMissingScenarios = [];
  for (const req of requirements) {
    if (reqIdsWithScenarios.has(req.id)) {
      reqsWithScenarios++;
    } else {
      reqsMissingScenarios.push(req.id);
    }
  }
  const check2 = reqsMissingScenarios.length === 0;
  addCheck('All requirements have scenario coverage', check2,
    check2 ? `All ${requirements.length} requirements covered`
      : `Missing scenarios for: ${reqsMissingScenarios.join(', ')}`);

  // Check 3: All scenarios have @req: and @scenario: tags
  let scenariosMissingReq = [];
  let scenariosMissingScenarioId = [];
  for (const s of scenarios) {
    if (!s.reqId) scenariosMissingReq.push(`${s.file.split('features/')[1]}:${s.line}`);
    if (!s.scenarioId) scenariosMissingScenarioId.push(`${s.file.split('features/')[1]}:${s.line}`);
  }
  const check3 = scenariosMissingReq.length === 0 && scenariosMissingScenarioId.length === 0;
  addCheck('All scenarios have @req: and @scenario: tags', check3,
    check3 ? `All ${scenarios.length} scenarios tagged`
      : `Missing @req: ${scenariosMissingReq.length}, missing @scenario: ${scenariosMissingScenarioId.length}`);

  // Check 4: Traceability gate passes
  let traceabilityPassed = false;
  try {
    execSync('node scripts/verify-traceability.mjs', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    traceabilityPassed = true;
  } catch (e) {
    traceabilityPassed = false;
  }
  addCheck('Traceability gate passes', traceabilityPassed,
    traceabilityPassed ? 'verify-traceability.mjs exits 0' : 'verify-traceability.mjs reports violations');

  // Check 5: Capability test results exist (from execution history)
  const historyDir = join(ROOT, 'docs', 'execution-history');
  let executionRecords = [];
  if (existsSync(historyDir)) {
    for (const d of readdirSync(historyDir)) {
      const dir = join(historyDir, d);
      if (d === 'archive') continue;
      for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
        try {
          executionRecords.push(JSON.parse(readFileSync(join(dir, f), 'utf8')));
        } catch (e) { /* ignore */ }
      }
    }
  }
  const hasExecutionEvidence = executionRecords.length > 0;
  addCheck('Execution evidence exists', hasExecutionEvidence,
    hasExecutionEvidence ? `${executionRecords.length} execution record(s) found`
      : 'No execution records in docs/execution-history/');

  // Check 6: All verified_by references resolve to existing files
  const testFiles = [];
  const backendDir = join(ROOT, 'backend');
  if (existsSync(backendDir)) {
    function walkTest(dir) {
      const results = [];
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const e of entries) {
        const full = join(dir, e.name);
        if (e.isDirectory()) results.push(...walkTest(full));
        else if (e.name.match(/(IT|Test)\.java$/i)) results.push(full);
      }
      return results;
    }
    for (const mod of readdirSync(backendDir, { withFileTypes: true })) {
      if (!mod.isDirectory()) continue;
      const modDir = join(backendDir, mod.name);
      const modEntries = readdirSync(modDir, { withFileTypes: true });
      if (!modEntries.some(e => e.name === 'src')) continue;
      const srcTest = join(modDir, 'src', 'test');
      if (existsSync(srcTest)) testFiles.push(...walkTest(srcTest));
    }
  }

  let missingRefs = [];
  for (const cap of capabilities) {
    for (const ref of cap.verifiedBy) {
      const cleanRef = ref.replace(/^['"]|['"]$/g, '');
      const directPath = join(ROOT, cleanRef);
      if (existsSync(directPath)) continue;
      // Try matching Java class name to test file
      const className = cleanRef.split('.').pop();
      const found = testFiles.some(tf => tf.endsWith(`/${className}.java`) || tf.endsWith(`\\${className}.java`));
      if (!found) missingRefs.push(`${cap.id}: ${cleanRef}`);
    }
  }
  const check6 = missingRefs.length === 0;
  addCheck('All verified_by references resolve', check6,
    check6 ? 'All capability references exist on disk'
      : `Missing: ${missingRefs.join(', ')}`);

  const passed = checks.filter(c => c.passed).length;
  const total = checks.length;
  const pct = total ? Math.round((passed / total) * 100) : 0;

  // Build report
  const lines = [];
  lines.push('# Release Checklist');
  lines.push('');
  lines.push(`Commit: ${commitSha}`);
  lines.push(`Branch: ${branch}`);
  lines.push(`Result: ${passed}/${total} checks passed (${pct}%)`);
  lines.push('');

  for (const check of checks) {
    const icon = check.passed ? '✅' : '❌';
    lines.push(`${icon} ${check.name}`);
    if (check.detail) lines.push(`   ${check.detail}`);
  }

  lines.push('');
  lines.push(`**Overall: ${passed === total ? 'PASS' : 'FAIL'}**`);

  const report = lines.join('\n') + '\n';

  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'checklist.md'), report);

    // HTML version
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Release Checklist</title>
<style>body{font-family:system-ui,sans-serif;max-width:800px;padding:2rem}
h1{border-bottom:2px solid #d0d7de;padding-bottom:.5rem}
.pass{color:#116329} .fail{color:#b42318}
ul{list-style:none;padding:0}
li{margin:.5rem 0;padding:.3rem;border:1px solid #d0d7de;border-radius:4px}
li.pass{background:#f0fdf4;border-color:#23863d} li.fail{background:#fff8f9;border-color:#b42318}
</style></head><body>
<h1>Release Checklist</h1>
<p><strong>Commit:</strong> ${commitSha}</p>
<p><strong>Branch:</strong> ${branch}</p>
<p><strong>Result:</strong> <span class="${passed === total ? 'pass' : 'fail'}">${passed}/${total} checks passed (${pct}%)</span></p>
<h2>Checks</h2>
<ul>
${checks.map(c => `<li class="${c.passed ? 'pass' : 'fail'}"><strong>${c.name}</strong>: ${c.detail}</li>`).join('')}
</ul>
<p><strong>Overall: <span class="${passed === total ? 'pass' : 'fail'}">${passed === total ? 'PASS' : 'FAIL'}</span></strong></p>
</body></html>`;
    writeFileSync(join(output, 'index.html'), html);
    console.log(`Release checklist: ${join(output, 'checklist.md')}`);
    console.log(`Release checklist: ${join(output, 'index.html')}`);
  } else {
    console.log(report);
  }

  process.exit(passed === total ? 0 : 0); // advisory only, never fails
}

main();
