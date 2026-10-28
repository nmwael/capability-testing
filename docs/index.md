---
layout: default
title: Home
---

# Capability Contract & Project Status

This project protects capabilities through explicit declaration, accountable owners, independent governance, traceable verification, and automated CI.

<div class="card">
<h2><a href="{{ site.baseurl }}/capabilities/">Capabilities</a> <a href="https://github.com/nmwael/capability-testing/blob/main/docs/capabilities.md" class="github-link" target="_blank" rel="noopener">📄</a></h2>
<p>7 capabilities governed by the Capability Contract: 6 active, 1 draft. Every capability declares its intent, owner, and verification criteria.</p>
<div class="summary">
<div><strong>7</strong>capabilities</div>
<div><strong>6</strong>active</div>
<div><strong>1</strong>draft</div>
<div><strong>96</strong>scenarios</div>
<div><strong>91</strong>implemented (95%)</div>
</div>
</div>

<div class="card">
<h2><a href="{{ site.baseurl }}/reports/">CI &amp; Reports</a> <a href="https://github.com/nmwael/capability-testing/blob/main/docs/reports.md" class="github-link" target="_blank" rel="noopener">📄</a></h2>
<p>Five CI jobs ensure end-to-end protection of capabilities. Coverage report drills from capability down to the individual test that proves it.</p>
<div class="summary">
<div><strong>5</strong>CI jobs</div>
<div><strong>178</strong>mutants killed</div>
<div><strong>306</strong>total mutants</div>
<div><strong>58%</strong>mutation coverage</div>
</div>
</div>

<div class="card">
<h2><a href="{{ site.baseurl }}/governance/">Governance</a> <a href="https://github.com/nmwael/capability-testing/blob/main/docs/governance.md" class="github-link" target="_blank" rel="noopener">📄</a></h2>
<p>Governance roles, separation of duties, and approval policies. PO Architect defines capabilities; Test Manager validates verification.</p>
<div class="summary">
<div><strong>2</strong>roles</div>
<div><strong>2</strong>gates per change</div>
<div><strong>CODEOWNERS</strong>enforced</div>
</div>
</div>

## Core Principles

- **Explicit Declaration**: Every capability is declared with its intent, owner, and verification criteria
- **Accountable Owners**: PO Architect and Test Manager serve as gates, with separation of duties
- **Independent Governance**: Governance decisions are made without capability owners' involvement
- **Traceable Verification**: Claims are distinguished from evidence; verification is automated
- **Automated CI**: Five CI jobs ensure traceability, backend stability, mention-check, frontend stability, and Playwright E2E

## Quick Links

- [Capabilities](/capability-testing/capabilities) - Full capability table with owners and status
- [CI & Reports](/capability-testing/reports) - CI jobs, coverage reports, and BDD tracking
- [Coverage](/capability-testing/coverage/) - Coverage report and verification status
- [Governance](/capability-testing/governance) - Roles, separation of duties, and approval policies
