#!/usr/bin/env node
// Capability report: what capabilities exist, how far along they are, and what
// is still unwritten. Advisory only — it never fails a build.
//
//   node scripts/capability-report.js                  # matrix to stdout
//   node scripts/capability-report.js --summary FILE   # append to a job summary
//   node scripts/capability-report.js --surefire FILE  # include surefire XML
//   node scripts/capability-report.js --vitest FILE   # include vitest JUnit XML
//
// Progress is measured from the specs: a scenario counts as *implemented* once
// its @todo tag is gone. @todo at Feature level covers every scenario in that
// file; @todo directly above a Scenario covers just that one.
//
// Test failures from Surefire and vitest JUnit XML are collected and shown in
// the unified matrix.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const LANES = ['frontend', 'publication', 'alerting', 'docs'];

function unquote(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

// --- registry -------------------------------------------------------------
// Parsed here rather than shared with the gate on purpose: that one validates,
// this one describes, and keeping them independent means neither grows the
// other's concerns.

function readRegistry(file) {
  const caps = [];
  let cap = null;
  for (const raw of fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim() || line.trim().startsWith('#')) continue;

    const id = line.match(/^\s*-\s+id:\s*(.+)$/);
    if (id) {
      cap = { id: unquote(id[1].split('#')[0]), verified_by: [] };
      caps.push(cap);
      continue;
    }
    if (!cap) continue;

    const kv = line.match(/^\s{2,}(\w+):\s*(.*)$/);
    if (kv) {
      const v = kv[2].split('#')[0].trim();
      cap[kv[1]] = v === '' ? [] : unquote(v);
      continue;
    }
    const li = line.match(/^\s{4,}-\s*(.+)$/);
    if (li) {
      const v = unquote(li[1].split('#')[0].trim());
      if (v) cap.verified_by.push(v);
    }
  }
  return caps;
}

// --- specs ----------------------------------------------------------------

function readFeature(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const head = text.split(/^[ \t]*Feature:/m)[0];
  const headTags = head.match(/^@[\w:.-]+/gm) || [];
  const capTag = headTags.find(t => t.startsWith('@cap:'));

  let scenarios = 0;
  let todo = 0;
  let tags = [];
  for (const line of text.split('\n')) {
    const tag = line.match(/^\s*@([\w:.-]+)\s*$/);
    if (tag) { tags.push(tag[1]); continue; }
    if (/^[ \t]*Scenario(?: Outline)?:/.test(line)) {
      scenarios++;
      if (headTags.includes('@todo') || tags.includes('todo')) todo++;
      tags = [];
      continue;
    }
    // A blank line, comment or step ends the tag block.
    tags = [];
  }
  return { cap: capTag ? capTag.slice('@cap:'.length) : null, scenarios, todo };
}

// --- parse test results ----------------------------------------------------

function parseJUnitXML(xmlPath) {
  if (!fs.existsSync(xmlPath)) return null;
  const text = fs.readFileSync(xmlPath, 'utf8');
  return parseJUnitText(text);
}

function parseSurefire(xmlPath) {
  if (!fs.existsSync(xmlPath)) return {};
  const text = fs.readFileSync(xmlPath, 'utf8');
  return parseJUnitText(text);
}

function parseJUnitText(text) {
  // Extract test names and failure counts from JUnit XML
  const results = new Map();
  const lines = text.split('\n');
  let inTests = false;
  let inFailure = false;
  let currentTest = null;
  let currentFailures = 0;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('<testsuites') || line.includes('<testsuite')) {
      inTests = true;
      continue;
    }
    if (inTests) {
      if (line.includes('</testsuites>') || line.includes('</testsuite>')) {
        inTests = false;
        continue;
      }
      if (line.includes('<testcase')) {
        const nameMatch = line.match(/name="([^"]+)"/);
        if (nameMatch) {
          currentTest = nameMatch[1];
          currentFailures = 0;
        }
      }
      if (inFailure && line.includes('</failure>')) {
        currentFailures++;
        inFailure = false;
      }
      if (line.includes('<failure')) {
        inFailure = true;
      }
      if (line.includes('<testcase')) {
        if (currentTest) {
          // Extract capability from test name (e.g., "features.publication.User.feature")
          const parts = currentTest.split('.');
          const featureFile = parts[0];
          const capability = parts[1];
          if (capability) {
            const capKey = `surefire:${capability}`;
            const failures = currentFailures;
            if (!results.has(capKey)) {
              results.set(capKey, { failures: 0, files: [] });
            }
            results.get(capKey).failures += failures;
            if (!results.get(capKey).files.includes(featureFile)) {
              results.get(capKey).files.push(featureFile);
            }
          }
        }
        currentTest = null;
        currentFailures = 0;
        inFailure = false;
      }
    }
  }
  
  return { perCap: new Map(), capFiles: new Map() };
}

