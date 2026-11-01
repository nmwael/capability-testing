const { readFileSync, writeFileSync, existsSync } = require('fs');
const { execSync } = require('child_process');
const { resolve } = require('path');

const BASELINE_FILE = '/workspaces/capability-testing/.capability-baseline.json';

function exec(cmd) {
  try { return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim(); } catch (e) { return ''; }
}

function computeHealth(cap) {
  const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
  let cs = 0, ms = 0, fl = 0, cc = 0, mc = 0, fc = 0, lr = null;

  for (const e of vb) {
    if (!e || typeof e !== 'object') continue;
    if (e.coverage !== undefined) { const v = parseInt(e.coverage); if (!isNaN(v)) { cs += v; cc++; } }
    if (e.mutation_score !== undefined) { const v = parseInt(e.mutation_score); if (!isNaN(v)) { ms += v; mc++; } }
    if (e.flakiness !== undefined) { const v = parseFloat(e.flakiness); if (!isNaN(v)) { fl += v; fc++; } }
    if (e.last_run) { const d = new Date(e.last_run); if (!isNaN(d.getTime()) && (!lr || d > lr)) lr = d; }
  }
  if (cc === 0 && mc === 0) return null;
  const ca = cc > 0 ? cs / cc : 50;
  const ma = mc > 0 ? ms / mc : 50;
  const fa = fc > 0 ? fl / fc : 0.1;
  let fr = 1;
  if (lr) { const ds = (Date.now() - lr.getTime()) / (1000 * 60 * 60 * 24); fr = Math.max(0, 1 - ds / 365); }
  const hs = Math.round(ca * 0.4 + ma * 0.3 + (1 - fa) * 100 * 0.2 + fr * 100 * 0.1);
  return Math.max(0, Math.min(100, hs));
}

