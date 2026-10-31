#!/usr/bin/env node
// Regression test for scripts/verify-capabilities.js
//
//   node scripts/verify-capabilities.test.mjs
//
// Tests each validation rule:
//   - Capability ID uniqueness (T1.1)
//   - @cap: tag resolution to existing capability (T1.2)
//   - verified_by references resolve to existing files (T1.3)
//   - Feature files have exactly one @cap: tag (T1.4)
//   - Lane validation: feature file directory matches capability owner (T1.5)
//   - Orphaned feature detection (T1.6)
//   - Lifecycle status validation (T1.7)
//
// Exit 0 = every case passed. Exit 1 = at least one failure.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'verify-capabilities.js');
const FIXTURE_ROOT = join(process.cwd(), 'wip', 'test-fixtures', 'verify-capabilities');

let passed = 0;
let failed = 0;

function run(fixtureDir) {
  const capsPath = join(fixtureDir, 'capabilities.yml');
  const result = spawnSync('node', [SCRIPT, '--caps', capsPath], { cwd: fixtureDir, encoding: 'utf8' });
  return { exitCode: result.status, stdout: result.stdout, stderr: result.stderr };
}

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
  assert(result.exitCode === expectedExit, `${message} (expected exit ${expectedExit}, got ${result.exitCode})`);
}

function assertContains(haystack, needle, message) {
  assert(haystack.includes(needle), `${message} (expected output to contain: ${needle})`);
}

function assertNotContains(haystack, needle, message) {
  assert(!haystack.includes(needle), `${message} (expected output NOT to contain: ${needle})`);
}

// --- Setup fixtures ---
function setup() {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  mkdirSync(FIXTURE_ROOT, { recursive: true });
}

// Fixture: valid capabilities with no issues
function makeValidFixture() {
  const dir = join(FIXTURE_ROOT, 'valid');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
    verified_by:
      - "features/publication/alert-publish.feature"
  - id: alert.route
    intent: Route alerts
    owner: alerting
    status: active
    verified_by:
      - "features/alerting/alert-route.feature"
`);
  mkdirSync(join(dir, 'features', 'publication'), { recursive: true });
  mkdirSync(join(dir, 'features', 'alerting'), { recursive: true });
  writeFileSync(join(dir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  Scenario: publish
`);
  writeFileSync(join(dir, 'features', 'alerting', 'alert-route.feature'), `
@cap:alert.route @backend
Feature: Route alert
  Scenario: route
`);
  return dir;
}

// Fixture: duplicate capability IDs
function makeDuplicateIdFixture() {
  const dir = join(FIXTURE_ROOT, 'duplicate-id');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
  - id: alert.publish
    intent: Duplicate
    owner: publication
    status: draft
`);
  return dir;
}

// Fixture: @cap: tag references unknown capability
function makeUnknownCapFixture() {
  const dir = join(FIXTURE_ROOT, 'unknown-cap');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
`);
  mkdirSync(join(dir, 'features', 'publication'), { recursive: true });
  writeFileSync(join(dir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.nonexistent @backend
Feature: Publish alert
  Scenario: publish
`);
  return dir;
}

// Fixture: feature file with zero @cap: tags
function makeNoCapTagFixture() {
  const dir = join(FIXTURE_ROOT, 'no-cap-tag');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
`);
  mkdirSync(join(dir, 'features', 'publication'), { recursive: true });
  writeFileSync(join(dir, 'features', 'publication', 'no-cap.feature'), `
Feature: No capability tag
  Scenario: test
`);
  return dir;
}

// Fixture: wrong lane directory
function makeWrongLaneFixture() {
  const dir = join(FIXTURE_ROOT, 'wrong-lane');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
    verified_by:
      - "features/publication/alert-publish.feature"
`);
  mkdirSync(join(dir, 'features', 'alerting'), { recursive: true });
  writeFileSync(join(dir, 'features', 'alerting', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert in wrong lane
  Scenario: publish
`);
  return dir;
}

// Fixture: invalid lifecycle status
function makeInvalidStatusFixture() {
  const dir = join(FIXTURE_ROOT, 'invalid-status');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: frobnicate
    verified_by:
      - "features/publication/alert-publish.feature"
`);
  mkdirSync(join(dir, 'features', 'publication'), { recursive: true });
  writeFileSync(join(dir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  Scenario: publish
`);
  return dir;
}

