#!/usr/bin/env node
// regression-check.mjs — Capability regression detection
// Compares current capability health/evidence against baseline
// Exits 0 on no regression, 1 on regression detected

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASELINE_FILE = join(ROOT, 'docs', 'capability-baseline.json');

function parseCapabilities(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const caps = [];
  let current = null;
  let inVerifiedBy = false;
  
  for (const line of lines) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    
    const capMatch = line.match(/^ {2}- id:\s*(.+)$/);
    if (capMatch) {
      if (current) caps.push(current);
      current = { id: capMatch[1].split('#')[0].trim().replace(/^['"]|['"]$/g, ''), verified_by: [] };
      inVerifiedBy = false;
      continue;
    }
    
    if (!current) continue;
    
    const lanesMatch = line.match(/^ {4}lanes:\s*\[(.+)\]/);
    if (lanesMatch) {
      current.lanes = lanesMatch[1].split(',').map(l => l.trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    
    const depsMatch = line.match(/^ {4}dependencies:\s*\[(.+)\]/);
    if (depsMatch) {
      current.dependencies = depsMatch[1].split(',').map(d => d.trim().replace(/^['"]|['"]$/g, ''));
      continue;
    }
    
    const lifecycleMatch = line.match(/^ {4}lifecycle_state:\s*(.*)$/);
    if (lifecycleMatch) {
      let val = lifecycleMatch[1].trim().split('#')[0].trim();
      if (val && !val.startsWith('#')) {
        current.lifecycle_state = val.replace(/^['"]|['"]$/g, '');
      }
      continue;
    }
    
    const kv = line.match(/^ {4}(\w+):\s*(.*)$/);
    if (kv) {
      let val = kv[2].trim().split('#')[0].trim();
      if (val && !val.startsWith('#')) {
        current[kv[1]] = val.replace(/^['"]|['"]$/g, '');
      }
      inVerifiedBy = kv[1] === 'verified_by';
      if (inVerifiedBy) current.verified_by = [];
      continue;
    }
    
    if (inVerifiedBy) {
      const listItem = line.match(/^ {6}-\s*(.+)$/);
      if (listItem) {
        let v = listItem[1].split('#')[0].trim().replace(/^['"]|['"]$/g, '');
        if (v.startsWith('type:')) {
          const obj = {};
          for (const part of v.split(',').map(p => p.trim())) {
            const kvMatch = part.match(/^(\w+):\s*(.+)$/);
            if (kvMatch) obj[kvMatch[1].trim()] = kvMatch[2].trim().replace(/^['"]|['"]$/g, '');
          }
          current.verified_by.push(obj);
          current._vbObjMode = true;
        } else {
          current.verified_by.push({ type: 'unknown', ref: v });
          current._vbObjMode = false;
        }
        continue;
      }
      
      const objFieldMatch = line.match(/^ {8}(\w+):\s*(.*)$/);
      if (objFieldMatch && current._vbObjMode && current.verified_by.length > 0) {
        const lastEntry = current.verified_by[current.verified_by.length - 1];
        if (typeof lastEntry === 'object') {
          let val = objFieldMatch[2].trim().split('#')[0].trim();
          if (val && !val.startsWith('#')) {
            lastEntry[objFieldMatch[1]] = val.replace(/^['"]|['"]$/g, '');
          }
        }
        continue;
      }
      if (!objFieldMatch) current._vbObjMode = false;
    }
  }
  if (current) caps.push(current);
  return caps;
}

function computeHealthScore(cap) {
  const vb = Array.isArray(cap.verified_by) ? cap.verified_by : [];
  if (vb.length === 0) return null;
  
  let coverageSum = 0, mutationSum = 0, flakinessSum = 0, coverageCount = 0, mutationCount = 0, flakinessCount = 0;
  let latestRun = null;
  
  for (const entry of vb) {
    if (!entry || typeof entry !== 'object') continue;
    if (entry.coverage !== undefined) {
      const cov = parseInt(entry.coverage, 10);
      if (!isNaN(cov)) { coverageSum += cov; coverageCount++; }
    }
    if (entry.mutation_score !== undefined) {
      const ms = parseInt(entry.mutation_score, 10);
      if (!isNaN(ms)) { mutationSum += ms; mutationCount++; }
    }
    if (entry.flakiness !== undefined) {
      const fl = parseFloat(entry.flakiness);
      if (!isNaN(fl)) { flakinessSum += fl; flakinessCount++; }
    }
    if (entry.last_run) {
      const runDate = new Date(entry.last_run);
      if (!isNaN(runDate.getTime()) && (!latestRun || runDate > latestRun)) {
        latestRun = runDate;
      }
    }
  }
  
  if (coverageCount === 0 && mutationCount === 0) return null;
  
  const coverageAvg = coverageCount > 0 ? coverageSum / coverageCount : 50;
  const mutationAvg = mutationCount > 0 ? mutationSum / mutationCount : 50;
  const flakinessAvg = flakinessCount > 0 ? flakinessSum / flakinessCount : 0.1;
  
  let freshness = 1.0;
  if (latestRun) {
    const daysSinceRun = (Date.now() - latestRun.getTime()) / (1000 * 60 * 60 * 24);
    freshness = Math.max(0, 1 - daysSinceRun / 365);
  }
  
  return Math.round(
    coverageAvg * 0.4 + mutationAvg * 0.3 + (1 - flakinessAvg) * 100 * 0.2 + freshness * 100 * 0.1
  );
}

function main() {
  const capsPath = join(ROOT, 'capabilities', 'capabilities.yml');
  if (!existsSync(capsPath)) {
    console.error('capabilities.yml not found');
    process.exit(1);
  }
  
  const capsContent = readFileSync(capsPath, 'utf8');
  const capabilities = parseCapabilities(capsContent);
  
  // Compute current health scores
  const current = {};
  for (const cap of capabilities) {
    const health = computeHealthScore(cap);
    current[cap.id] = {
      health,
      lifecycle_state: cap.lifecycle_state || 'active',
      verified_by_count: Array.isArray(cap.verified_by) ? cap.verified_by.length : 0,
      coverage: cap.verified_by?.find(v => v.coverage)?.coverage || null,
      mutation_score: cap.verified_by?.find(v => v.mutation_score)?.mutation_score || null
    };
  }
  
  // Load baseline if exists
  let baseline = {};
  if (existsSync(BASELINE_FILE)) {
    try {
      baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    } catch (e) {
      console.warn('Could not parse baseline file');
    }
  }
  
  // Check for regressions
  const regressions = [];
  for (const [id, data] of Object.entries(current)) {
    const base = baseline[id];
    if (!base) {
      console.log(`New capability: ${id}`);
      continue;
    }
    
    if (data.health !== null && base.health !== null && data.health < base.health - 5) {
      regressions.push(`Capability '${id}': health dropped from ${base.health} to ${data.health}`);
    }
    if (data.verified_by_count < base.verified_by_count) {
      regressions.push(`Capability '${id}': verified_by count decreased from ${base.verified_by_count} to ${data.verified_by_count}`);
    }
    if (data.lifecycle_state !== base.lifecycle_state && data.lifecycle_state === 'deprecated' && base.lifecycle_state === 'active') {
      regressions.push(`Capability '${id}': lifecycle regressed from ${base.lifecycle_state} to ${data.lifecycle_state}`);
    }
  }
  
  // Save current as new baseline
  mkdirSync(join(ROOT, 'docs'), { recursive: true });
  writeFileSync(BASELINE_FILE, JSON.stringify(current, null, 2));
  
  if (regressions.length > 0) {
    console.error('REGRESSIONS DETECTED:');
    for (const r of regressions) console.error('  - ' + r);
    process.exit(1);
  }
  
  console.log('No regressions detected');
  console.log(`Checked ${Object.keys(current).length} capabilities`);
  process.exit(0);
}

main();