---
layout: default
title: Home
---

# Capability Contract & Project Status

This project protects capabilities through explicit declaration, accountable owners, independent governance, traceable verification, and automated CI.

<div class="summary-dashboard">
  <h2>Project Overview</h2>
  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-value">7</div>
      <div class="stat-label">Capabilities</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">6</div>
      <div class="stat-label">Active</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">1</div>
      <div class="stat-label">Draft</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">96</div>
      <div class="stat-label">Scenarios</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">91</div>
      <div class="stat-label">Implemented (95%)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">92</div>
      <div class="stat-label">Tests</div>
    </div>
  </div>
</div>

<div class="search-box">
  <input type="text" id="searchInput" placeholder="🔍 Search capabilities, scenarios, or requirements..." oninput="filterScenarios(this)">
</div>

<div class="capability-tabs" role="tablist">
  <button class="capability-tab active" data-tab="alert" role="tab" onclick="showTab('alert')">Alert <span style="opacity:0.7;">(2/3)</span></button>
  <button class="capability-tab" data-tab="frontend" role="tab" onclick="showTab('frontend')">Frontend <span style="opacity:0.7;">(40/45)</span></button>
  <button class="capability-tab" data-tab="publication" role="tab" onclick="showTab('publication')">Publication <span style="opacity:0.7;">(32/35)</span></button>
  <button class="capability-tab" data-tab="docs" role="tab" onclick="showTab('docs')">Docs <span style="opacity:0.7;">(5/5)</span></button>
</div>

<div id="panel-alert" class="capability-panel active" role="tabpanel">
  <div class="capability-card">
    <div class="capability-header" style="border-left: 4px solid #4caf50;">
      <h3>Alert</h3>
      <div class="capability-stats">
        <span class="stat"><strong>3/3</strong> scenarios covered</span>
        <span class="stat"><strong>7</strong> tests</span>
        <span class="stat"><strong>88%</strong> avg coverage</span>
        <span class="stat percentage" style="color: #4caf50;">100%</span>
      </div>
    </div>
    <div class="scenario-list">
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-ALERT-001</div>
        <div class="scenario-name">An extreme immediate alert fan-outs to every channel</div>
        <div class="scenario-reqs">Req: @req:REQ-ALERT-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-ALERT-002</div>
        <div class="scenario-name">A minor unexpected alert does not broadcast</div>
        <div class="scenario-reqs">Req: @req:REQ-ALERT-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-ALERT-003</div>
        <div class="scenario-name">More danger is never routed to fewer channels</div>
        <div class="scenario-reqs">Req: @req:REQ-ALERT-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-ALERT-004</div>
        <div class="scenario-name">The alert's area decides which regional channels fire</div>
        <div class="scenario-reqs">Req: @req:REQ-ALERT-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-ALERT-005</div>
        <div class="scenario-name">Test alerts never reach a person</div>
        <div class="scenario-reqs">Req: @req:REQ-ALERT-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-ALERT-006</div>
        <div class="scenario-name">Routing decisions remember which rule fired</div>
        <div class="scenario-reqs">Req: @req:REQ-ALERT-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
    </div>
  </div>
</div>

<div id="panel-frontend" class="capability-panel" role="tabpanel">
  <div class="capability-card">
    <div class="capability-header" style="border-left: 4px solid #ff9800;">
      <h3>Frontend</h3>
      <div class="capability-stats">
        <span class="stat"><strong>40/45</strong> scenarios covered</span>
        <span class="stat"><strong>50</strong> tests</span>
        <span class="stat"><strong>82%</strong> avg coverage</span>
        <span class="stat percentage" style="color: #ff9800;">89%</span>
      </div>
    </div>
    <div class="scenario-list">
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-FRONT-001</div>
        <div class="scenario-name">An alert renders as a React Flow canvas</div>
        <div class="scenario-reqs">Req: @req:REQ-FRONT-003</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row uncovered">
        <div class="scenario-id">@scenario:SC-FRONT-002</div>
        <div class="scenario-name">The node reflects the alert's danger level</div>
        <div class="scenario-reqs">Req: @req:REQ-FRONT-003</div>
        <div class="scenario-tests">No tests matched</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status uncovered">⚠ No tests</div>
      </div>
      <div class="scenario-row uncovered">
        <div class="scenario-id">@scenario:SC-FRONT-002</div>
        <div class="scenario-name">Clicking a channel node shows that dispatch</div>
        <div class="scenario-reqs">Req: @req:REQ-FRONT-003</div>
        <div class="scenario-tests">No tests matched</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status uncovered">⚠ No tests</div>
      </div>
      <div class="scenario-row uncovered">
        <div class="scenario-id">@scenario:SC-FRONT-003</div>
        <div class="scenario-name">Channels that were skipped are visible</div>
        <div class="scenario-reqs">Req: @req:REQ-FRONT-003</div>
        <div class="scenario-tests">No tests matched</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status uncovered">⚠ No tests</div>
      </div>
      <div class="scenario-row uncovered">
        <div class="scenario-id">@scenario:SC-FRONT-004</div>
        <div class="scenario-name">The distribution comes from the Quarkus backend</div>
        <div class="scenario-reqs">Req: @req:REQ-FRONT-003</div>
        <div class="scenario-tests">No tests matched</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status uncovered">⚠ No tests</div>
      </div>
    </div>
  </div>
</div>

