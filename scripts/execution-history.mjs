#!/usr/bin/env node
// execution-history.mjs — capture, store, archive, and compare test execution history.
// Advisory only — never fails a build.
//
//   node scripts/execution-history.mjs --help
//   node scripts/execution-history.mjs --capture          # capture current execution metadata
//   node scripts/execution-history.mjs --store FILE       # store a JUnit XML result under docs/execution-history/
//   node scripts/execution-history.mjs --archive          # archive old runs to docs/execution-history/archive/
//   node scripts/execution-history.mjs --compare FILE1 FILE2  # compare two execution records (regression detection)

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync, renameSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';

const ROOT = process.cwd();
const HISTORY_DIR = join(ROOT, 'docs', 'execution-history');
const ARCHIVE_DIR = join(HISTORY_DIR, 'archive');

function nowIso() {
  return new Date().toISOString();
}

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return null;
  }
}

function capture() {
  const commitSha = git('git rev-parse HEAD') || 'unknown';
  const branch = git('git rev-parse --abbrev-ref HEAD') || 'unknown';
  const buildId = process.env.CI_BUILD_ID || process.env.GITHUB_RUN_ID || `manual-${Date.now()}`;
  const timestamp = nowIso();
  const environment = {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    ci: process.env.CI || 'false',
    githubActions: process.env.GITHUB_ACTIONS || 'false',
    cwd: ROOT,
  };

  const record = {
    executionId: `${timestamp.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}-${buildId}`,
    commitSha,
    branch,
    buildId,
    timestamp,
    environment,
    results: [],
  };

  console.log(JSON.stringify(record, null, 2));
  return record;
}

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function extractTestResults(xmlContent) {
  const results = [];
  // Match <testcase ... name="..." classname="..." ...> (either attribute order)
  const testcaseRegex = /<testcase[^>]*?name="([^"]+)"[^>]*?classname="([^"]+)"[^>]*?time="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g;
  const testcaseNameFirstRegex = /<testcase[^>]*?classname="([^"]+)"[^>]*?name="([^"]+)"[^>]*?time="([^"]*)"[^>]*>([\s\S]*?)<\/testcase>/g;
  const testcaseSelfClosingRegex = /<testcase[^>]*?name="([^"]+)"[^>]*?classname="([^"]+)"[^>]*?time="([^"]*)"[^>]*?\/>/g;
  const testcaseSelfClosingNameFirstRegex = /<testcase[^>]*?classname="([^"]+)"[^>]*?name="([^"]+)"[^>]*?time="([^"]*)"[^>]*?\/>/g;

  function addResult(name, classname, time, body = '') {
    const failures = (body.match(/<failure/g) || []).length;
    results.push({ name, classname, time: parseFloat(time) || 0, failures, status: failures > 0 ? 'failed' : 'passed' });
  }

  let match;
  while ((match = testcaseRegex.exec(xmlContent)) !== null) {
    addResult(match[1], match[2], match[3], match[4]);
  }
  while ((match = testcaseNameFirstRegex.exec(xmlContent)) !== null) {
    addResult(match[2], match[1], match[3], match[4]);
  }
  while ((match = testcaseSelfClosingRegex.exec(xmlContent)) !== null) {
    addResult(match[1], match[2], match[3]);
  }
  while ((match = testcaseSelfClosingNameFirstRegex.exec(xmlContent)) !== null) {
    addResult(match[2], match[1], match[3]);
  }
  return results;
}

function extractCapabilityTags(xmlContent) {
  const caps = new Set();
  const capRegex = /@cap:([\w:.-]+)/g;
  let match;
  while ((match = capRegex.exec(xmlContent)) !== null) {
    caps.add(match[1]);
  }
  return Array.from(caps);
}

function extractScenarioIds(xmlContent) {
  const scenarios = new Set();
  const scRegex = /@scenario:(SC-[\w-]+)/g;
  let match;
  while ((match = scRegex.exec(xmlContent)) !== null) {
    scenarios.add(match[1]);
  }
  return Array.from(scenarios);
}

