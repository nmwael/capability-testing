#!/usr/bin/env node
// Regression test for scripts/change-impact.mjs
//
//   node scripts/change-impact.test.mjs
//
// Tests:
//   T6.1 --since detects changed files (unstaged)
//   T6.2 maps changed feature files to capabilities via @cap:
//   T6.3 maps changed feature files to requirements via @req:
//   T6.4 generates impact report (Markdown/HTML)
//   T6.5 no changes returns empty
//
// Exit 0 = every case passed. Exit 1 = at least one failure.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'change-impact.mjs');
const TEST_ROOT = join(process.cwd(), 'wip', 'test-fixtures', 'change-impact');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertExit(expectedExit, result, message) {
  assert(result.status === expectedExit, `${message} (expected exit ${expectedExit}, got ${result.status})`);
}

function assertContains(haystack, needle, message) {
  assert(haystack.includes(needle), `${message} (expected output to contain: ${needle})`);
}

function assertNotContains(haystack, needle, message) {
  assert(!haystack.includes(needle), `${message} (expected output NOT to contain: ${needle})`);
}

function setup() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });

  const repoDir = join(TEST_ROOT, 'repo');
  mkdirSync(repoDir, { recursive: true });

  // Init git repo
  spawnSync('git', ['init'], { cwd: repoDir, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.email', 'test@test.com'], { cwd: repoDir, encoding: 'utf8' });
  spawnSync('git', ['config', 'user.name', 'Test'], { cwd: repoDir, encoding: 'utf8' });

  // Create capabilities.yml
  mkdirSync(join(repoDir, 'capabilities'), { recursive: true });
  writeFileSync(join(repoDir, 'capabilities', 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
    verified_by:
      - "AlertPublishIT"
      - "features/publication/alert-publish.feature"
  - id: alert.route
    intent: Route alerts
    owner: alerting
    status: active
    verified_by:
      - "AlertRouteIT"
      - "features/alerting/alert-route.feature"
`);

  // Create requirements.yml
  mkdirSync(join(repoDir, 'requirements'), { recursive: true });
  writeFileSync(join(repoDir, 'requirements', 'requirements.yml'), `
requirements:
  - id: REQ-PUB-001
    capability: alert.publish
    status: active
  - id: REQ-ALERT-001
    capability: alert.route
    status: active
`);

  // Create feature files
  mkdirSync(join(repoDir, 'features', 'publication'), { recursive: true });
  writeFileSync(join(repoDir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  @scenario:SC-PUB-001 @req:REQ-PUB-001
  Scenario: Publish alert
`);

  mkdirSync(join(repoDir, 'features', 'alerting'), { recursive: true });
  writeFileSync(join(repoDir, 'features', 'alerting', 'alert-route.feature'), `
@cap:alert.route @backend
Feature: Route alert
  @scenario:SC-ALERT-001 @req:REQ-ALERT-001
  Scenario: Route alert
`);

  // Initial commit
  spawnSync('git', ['add', '.'], { cwd: repoDir, encoding: 'utf8' });
  spawnSync('git', ['commit', '-m', 'initial'], { cwd: repoDir, encoding: 'utf8' });

  return repoDir;
}

// --- Run tests ---

setup();
const repoDir = join(TEST_ROOT, 'repo');

// T6.1 — Change detection (unstaged changes)
console.log('T6.1 — Change detection');
{
  // Modify a feature file (unstaged)
  writeFileSync(join(repoDir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  @scenario:SC-PUB-001 @req:REQ-PUB-001
  Scenario: Publish alert
  @scenario:SC-PUB-002 @req:REQ-PUB-001
  Scenario: Publish alert v2
`);

  const result = spawnSync('node', [SCRIPT, '--since', 'HEAD'], { cwd: repoDir, encoding: 'utf8' });
  assertExit(0, result, '--since exits 0');
  assertContains(result.stdout, 'features/publication/alert-publish.feature', 'detects changed feature file');
}

// T6.2 — Capability mapping
console.log('T6.2 — Capability mapping');
{
  const result = spawnSync('node', [SCRIPT, '--since', 'HEAD'], { cwd: repoDir, encoding: 'utf8' });
  assertContains(result.stdout, 'alert.publish', 'maps feature change to capability alert.publish');
  assertNotContains(result.stdout, 'alert.route', 'does not map unrelated capability');
}

// T6.3 — Requirement mapping
console.log('T6.3 — Requirement mapping');
{
  const result = spawnSync('node', [SCRIPT, '--since', 'HEAD'], { cwd: repoDir, encoding: 'utf8' });
  assertContains(result.stdout, 'REQ-PUB-001', 'maps feature change to requirement REQ-PUB-001');
}

// T6.4 — Impact report output
console.log('T6.4 — Impact report output');
{
  const outDir = join(TEST_ROOT, 'output');
  const result = spawnSync('node', [SCRIPT, '--since', 'HEAD', '--output', outDir], { cwd: repoDir, encoding: 'utf8' });
  assertExit(0, result, '--output exits 0');
  assert(existsSync(join(outDir, 'impact.md')), 'creates impact.md');
  assert(existsSync(join(outDir, 'index.html')), 'creates index.html');
  const md = readFileSync(join(outDir, 'impact.md'), 'utf8');
  assertContains(md, 'alert.publish', 'impact.md mentions capability');
  assertContains(md, 'REQ-PUB-001', 'impact.md mentions requirement');
}

// T6.5 — No changes
console.log('T6.5 — No changes');
{
  // Revert the change
  writeFileSync(join(repoDir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  @scenario:SC-PUB-001 @req:REQ-PUB-001
  Scenario: Publish alert
`);

  const result = spawnSync('node', [SCRIPT, '--since', 'HEAD'], { cwd: repoDir, encoding: 'utf8' });
  assertExit(0, result, 'no changes exits 0');
  assertContains(result.stdout, 'No changes since HEAD', 'reports no changes');
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
