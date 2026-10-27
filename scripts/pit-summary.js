#!/usr/bin/env node
// Summarises PIT's mutation XML into a list of the tests that are missing.
//
// A surviving mutation is an assertion the suite never makes: the code changed
// under it and no test noticed. `mvn -Ppit test-compile
// org.pitest:pitest-maven:mutationCoverage` writes one mutations.xml per module.
//
//   node scripts/pit-summary.js [--limit N]
//
// With --limit 0 (default) every surviving mutation is printed.

const fs = require('fs');
const path = require('path');

function parseArgs(args) {
  const opts = { limit: 0 };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const value = eq === -1 ? null : arg.slice(eq + 1);
    if (value === null) continue;
    if (key === 'limit') opts.limit = parseInt(value, 10) || 0;
  }
  return opts;
}

// PIT writes the mutator as a fully-qualified class; the short name is the part
// a reader can act on ("NegateConditionalsMutator").
const MUTATOR = /<mutator>([^<]*)<\/mutator>/;
// PIT quotes attributes with apostrophes (`status='NO_COVERAGE'`), so a pattern
// that only accepts double quotes silently matches nothing and every mutation
// would be reported as a gap.
const ATTR = name => new RegExp(name + '\\s*=\\s*[\'"]([^\'"]*)[\'"]');

function parseMutations(xml) {
  const out = [];
  const re = /<mutation\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const end = xml.indexOf('</mutation>', m.index);
    const body = end === -1 ? '' : xml.slice(m.index, end);
    const field = name => {
      const f = new RegExp('<' + name + '>([^<]*)</' + name + '>').exec(body);
      return f ? f[1] : '';
    };
    const mutator = MUTATOR.exec(body);
    const status = (ATTR('status').exec(m[1]) || [])[1] || 'UNKNOWN';
    out.push({
      detected: ATTR('detected').test(m[1]) ? (ATTR('detected').exec(m[1]) || [])[1] === 'true' : null,
      status,
      testsRun: parseInt((ATTR('numberOfTestsRun').exec(m[1]) || [])[1] || '0', 10),
      sourceFile: field('sourceFile'),
      mutatedClass: field('mutatedClass'),
      method: field('mutatedMethod'),
      line: parseInt(field('lineNumber') || '0', 10),
      mutator: mutator ? mutator[1].split('.').pop() : 'unknown',
      description: field('description'),
    });
  }
  return out;
}

// PIT's report path is <module>/target/pit-reports. Walk from each matched file
// so the module name is the directory holding target/.
function moduleOf(file) {
  const normalised = file.split(path.sep).join('/');
  const at = normalised.lastIndexOf('/target/');
  return at === -1 ? normalised : normalised.slice(0, at);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  const files = [];
  const walk = dir => {
    let entries = [];
    try { entries = fs.readdirSync(dir); } catch (e) { return; }
    for (const entry of entries.sort()) {
      const full = path.join(dir, entry);
      let stat;
      try { stat = fs.statSync(full); } catch (e) { continue; }
      if (stat.isDirectory()) walk(full);
      else if (/mutations\.xml$/.test(entry)) files.push(full);
    }
  };
  walk('backend');

  if (!files.length) {
    console.log('No mutations.xml found. Run: mvn -Ppit test-compile org.pitest:pitest-maven:mutationCoverage');
    return;
  }

  let total = 0;
  const byStatus = new Map();
  const byClass = new Map();

  for (const file of files) {
    const module = moduleOf(file);
    const mutations = parseMutations(fs.readFileSync(file, 'utf8'));
    for (const mutation of mutations) {
      total++;
      byStatus.set(mutation.status, (byStatus.get(mutation.status) || 0) + 1);
      const key = module + ' :: ' + (mutation.mutatedClass || mutation.sourceFile || '(unknown)');
      if (!byClass.has(key)) byClass.set(key, { killed: 0, survived: 0, noCoverage: 0, items: [] });
      const bucket = byClass.get(key);
      if (mutation.status === 'KILLED') {
        bucket.killed++;
        continue;
      }
      if (mutation.status === 'NO_COVERAGE') bucket.noCoverage++;
      else bucket.survived++;
      bucket.items.push(mutation);
    }
  }

  console.log('Modules: ' + [...new Set(files.map(moduleOf))].join(', '));
  console.log('Mutations: ' + total);
  for (const [status, count] of [...byStatus.entries()].sort()) {
    console.log('  ' + status + ': ' + count);
  }

  const killed = byStatus.get('KILLED') || 0;
  const killedPct = total ? ((killed / total) * 100).toFixed(1) : '0.0';
  console.log('Mutation coverage: ' + killedPct + '%');

  // A survived mutation means a test ran and did not notice the change. NO_COVERAGE
  // means no PIT-eligible test reached the line at all. Both are gaps, but only the
  // first is an assertion that exists and is too weak, so they are reported apart.
  const missing = [...byClass.entries()]
    .map(([key, bucket]) => ({ key, ...bucket }))
    .filter(c => c.survived + c.noCoverage > 0)
    .sort((a, b) => (b.survived + b.noCoverage) - (a.survived + a.noCoverage));

  console.log('\nClasses PIT could not disprove (the missing tests):');
  for (const cls of missing) {
    const total1 = cls.killed + cls.survived + cls.noCoverage;
    const pct = ((cls.killed / total1) * 100).toFixed(1);
    console.log('  ' + cls.key + '  killed ' + cls.killed + ', survived ' +
      cls.survived + ', no coverage ' + cls.noCoverage + ' (' + pct + '% killed)');
    for (const mutation of (opts.limit ? cls.items.slice(0, opts.limit) : cls.items)) {
      const kind = mutation.status === 'NO_COVERAGE'
        ? (mutation.testsRun === 0 ? 'no test reached this line' : 'no eligible test')
        : 'test ran and did not notice';
      console.log('      line ' + mutation.line + '  ' + mutation.description +
        '  [' + mutation.mutator + ', ' + kind + ']');
    }
  }

  const noCoverage = byStatus.get('NO_COVERAGE') || 0;
  if (noCoverage && killed === 0) {
    console.log('\nNote: nothing was killed at all. Every mutant is NO_COVERAGE, which means');
    console.log('PIT never got a test to the mutated lines. That is not itself evidence of weak');
    console.log('assertions - check whether the tests covering this module are excluded from PIT');
    console.log('(the quarkus *IT classes and the Cucumber runner are, by configuration).');
  }
}

main();
