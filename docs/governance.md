---
layout: default
title: Governance
---

# Governance

This page documents governance roles, separation of duties, and approval policies.

## Governance Roles

| Role | Responsibilities | Gates |
|------|------------------|-------|
| **PO Architect** | Defines capabilities, ensures traceability, approves changes | Capabilities, CI, Traceability |
| **Test Manager** | Ensures test coverage, validates evidence, approves verification | Coverage, BDD, Verification |

## Separation of Duties

Governance maintains independence by separating definition from verification:

| Area | Responsible | Verified By |
|------|-------------|-------------|
| Capability Definition | PO Architect | Test Manager |
| Test Implementation | Test Manager | PO Architect |
| Coverage Validation | Test Manager | PO Architect |
| Change Approval | PO Architect + Test Manager | Both |

## Change Approval Policy

Changes to capabilities require dual approval:

1. **Capability changes**: PO Architect defines, Test Manager verifies
2. **CI job changes**: PO Architect proposes, Test Manager validates
3. **Documentation changes**: Test Manager reviews, PO Architect approves

## CODEOWNERS Enforcement Rules

The `CODEOWNERS` file enforces:

- **PO Architect**: Reviews all capability-related changes
- **Test Manager**: Reviews all test and verification changes

Changes must pass both gates before merging.

## Governance Gap Note

The governance process currently lacks automated approval workflows for capability changes. Manual review via `CODEOWNERS` remains in place until automation is implemented.

## See Also

- [Capabilities](/capability-testing/capabilities) - Capability table and status
- [CI & Reports](/capability-testing/reports) - CI jobs and coverage reports