function store(junitXmlPath) {
  if (!existsSync(junitXmlPath)) {
    console.error(`ERROR: ${junitXmlPath} not found`);
    process.exit(1);
  }

  const content = readFileSync(junitXmlPath, 'utf8');
  const metadata = capture();
  const testResults = extractTestResults(content);
  const capabilities = extractCapabilityTags(content);
  const scenarioIds = extractScenarioIds(content);

  // Associate each test result with capabilities and scenarios
  for (const result of testResults) {
    result.capabilities = capabilities;
    result.scenarioIds = scenarioIds;
  }

  const dateDir = join(HISTORY_DIR, metadata.timestamp.slice(0, 10));
  ensureDir(dateDir);

  const outPath = join(dateDir, `${metadata.executionId}.json`);
  const record = {
    ...metadata,
    source: junitXmlPath,
    results: testResults,
    capabilities,
    scenarioIds,
    summary: {
      total: testResults.length,
      passed: testResults.filter(r => r.status === 'passed').length,
      failed: testResults.filter(r => r.status === 'failed').length,
    },
  };
  writeFileSync(outPath, JSON.stringify(record, null, 2));
  console.log(`Stored execution record: ${outPath}`);
}

function archive() {
  ensureDir(ARCHIVE_DIR);
  const today = new Date().toISOString().slice(0, 10);
  const todayDir = join(HISTORY_DIR, today);
  let archived = 0;

  if (existsSync(HISTORY_DIR)) {
    for (const entry of readdirSync(HISTORY_DIR)) {
      const full = join(HISTORY_DIR, entry);
      if (!statSync(full).isDirectory()) continue;
      if (entry === 'archive' || entry === today) continue;
      renameSync(full, join(ARCHIVE_DIR, entry));
      archived++;
    }
  }

  console.log(`Archived ${archived} old execution run(s) to ${ARCHIVE_DIR}`);
}

function compare(file1, file2) {
  if (!existsSync(file1)) {
    console.error(`ERROR: ${file1} not found`);
    process.exit(1);
  }
  if (!existsSync(file2)) {
    console.error(`ERROR: ${file2} not found`);
    process.exit(1);
  }

  const a = JSON.parse(readFileSync(file1, 'utf8'));
  const b = JSON.parse(readFileSync(file2, 'utf8'));

  const failuresA = new Map();
  const failuresB = new Map();

  for (const r of a.results || []) {
    failuresA.set(r.capability || r.name, r.failures || 0);
  }
  for (const r of b.results || []) {
    failuresB.set(r.capability || r.name, r.failures || 0);
  }

  const allKeys = new Set([...failuresA.keys(), ...failuresB.keys()]);
  const regressions = [];
  const improvements = [];

  for (const key of allKeys) {
    const fa = failuresA.get(key) || 0;
    const fb = failuresB.get(key) || 0;
    if (fb > fa) regressions.push({ capability: key, from: fa, to: fb, added: fb - fa });
    else if (fb < fa) improvements.push({ capability: key, from: fa, to: fb, fixed: fa - fb });
  }

  const report = {
    older: { executionId: a.executionId, timestamp: a.timestamp, commitSha: a.commitSha },
    newer: { executionId: b.executionId, timestamp: b.timestamp, commitSha: b.commitSha },
    regressions,
    improvements,
    unchanged: allKeys.size - regressions.length - improvements.length,
  };

  console.log(JSON.stringify(report, null, 2));
  return report;
}

function help() {
  console.log(`
usage: node scripts/execution-history.mjs [--help|--capture|--store FILE|--archive|--compare FILE1 FILE2]

Options:
  --help              Show this help
  --capture           Capture current execution metadata (commit SHA, branch, build ID, timestamp, environment)
  --store FILE        Store a JUnit XML result under docs/execution-history/<date>/<id>.json
  --archive           Archive old execution runs to docs/execution-history/archive/
  --compare FILE1 FILE2 Compare two execution records (regression detection)
`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  help();
  process.exit(0);
}

if (args.includes('--capture')) {
  capture();
  process.exit(0);
}

const storeIdx = args.indexOf('--store');
if (storeIdx !== -1) {
  store(args[storeIdx + 1]);
  process.exit(0);
}

if (args.includes('--archive')) {
  archive();
  process.exit(0);
}

const compareIdx = args.indexOf('--compare');
if (compareIdx !== -1) {
  compare(args[compareIdx + 1], args[compareIdx + 2]);
  process.exit(0);
}

console.error('ERROR: unknown option');
help();
process.exit(1);