function readCapabilities() {
  const capsPath = '/workspaces/capability-testing/capabilities/capabilities.yml';
  const text = require('fs').readFileSync(capsPath, 'utf8');
  const lines = text.split('\n');
  const caps = [];
  let currentCap = null;
  let inVerifiedBy = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'capabilities:') continue;
    if (trimmed === 'plans:') continue;

    const capMatch = line.match(/^ {2}- id:\s*(.+)$/);
    if (capMatch) {
      currentCap = { verified_by: [] };
      currentCap.id = capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
      inVerifiedBy = false;
      caps.push(currentCap);
      continue;
    }
    if (!currentCap) continue;

    const lanesMatch = line.match(/^ {4}lanes:\s*\[(.+)\]/);
    if (lanesMatch) { currentCap.lanes = lanesMatch[1].split(',').map(l => l.trim().replace(/^['"]|['"]$/g, '')); continue; }
    const depsMatch = line.match(/^ {4}dependencies:\s*\[(.+)\]/);
    if (depsMatch) { currentCap.dependencies = depsMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, '')); continue; }
    const lifecycleMatch = line.match(/^ {4}lifecycle_state:\s*(.*)$/);
    if (lifecycleMatch) { let val = lifecycleMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.lifecycle_state = val; } continue; }
    const githubMatch = line.match(/^ {4}github_team:\s*(.*)$/);
    if (githubMatch) { let val = githubMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.github_team = val; } continue; }
    const kv = line.match(/^ {4}(\w+):\s*(.*)$/);
    if (kv) { const key = kv[1]; let val = kv[2].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val === '') { inVerifiedBy = key === 'verified_by'; if (inVerifiedBy) currentCap.verified_by = []; continue; } val = val.replace(/^['"]|['"]$/g, ''); currentCap[key] = val; inVerifiedBy = false; continue; }
    if (inVerifiedBy) {
      const listItem = line.match(/^ {6}- \s*(.+)$/);
      if (listItem) { let v = listItem[1].trim(); if (v.startsWith('type:')) { const obj = {}; const parts = v.split(',').map(p => p.trim()); for (const part of parts) { const kvMatch = part.match(/^(\w+):\s*(.+)$/); if (kvMatch) { obj[kvMatch[1].trim()] = kvMatch[2].trim().replace(/^['"]|['"]$/g, ''); } } currentCap.verified_by.push(obj); currentCap._vbObjMode = true; } else { currentCap.verified_by.push({ type: 'unknown', ref: v.replace(/^['"]|['"]$/g, '').replace(/\s*#.*$/, '').trim() }); currentCap._vbObjMode = false; } continue; }
      if (currentCap._vbObjMode && line.startsWith('      ') && !trimmed.startsWith('-')) { const fieldMatch = line.match(/^ {8}(\w+):\s*(.*)$/); if (fieldMatch && currentCap.verified_by.length > 0) { const key = fieldMatch[1]; let val = fieldMatch[2].replace(/^['"]|['"]$/g, '').trim(); if (val) { const lastEntry = currentCap.verified_by[currentCap.verified_by.length - 1]; if (lastEntry && typeof lastEntry === 'object') { lastEntry[key] = val; } } continue; }
      if (currentCap._vbObjMode && !line.startsWith('      ')) { currentCap._vbObjMode = false; }
      inVerifiedBy = false;
    }
  }
  return caps;
}

function computeHealth(cap) {
  const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
  let cs = 0, ms = 0, fl = 0, cc = 0, mc = 0, fc = 0, lr = null;

  for (const e of vb) {
    if (!e || typeof e !== 'object') continue;
    if (e.coverage !== undefined) { const v = parseInt(e.coverage); if (!isNaN(v)) { cs += v; cc++; } }
    if (e.mutation_score !== undefined) { const v = parseInt(e.mutation_score); if (!isNaN(v)) { ms += v; mc++; } }
    if (e.flakiness !== undefined) { const v = parseFloat(e.flakiness); if (!isNaN(v)) { fl += v; fc++; } }
    if (e.last_run) { const d = new Date(e.last_run); if (!isNaN(d.getTime()) && (!lr || d > lr)) lr = d; }
  }
  if (cc === 0 && mc === 0) return null;
  const ca = cc > 0 ? cs / cc : 50;
  const ma = mc > 0 ? ms / mc : 50;
  const fa = fc > 0 ? fl / fc : 0.1;
  let fr = 1;
  if (lr) { const ds = (Date.now() - lr.getTime()) / (1000 * 60 * 60 * 24); fr = Math.max(0, 1 - ds / 365); }
  const hs = Math.round(ca * 0.4 + ma * 0.3 + (1 - fa) * 100 * 0.2 + fr * 100 * 0.1);
  return Math.max(0, Math.min(100, hs));
}

function readCapabilities() {
  const capsPath = '/workspaces/capability-testing/capabilities/capabilities.yml';
  const text = require('fs').readFileSync(capsPath, 'utf8');
  const lines = text.split('\n');
  const caps = [];
  let currentCap = null;
  let inVerifiedBy = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (trimmed === 'capabilities:') continue;
    if (trimmed === 'plans:') continue;

    const capMatch = line.match(/^ {2}- id:\s*(.+)$/);
    if (capMatch) {
      currentCap = { verified_by: [] };
      currentCap.id = capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
      inVerifiedBy = false;
      caps.push(currentCap);
      continue;
    }
    if (!currentCap) continue;

    const lanesMatch = line.match(/^ {4}lanes:\s*\[(.+)\]/);
    if (lanesMatch) { currentCap.lanes = lanesMatch[1].split(',').map(l => l.trim().replace(/^['"]|['"]$/g, '')); continue; }
    const depsMatch = line.match(/^ {4}dependencies:\s*\[(.+)\]/);
    if (depsMatch) { currentCap.dependencies = depsMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, '')); continue; }
    const lifecycleMatch = line.match(/^ {4}lifecycle_state:\s*(.*)$/);
    if (lifecycleMatch) { let val = lifecycleMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.lifecycle_state = val; } continue; }
    const githubMatch = line.match(/^ {4}github_team:\s*(.*)$/);
    if (githubMatch) { let val = githubMatch[1].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val !== '') { val = val.replace(/^['"]|['"]$/g, ''); currentCap.github_team = val; } continue; }
    const kv = line.match(/^ {4}(\w+):\s*(.*)$/);
    if (kv) { const key = kv[1]; let val = kv[2].trim(); val = val.split('#')[0].trim(); if (val.startsWith('#')) val = ''; if (val === '') { inVerifiedBy = key === 'verified_by'; if (inVerifiedBy) currentCap.verified_by = []; continue; } val = val.replace(/^['"]|['"]$/g, ''); currentCap[key] = val; inVerifiedBy = false; continue; }
    if (inVerifiedBy) {
      const listItem = line.match(/^ {6}- \s*(.+)$/);
      if (listItem) { let v = listItem[1].trim(); if (v.startsWith('type:')) { const obj = {}; const parts = v.split(',').map(p => p.trim()); for (const part of parts) { const kvMatch = part.match(/^(\w+):\s*(.+)$/); if (kvMatch) { obj[kvMatch[1].trim()] = kvMatch[2].trim().replace(/^['"]|['"]$/g, ''); } } currentCap.verified_by.push(obj); currentCap._vbObjMode = true; } else { currentCap.verified_by.push({ type: 'unknown', ref: v.replace(/^['"]|['"]$/g, '').replace(/\s*#.*$/, '').trim() }); currentCap._vbObjMode = false; } continue; }
      if (currentCap._vbObjMode && line.startsWith('      ') && !trimmed.startsWith('-')) { const fieldMatch = line.match(/^ {8}(\w+):\s*(.*)$/); if (fieldMatch && currentCap.verified_by.length > 0) { const key = fieldMatch[1]; let val = fieldMatch[2].replace(/^['"]|['"]$/g, '').trim(); if (val) { const lastEntry = currentCap.verified_by[currentCap.verified_by.length - 1]; if (lastEntry && typeof lastEntry === 'object') { lastEntry[key] = val; } } continue; }
      if (currentCap._vbObjMode && !line.startsWith('      ')) { currentCap._vbObjMode = false; }
      inVerifiedBy = false;
    }
  }
  return caps;
}

function computeHealth(cap) {
  const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
  let cs = 0, ms = 0, fl = 0, cc = 0, mc = 0, fc = 0, lr = null;

  for (const e of vb) {
    if (!e || typeof e !== 'object') continue;
    if (e.coverage !== undefined) { const v = parseInt(e.coverage); if (!isNaN(v)) { cs += v; cc++; } }
    if (e.mutation_score !== undefined) { const v = parseInt(e.mutation_score); if (!isNaN(v)) { ms += v; mc++; } }
    if (e.flakiness !== undefined) { const v = parseFloat(e.flakiness); if (!isNaN(v)) { fl += v; fc++; } }
    if (e.last_run) { const d = new Date(e.last_run); if (!isNaN(d.getTime()) && (!lr || d > lr)) lr = d; }
  }
  if (cc === 0 && mc === 0) return null;
  const ca = cc > 0 ? cs / cc : 50;
  const ma = mc > 0 ? ms / mc : 50;
  const fa = fc > 0 ? fl / fc : 0.1;
  let fr = 1;
  if (lr) { const ds = (Date.now() - lr.getTime()) / (1000 * 60 * 60 * 24); fr = Math.max(0, 1 - ds / 365); }
  const hs = Math.round(ca * 0.4 + ma * 0.3 + (1 - fa) * 100 * 0.2 + fr * 100 * 0.1);
  return Math.max(0, Math.min(100, hs));
}

function getCurrentHealth() {
  const caps = readCapabilities();
  const health = {};
  for (const cap of caps) {
    const score = computeHealth(cap);
    if (score !== null) health[cap.id] = score;
  }
  return health;
}

const BASELINE_FILE = '/workspaces/capability-testing/.capability-baseline.json';
const { readFileSync, writeFileSync, existsSync } = require('fs');

function loadBaseline() { if (existsSync(BASELINE_FILE)) return JSON.parse(require('fs').readFileSync(BASELINE_FILE, 'utf8')); return {}; }
function saveBaseline(health) { require('fs').writeFileSync('/workspaces/capability-testing/.capability-baseline.json', JSON.stringify(health, null, 2)); }

function checkRegression(current, baseline) {
  const regressions = [];
  for (const [id, currentScore] of Object.entries(current)) {
    const baselineScore = baseline[id];
    if (baselineScore !== undefined) {
      const drop = baselineScore - currentScore;
      if (drop > 5) { console.log(`REGRESSION: ${id} health dropped ${drop}% (${baselineScore} -> ${currentScore})`); regressions.push({ id, type: 'health_drop', baseline: baselineScore, current: currentScore, drop }); }
    }
    if (baselineScore === undefined) console.log(`NEW CAPABILITY: ${id} (health: ${currentScore})`);
  }
  for (const id of Object.keys(baseline)) { if (!current[id]) console.log(`REMOVED CAPABILITY: ${id}`); }
  return regressions;
}

function main() {
  console.log('Starting regression check...');
  const caps = readCapabilities();
  console.log('readCapabilities returned:', caps ? caps.length : "null");
  const health = {};
  for (const cap of caps) { const score = computeHealth(cap); if (score !== null) health[cap.id] = score; }
  console.log('Current health:', JSON.stringify(health, null, 2));
  const baseline = loadBaseline();
  console.log('Baseline:', JSON.stringify(baseline, null, 2));
  const regressions = checkRegression(health, baseline);
  if (regressions.length > 0) { console.error('REGRESSIONS:', regressions); process.exit(1); }
  console.log('✅ No regressions');
}

main();
}

}