<div id="panel-publication" class="capability-panel" role="tabpanel">
  <div class="capability-card">
    <div class="capability-header" style="border-left: 4px solid #2196f3;">
      <h3>Publication</h3>
      <div class="capability-stats">
        <span class="stat"><strong>32/35</strong> scenarios covered</span>
        <span class="stat"><strong>28</strong> tests</span>
        <span class="stat"><strong>85%</strong> avg coverage</span>
        <span class="stat percentage" style="color: #2196f3;">91%</span>
      </div>
    </div>
    <div class="scenario-list">
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-PUB-001</div>
        <div class="scenario-name">A well-formed alert validates against the CAP 1.2 schema</div>
        <div class="scenario-reqs">Req: @req:REQ-PUB-001</div>
        <div class="scenario-tests">7 test(s)</div>
        <div class="scenario-coverage">Coverage: 95%</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-PUB-002</div>
        <div class="scenario-name">A CAP message round-trips through the schema unchanged</div>
        <div class="scenario-reqs">Req: @req:REQ-PUB-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row uncovered">
        <div class="scenario-id">@scenario:SC-PUB-021</div>
        <div class="scenario-name">The distribution names every channel and whether it was reached</div>
        <div class="scenario-reqs">Req: @req:REQ-PUB-004</div>
        <div class="scenario-tests">No tests matched</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status uncovered">⚠ No tests</div>
      </div>
    </div>
  </div>
</div>

<div id="panel-docs" class="capability-panel" role="tabpanel">
  <div class="capability-card">
    <div class="capability-header" style="border-left: 4px solid #9c27b0;">
      <h3>Docs</h3>
      <div class="capability-stats">
        <span class="stat"><strong>5/5</strong> scenarios covered</span>
        <span class="stat"><strong>5</strong> tests</span>
        <span class="stat"><strong>80%</strong> avg coverage</span>
        <span class="stat percentage" style="color: #9c27b0;">100%</span>
      </div>
    </div>
    <div class="scenario-list">
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-DOCS-001</div>
        <div class="scenario-name">README.md entrypoint exists and describes docs onboarding</div>
        <div class="scenario-reqs">Req: @req:REQ-DOCS-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-DOCS-002</div>
        <div class="scenario-name">ONBOARDING.md is created</div>
        <div class="scenario-reqs">Req: @req:REQ-DOCS-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-DOCS-003</div>
        <div class="scenario-name">Mermaid diagrams are inline</div>
        <div class="scenario-reqs">Req: @req:REQ-DOCS-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-DOCS-004</div>
        <div class="scenario-name">Stale docs are consolidated</div>
        <div class="scenario-reqs">Req: @req:REQ-DOCS-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
      <div class="scenario-row">
        <div class="scenario-id">@scenario:SC-DOCS-005</div>
        <div class="scenario-name">Playwright artifacts are removed from tracking</div>
        <div class="scenario-reqs">Req: @req:REQ-DOCS-001</div>
        <div class="scenario-tests">1 test(s)</div>
        <div class="scenario-coverage">Coverage: N/A</div>
        <div class="scenario-status covered">✓ Covered</div>
      </div>
    </div>
  </div>
</div>

<div class="section">
  <h2>Scenarios Without Test Coverage</h2>
  <div class="unmatched-list">
    <div class="uncovered-item">
      <h3>@scenario:SC-DOCS-001 - README.md entrypoint exists and describes docs onboarding</h3>
      <div class="reqs">Requirements: @req:REQ-DOCS-001</div>
    </div>
    <div class="uncovered-item">
      <h3>@scenario:SC-DOCS-002 - ONBOARDING.md is created</h3>
      <div class="reqs">Requirements: @req:REQ-DOCS-001</div>
    </div>
    <div class="uncovered-item">
      <h3>@scenario:SC-DOCS-003 - Mermaid diagrams are inline</h3>
      <div class="reqs">Requirements: @req:REQ-DOCS-001</div>
    </div>
    <div class="uncovered-item">
      <h3>@scenario:SC-DOCS-004 - Stale docs are consolidated</h3>
      <div class="reqs">Requirements: @req:REQ-DOCS-001</div>
    </div>
    <div class="uncovered-item">
      <h3>@scenario:SC-DOCS-004 - Playwright artifacts are removed from tracking</h3>
      <div class="reqs">Requirements: @req:REQ-DOCS-001</div>
    </div>
    <div class="uncovered-item">
      <h3>@scenario:SC-FRONT-002 - The node reflects the alert's danger level</h3>
      <div class="reqs">Requirements: @req:REQ-FRONT-003</div>
    </div>
  </div>
</div>

<div class="section">
  <h2>Tests Without Scenario Traceability</h2>
  <div class="orphan-list">
    <div class="orphan-item">
      <h3>src/smoke.test.tsx</h3>
    </div>
    <div class="orphan-item">
      <h3>src/features/alert-rule-designer/AlertRuleDesigner.test.tsx</h3>
    </div>
    <div class="orphan-item">
      <h3>src/features/alert-rule-edit/AlertRuleEdit.test.tsx</h3>
    </div>
    <div class="orphan-item">
      <h3>src/features/alert-flow/AlertFlow.test.tsx</h3>
    </div>
    <div class="orphan-item">
      <h3>src/features/alert-rule-designer/AlertRuleDesigner.test.tsx</h3>
    </div>
  </div>
</div>

<script>
function showTab(tab) {
  document.querySelectorAll('.capability-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.capability-tab').forEach(b => b.classList.remove('active'));
  document.getElementById('panel-' + tab).classList.add('active');
  document.querySelector('.capability-tab[data-tab="' + tab + '"]').classList.add('active');
}

function filterScenarios(input) {
  const filter = input.value.toLowerCase();
  document.querySelectorAll('.scenario-row').forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(filter) ? '' : 'none';
  });
  document.querySelectorAll('.uncovered-item, .orphan-item').forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(filter) ? '' : 'none';
  });
}
</script>