#!/usr/bin/env node
// change-impact.mjs — Git-based change impact analysis for capabilities
// and requirements. Advisory only — never fails a build.
//
//   node scripts/change-impact.mjs --since HEAD~1
//   node scripts/change-impact.mjs --since <commit> --output docs/impact/
//
// Detects files changed since <commit>, maps them to affected capabilities
// (via features/<lane>/ and capabilities.yml verified_by references) and
// affected requirements (via requirements.yml and feature @req: tags),
// then generates a Markdown/HTML impact report.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

function git(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return '';
  }
}

// Changed files since <ref>, one per line
function changedFiles(since) {
  let out = '';
  try {
    out = execSync(`git diff --name-only ${since}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    out = '';
  }
  try {
    const unstaged = execSync('git diff --name-only', { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (unstaged) out = out ? out + '\n' + unstaged : unstaged;
  } catch (e) {
    // no unstaged changes
  }
  const seen = new Set();
  const result = [];
  for (const f of (out || '').split('\n')) {
    if (f && !seen.has(f)) { seen.add(f); result.push(f); }
  }
  return result;
}

// Capability registry (minimal parse, dependency-free)
function parseCapabilities(text) {
  const capabilities = [];
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
      capabilities.push(current);
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
  return capabilities;
}

// Feature file parse: extract @cap:, @scenario:, @req: tags
function parseFeature(text) {
  const cap = text.match(/@cap:([\w:.-]+)/);
  const scenarios = [];
  const scRegex = /@scenario:(SC-[\w-]+)\s+@req:(REQ-\S+)/g;
  let m;
  while ((m = scRegex.exec(text)) !== null) {
    scenarios.push({ scenarioId: m[1], reqId: m[2] });
  }
  return { capId: cap ? cap[1] : null, scenarios };
}

// Load capabilities
function loadCapabilities() {
  const p = join(ROOT, 'capabilities', 'capabilities.yml');
  if (!existsSync(p)) return [];
  return parseCapabilities(readFileSync(p, 'utf8'));
}

// Load requirements
function loadRequirements() {
  const p = join(ROOT, 'requirements', 'requirements.yml');
  if (!existsSync(p)) return [];
  const text = readFileSync(p, 'utf8');
  const reqs = [];
  const idRe = /^ {2}- id:\s*(\S+)/gm;
  const capRe = /^ {4}capability:\s*(\S+)/gm;
  let idMatch;
  let currentId = null;
  const lines = text.split('\n');
  let inReq = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const im = trimmed.match(/^ {2}- id:\s*(\S+)/);
    if (im) {
      currentId = im[1].replace(/^['"]|['"]$/g, '');
      inReq = true;
      reqs.push({ id: currentId, capability: '' });
      continue;
    }
    const cm = trimmed.match(/^ {4}capability:\s*(\S+)/);
    if (cm && inReq && currentId) {
      const req = reqs.find(r => r.id === currentId);
      if (req) req.capability = cm[1].replace(/^['"]|['"]$/g, '');
    }
    if (trimmed.match(/^ {2}- /) && !im) inReq = false;
  }
  return reqs;
}

// Map a changed file to capabilities
function fileToCapabilities(file, capabilities, featureCache) {
  const result = new Set();

  // Direct capability registry change
  if (file === 'capabilities/capabilities.yml') {
    for (const c of capabilities) result.add(c.id);
    return result;
  }

  // Direct requirements change
  if (file === 'requirements/requirements.yml') {
    // handled separately via requirements
    return result;
  }

  // Feature file change -> map via @cap: tag
  if (file.endsWith('.feature')) {
    if (!featureCache.has(file)) {
      try {
        const text = readFileSync(join(ROOT, file), 'utf8');
        featureCache.set(file, parseFeature(text));
      } catch (e) {
        featureCache.set(file, { capId: null, scenarios: [] });
      }
    }
    const feat = featureCache.get(file);
    if (feat.capId) result.add(feat.capId);
  }

  // verified_by reference -> find capability that lists this file
  for (const cap of capabilities) {
    for (const ref of cap.verifiedBy) {
      if (ref === file || ref.endsWith('/' + file) || file.endsWith(ref)) {
        result.add(cap.id);
      }
    }
  }

  return result;
}

// Map a changed file to requirements
function fileToRequirements(file, requirements, featureCache) {
  const result = new Set();

  if (file === 'requirements/requirements.yml') {
    for (const r of requirements) result.add(r.id);
    return result;
  }

  if (file.endsWith('.feature')) {
    if (!featureCache.has(file)) {
      try {
        const text = readFileSync(join(ROOT, file), 'utf8');
        featureCache.set(file, parseFeature(text));
      } catch (e) {
        featureCache.set(file, { capId: null, scenarios: [] });
      }
    }
    const feat = featureCache.get(file);
    for (const sc of feat.scenarios) {
      if (sc.reqId) result.add(sc.reqId);
    }
  }

  return result;
}

function main() {
  const args = process.argv.slice(2);
  const sinceIdx = args.indexOf('--since');
  const outIdx = args.indexOf('--output');
  const since = sinceIdx !== -1 ? args[sinceIdx + 1] : 'HEAD~1';
  const output = outIdx !== -1 ? args[outIdx + 1] : null;

  const files = changedFiles(since);
  if (files.length === 0) {
    console.log(`No changes since ${since}`);
    process.exit(0);
  }

  const capabilities = loadCapabilities();
  const requirements = loadRequirements();
  const featureCache = new Map();

  const fileToCap = new Map();   // file -> Set<capId>
  const fileToReq = new Map();   // file -> Set<reqId>
  const capToFiles = new Map();  // capId -> Set<file>
  const reqToFiles = new Map();  // reqId -> Set<file>

  for (const file of files) {
    const caps = fileToCapabilities(file, capabilities, featureCache);
    const reqs = fileToRequirements(file, requirements, featureCache);
    fileToCap.set(file, caps);
    fileToReq.set(file, reqs);

    for (const capId of caps) {
      if (!capToFiles.has(capId)) capToFiles.set(capId, new Set());
      capToFiles.get(capId).add(file);
    }
    for (const reqId of reqs) {
      if (!reqToFiles.has(reqId)) reqToFiles.set(reqId, new Set());
      reqToFiles.get(reqId).add(file);
    }
  }

  // Build report
  const lines = [];
  lines.push('# Change Impact Report');
  lines.push('');
  lines.push(`Base commit: ${since}`);
  lines.push(`Changed files: ${files.length}`);
  lines.push('');

  lines.push('## Affected Capabilities');
  if (capToFiles.size === 0) {
    lines.push('(none)');
  } else {
    for (const [capId, fileSet] of [...capToFiles.entries()].sort()) {
      const cap = capabilities.find(c => c.id === capId);
      const owner = cap ? cap.owner : '?';
      const status = cap ? cap.status : '?';
      lines.push(`### ${capId} (${owner}, ${status})`);
      for (const f of [...fileSet].sort()) {
        lines.push(`- ${f}`);
      }
      lines.push('');
    }
  }

  lines.push('## Affected Requirements');
  if (reqToFiles.size === 0) {
    lines.push('(none)');
  } else {
    for (const [reqId, fileSet] of [...reqToFiles.entries()].sort()) {
      const req = requirements.find(r => r.id === reqId);
      const cap = req ? req.capability : '?';
      lines.push(`### ${reqId} (capability: ${cap})`);
      for (const f of [...fileSet].sort()) {
        lines.push(`- ${f}`);
      }
      lines.push('');
    }
  }

  lines.push('## Changed Files Detail');
  for (const file of files.sort()) {
    const caps = [...(fileToCap.get(file) || [])].join(', ') || '(none)';
    const reqs = [...(fileToReq.get(file) || [])].join(', ') || '(none)';
    lines.push(`- ${file}: capabilities=[${caps}], requirements=[${reqs}]`);
  }

  const report = lines.join('\n') + '\n';

  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'impact.md'), report);
    // Simple HTML version
    const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Change Impact Report</title>
