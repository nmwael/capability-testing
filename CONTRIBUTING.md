# Contributing to Capability Testing

Thank you for your interest in contributing! This guide explains how to add new capabilities, run validation, and understand the capability lifecycle.

## Capability Schema

Each capability is defined in `capabilities/capabilities.yml` with the following fields:

### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique identifier (e.g., `alert.publish`) |
| `intent` | string | Human-readable description of what the capability does |
| `owner` | string | Logical owner (e.g., `publication`, `alerting`, `frontend`, `docs`) |
| `github_team` | string | GitHub team for CODEOWNERS (e.g., `@org/architects`) |
| `status` | enum | One of: `active`, `deprecated`, `retired`, `draft` |
| `lifecycle_state` | enum | One of: `draft`, `active`, `deprecated`, `retired` |
| `since` | string | Version when capability was introduced (e.g., `1.0.0`) |
| `verified_by` | array | Evidence references (tests, features, reviews) |

### Optional Fields

| Field | Type | Description |
|-------|------|-------------|
| `lanes` | array | Multiple owners (e.g., `[publication, frontend]`) |
| `dependencies` | array | Other capability IDs this depends on |
| `lifecycle_state_changed` | date | Date of last lifecycle state change (YYYY-MM-DD) |
| `plans` | array | Related GitHub issue numbers |

### Verified By Entries

Each entry in `verified_by` can be a string (legacy) or object with structured metadata:

```yaml
verified_by:
  - type: integration_test
    ref: "AlertPublishIT"
    coverage: 95
    mutation_score: 85
    last_run: "2026-10-28T10:30:00Z"
  - type: bdd_feature
    ref: "features/publication/alert-publish.feature"
    scenarios: ["SC-PUB-001", "SC-PUB-002"]
    last_run: "2026-10-28T10:35:00Z"
```

#### Evidence Types

| Type | Description |
|------|-------------|
| `unit_test` | Unit test class/method |
| `integration_test` | Integration test class/method |
| `bdd_feature` | Gherkin feature file |
| `contract_test` | Contract test (Pact, etc.) |
| `mutation_test` | Mutation testing (PIT, etc.) |
| `e2e_test` | End-to-end test (Playwright, Cypress) |
| `static_analysis` | Static analysis tool output |
| `manual_review` | Manual code review reference |
| `audit` | Security/compliance audit |

## Adding a New Capability

### 1. Create Feature File(s)

Create Gherkin feature files in `features/<owner>/`:

```gherkin
# features/publication/alert-silence.feature
@cap:alert.silence
@req:REQ-PUB-005
Feature: Alert Silence
  As an operator
  I want to silence alerts temporarily
  So that maintenance windows don't generate noise

  @scenario:SC-PUB-020
  Scenario: Silence an active alert
    Given an active alert
    When I silence it for 30 minutes
    Then it should not fire during that period
```

### 2. Add Capability Entry

Add entry to `capabilities/capabilities.yml`:

```yaml
  - id: alert.silence
    intent: "Temporarily silence alerts during maintenance windows"
    owner: publication
    github_team: "@org/architects"
    status: active
    lifecycle_state: active
    since: 1.2.0
    verified_by:
      - type: bdd_feature
        ref: "features/publication/alert-silence.feature"
        scenarios: ["SC-PUB-020"]
```

### 3. Run Validation

```bash
# Run all validation locally
node scripts/verify-capabilities.js

# Run full traceability check
node scripts/verify-traceability.mjs

# Generate coverage report
node scripts/coverage-report.js \
  --surefire 'backend/**/target/surefire-reports/TEST-*.xml' \
  --vitest frontend/reports/junit.xml \
  --features features \
  --out docs/coverage
```

## Validation Scripts

| Script | Purpose |
|--------|---------|
| `verify-capabilities.js` | Validates capability schema, lane consistency, verified_by references, lifecycle transitions |
| `verify-traceability.mjs` | Checks requirements → scenarios → tests traceability |
| `change-impact.mjs` | Analyzes impact of changes since a commit |
| `release-checklist.mjs` | Runs 6 pre-release gates |
| `coverage-report.js` | Generates HTML coverage report |

## Running Validation Locally

```bash
# Install dependencies
npm ci

# Run capability validation
node scripts/verify-capabilities.js

# Run traceability check
node scripts/verify-traceability.mjs

# Generate coverage report
node scripts/coverage-report.js --features features --out docs/coverage

# Run release checklist
node scripts/release-checklist.mjs
```

## CI/CD Pipeline

The `.github/workflows/capability.yml` runs on every push/PR:

1. **validate** - Runs `verify-capabilities.js`
2. **regression-check** - Compares health scores against main branch baseline
3. **pr-comment** - Posts summary as PR comment (on PRs only)

## Health Metrics

Capabilities receive a health score (0-100) based on:
- **Coverage** (40%) - Average test coverage from verified_by entries
- **Mutation Score** (30%) - Average mutation score
- **Flakiness** (20%) - Inverse of flakiness (lower is better)
- **Freshness** (10%) - Recency of last test run (decays over 1 year)

### Health Thresholds

| Threshold | Value | Action |
|-----------|-------|--------|
| Critical | < 40% | Error - blocks release |
| Warning | < 60% | Warning - review needed |
| Draft → Active | ≥ 70% | Eligible for activation |
| Active → Deprecated | < 50% for 30 days | Advisory |
| Deprecated → Retired | < 30% for 60 days | Advisory |

## CODEOWNERS Integration

Each capability has a `github_team` field that maps to `.github/CODEOWNERS`:

```yaml
github_team: "@org/architects"
```

The `verify-capabilities.js` validates that:
1. Each capability's feature files have matching CODEOWNERS entries
2. Critical files (`capabilities.yml`, `verify-capabilities.js`) have CODEOWNERS entries
3. The GitHub team matches the capability's `github_team` field

## Lifecycle Management

### State Transitions

```
draft → active → deprecated → retired
         ↑         ↓
         └─────────┘ (reactivation)
```

### Transition Rules

| From | To | Requirements |
|------|-----|--------------|
| draft | active | Health ≥ 70%, ≥ 2 verified_by entries |
| active | deprecated | Health < 50% for 30 days |
| deprecated | retired | Health < 30% for 60 days |
| deprecated | active | Health ≥ 70% (reactivation) |

## Running Tests

```bash
# Backend tests
cd backend && mvn test

# Frontend tests
cd frontend && npm run test:unit

# Mutation testing (backend)
cd backend && mvn -Ppit test-compile org.pitest:pitest-maven:mutationCoverage

# E2E tests
cd frontend && npm run test:e2e
```

## Code Style

- Follow existing patterns in the codebase
- Run formatters/linters before committing
- Ensure all tests pass before pushing

## Questions?

Open an issue or check existing documentation in `docs/`.