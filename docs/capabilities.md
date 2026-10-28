---
layout: default
title: Capabilities
---

# Capabilities

This page documents all capabilities governed by the Capability Contract. Each capability is linked to its source in `capabilities/capabilities.yml`.

<div class="card">
<h2><a href="https://github.com/nmwael/capability-testing/blob/main/capabilities/capabilities.yml" class="github-link" target="_blank" rel="noopener">📄</a> Source: capabilities/capabilities.yml</h2>
<p>The capability registry is the single source of truth. Each entry lists its <code>verified_by</code> entries which drill down to individual tests in the <a href="{{ site.baseurl }}/coverage/">coverage report</a>.</p>
</div>

## Capability Table

| ID | Intent | Owner | Status | Since | Verified By |
|----|--------|-------|--------|-------|-------------|
| `@cap:backend` | Ensure backend stability | PO Architect | Active | 2024-02-21 | [`ci.yml`](../ci.yml) |
| `@cap:frontend` | Ensure frontend stability | PO Architect | Active | 2024-02-21 | [`ci.yml`](../ci.yml) |
| `@cap:e2e` | Ensure Playwright E2E tests | PO Architect | Active | 2024-02-21 | [`ci.yml`](../ci.yml) |
| `@cap:trace` | Ensure traceability | PO Architect | Active | 2024-02-21 | [`ci.yml`](../ci.yml) |
| `@cap:mentions` | Ensure no @-mentions in GitHub posts | PO Architect | Active | 2024-02-21 | [`ci.yml`](../ci.yml) |
| `@cap:docs.onboarding` | Ensure docs.onboarding capability | PO Architect | Draft | TBD | TBD |

## Draft Capabilities

The following capabilities are marked as draft and require implementation:

<div class="card">
<h2>@cap:docs.onboarding</h2>
<p><strong>Status:</strong> Draft</p>
<p><strong>Scenarios:</strong> 5 total, 5 to do (0 implemented)</p>
<p><strong>Intent:</strong> Ensure proper onboarding documentation</p>
<p><strong>Next Steps:</strong> Implement remaining scenarios and verify with <code>scripts/check-docs.js</code></p>
</div>

## Implementation Status

- **91 of 96 scenarios implemented** (95% coverage)
- **5 scenarios remaining** (all under `@cap:docs.onboarding`)
- **All active checks pass**: `scripts/verify-capabilities.js` PASSES, `scripts/check-docs.js` PASSES

## See Also

- [CI & Reports](/capability-testing/reports) - Detailed CI job coverage and BDD tracking
- [Governance](/capability-testing/governance) - Governance roles and approval policies
- [Coverage](/capability-testing/coverage/) - Capability-to-test drilldown report