<style>body{font-family:system-ui,sans-serif;max-width:900px;padding:2rem}
h1,h2,h3{border-bottom:1px solid #d0d7de;padding-bottom:.3rem}
pre{background:#f6f8fa;padding:.5rem;border-radius:4px;overflow:auto}
.badge{display:inline-block;padding:.1rem .4rem;border-radius:3px;font-size:.8rem;margin-right:.3rem}
.cap{background:#23863d;color:#fff} .req{background:#1b6ec2;color:#fff} .none{background:#8c959d;color:#fff}
</style></head><body>
<h1>Change Impact Report</h1>
<p>Base commit: <code>${since}</code></p>
<p>Changed files: ${files.length}</p>
<h2>Affected Capabilities</h2>
${capToFiles.size === 0 ? '<p>(none)</p>' : ''}
${[...capToFiles.entries()].sort().map(([capId, fileSet]) => {
  const cap = capabilities.find(c => c.id === capId);
  return `<h3><span class="badge cap">${capId}</span> (${cap ? cap.owner : '?'}, ${cap ? cap.status : '?'})</h3><ul>${[...fileSet].sort().map(f => `<li>${f}</li>`).join('')}</ul>`;
}).join('')}
<h2>Affected Requirements</h2>
${reqToFiles.size === 0 ? '<p>(none)</p>' : ''}
${[...reqToFiles.entries()].sort().map(([reqId, fileSet]) => {
  const req = requirements.find(r => r.id === reqId);
  return `<h3><span class="badge req">${reqId}</span> (capability: ${req ? req.capability : '?'})</h3><ul>${[...fileSet].sort().map(f => `<li>${f}</li>`).join('')}</ul>`;
}).join('')}
<h2>Changed Files Detail</h2>
<ul>${files.sort().map(file => {
  const caps = [...(fileToCap.get(file) || [])].join(', ') || '(none)';
  const reqs = [...(fileToReq.get(file) || [])].join(', ') || '(none)';
  return `<li><code>${file}</code>: capabilities=[${caps}], requirements=[${reqs}]</li>`;
}).join('')}</ul>
</body></html>`;
    writeFileSync(join(output, 'index.html'), html);
    console.log(`Impact report: ${join(output, 'impact.md')}`);
    console.log(`Impact report: ${join(output, 'index.html')}`);
  } else {
    console.log(report);
  }
}

main();
