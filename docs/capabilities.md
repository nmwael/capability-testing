---
layout: default
title: Capabilities
---

# Capabilities

This page documents all capabilities governed by the Capability Contract. Each capability is linked to its source in `capabilities/capabilities.yml`.

<div class="card">
<h2><a href="https://github.com/nmwael/capability-testing/blob/main/capabilities/capabilities.yml" class="github-link" target="_blank" rel="noopener">📄</a> Source: capabilities/capabilities.yml</h2>
<p>The capability registry is the single source of truth. Each entry lists its `verified_by` entries which drill down to individual tests in the <a href="{{ site.baseurl }}/coverage/">coverage report</a>.</p>
</div>

## Capability Table

| ID | Intent | Owner | Status | Since | Requirements |
|----|--------|-------|--------|-------|--------------|
| `alert.publish` | Publish an alert as a CAP v1.2 message that validates against the OASIS schema | publication | Active | 2026-01-15 | <a href="https://github.com/nmwael/capability-testing/issues/267" target="_blank" rel="noopener"><code>REQ-PUB-001</code></a> |
| `alert.route` | Route a CAP alert by its severity, urgency and certainty | alerting | Active | 2026-02-20 | <a href="https://github.com/nmwael/capability-testing/issues/271" target="_blank" rel="noopener"><code>REQ-ALERT-001</code></a> |
| `alert.rule-design` | Draw routing rules as a React Flow graph; compile and execute them in Drools | publication | Active | 2026-03-10 | <a href="https://github.com/nmwael/capability-testing/issues/268" target="_blank" rel="noopener"><code>REQ-PUB-002</code></a>, <a href="https://github.com/nmwael/capability-testing/issues/272" target="_blank" rel="noopener"><code>REQ-FRONT-001</code></a> |
| `alert.rule-edit` | Edit a saved routing rule graph in the designer and exchange it with the backend as JSON | publication | Active | 2026-04-05 | <a href="https://github.com/nmwael/capability-testing/issues/269" target="_blank" rel="noopener"><code>REQ-PUB-003</code></a>, <a href="https://github.com/nmwael/capability-testing/issues/273" target="_blank" rel="noopener"><code>REQ-FRONT-002</code></a> |
| `alert.flow` | Show an alert's distribution as a React Flow canvas | publication | Active | 2026-05-12 | <a href="https://github.com/nmwael/capability-testing/issues/270" target="_blank" rel="noopener"><code>REQ-PUB-004</code></a>, <a href="https://github.com/nmwael/capability-testing/issues/274" target="_blank" rel="noopener"><code>REQ-FRONT-003</code></a> |
| `alert.cap-fields` | List every CAP v1.2 attribute with its type and valid values, and drive the rule designer's condition fields from the schema | frontend | Active | 2026-06-20 | <a href="https://github.com/nmwael/capability-testing/issues/275" target="_blank" rel="noopener"><code>REQ-FRONT-004</code></a> |
| `docs.onboarding` | Create entrypoint README.md, optional ONBOARDING.md, inline mermaid diagrams, consolidate stale docs, remove generated Playwright artifacts | docs | Draft | 2026-09-01 | <a href="https://github.com/nmwael/capability-testing/issues/276" target="_blank" rel="noopener"><code>REQ-DOCS-001</code></a> |

## Draft Capabilities

The following capabilities are marked as draft and require implementation:

## docs.onboarding

<p><strong>Status:</strong> draft</p>
<p><strong>Scenarios:</strong> 5 total, 5 to do (0 implemented)</p>
<p><strong>Intent:</strong> Create entrypoint README.md, optional ONBOARDING.md, inline mermaid diagrams, consolidate stale docs, remove generated Playwright artifacts</p>
<p><strong>Since:</strong> 2026-09-01</p>
<p><strong>Requirements:</strong> <code>REQ-DOCS-001</code></p>

## Implementation Status

- **91 of 96 scenarios implemented** (95% coverage)
- **1 draft capabilities**
- **All active checks pass**: `scripts/verify-capabilities.js` PASSES, `scripts/check-docs.js` PASSES

## See Also

- [CI & Reports]({{ site.baseurl }}/reports) - Detailed CI job coverage and BDD tracking
- [Governance]({{ site.baseurl }}/governance) - Governance roles and approval policies
- [Coverage]({{ site.baseurl }}/coverage/) - Capability-to-test drilldown report
