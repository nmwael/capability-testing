---
layout: default
title: CI & Reports
---

# CI & Reports

This page documents CI jobs, coverage reports, and BDD tracking.

## CI Jobs Overview

Five CI jobs ensure end-to-end protection of capabilities:

| Job | Purpose | Owner |
|-----|---------|-------|
| `traceability` | Ensure traceability of claims to evidence | PO Architect |
| `backend` | Ensure backend stability | PO Architect |
| `frontend` | Ensure frontend stability | PO Architect |
| `playwright-e2e` | Ensure Playwright E2E tests pass | PO Architect |
| `mention-check` | Ensure no @-mentions in GitHub posts | PO Architect |

## Coverage Reports

### Backend Coverage

- **JaCoCo report**: Backend test coverage is automatically generated
- **Threshold**: 100% required for all critical paths

### Frontend Coverage

- **Vitest report**: Frontend test coverage is automatically generated
- **Threshold**: 100% required for all critical paths

## Capability Matrix

Each capability is mapped to specific CI jobs and verification scripts:

| Capability | CI Job | Verification Script |
|------------|--------|-------------------|
| `@cap:backend` | backend | `scripts/verify-capabilities.js` |
| `@cap:frontend` | frontend | `scripts/verify-capabilities.js` |
| `@cap:e2e` | playwright-e2e | `scripts/verify-capabilities.js` |
| `@cap:trace` | traceability | `scripts/verify-capabilities.js` |
| `@cap:mentions` | mention-check | `scripts/verify-capabilities.js` |
| `@cap:docs.onboarding` | N/A | `scripts/check-docs.js` |

## BDD @todo Tracking

The BDD framework tracks scenarios with `@todo` annotations:

- **Implemented scenarios**: Marked with `@bdd` and passing tests
- **Pending scenarios**: Marked with `@todo` in the capability registry
- **Current status**: 91 of 96 scenarios implemented (95% coverage)

## How to Read Reports

1. **Check CI status**: Verify all jobs pass in the repository CI
2. **Run verification scripts**:
   - `node scripts/verify-capabilities.js` - Checks capability matrix
   - `node scripts/check-docs.js` - Checks documentation
3. **Review coverage reports**: Check JaCoCo (backend) and Vitest (frontend) reports
4. **Track @todo items**: Review the capability registry for pending scenarios

## See Also

- [Capabilities](/capability-testing/capabilities) - Full capability table
- [Governance](/capability-testing/governance) - Governance roles and policies
