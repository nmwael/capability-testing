#!/usr/bin/env node
// Traceability gate: verifies requirements, scenario IDs, and the links between
// requirements, capabilities, and scenarios. Dependency-free (no `yaml` package).
//
// Exit codes:
//   0 — all references resolve, no duplicates
//   1 — any violation (dangling ref, duplicate id, empty input, tombstone reuse, ...)
//
// Usage:
//   node scripts/verify-traceability.mjs
//   node scripts/verify-traceability.mjs --requirements <path> --features <dir>

import fs from 'fs';
import path from 'path';

const repoRoot = process.cwd();

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : null;
}

const requirementsArg = argValue('--requirements');
const featuresArg = argValue('--features');

const requirementsPath = requirementsArg
  ? path.resolve(repoRoot, requirementsArg)
  : path.join(repoRoot, 'requirements', 'requirements.yml');
const featuresDir = featuresArg ? path.resolve(repoRoot, featuresArg) : path.join(repoRoot, 'features');
const capabilitiesPath = path.join(repoRoot, 'capabilities', 'capabilities.yml');
const tombstonePath = path.join(repoRoot, 'features', '.retired-ids.yml');

const errors = [];

// ---- tiny YAML subset for requirements.yml (top-level `requirements:` list of maps) ----
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

// ---- read requirements ----
let requirements;
try {
  const text = fs.readFileSync(requirementsPath, 'utf8');
  requirements = parseRequirementsYaml(text);
} catch (e) {
  errors.push(`cannot read requirements file: ${path.relative(repoRoot, requirementsPath)}`);
  printAndExit();
}

if (!requirements || requirements.length === 0) {
  errors.push('No requirements found — requirements file is missing or empty');
  printAndExit();
}

// duplicate requirement ids
const reqIds = requirements.map(r => r.id);
const dupReqIds = reqIds.filter((id, i) => reqIds.indexOf(id) !== i);
if (dupReqIds.length) {
  for (const id of new Set(dupReqIds)) errors.push(`Duplicate requirement id: ${id}`);
}

// capability index from capabilities/capabilities.yml
let capabilities = [];
try {
  const capsText = fs.readFileSync(capabilitiesPath, 'utf8');
  const capMatches = capsText.match(/^ {2}- id:\s*(\S+)/gm);
  capabilities = (capMatches || []).map(m => m.split('id:')[1].trim());
} catch (e) {
  errors.push(`cannot read capabilities file: capabilities/capabilities.yml`);
  printAndExit();
}

// validate each requirement
for (const req of requirements) {
  if (!req.id) {
    errors.push('Requirement without an id');
    continue;
  }
  if (!req.capability) {
    errors.push(`Requirement '${req.id}' has no capability:`);
    continue;
  }
  if (!capabilities.includes(req.capability)) {
    errors.push(`Requirement '${req.id}' references unknown capability '${req.capability}'`);
  }
}

// ---- read feature files ----
function walk(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...walk(full));
    } else if (e.name.endsWith('.feature')) {
      results.push(path.relative(repoRoot, full));
    }
  }
  return results;
}

let featureFiles;
try {
  featureFiles = walk(featuresDir).sort();
} catch (e) {
  errors.push(`cannot read features directory: features/`);
  printAndExit();
}

if (featureFiles.length === 0) {
  errors.push('No feature files found — cannot compute traceability on an empty input set');
  printAndExit();
}

// tombstone ids
let retiredIds = [];
try {
  const tombstoneText = fs.readFileSync(tombstonePath, 'utf8');
  retiredIds = [...tombstoneText.matchAll(/^ {2}- id:\s*(SC-\S+)/gm)].map(m => m[1]);
} catch (e) {
  // tombstone may not exist yet — that's fine, no retired ids
}

// parse feature files
const scenarios = []; // { file, line, scenarioId, reqId, capId }
const fileCapIds = {}; // file -> @cap: id (from feature-level tags)

for (const file of featureFiles) {
  const text = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const lines = text.split('\n');

  // feature-level @cap: tag (only before `Feature:`)
  const head = text.split(/^[ \t]*Feature:/m)[0];
  const capTags = head.match(/^@cap:(\S+)/gm);
  let capId = null;
  if (capTags) {
    if (capTags.length > 1) {
      errors.push(`${file}: more than one @cap: tag`);
    } else {
      capId = capTags[0].slice('@cap:'.length);
      fileCapIds[file] = capId;
    }
  }

  // scan scenario lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const sm = line.match(/^  Scenario:/);
    if (!sm) continue;

    // collect scenario-level tags immediately above this scenario
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

    scenarios.push({ file, line: i + 1, scenarioId, reqId, capId });
  }
}

if (scenarios.length === 0) {
  errors.push('No scenarios found — cannot compute traceability on an empty input set');
  printAndExit();
}

// duplicate scenario ids
const allScenarioIds = scenarios.map(s => s.scenarioId).filter(Boolean);
const dupScenarioIds = allScenarioIds.filter((id, i) => allScenarioIds.indexOf(id) !== i);
for (const id of new Set(dupScenarioIds)) {
  errors.push(`Duplicate scenario id: ${id}`);
}

// tombstone reuse
for (const s of scenarios) {
  if (s.scenarioId && retiredIds.includes(s.scenarioId)) {
    errors.push(`${s.file}:${s.line}: scenario id '${s.scenarioId}' is retired (tombstoned) — do not reuse`);
  }
}

// requirement coverage: every scenario must have @req:
for (const s of scenarios) {
  if (!s.reqId) {
    errors.push(`${s.file}:${s.line}: scenario has no @req: tag`);
  }
}

// every scenario must have a stable @scenario: ID
const scenarioIdFormat = /^SC-(ALERT|PUB|DOCS|FRONT)-\d{3}$/;
for (const s of scenarios) {
  if (!s.scenarioId) {
    errors.push(`${s.file}:${s.line}: scenario has no @scenario: tag`);
  } else if (!scenarioIdFormat.test(s.scenarioId)) {
    errors.push(
      `${s.file}:${s.line}: scenario id '${s.scenarioId}' does not match format SC-<LANE>-<nnn>`
    );
  }
}

// every @req: must name an existing requirement
const reqIdSet = new Set(reqIds);
for (const s of scenarios) {
  if (s.reqId && !reqIdSet.has(s.reqId)) {
    errors.push(`${s.file}:${s.line}: @req:'${s.reqId}' is not a known requirement`);
  }
}

// every @req: must match the file's @cap: capability
for (const s of scenarios) {
  if (s.reqId && s.capId) {
    const req = requirements.find(r => r.id === s.reqId);
    if (req && req.capability !== s.capId) {
      errors.push(
        `${s.file}:${s.line}: @req:'${s.reqId}' (capability '${req.capability}') ` +
          `does not match file @cap:'${s.capId}'`
      );
    }
  }
}

// every requirement must have at least one scenario
const scenarioReqIds = new Set(scenarios.map(s => s.reqId).filter(Boolean));
for (const req of requirements) {
  if (!scenarioReqIds.has(req.id)) {
    errors.push(`Requirement '${req.id}' has no scenario`);
  }
}

function printAndExit() {
  if (errors.length > 0) {
    console.error('Traceability check FAILED:');
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `Traceability check PASSED (${requirements.length} requirements, ${scenarios.length} scenarios)`
  );
  process.exit(0);
}

printAndExit();