function parseTestResults(surefirePath, vitestPath) {
  const perCap = new Map();
  const capFiles = new Map();

  // Parse surefire reports
  if (fs.existsSync(surefirePath)) {
    const surefireDir = path.join(ROOT, surefirePath);
    if (fs.existsSync(surefireDir) && fs.statSync(surefireDir).isDirectory()) {
      for (const file of fs.readdirSync(surefireDir).filter(f => f.startsWith('TEST-'))) {
        const fileStats = fs.statSync(path.join(surefireDir, file));
        if (!fileStats.isFile()) continue;
        
        const text = fs.readFileSync(path.join(surefireDir, file), 'utf8');
        const result = parseJUnitText(text);
        
        for (const [key, data] of Object.entries(result)) {
          perCap.set(key, (perCap.get(key) || 0) + data.failures);
          capFiles.set(key, [...(capFiles.get(key) || []), file]);
        }
      }
    }
  }

  // Parse vitest JUnit XML
  if (fs.existsSync(vitestPath)) {
    const text = fs.readFileSync(vitestPath, 'utf8');
    const result = parseJUnitText(text);
    
    for (const [key, data] of Object.entries(result)) {
      perCap.set(key, (perCap.get(key) || 0) + data.failures);
      capFiles.set(key, [...(capFiles.get(key) || []), file]);
    }
  }

  return { perCap, capFiles };
}

function scanSpecs(featuresDir) {
  const found = [];
  if (!fs.existsSync(featuresDir)) return found;
  for (const lane of fs.readdirSync(featuresDir)) {
    const dir = path.join(featuresDir, lane);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir).sort()) {
      if (!file.endsWith('.feature')) continue;
      const rel = path.posix.join('features', lane, file);
      found.push(Object.assign({ rel, lane }, readFeature(path.join(dir, file))));
    }
  }
  return found;
}

// --- report ---------------------------------------------------------------

const dash = n => (n ? String(n) : '–');

function render(caps, specs, testResults) {
  const per = new Map(caps.map(c => [c.id, { sc: {}, total: 0, todoTotal: 0 }]));
  for (const s of specs) {
    const a = per.get(s.cap);
    if (!a) continue;
    a.sc[s.lane] = (a.sc[s.lane] || 0) + s.scenarios;
    a.total += s.scenarios;
    a.todoTotal += s.todo;
  }

  // Add test failure counts
  if (testResults && testResults.perCap) {
    for (const [key, failures] of testResults.perCap) {
      const capId = key.split(':')[1];
      const a = per.get(capId);
      if (a) {
        a.testFailures = (a.testFailures || 0) + failures;
      }
    }
  }

  let total = 0;
  let todoTotal = 0;
  for (const a of per.values()) { total += a.total; todoTotal += a.todoTotal; }
  const pct = total ? Math.round(((total - todoTotal) / total) * 100) : 0;

  const L = [];
  L.push('## Capability report');
  L.push('');
  L.push(`**${caps.length} capabilities** · **${total} scenarios** · `
    + `**${total - todoTotal} implemented** · **${todoTotal} to do** · **${pct}%**`);
  L.push('');
  L.push('| Capability | Intent | Owner | Status | Frontend | Publication | Alerting | To do | Scenarios | Test |');
  L.push('| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const c of caps) {
    const a = per.get(c.id);
    const lane = l => (a.sc[l] ? String(a.sc[l]) : '–');
    const test = a.testFailures ? String(a.testFailures) : '–';
    L.push(`| ${c.id} | ${(c.intent || '–').replace(/\|/g, '\\|')} `
      + `| ${c.owner || '–'} | ${c.status || '–'} `
      + `| ${lane('frontend')} | ${lane('publication')} | ${lane('alerting')} `
      + `| ${dash(a.todoTotal)} | ${dash(a.total)} |`
      + `| ${test} |`);
  }

  const remaining = caps.filter(c => per.get(c.id).todoTotal > 0);
  if (remaining.length) {
    L.push('');
    L.push('### Still `@todo`');
    L.push('');
    for (const c of remaining) {
      const a = per.get(c.id);
      const done = a.total - a.todoTotal;
      L.push(`- **${c.id}** — ${a.todoTotal} of ${a.total} scenarios (${done} done)`);
    }
  }

  const known = new Set(caps.map(c => c.id));
  const unplaced = specs.filter(s => !s.cap || !known.has(s.cap));
  if (unplaced.length) {
    L.push('');
    L.push('### Specs the registry does not cover');
    L.push('');
    for (const s of unplaced) {
      L.push(`- \`${s.rel}\` — ${s.cap ? `@cap:${s.cap} is not in capabilities.yml` : 'no `@cap:` tag'}`);
    }
  }
  return L.join('\n') + '\n';
}

// --- entry ----------------------------------------------------------------

function main() {
  const summary = process.argv.includes('--summary')
    ? process.argv[process.argv.indexOf('--summary') + 1] : null;
  const surefire = process.argv.includes('--surefire')
    ? process.argv[process.argv.indexOf('--surefire') + 1] : null;
  const vitest = process.argv.includes('--vitest')
    ? process.argv[process.argv.indexOf('--vitest') + 1] : null;

  const registryPath = path.join(ROOT, 'capabilities', 'capabilities.yml');
  if (!fs.existsSync(registryPath)) {
    console.error(`capability report: ${registryPath} not found`);
    process.exit(1);
  }

  const specs = scanSpecs(path.join(ROOT, 'features'));
  let testResults = null;
  if (surefire || vitest) {
    testResults = parseTestResults(surefire, vitest);
  }

  const text = render(readRegistry(registryPath), specs, testResults);

  if (summary) {
    fs.appendFileSync(summary, text, 'utf8');
    console.log(`Capability report appended to ${summary} (${text.length} bytes)`);
  } else {
    process.stdout.write(text);
  }
}

main();
