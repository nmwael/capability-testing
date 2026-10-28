#!/usr/bin/env node

// Capability -> test coverage report.
//
// Reads the capability registry, resolves every `verified_by` entry against real
// JUnit/Surefire XML and vitest junit XML, and writes a static HTML page that lets
// a reader drill from a capability down to the individual test that proves it.
// Entries that resolve to nothing are never dropped: they render the literal
// text "no matching test found" so a gap is visible rather than silent.
//
// Dependency free: Node builtins only, so it runs in CI with no install step.
//
// Usage:
//   node scripts/coverage-report.js [--capabilities <file>] [--surefire <glob>]
//                                   [--vitest <file[,file]>] [--out <dir>]
//                                   [--summary <file>]
//
// `--out` is a DIRECTORY: the report is written to <dir>/index.html.

const fs = require('fs');
const path = require('path');

const DEFAULT_CAPABILITIES = 'capabilities/capabilities.yml';
const DEFAULT_OUT = 'docs/coverage';
const DEFAULT_FEATURES = 'features/**/*.feature';
const DEFAULT_PIT = null;

function parseArgs(args) {
  const opts = {
    capabilities: DEFAULT_CAPABILITIES,
    surefire: null,
    vitest: null,
    cucumber: null,
    jacoco: null,
    frontendCoverage: null,
    features: DEFAULT_FEATURES,
    pit: DEFAULT_PIT,
    out: DEFAULT_OUT,
    summary: null,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;

    const eq = arg.indexOf('=');
    const rawKey = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
    const key = rawKey.replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    let value = eq === -1 ? null : arg.slice(eq + 1);

    if (value === null) {
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        value = next;
        i++;
      }
    }

    if (key in opts && value !== null) {
      opts[key] = value;
    }
  }

  return opts;
}