// Fixture: missing verified_by reference
function makeMissingVerifiedByFixture() {
  const dir = join(FIXTURE_ROOT, 'missing-vb');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
    verified_by:
      - "features/publication/nonexistent.feature"
`);
  mkdirSync(join(dir, 'features', 'publication'), { recursive: true });
  writeFileSync(join(dir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  Scenario: publish
`);
  return dir;
}

// Fixture: orphaned feature file (not referenced by any capability)
function makeOrphanFixture() {
  const dir = join(FIXTURE_ROOT, 'orphan');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'capabilities.yml'), `
capabilities:
  - id: alert.publish
    intent: Publish alerts
    owner: publication
    status: active
    verified_by:
      - "features/publication/alert-publish.feature"
`);
  mkdirSync(join(dir, 'features', 'publication'), { recursive: true });
  writeFileSync(join(dir, 'features', 'publication', 'alert-publish.feature'), `
@cap:alert.publish @backend
Feature: Publish alert
  Scenario: publish
`);
  writeFileSync(join(dir, 'features', 'publication', 'orphaned.feature'), `
@cap:alert.publish @backend
Feature: Orphaned feature
  Scenario: test
`);
  return dir;
}

// --- Run tests ---

setup();

// T1.1: Capability ID uniqueness
console.log('T1.1 — Capability ID uniqueness');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'valid fixture passes');

  const dir2 = makeDuplicateIdFixture();
  const r2 = run(dir2);
  assertExit(1, r2, 'duplicate IDs fail');
  assertContains(r2.stderr, 'Duplicate capability IDs', 'reports duplicate IDs');
}

// T1.2: @cap: tag resolution
console.log('T1.2 — @cap: tag resolution');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'valid @cap: tags pass');

  const dir2 = makeUnknownCapFixture();
  const r2 = run(dir2);
  assertExit(1, r2, 'unknown @cap: capability fails');
  assertContains(r2.stderr, 'references unknown capability', 'reports unknown capability reference');
}

// T1.3: verified_by validation
console.log('T1.3 — verified_by validation');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'valid verified_by passes');

  const dir2 = makeMissingVerifiedByFixture();
  const r2 = run(dir2);
  assertExit(1, r2, 'missing verified_by reference fails');
  assertContains(r2.stderr, 'Reference not found', 'reports missing reference');
}

// T1.4: Feature capability tags
console.log('T1.4 — Feature capability tags');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'single @cap: tag passes');

  const dir2 = makeNoCapTagFixture();
  const r2 = run(dir2);
  assertExit(1, r2, 'zero @cap: tag fails');
  assertContains(r2.stderr, 'expected exactly one @cap: tag', 'reports missing @cap: tag');
}

// T1.5: Lane validation
console.log('T1.5 — Lane validation');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'correct lane passes');

  const dir2 = makeWrongLaneFixture();
  const r2 = run(dir2);
  assertExit(1, r2, 'wrong lane directory fails');
  assertContains(r2.stderr, 'Lane consistency failed', 'reports lane consistency error');
}

// T1.6: Orphaned feature detection
console.log('T1.6 — Orphaned feature detection');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'no orphaned features passes');

  const dir2 = makeOrphanFixture();
  const r2 = run(dir2);
  // Orphaned features are warnings, not errors - exit 0 but with warning
  assertExit(0, r2, 'orphan feature produces warning not error');
  const combined = r2.stdout + r2.stderr;
  assertContains(combined, 'Orphaned feature', 'reports orphaned feature');
}

// T1.7: Lifecycle status validation
console.log('T1.7 — Lifecycle status validation');
{
  const dir = makeValidFixture();
  const r = run(dir);
  assertExit(0, r, 'valid status passes');

  const dir2 = makeInvalidStatusFixture();
  const r2 = run(dir2);
  assertExit(0, r2, 'invalid status produces warning not error');
  const combined = r2.stdout + r2.stderr;
  assertContains(combined, 'Invalid status', 'reports invalid status');
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
