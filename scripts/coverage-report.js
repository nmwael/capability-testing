#!/usr/bin/env node
// coverage-report.js: Generate an HTML coverage report mapping capabilities
// to test coverage, enabling drill-down from capability -> test -> code.
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

function unquote(s) {
  return s.replace(/^['"]|['"]$/g, '');
}

function readCapabilities(file) {
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

function parseVitestCoverage(file) {
  if (!fs.existsSync(file)) return {};
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = {};
  for (const [filePath, cov] of Object.entries(data)) {
    if (!cov || !cov.statementMap) continue;
    const statements = Object.keys(cov.statementMap).length;
    const executed = Object.values(cov.s || {}).filter(n => n > 0).length;
    const branches = Object.keys(cov.branchMap || {}).length;
    const executedBranches = Object.values(cov.b || {}).reduce((acc, v) => acc + (v.filter(n => n > 0).length || 0), 0);
    result[filePath] = {
      path: filePath,
      statements: { total: statements, covered: executed },
      branches: { total: branches, covered: executedBranches },
      percent: statements > 0 ? Math.round((executed / statements) * 100) : 0,
    };
  }
  return result;
}

function parseJacoco(file) {
  if (!fs.existsSync(file)) return {};
  const text = fs.readFileSync(file, 'utf8');
  const result = {};
  const classMatches = text.match(/<class[^>]*>[\s\S]*?<\/class>/g) || [];
  for (const clsMatch of classMatches) {
    const className = clsMatch.match(/name="([^"]+)"/)?.[1];
    if (!className) continue;
    let lineTotal = 0, lineCovered = 0;
    const lineMatches = clsMatch.match(/<line[^>]*>/g) || [];
    for (const lm of lineMatches) {
      const ci = lm.match(/ci="(\d+)"/);
      const nr = lm.match(/nr="(\d+)"/);
      if (ci && nr) {
        lineTotal += parseInt(nr[1], 10);
        lineCovered += parseInt(ci[1], 10);
      }
    }
    let branchTotal = 0, branchCovered = 0;
    const branchMatches = clsMatch.match(/<branch[^>]*>/g) || [];
    for (const bm of branchMatches) {
      const ci = bm.match(/ci="(\d+)"/);
      const nr = bm.match(/nr="(\d+)"/);
      if (ci && nr) {
        branchTotal += parseInt(nr[1], 10);
        branchCovered += parseInt(ci[1], 10);
      }
    }
    result[className] = {
      path: className,
      statements: { total: lineTotal, covered: lineCovered },
      branches: { total: branchTotal, covered: branchCovered },
      percent: lineTotal > 0 ? Math.round((lineCovered / lineTotal) * 100) : 0,
    };
  }
  return result;
}

function main() {
  const args = process.argv.slice(2);
  const argsMap = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      argsMap[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }

  const capFile = argsMap.capabilities || 'capabilities/capabilities.yml';
  const bcFile = argsMap['backend-coverage'];
  const fcFile = argsMap['frontend-coverage'];
  const outDir = argsMap.out || 'coverage-report';

  const capabilities = readCapabilities(path.join(ROOT, capFile));
  const bc = bcFile ? parseJacoco(path.join(ROOT, bcFile)) : {};
  const fc = fcFile ? parseVitestCoverage(path.join(ROOT, fcFile)) : {};

  const reportCaps = capabilities.map(cap => {
    const bcCov = bc[cap.id] || { statements: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, percent: 0 };
    const fcCov = fc[cap.id] || { statements: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, percent: 0 };
    return {
      ...cap,
      backend: bcCov,
      frontend: fcCov,
      totalStatements: (bcCov.statements.total || 0) + (fcCov.statements.total || 0),
      coveredStatements: (bcCov.statements.covered || 0) + (fcCov.statements.covered || 0),
      totalBranches: (bcCov.branches.total || 0) + (fcCov.branches.total || 0),
      coveredBranches: (bcCov.branches.covered || 0) + (fcCov.branches.covered || 0),
    };
  });

  let totalStatements = 0, coveredStatements = 0, totalBranches = 0, coveredBranches = 0;
  for (const cap of reportCaps) {
    totalStatements += cap.totalStatements;
    coveredStatements += cap.coveredStatements;
    totalBranches += cap.totalBranches;
    coveredBranches += cap.coveredBranches;
  }
  const overallPercent = totalStatements > 0 ? Math.round((coveredStatements / totalStatements) * 100) : 0;

  function pct(n) { return n > 0 ? Math.round((cap.coveredStatements / cap.totalStatements) * 100) : 0; }

  const rows = reportCaps.map(cap => {
    const pct = cap.totalStatements > 0 ? Math.round((cap.coveredStatements / cap.totalStatements) * 100) : 0;
    return `
      <tr>
        <td><strong>${cap.id}</strong></td>
        <td>${cap.intent || '&ndash;'}</td>
        <td>${cap.owner || '&ndash;'}</td>
        <td>${cap.status || '&ndash;'}</td>
        <td>
          <div class="progress-bar"><div class="progress-fill ${pct >= 80 ? 'good' : pct >= 50 ? 'medium' : 'bad'}" style="width: ${pct}%"></div></div>
          ${pct}%
        </td>
        <td>${cap.backend.percent}%</td>
        <td>${cap.frontend.percent}%</td>
        <td><button class="collapsible" onclick="toggleDetail('${cap.id}')">Show tests</button></td>
      </tr>
      <tr class="detail-row" id="detail-${cap.id}">
        <td colspan="8">
          <strong>Description:</strong> ${cap.intent || '&ndash;'}<br>
          <strong>Verified by:</strong> ${(cap.verified_by || []).join(', ') || 'None specified'}<br>
          <strong>Status:</strong> ${cap.status || 'unknown'}<br>
          <strong>Since:</strong> ${cap.since || 'unknown'}
        </td>
      </tr>
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Capability Coverage Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f7; }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 10px; }
    .summary-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin-bottom: 20px; display: inline-block; }
    .stat { display: inline-block; margin-right: 20px; }
    .stat-value { font-size: 2em; font-weight: bold; color: #2563eb; }
    .stat-label { font-size: 0.9em; color: #666; }
    table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    th { background: #f3f4f6; padding: 12px; text-align: left; font-weight: 600; }
    td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; }
    tr:hover { background: #f9fafb; }
    .badge { padding: 4px 8px; border-radius: 4px; font-size: 0.85em; font-weight: 600; }
    .badge-good { background: #dcfce7; color: #166534; }
    .badge-medium { background: #fef3c7; color: #92400e; }
    .badge-bad { background: #fee2e2; color: #991b1b; }
    .badge-none { background: #f3f4f6; color: #6b7280; }
    .detail-row { display: none; background: #f8fafc; }
    .detail-row.show { display: table-row; }
    .collapsible { cursor: pointer; color: #2563eb; text-decoration: underline; }
    .collapsible:hover { text-decoration: underline; }
    .progress-bar { width: 100%; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; margin-top: 4px; }
    .progress-fill { height: 100%; background: #2563eb; transition: width 0.3s ease; }
    .progress-fill.bad { background: #dc2626; }
    .progress-fill.medium { background: #d97706; }
    .progress-fill.good { background: #16a34a; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Capability Coverage Report</h1>
    <div class="summary-card">
      <div class="stat"><div class="stat-value">${capabilities.length}</div><div class="stat-label">Capabilities</div></div>
      <div class="stat"><div class="stat-value">${overallPercent}%</div><div class="stat-label">Coverage</div></div>
      <div class="stat"><div class="stat-value">${coveredStatements}</div><div class="stat-label">Lines Covered</div></div>
      <div class="stat"><div class="stat-value">${totalStatements}</div><div class="stat-label">Total Lines</div></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Capability</th>
          <th>Intent</th>
          <th>Owner</th>
          <th>Status</th>
          <th>Coverage</th>
          <th>Backend</th>
          <th>Frontend</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    <script>
      function toggleDetail(id) {
        const el = document.getElementById('detail-' + id);
        el.classList.toggle('show');
      }
    </script>
  </div>
</body>
</html>`;

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), html);
  console.log(`Coverage report written to ${path.join(outDir, 'index.html')}`);
}

main();
