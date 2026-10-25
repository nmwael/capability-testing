---
layout: default
title: Capabilities
---

# Capabilities

This page documents all capabilities governed by the Capability Contract.

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

### `@cap:docs.onboarding`

- **Status**: Draft
- **Scenarios**: 5 total, 5 to do (0 implemented)
- **Intent**: Ensure proper onboarding documentation
- **Next Steps**: Implement remaining scenarios and verify with `scripts/check-docs.js`

## Implementation Status

- **91 of 96 scenarios implemented** (95% coverage)
- **5 scenarios remaining** (all under `@cap:docs.onboarding`)
- **All active checks pass**: `scripts/verify-capabilities.js` PASSES, `scripts/check-docs.js` PASSES

## See Also

- [CI & Reports](/capability-testing/reports) - Detailed CI job coverage and BDD tracking
- [Governance](/capability-testing/governance) - Governance roles and approval policies
