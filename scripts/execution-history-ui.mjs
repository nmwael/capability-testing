#!/usr/bin/env node
// execution-history-ui.mjs — Generate a static HTML page for execution history
// with search/filter capabilities.
//
//   node scripts/execution-history-ui.mjs --output docs/execution-history/

import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const HISTORY_DIR = join(ROOT, 'docs', 'execution-history');

function escapeHtml(text) {
  return String(text === undefined || text === null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadRecords() {
  const records = [];
  if (!existsSync(HISTORY_DIR)) return records;

  for (const dateDir of readdirSync(HISTORY_DIR)) {
    const full = join(HISTORY_DIR, dateDir);
    if (!statSync(full).isDirectory()) continue;
    if (dateDir === 'archive') continue;

    for (const file of readdirSync(full)) {
      if (!file.endsWith('.json')) continue;
      try {
        const record = JSON.parse(readFileSync(join(full, file), 'utf8'));
        records.push(record);
      } catch (e) {
        // ignore malformed records
      }
    }
  }

  // Sort newest first
  records.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  return records;
}

function render(records) {
  const totalRuns = records.length;
  const totalTests = records.reduce((sum, r) => sum + (r.summary?.total || 0), 0);
  const totalFailed = records.reduce((sum, r) => sum + (r.summary?.failed || 0), 0);

  const rows = records.map(r => {
    const status = r.summary?.failed > 0 ? 'failure' : 'pass';
    const statusText = r.summary?.failed > 0 ? `${r.summary.failed} failed` : 'all passed';
    const capTags = (r.capabilities || []).map(c => `<span class="cap-tag">${escapeHtml(c)}</span>`).join(' ');
    const scenarioTags = (r.scenarioIds || []).map(s => `<span class="sc-tag">${escapeHtml(s)}</span>`).join(' ');
    return `
    <tr class="${status}">
      <td><code>${escapeHtml(r.executionId)}</code></td>
      <td><code>${escapeHtml(r.commitSha)}</code></td>
      <td>${escapeHtml(r.branch)}</td>
      <td>${escapeHtml(r.timestamp)}</td>
      <td>${r.summary?.total || 0}</td>
      <td>${r.summary?.passed || 0}</td>
      <td>${r.summary?.failed || 0}</td>
      <td class="${status}">${statusText}</td>
      <td>${capTags}</td>
      <td>${scenarioTags}</td>
    </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Execution History</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:1400px;padding:2rem;color:#1b1f23}
h1{border-bottom:2px solid #d0d7de;padding-bottom:.5rem}
.summary{display:flex;gap:1.5rem;margin:1rem 0;flex-wrap:wrap}
.summary div{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:.75rem 1rem}
.summary strong{display:block;font-size:1.4rem}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th,td{border:1px solid #d0d7de;padding:.4rem .6rem;text-align:left;font-size:.9rem;vertical-align:top}
th{background:#f6f8fa;font-weight:600}
tr.pass{color:#116329}
tr.failure{color:#b42318}
tr.failure td{background:#fff8f9}
.cap-tag,.sc-tag{display:inline-block;padding:.1rem .4rem;border-radius:3px;font-size:.75rem;margin:.1rem}
.cap-tag{background:#e1ecf4;color:#0550ae}
.sc-tag{background:#f0fdf4;color:#116329}
code{background:#f6f8fa;padding:.1rem .3rem;border-radius:3px;font-size:.85em}
.filters{margin:1rem 0}
.filters input{padding:.4rem;border:1px solid #d0d7de;border-radius:4px;width:100%;max-width:300px}
</style>
</head>
<body>
<h1>Execution History</h1>
<div class="summary">
  <div><strong>${totalRuns}</strong>execution runs</div>
  <div><strong>${totalTests}</strong>total tests</div>
  <div><strong>${totalFailed}</strong>failed tests</div>
</div>
<div class="filters">
  <input type="text" id="filter" placeholder="Filter by commit, branch, capability, scenario...">
</div>
<table id="history-table">
  <thead>
    <tr>
      <th>Execution ID</th><th>Commit SHA</th><th>Branch</th><th>Timestamp</th>
      <th>Tests</th><th>Passed</th><th>Failed</th><th>Status</th>
      <th>Capabilities</th><th>Scenarios</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
  </tbody>
</table>
<script>
document.getElementById('filter').addEventListener('input', function(e) {
  const term = e.target.value.toLowerCase();
  const rows = document.querySelectorAll('#history-table tbody tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(term) ? '' : 'none';
  });
});
</script>
</body>
</html>`;
}

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--output');
  const output = outIdx !== -1 ? args[outIdx + 1] : null;

  const records = loadRecords();
  const html = render(records);

  if (output) {
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, 'index.html'), html);
    console.log(`Execution history UI: ${join(output, 'index.html')} (${records.length} records)`);
  } else {
    console.log(html);
  }
}

main();
