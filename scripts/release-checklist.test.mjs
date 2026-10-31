#!/usr/bin/env node
// Regression test for scripts/release-checklist.mjs
//
//   node scripts/release-checklist.test.mjs
//
// Tests:
//   T7.1 Release checklist runs and produces output
//   T7.2 All checks pass on clean repo state
//   T7.3 --output generates checklist.md and index.html
//
// Exit 0 = every case passed. Exit 1 = at least one failure.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'release-checklist.mjs');
const TEST_ROOT = join(process.cwd(), 'wip', 'test-fixtures', 'release-checklist');

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

function setup() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

// --- T7.1 Release checklist runs ---
console.log('T7.1 — Release checklist runs');
{
  const result = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8' });
  assertExit(0, result, 'release-checklist exits 0');
  assertContains(result.stdout, 'Release Checklist', 'output has checklist header');
  assertContains(result.stdout, 'Commit:', 'output shows commit');
  assertContains(result.stdout, 'Result:', 'output shows result');
  assertContains(result.stdout, 'Overall:', 'output shows overall status');
}

// --- T7.2 All checks pass ---
console.log('T7.2 — All checks pass');
{
  const result = spawnSync('node', [SCRIPT], { cwd: process.cwd(), encoding: 'utf8' });
  assertContains(result.stdout, '6/6 checks passed', 'all 6 checks pass');
  assertContains(result.stdout, 'All capabilities have verified_by references', 'check 1 present');
  assertContains(result.stdout, 'All requirements have scenario coverage', 'check 2 present');
  assertContains(result.stdout, 'All scenarios have @req: and @scenario: tags', 'check 3 present');
  assertContains(result.stdout, 'Traceability gate passes', 'check 4 present');
  assertContains(result.stdout, 'Execution evidence exists', 'check 5 present');
  assertContains(result.stdout, 'All verified_by references resolve', 'check 6 present');
}

// --- T7.3 --output generates files ---
console.log('T7.3 — --output generates files');
{
  const outDir = join(TEST_ROOT, 'output');
  const result = spawnSync('node', [SCRIPT, '--output', outDir], { cwd: process.cwd(), encoding: 'utf8' });
  assertExit(0, result, '--output exits 0');
  assert(existsSync(join(outDir, 'checklist.md')), 'creates checklist.md');
  assert(existsSync(join(outDir, 'index.html')), 'creates index.html');
  const md = readFileSync(join(outDir, 'checklist.md'), 'utf8');
  assertContains(md, 'Release Checklist', 'checklist.md has header');
  const html = readFileSync(join(outDir, 'index.html'), 'utf8');
  assertContains(html, 'Release Checklist', 'index.html has header');
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