function escapeHtml(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// JUnit attributes are XML, so a test name such as `suite > case` is already
// written as `suite &gt; case`. Decode once on the way in; escapeHtml then
// escapes it a single time on the way out. Without this the page shows the
// literal entity text (`&gt;`) because the ampersand gets escaped twice.
function decodeXmlEntities(text) {
  // Surefire's XML double-escapes what Cucumber already escaped, so the ANSI
  // reset that greps the scenario heading arrives as `&amp#27;` rather than
  // `&#27;`. Undo that first, or the escape never becomes a control character
  // and cannot be stripped.
  return String(text)
    .replace(/&amp#(?=(?:x?[0-9a-fA-F]+);)/g, '&#')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    })
    .replace(/&#(\d+);/g, (m, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripComment(value) {
  // The registry annotates many entries with a trailing `# ...` comment and
  // quotes every list item. Handle both so the entry text is clean.
  let out = value.trim();
  if (out.startsWith('"')) {
    const end = out.indexOf('"', 1);
    out = end === -1 ? out.slice(1) : out.slice(1, end);
  } else {
    const hash = out.indexOf(' #');
    if (hash !== -1) out = out.slice(0, hash);
  }
  return out.trim();
}

// Minimal reader for the registry's fixed shape:
//   capabilities:
//     - id: alert.publish
//       intent: "..."
//       owner: publication
//       status: active
//       since: 1.0.0
//       verified_by:
//         - "AlertPublishIT"
//         - "features/publication/alert-publish.feature"
function parseCapabilitiesYml(content) {
  const capabilities = [];
  let current = null;
  let inVerifiedBy = false;

  const lines = content.split('\n');

  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'capabilities:') continue;

    const idMatch = trimmed.match(/^-\s+id:\s*(.+)$/);
    if (idMatch) {
      current = { id: stripComment(idMatch[1]), intent: '', owner: '', status: '', since: '', verifiedBy: [] };
      capabilities.push(current);
      inVerifiedBy = false;
      continue;
    }

    if (!current) continue;

    if (/^verified_by:\s*$/.test(trimmed)) {
      inVerifiedBy = true;
      continue;
    }

    const fieldMatch = trimmed.match(/^([A-Za-z_][\w]*):\s*(.*)$/);
    if (fieldMatch) {
      inVerifiedBy = false;
      const key = fieldMatch[1];
      const value = stripComment(fieldMatch[2]);
      if (key === 'intent' || key === 'owner' || key === 'status' || key === 'since') {
        current[key] = value;
      }
      continue;
    }

    if (inVerifiedBy && trimmed.startsWith('-')) {
      const entry = stripComment(trimmed.slice(1));
      if (entry) current.verifiedBy.push(entry);
    }
  }

  return capabilities;
}

function classifyEntry(entry) {
  if (entry.endsWith('.feature')) return 'feature';
  if (/\.(tsx?|jsx?|mjs|cjs)$/.test(entry)) return 'file';
  return 'java';
}

function testcaseStatus(xml) {
  if (/<failure[\s>]/.test(xml) || /<error[\s>]/.test(xml)) return 'failure';
  if (/<skipped[\s>]/.test(xml)) return 'skipped';
  return 'pass';
}

function attr(xml, name) {
  const match = xml.match(new RegExp('\\b' + name + '\\s*=\\s*"([^"]*)"'));
  return match ? decodeXmlEntities(match[1]) : '';
}

// Handles both shapes seen in practice:
//   <test-suite><testcase classname="..." name="..."/>...
//   <test-files><test-case file="..."><testcase classname="..." name="..."/>
// Cucumber's console output is captured verbatim into each testcase's
// <system-out>, and it names the scenario the case actually ran:
//   Scenario: The distribution names every channel ... # alert-flow.feature:16
// Surefire meanwhile names the case after the parameteriser
// (getTests()[3][2]). Prefer the scenario name so the report reads like a
// human wrote it; the parameterised name stays as the fallback.
const SCENARIO_HEADING = /^Scenario(?:\s+Outline)?:\s*(.+)$/;
// The Gherkin source location the console appends. Anchored to a feature file
// path so a scenario that legitimately ends in a number keeps its name.
const SCENARIO_LOCATION = /\s+#\s+\S+\.feature(:\d+)?\s*$/i;

function cdataText(chunk) {
  const blocks = [];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>/g;
  let m;
  while ((m = re.exec(chunk)) !== null) blocks.push(m[1]);
  return decodeXmlEntities(blocks.join('\n'));
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

function parseJunitXml(xmlContent) {
  const tests = [];
  let pos = 0;

  while (true) {
    const start = xmlContent.indexOf('<testcase', pos);
    if (start === -1) break;

    const openEnd = xmlContent.indexOf('>', start);
    if (openEnd === -1) break;

    const selfClosing = xmlContent[openEnd - 1] === '/';
    let chunk;
    let next;
    if (selfClosing) {
      chunk = xmlContent.slice(start, openEnd + 1);
      next = openEnd + 1;
    } else {
      const close = xmlContent.indexOf('</testcase>', openEnd);
      if (close === -1) break;
      chunk = xmlContent.slice(start, close + '</testcase>'.length);
      next = close + 1;
    }

    const name = attr(chunk, 'name');
    const classname = attr(chunk, 'classname') || attr(chunk, 'file');

    // The scenario name governs when the surefire name is a parameteriser
    // artefact, otherwise the plain name is what the reader wants.
    const stdout = stripAnsi(cdataText(chunk));
    let displayName = name;
    let scenario = null;

    const scenarioLine = SCENARIO_HEADING.exec(name) || null;
    if (/^getTests\(\)/.test(name) || scenarioLine) {
      const heading = stdout.split('\n').map(l => l.trim()).find(l => /^Scenario(:|\s)/.test(l));
      if (heading) {
        const match = SCENARIO_HEADING.exec(stripAnsi(heading));
        if (match) {
          scenario = match[1].replace(SCENARIO_LOCATION, '').trim();
          if (scenario) displayName = scenario + '  [' + name + ']';
        }
      }
      if (!scenario && scenarioLine) {
        scenario = scenarioLine[1].replace(SCENARIO_LOCATION, '').trim();
        if (scenario) displayName = scenario + '  [' + name + ']';
      }
    }

    if (name || classname) {
      tests.push({
        name: displayName,
        rawName: name,
        scenario,
        classname,
        status: testcaseStatus(chunk),
        time: parseFloat(attr(chunk, 'time')) || 0,
      });
    }

    pos = next;
  }

  return tests;
}

function expandSurefire(spec) {
  if (!spec) return [];

  const files = [];
  const walk = (dir, relPath, pattern) => {
    let entries = [];
    try {
      entries = fs.readdirSync(dir);
    } catch (e) {
      return;
    }

    for (const entry of entries.sort()) {
      const full = path.join(dir, entry);
      const rel = relPath ? relPath + '/' + entry : entry;
      let stat;
      try {
        stat = fs.statSync(full);
      } catch (e) {
        continue;
      }
      if (stat.isDirectory()) {
        walk(full, rel, pattern);
      } else if (pattern.test(rel)) {
        files.push(full);
      }
    }
  };

  for (const raw of spec.split(',').map(part => part.trim()).filter(Boolean)) {
    if (!raw.includes('*')) {
      if (fs.existsSync(raw)) files.push(raw);
      continue;
    }

    // Split the pattern at the first wildcard segment: everything before it is a
    // real directory to walk from, everything after is matched per relative path.
    // Supports both `*` (within one segment) and `**` (across segments), so
    // `backend/**/target/surefire-reports/TEST-*.xml` works.
    const segments = raw.split('/');
    const fixed = [];
    for (const segment of segments) {
      if (segment.includes('*')) break;
      fixed.push(segment);
    }

    const baseDir = fixed.length ? fixed.join('/') : '.';
    const rest = segments.slice(fixed.length).join('/');
    const segmentRegex = segment => segment
      .split(/(\*\*|\*)/)
      .map(part => (part === '**' ? '.*' : part === '*' ? '[^/]*' : escapeRegExp(part)))
      .join('');
    const pattern = new RegExp('^' + rest.split('/').map(segmentRegex).join('/') + '$');

    walk(baseDir, '', pattern);
  }

  return files;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readTests(spec) {
  const tests = [];
  for (const file of expandSurefire(spec)) {
    try {
      const parsed = parseJunitXml(fs.readFileSync(file, 'utf8'));
      parsed.forEach(test => tests.push({ ...test, file }));
    } catch (e) {
      console.error(`coverage-report: cannot parse ${file}: ${e.message}`);
    }
  }
  return tests;
}

// --- Gherkin features ------------------------------------------------------
// The drilldown the reader wants is capability -> feature -> scenario -> test.
// A feature file carries that chain: an `@cap:<capability id>` tag, a `Feature:`
// title and one `Scenario:` per row. Scenario Outline rows are counted with
// the outline, since each Examples row becomes one scenario at runtime.
function parseFeatureFile(file, content) {
  const scenarios = [];
  const tags = [];
  let title = '';
  let inDocString = false;
  let docMarker = '';

  for (const raw of content.split('\n')) {
    const line = raw.replace(/\r$/, '');
    const trimmed = line.trim();

    // A triple-quoted doc string swallows any "Scenario:" inside it.
    const docMatch = trimmed.match(/^("""|```)/);
    if (inDocString) {
      if (trimmed === docMarker) { inDocString = false; docMarker = ''; }
      continue;
    }
    if (docMatch) {
      inDocString = true;
      docMarker = docMatch[1];
      continue;
    }

    if (!trimmed) continue;
    if (/^(#|\/\/)/.test(trimmed)) continue;
    if (trimmed.startsWith('@')) { tags.push(trimmed); continue; }

    const feature = trimmed.match(/^Feature:\s*(.+)$/);
    if (feature) { title = stripComment(feature[1]); continue; }

    const scenario = trimmed.match(/^Scenario(?:\s+Outline)?:\s*(.+)$/);
    if (scenario) scenarios.push(stripComment(scenario[1]));
  }

  const cap = tags.find(tag => tag.replace(/^@+/, '').startsWith('cap:'));

  return {
    file,
    title,
    scenarios,
    cap: cap ? cap.replace(/^@+cap:/, '') : null,
  };
}

// Joins a scenario to the test cases that prove it. Deterministic only: the
// test name must equal the scenario name (ignoring case/punctuation), or the
// scenario's own feature must be named by that test. Gherkin and vitest names
// in this repo are paraphrases of each other, so a miss is reported as a miss
// rather than guessed at.
function scenarioTests(scenario, tests, cucumberTests) {
  const want = normalise(scenario).replace(/[^a-z0-9]+/g, '');
  const keyed = pool => pool.filter(test => {
    const key = test.scenario || test.name;
    const name = normalise(key).replace(/[^a-z0-9]+/g, '');
    const tail = normalise(String(key).split('>').pop() || '').replace(/[^a-z0-9]+/g, '');
    return name === want || tail === want;
  });

  // Cucumber's own report is the authoritative source for a scenario's name and
  // status, so it wins when a name is recovered from surefire's output too and
  // the same execution is never listed twice.
  const cucumber = keyed(cucumberTests || []);
  if (cucumber.length) return cucumber;
  return keyed(tests);
}

function readFeatures(spec) {
  if (!spec) return [];
  const features = [];
  for (const file of expandSurefire(spec)) {
    try {
      features.push(parseFeatureFile(file, fs.readFileSync(file, 'utf8')));
    } catch (e) {
      console.error(`coverage-report: cannot read ${file}: ${e.message}`);
    }
  }
  return features;
}

// --- Mutation testing (PIT) ------------------------------------------------
// A mutant is killed when a test ran and noticed the change; NO_COVERAGE means
// no eligible test reached the line. Only a killed mutant is evidence of an
// assertion, so the section reports the three counts apart rather than lumping
// an untested line together with a weak one.
function parsePitXml(xmlContent) {
  const out = [];
  const re = /<mutation\b([^>]*)>/g;
  let m;
  while ((m = re.exec(xmlContent)) !== null) {
    const end = xmlContent.indexOf('</mutation>', m.index);
    const body = end === -1 ? '' : xmlContent.slice(m.index, end);
    const field = name => {
      const f = new RegExp('<' + name + '>([^<]*)</' + name + '>').exec(body);
      return f ? f[1] : '';
    };
    const status = (/status\s*=\s*['"]([A-Z_]+)['"]/.exec(m[1]) || [])[1] || 'UNKNOWN';
    out.push({
      status,
      testsRun: parseInt((/numberOfTestsRun\s*=\s*['"](\d+)['"]/.exec(m[1]) || [])[1] || '0', 10),
      mutatedClass: field('mutatedClass'),
      mutator: (field('mutator') || '').split('.').pop(),
      description: field('description'),
      lineNumber: parseInt(field('lineNumber') || '0', 10),
    });
  }
  return out;
}

function readPit(spec) {
  if (!spec) return null;
  const classes = new Map();
  let reports = 0;

  for (const file of expandSurefire(spec)) {
    let mutations;
    try {
      mutations = parsePitXml(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`coverage-report: cannot parse ${file}: ${e.message}`);
      continue;
    }
    if (!mutations.length) continue;
    reports++;
    for (const mutation of mutations) {
      const key = mutation.mutatedClass || '(unknown)';
      if (!classes.has(key)) classes.set(key, { killed: 0, survived: 0, noCoverage: 0 });
      const bucket = classes.get(key);
      if (mutation.status === 'KILLED') bucket.killed++;
      else if (mutation.status === 'NO_COVERAGE') bucket.noCoverage++;
      else if (mutation.status !== 'TIMED_OUT' && mutation.status !== 'MEMORY_ERROR') bucket.survived++;
    }
  }

  return reports ? { classes, total: [...classes.values()].reduce((sum, c) => sum + c.killed + c.survived + c.noCoverage, 0) } : null;
}

// Which capabilities a mutated class backs, by the same class-suffix rule the
// verified_by java entries use.
function capabilitiesForClass(className, capabilities) {
  const simple = className.split('.').pop();
  const owners = [];
  for (const capability of capabilities) {
    const hit = capability.verifiedBy.some(entry => {
      if (classifyEntry(entry) !== 'java') return false;
      const wanted = entry.split('.').pop();
      return wanted === simple;
    });
    if (hit) owners.push(capability.id);
  }
  return owners;
}

function renderMutation(pit, capabilities) {
  if (!pit || !pit.classes.size) return [];

  const parts = [];
  parts.push('<h2>Mutation testing</h2>');
  parts.push('<p class="meta">PIT reruns the tests against mutated copies of the production classes. ' +
    'A <strong>killed</strong> mutant means a test noticed the change; <strong>survived</strong> means a test ran and did not; ' +
    '<strong>no coverage</strong> means no eligible test reached the line at all. ' +
    'A class that no capability names is itself a traceability gap, not a scoring artefact.</p>');
  parts.push('<table class="mutation">');
  parts.push('<thead><tr><th>class</th><th>capability</th><th>mutants</th><th>killed</th><th>survived</th><th>no coverage</th></tr></thead>');
  parts.push('<tbody>');

  const rows = [...pit.classes.entries()]
    .map(([className, counts]) => ({
      className,
      counts,
      total: counts.killed + counts.survived + counts.noCoverage,
      owners: capabilitiesForClass(className, capabilities),
    }))
    .sort((a, b) => b.total - a.total || a.className.localeCompare(b.className));

  for (const row of rows) {
    const pct = row.total ? ((row.counts.killed / row.total) * 100).toFixed(1) : '0.0';
    const cls = row.counts.killed === row.total ? 'pass' : row.counts.killed === 0 ? 'failure' : 'skipped';
    const owners = row.owners.length
      ? row.owners.map(id => `<a href="#cap-${escapeHtml(id)}">${escapeHtml(id)}</a>`).join(', ')
      : '<span class="meta">not named by any capability</span>';
    parts.push(
      '<tr>' +
      `<td><code>${escapeHtml(row.className)}</code></td>` +
      `<td>${owners}</td>` +
      `<td>${row.total}</td>` +
      `<td class="${cls}">${row.counts.killed} (${pct}%)</td>` +
      `<td>${row.counts.survived}</td>` +
      `<td>${row.counts.noCoverage}</td>` +
      '</tr>'
    );
  }
  parts.push('</tbody></table>');

  const killed = [...pit.classes.values()].reduce((sum, c) => sum + c.killed, 0);
  parts.push(`<p class="meta">${killed} of ${pit.total} mutants killed across ${pit.classes.size} classes.</p>`);
  return parts;
}

// --- Code coverage ---------------------------------------------------------
// JaCoCo emits one <report> per Maven module. Its report-level counters are the
// direct children that follow the last </package>; summing every nested counter
// instead would count each class several times.
function parseJacocoXml(xmlContent) {
  const lastPackage = xmlContent.lastIndexOf('</package>');
  const tail = lastPackage === -1 ? xmlContent : xmlContent.slice(lastPackage);

  const counter = type => {
    const match = tail.match(new RegExp('<counter type="' + type + '" missed="(\\d+)" covered="(\\d+)"'));
    if (!match) return null;
    return { covered: Number(match[2]), total: Number(match[1]) + Number(match[2]) };
  };

  return { line: counter('LINE'), branch: counter('BRANCH') };
}

function addMetric(target, source) {
  if (!source) return target;
  if (!target) return { covered: source.covered, total: source.total };
  return { covered: target.covered + source.covered, total: target.total + source.total };
}

function readBackendCoverage(spec) {
  if (!spec) return null;

  let totals = null;
  let reports = 0;

  for (const file of expandSurefire(spec)) {
    let parsed;
    try {
      parsed = parseJacocoXml(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`coverage-report: cannot parse ${file}: ${e.message}`);
      continue;
    }
    reports++;
    totals = {
      line: addMetric(totals && totals.line, parsed.line),
      branch: addMetric(totals && totals.branch, parsed.branch),
    };
  }

  return reports ? totals : null;
}

// vitest's json-summary reporter writes istanbul's shape: { total: { lines:
// { total, covered, pct }, branches: {...} } }.
function readFrontendCoverage(file) {
  if (!file) return null;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`coverage-report: cannot read ${file}: ${e.message}`);
    return null;
  }

  const total = data.total || data;
  const metric = key => {
    const entry = total[key];
    if (!entry || typeof entry.total !== 'number') return null;
    return { covered: Number(entry.covered) || 0, total: Number(entry.total) };
  };

  const lines = metric('lines');
  const branches = metric('branches');
  return lines || branches ? { line: lines, branch: branches } : null;
}

function normalise(text) {
  return String(text || '').toLowerCase();
}

// Returns EVERY test case in the matched test class, not just the first one, so a
// capability whose backing class holds several cases drills down to all of them.
function matchEntry(entry, kind, surefireTests, vitestTests) {
  const pool = surefireTests.concat(vitestTests);

  const allInClass = classname => pool.filter(test => String(test.classname || '') === String(classname || ''));

  if (kind === 'java') {
    const wanted = entry.split('.').pop();
    const matches = pool.filter(test => {
      const cls = String(test.classname || '');
      return cls === wanted || cls.endsWith('.' + wanted) || cls.endsWith('/' + wanted);
    });
    if (matches.length) return allInClass(matches[0].classname);
    return [];
  }

  // Feature path: features/<lane>/<slug>.feature. Match the slug against the test
  // class/file name. Two passes so a hyphenated hit beats a looser stripped hit.
  const slug = path.basename(entry).replace(/\.feature$/, '');
  const slugLower = normalise(slug);
  const slugStripped = slugLower.replace(/[-_.]/g, '');

  const exact = pool.find(test => {
    const cls = normalise(test.classname);
    const base = path.basename(cls).replace(/\.(test|spec)\.[a-z]+$/, '');
    return cls.includes(slugLower) || base === slugLower;
  });
  if (exact) return allInClass(exact.classname);

  const loose = pool.find(test => {
    const haystack = (normalise(test.classname) + ' ' + normalise(test.name)).replace(/[-_.\/]/g, '');
    return haystack.includes(slugStripped);
  });
  return loose ? allInClass(loose.classname) : [];
}

function buildReport(capabilities, surefireTests, vitestTests, features, cucumberTests) {
  const rows = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let failureCount = 0;
  let testCount = 0;
  let scenarioCount = 0;
  let scenarioMatched = 0;
  let scenarioFailure = 0;

  const featureFor = entry => {
    const slug = path.basename(entry).replace(/\.feature$/, '');
    return features.find(f => f.file.endsWith(entry) || path.basename(f.file) === slug + '.feature') || null;
  };

  for (const capability of capabilities) {
    const entries = capability.verifiedBy.map(entry => {
      const kind = classifyEntry(entry);
      const tests = matchEntry(entry, kind, surefireTests, vitestTests);
      if (tests.length) {
        matchedCount++;
        testCount += tests.length;
        failureCount += tests.filter(test => test.status === 'failure').length;
      } else {
        unmatchedCount++;
      }

      const item = { entry, kind, tests };

      if (kind === 'feature') {
        const feature = featureFor(entry);
        if (feature) {
          // A scenario is covered either by a test case that names it, or -
          // when the runner emits parameterised names the scenario cannot be
          // keyed on - by the feature's backing class running at all. Both are
          // stated, so a reader can never mistake class coverage for a
          // scenario-level one.
          const scenarios = feature.scenarios.map(name => {
            const named = scenarioTests(name, surefireTests.concat(vitestTests), cucumberTests);
            const classLevel = named.length ? [] : tests;
            scenarioCount++;
            const has = named.length > 0 || classLevel.length > 0;
            if (has) scenarioMatched++;
            if (named.length) {
              // A scenario proved by a named case is a test case in its own
              // right, so it counts in the totals rather than being invisible
              // inside the feature block.
              testCount += named.length;
              named.forEach(test => { if (test.status === 'failure') failureCount++; });
            }
            const status = named.length
              ? named.some(test => test.status === 'failure') ? 'failure' : 'pass'
              : classLevel.some(test => test.status === 'failure') ? 'failure' : 'pass';
            if (status === 'failure') scenarioFailure++;
            return { name, named, classLevel, status };
          });
          item.feature = feature;
          item.scenarios = scenarios;
        }
      }

      return item;
    });

    rows.push({ capability, entries });
  }

  return {
    rows,
    matchedCount,
    unmatchedCount,
    failureCount,
    testCount,
    scenarioCount,
    scenarioMatched,
    scenarioFailure,
  };
}

function formatPercent(metric) {
  if (!metric || !metric.total) return 'n/a';
  return ((metric.covered / metric.total) * 100).toFixed(1) + '%';
}

function coverageCell(metric) {
  if (!metric || !metric.total) return '<span class="meta">n/a</span>';
  const pct = (metric.covered / metric.total) * 100;
  const cls = pct >= 80 ? 'pass' : pct >= 50 ? 'skipped' : 'failure';
  return `<span class="${cls}">${pct.toFixed(1)}%</span> <span class="meta">(${metric.covered}/${metric.total})</span>`;
}

function renderCoverage(coverage) {
  const suites = [
    ['Backend (JaCoCo)', coverage && coverage.backend],
    ['Frontend (vitest, v8)', coverage && coverage.frontend],
  ].filter(([, data]) => data && (data.line || data.branch));

  if (!suites.length) return [];

  const parts = [];
  parts.push('<h2>Code coverage</h2>');
  parts.push('<table class="coverage">');
  parts.push('<thead><tr><th>suite</th><th>lines</th><th>branches</th></tr></thead>');
  parts.push('<tbody>');
  for (const [label, data] of suites) {
    parts.push(
      `<tr><td>${escapeHtml(label)}</td>` +
      `<td>${coverageCell(data.line)}</td>` +
      `<td>${coverageCell(data.branch)}</td></tr>`
    );
  }
  parts.push('</tbody></table>');
  return parts;
}

function scenarioCell(scenario) {
  if (scenario.named.length) {
    return scenario.named
      .map(test => `<code>${escapeHtml(test.name)}</code> <span class="meta">${escapeHtml(test.classname)}</span>`)
      .join('<br>');
  }
  if (scenario.classLevel.length) {
    // The whole class ran; individual scenario names are not emitted.
    const cls = scenario.classLevel[0].classname;
    return `<span class="meta">covered by class</span> <code>${escapeHtml(cls)}</code>` +
      `<span class="meta">(${scenario.classLevel.length} cases, runner emits no scenario name)</span>`;
  }
  return '<span class="none">no matching test found.</span>';
}

function renderHtml(report, generatedAt, coverage, pit) {
  const { rows, matchedCount, unmatchedCount, failureCount, testCount } = report;

  const parts = [];
  parts.push('<!DOCTYPE html>');
  parts.push('<html lang="en">');
  parts.push('<head>');
  parts.push('<meta charset="utf-8">');
  parts.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  parts.push('<title>Capability to test coverage</title>');
  parts.push('<style>');
  parts.push('body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:2rem auto;max-width:72rem;padding:0 1rem;color:#1b1f23;line-height:1.5}');
  parts.push('h1{margin-bottom:.25rem}');
  parts.push('.meta{color:#57606a;font-size:.9rem;margin-top:0}');
  parts.push('.summary{display:flex;gap:1.5rem;margin:1.5rem 0;flex-wrap:wrap}');
  parts.push('.summary div{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:.75rem 1rem}');
  parts.push('.summary strong{display:block;font-size:1.4rem}');
  parts.push('table{width:100%;border-collapse:collapse;margin:.5rem 0 2rem}');
  parts.push('caption{text-align:left;font-weight:600;padding:.5rem 0;font-size:1.1rem}');
  parts.push('th,td{border:1px solid #d0d7de;padding:.4rem .6rem;text-align:left;vertical-align:top;font-size:.92rem}');
  parts.push('th{background:#f6f8fa}');
  parts.push('code{background:#f6f8fa;padding:.1rem .3rem;border-radius:3px;font-size:.88em}');
  parts.push('.pass{color:#116329;font-weight:600}');
  parts.push('.failure{color:#b42318;font-weight:600}');
  parts.push('.skipped{color:#9a6700;font-weight:600}');
  parts.push('.none{color:#b42318;font-style:italic}');
  parts.push('.cap-id{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem}');
  parts.push('table.mutation td:nth-child(2){max-width:14rem}');
  parts.push('</style>');
  parts.push('</head>');
  parts.push('<body>');
  parts.push('<h1>Capability to test coverage</h1>');
  parts.push(`<p class="meta">Generated ${escapeHtml(generatedAt)} from <code>capabilities/capabilities.yml</code></p>`);
  parts.push('<div class="summary">');
  parts.push(`<div><strong>${rows.length}</strong>capabilities</div>`);
  parts.push(`<div><strong>${matchedCount}</strong>verified_by entries with a test</div>`);
  parts.push(`<div><strong>${unmatchedCount}</strong>entries with no matching test</div>`);
  parts.push(`<div><strong>${testCount}</strong>individual tests</div>`);
  parts.push(`<div><strong>${failureCount}</strong>failing tests</div>`);
  if (report.scenarioCount) {
    parts.push(`<div><strong>${report.scenarioCount}</strong>scenarios</div>`);
    parts.push(`<div><strong>${report.scenarioMatched}</strong>scenarios with a test</div>`);
  }
  parts.push('</div>');

  // The mutation section links back to a capability by id, so the captions need
  // an anchor to point at.
  const capabilitiesForMutation = rows.map(row => row.capability);

  for (const line of renderCoverage(coverage)) parts.push(line);
  for (const line of renderMutation(pit, capabilitiesForMutation)) parts.push(line);

  for (const row of rows) {
    const cap = row.capability;
    parts.push('<table>');
    parts.push(`<caption id="cap-${escapeHtml(cap.id)}"><span class="cap-id">${escapeHtml(cap.id)}</span> &mdash; ${escapeHtml(cap.intent)}</caption>`);
    parts.push('<thead><tr><th>verified_by</th><th>kind</th><th>test</th><th>status</th></tr></thead>');
    parts.push('<tbody>');
    for (const item of row.entries) {
      const label = escapeHtml(item.entry);
      if (!item.tests.length) {
        parts.push(`<tr><td><code>${label}</code></td><td>${item.kind}</td><td class="none" colspan="2">no matching test found</td></tr>`);
        continue;
      }
      item.tests.forEach((test, index) => {
        const status = test.status || 'pass';
        const lead = index === 0
          ? `<td rowspan="${item.tests.length}"><code>${label}</code></td><td rowspan="${item.tests.length}">${item.kind}</td>`
          : '';
        parts.push(
          `<tr>${lead}` +
          `<td><code>${escapeHtml(test.name)}</code><br><span class="meta">${escapeHtml(test.classname)}</span></td>` +
          `<td class="${escapeHtml(status)}">${escapeHtml(status)}</td></tr>`
        );
      });

      // Feature entries keep their class rows, then break out one row per
      // scenario so the chain reads capability -> feature -> scenario -> test.
      if (item.feature) {
        const title = escapeHtml(item.feature.title || path.basename(item.feature.file));
        item.scenarios.forEach((scenario, index) => {
          const lead = index === 0
            ? `<td rowspan="${item.scenarios.length}"><code>${label}</code></td>` +
              `<td rowspan="${item.scenarios.length}">scenario</td>`
            : '';
          parts.push(
            `<tr>${lead}` +
            `<td><em>${escapeHtml(scenario.name)}</em><br>${scenarioCell(scenario)}</td>` +
            `<td class="${escapeHtml(scenario.status)}">${escapeHtml(scenario.status)}</td></tr>`
          );
        });
      }
    }
    parts.push('</tbody></table>');
  }

  parts.push('</body>');
  parts.push('</html>');

  return parts.join('\n') + '\n';
}

function renderSummary(report, coverage, pit) {
  const lines = [];
  lines.push('## Capability to test coverage');
  lines.push('');
  lines.push(`- capabilities: ${report.rows.length}`);
  lines.push(`- verified_by entries with a test: ${report.matchedCount}`);
  lines.push(`- verified_by entries with no matching test: ${report.unmatchedCount}`);
  lines.push(`- individual tests: ${report.testCount}`);
  lines.push(`- failing tests: ${report.failureCount}`);
  if (report.scenarioCount) {
    lines.push(`- scenarios: ${report.scenarioCount}`);
    lines.push(`- scenarios with a test: ${report.scenarioMatched}`);
  }
  if (coverage) {
    const fmt = data => (data ? `${formatPercent(data.line)} lines, ${formatPercent(data.branch)} branches` : 'n/a');
    lines.push(`- backend coverage: ${fmt(coverage.backend)}`);
    lines.push(`- frontend coverage: ${fmt(coverage.frontend)}`);
  }
  if (pit) {
    const killed = [...pit.classes.values()].reduce((sum, c) => sum + c.killed, 0);
    lines.push(`- mutation coverage: ${killed} of ${pit.total} mutants killed across ${pit.classes.size} classes`);
  }
  lines.push('');
  for (const row of report.rows) {
    lines.push(`### ${row.capability.id}`);
    for (const item of row.entries) {
      const outcome = item.tests.length
        ? item.tests.map(test => `${test.name} (${test.status})`).join(', ')
        : 'no matching test found';
      lines.push(`- ${item.entry} -> ${outcome}`);
      if (item.feature) {
        lines.push(`  - feature: ${item.feature.title || path.basename(item.feature.file)} (${item.scenarios.length} scenarios)`);
        for (const scenario of item.scenarios) {
          const proof = scenario.named.length
            ? scenario.named.map(test => `${test.name} [${test.status}]`).join(', ')
            : scenario.classLevel.length
              ? `class-level only: ${scenario.classLevel[0].classname} (${scenario.classLevel.length} cases)`
              : 'no matching test found';
          lines.push(`    - ${scenario.name} -> ${proof}`);
        }
      }
    }
    lines.push('');
  }
  return lines.join('\n') + '\n';
}

function main() {
  const opts = parseArgs(process.argv.slice(2));

  let capabilities;
  try {
    capabilities = parseCapabilitiesYml(fs.readFileSync(opts.capabilities, 'utf8'));
  } catch (e) {
    console.error(`coverage-report: cannot read ${opts.capabilities}: ${e.message}`);
    process.exit(1);
  }

  const surefireTests = readTests(opts.surefire);
  const vitestTests = readTests(opts.vitest);
  const features = readFeatures(opts.features);
  // Cucumber's own JUnit report names each scenario. When it is supplied it
  // supersedes surefire's parameterised cases for the same run, so those are
  // dropped rather than listed twice.
  const cucumberTests = readTests(opts.cucumber);
  const surefireKept = cucumberTests.length
    ? surefireTests.filter(test => !/^getTests\(\)/.test(test.rawName || ''))
    : surefireTests;

  const coverage = {
    backend: readBackendCoverage(opts.jacoco),
    frontend: readFrontendCoverage(opts.frontendCoverage),
  };
  const pit = readPit(opts.pit);

  const report = buildReport(capabilities, surefireKept, vitestTests, features, cucumberTests);
  const html = renderHtml(report, new Date().toISOString(), coverage, pit);

  fs.mkdirSync(opts.out, { recursive: true });
  const outputPath = path.join(opts.out, 'index.html');
  fs.writeFileSync(outputPath, html);

  if (opts.summary) {
    try {
      fs.writeFileSync(opts.summary, renderSummary(report, coverage, pit));
    } catch (e) {
      console.error(`coverage-report: cannot write summary ${opts.summary}: ${e.message}`);
    }
  }

  console.log(`Coverage report: ${outputPath}`);
  console.log(`Capabilities: ${report.rows.length}`);
  console.log(`Matched entries: ${report.matchedCount}`);
  console.log(`Unmatched entries: ${report.unmatchedCount}`);
  console.log(`Individual tests: ${report.testCount}`);
  console.log(`Failing tests: ${report.failureCount}`);
  if (report.scenarioCount) {
    console.log(`Scenarios: ${report.scenarioCount}`);
    console.log(`Scenarios with a test: ${report.scenarioMatched}`);
  }
  if (coverage.backend || coverage.frontend) {
    console.log(`Backend coverage: ${coverage.backend ? formatPercent(coverage.backend.line) : 'n/a'} lines`);
    console.log(`Frontend coverage: ${coverage.frontend ? formatPercent(coverage.frontend.line) : 'n/a'} lines`);
  }
  if (pit) {
    const killed = [...pit.classes.values()].reduce((sum, c) => sum + c.killed, 0);
    console.log(`Mutation coverage: ${killed} of ${pit.total} mutants killed across ${pit.classes.size} classes`);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseCapabilitiesYml,
  parseJunitXml,
  parseJacocoXml,
  readBackendCoverage,
  readFrontendCoverage,
  classifyEntry,
  matchEntry,
  buildReport,
  renderHtml,
};
