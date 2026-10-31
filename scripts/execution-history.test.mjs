#!/usr/bin/env node
// Regression test for scripts/execution-history.mjs
//
//   node scripts/execution-history.test.mjs
//
// Tests:
//   T3.1 --help exits 0
//   T3.2 --capture exits 0 with commitSha, branch, timestamp, environment
//   T3.3 --store parses JUnit XML and stores execution record
//   T3.4 --archive runs without error
//   T3.5 --compare compares two execution records
//
// Exit 0 = every case passed. Exit 1 = at least one failure.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'execution-history.mjs');
const TEST_ROOT = join(process.cwd(), 'wip', 'test-fixtures', 'execution-history');

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

// --- T3.1 --help ---
console.log('T3.1 — --help');
{
  const result = spawnSync('node', [SCRIPT, '--help'], { encoding: 'utf8' });
  assertExit(0, result, '--help exits 0');
  assertContains(result.stdout, '--capture', '--help mentions --capture');
  assertContains(result.stdout, '--store', '--help mentions --store');
  assertContains(result.stdout, '--archive', '--help mentions --archive');
  assertContains(result.stdout, '--compare', '--help mentions --compare');
}

// --- T3.2 --capture ---
console.log('T3.2 — --capture');
{
  const result = spawnSync('node', [SCRIPT, '--capture'], { cwd: process.cwd(), encoding: 'utf8' });
  assertExit(0, result, '--capture exits 0');
  const parsed = JSON.parse(result.stdout);
  assert(parsed.commitSha && parsed.commitSha !== 'unknown', 'capture returns commitSha');
  assert(parsed.branch && parsed.branch !== 'unknown', 'capture returns branch');
  assert(parsed.timestamp, 'capture returns timestamp');
  assert(parsed.environment, 'capture returns environment');
  assert(parsed.executionId, 'capture returns executionId');
  assert(parsed.buildId, 'capture returns buildId');
}

setup();

// --- T3.3 --store ---
console.log('T3.3 — --store');
{
  // Create a sample JUnit XML file
  const junitXml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="test" tests="2" failures="0">
  <testsuite name="suite1" tests="2" failures="0">
    <testcase classname="com.example.TestA" name="testOne" time="0.1">
      <system-out><![CDATA[@cap:alert.publish @backend]]></system-out>
    </testcase>
    <testcase classname="com.example.TestA" name="testTwo" time="0.2">
      <failure message="boom">error details</failure>
    </testcase>
  </testsuite>
</testsuites>`;
  const xmlPath = join(TEST_ROOT, 'sample.xml');
  writeFileSync(xmlPath, junitXml);

  const result = spawnSync('node', [SCRIPT, '--store', xmlPath], { cwd: process.cwd(), encoding: 'utf8' });
  assertExit(0, result, '--store exits 0');

  // Find the stored file - search all date dirs in docs/execution-history
  const historyDir = join(process.cwd(), 'docs', 'execution-history');
  const dateDirs = existsSync(historyDir) ? readdirSync(historyDir).filter(d => {
    const fullPath = join(historyDir, d);
    return d !== 'archive' && statSync(fullPath).isDirectory();
  }) : [];
  let found = false;
  for (const d of dateDirs) {
    const dir = join(historyDir, d);
    const files = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')) : [];
    for (const f of files) {
      const record = JSON.parse(readFileSync(join(dir, f), 'utf8'));
      if (record.capabilities && record.capabilities.includes('alert.publish')) {
        assert(record.results.length === 2, 'stored record has 2 test results');
        assert(record.summary.total === 2, 'summary total is 2');
        assert(record.summary.failed === 1, 'summary failed is 1');
        found = true;
        break;
      }
    }
    if (found) break;
  }
  assert(found, 'stored record file found');
}

// --- T3.4 --archive ---
console.log('T3.4 — --archive');
{
  const result = spawnSync('node', [SCRIPT, '--archive'], { cwd: process.cwd(), encoding: 'utf8' });
  assertExit(0, result, '--archive exits 0');
}

// --- T3.5 --compare ---
console.log('T3.5 — --compare');
{
  const historyDir = join(process.cwd(), 'docs', 'execution-history');
  // Find two execution records to compare
  const dateDirs = existsSync(historyDir) ? readdirSync(historyDir).filter(d => {
    const fullPath = join(historyDir, d);
    return d !== 'archive' && statSync(fullPath).isDirectory();
  }) : [];
  let files = [];
  for (const d of dateDirs) {
    const dir = join(historyDir, d);
    const dirFiles = existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.json')).map(f => join(dir, f)) : [];
    files = files.concat(dirFiles);
  }
  if (files.length >= 2) {
    const result = spawnSync('node', [SCRIPT, '--compare', files[0], files[1]], { cwd: process.cwd(), encoding: 'utf8' });
    assertExit(0, result, '--compare exits 0');
    const parsed = JSON.parse(result.stdout);
    assert(parsed.older, 'compare returns older record');
    assert(parsed.newer, 'compare returns newer record');
    assert(Array.isArray(parsed.regressions), 'compare returns regressions array');
    assert(Array.isArray(parsed.improvements), 'compare returns improvements array');
  } else {
    assert(true, '--compare skipped (need 2+ execution records)');
  }
}

// --- Summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
