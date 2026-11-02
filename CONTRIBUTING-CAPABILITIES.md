# Capability Development Tutorial

This guide walks you through adding a new capability to the capability contract system, from specification to automated verification.

## Prerequisites

- Node.js 24+
- Java 17+ (for backend tests)
- Maven 3.9+ (for backend)
- npm 10+ (for frontend)

## Step 1: Define the Capability

Add a new capability entry to `capabilities/capabilities.yml`:

```yaml
- id: my.capability
  intent: "Clear, concise description of what this capability delivers"
  owner: frontend          # or publication, alerting, docs
  github_team: "@org/architects"
  lanes: [frontend]        # or [publication, frontend] for multi-lane
  lifecycle_state: active
  lifecycle_state_changed: "2026-01-15"
  dependencies: []         # list of capability IDs this depends on
  since: 1.0.0
  verified_by:
    - type: unit_test
      ref: "MyCapabilityUnitTest"
      coverage: 90
      mutation_score: 80
      flakiness: 0.02
      last_run: "2026-01-15T10:00:00Z"
    - type: bdd_feature
      ref: "features/frontend/my-capability.feature"
      scenarios: ["SC-FRONT-001", "SC-FRONT-002"]
      last_run: "2026-01-15T10:30:00Z"
```

### Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique capability identifier (kebab-case, e.g., `my.capability`) |
| `intent` | Yes | One-sentence description of the capability's purpose |
| `owner` | Yes | Primary team: `frontend`, `publication`, `alerting`, `docs` |
| `github_team` | Yes | GitHub team for CODEOWNERS mapping (e.g., `@org/architects`) |
| `lanes` | No | Array of lanes for multi-lane capabilities; defaults to `[owner]` |
| `lifecycle_state` | Yes | `draft`, `active`, `deprecated`, `retired` |
| `lifecycle_state_changed` | Yes | ISO date when current state began |
| `dependencies` | No | Array of capability IDs this capability depends on |
| `since` | Yes | Version when capability was introduced |
| `verified_by` | Yes | Array of verification evidence objects |

### Verification Evidence Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `unit_test` | Unit test class | `ref` (class name), `coverage`, `mutation_score` |
| `integration_test` | Integration test class | `ref`, `coverage`, `mutation_score` |
| `bdd_feature` | Gherkin feature file | `ref` (path), `scenarios` (array of SC-XXX IDs) |
| `contract_test` | Contract test | `ref`, `coverage` |
| `mutation_test` | Mutation testing | `ref`, `mutation_score` |
| `e2e_test` | End-to-end test | `ref`, `coverage` |
| `static_analysis` | Static analysis | `ref` |
| `manual_review` | Manual review | `ref`, `last_run` |
| `audit` | Security/compliance audit | `ref`, `last_run` |

## Step 2: Write Gherkin Scenarios

Create a feature file in the appropriate lane directory:

```gherkin
# features/frontend/my-capability.feature
@bdd
@cap:my.capability
@frontend
Feature: My Capability

  @scenario:SC-FRONT-001
  @req:REQ-MY-001
  Scenario: Basic functionality
    Given the system is initialized
    When I invoke the capability
    Then the expected result is produced

  @scenario:SC-FRONT-002
  @req:REQ-MY-002
  Scenario: Error handling
    Given invalid input
    When I invoke the capability
    Then an appropriate error is returned
```

### Tagging Conventions

| Tag | Purpose | Example |
|-----|---------|---------|
| `@bdd` | Marks file as BDD feature | `@bdd` |
| `@cap:<id>` | Links to capability | `@cap:my.capability` |
| `@frontend` / `@backend` / `@docs` | Lane marker | `@frontend` |
| `@scenario:SC-XXX` | Stable scenario ID | `@scenario:SC-FRONT-001` |
| `@req:REQ-XXX` | Requirement traceability | `@req:REQ-MY-001` |

## Step 3: Implement Verification

### Backend (Java/JUnit)

```java
// backend/.../MyCapabilityIT.java
@Tag("integration")
class MyCapabilityIT {
    @Test
    void testBasicFunctionality() {
        // SC-FRONT-001
        // Implementation
    }
}
```

### Frontend (Vitest)

```typescript
// frontend/src/__tests__/my-capability.test.ts
describe('My Capability', () => {
  it('SC-FRONT-001: basic functionality', () => {
    // Implementation
  });
});
```

### Playwright (E2E)

```typescript
// frontend/e2e/my-capability.spec.ts
test('SC-FRONT-001: basic functionality', async ({ page }) => {
  // Implementation
});
```

## Step 4: Run Verification

```bash
# Validate capability contract
node scripts/verify-capabilities.js

# Generate coverage report
node scripts/coverage-report.js \
  --surefire 'backend/**/target/surefire-reports/TEST-*.xml' \
  --vitest 'frontend/reports/junit.xml' \
  --cucumber 'backend/**/cucumber-junit.xml' \
  --jacoco 'backend/**/target/site/jacoco/jacoco.xml' \
  --frontend-coverage 'frontend/coverage/coverage-summary.json' \
  --pit 'backend/*/target/pit-reports/mutations.xml' \
  --features features \
  --out docs/coverage
```

## Step 5: CI Integration

The CI pipeline automatically runs on every PR:

1. **verify-capabilities.js** - Validates capability contract
2. **verify-traceability.mjs** - Checks requirement-to-test traceability
3. **regression-check.mjs** - Fails on health score drops
4. **pr-comment.mjs** - Posts validation report to PR

## Step 6: Health Metrics

Capabilities are scored automatically (0-100):

- **Coverage** (40%): Average test coverage from verified_by
- **Mutation Score** (30%): Mutation testing effectiveness
- **Flakiness** (20%): 1 - flakiness rate
- **Freshness** (10%): Recency of last verification run

Scores drive lifecycle transitions:
- **draft → active**: Health ≥ 70 + ≥2 verified_by entries
- **active → deprecated**: Health < 50 for 30 days
- **deprecated → retired**: Health < 30 for 60 days
- **deprecated → active**: Health ≥ 70 (reactivation)

## Common Issues

### Lane Consistency Error
```
Lane consistency failed: features/frontend/... capability 'my.cap' has owner 'publication'
```
**Fix**: Add `lanes: [publication, frontend]` to capability or change `owner` to match feature directory.

### Orphaned Feature File
```
Orphaned feature file not referenced by any capability: features/frontend/my-feature.feature
```
**Fix**: Add the feature file to `verified_by` in capabilities.yml.

### Missing CODEOWNERS
```
Feature file 'features/frontend/...' has no CODEOWNERS entry
```
**Fix**: Add entry to `.github/CODEOWNERS` mapping the feature file to the capability's `github_team`.

## Best Practices

1. **One capability per file** - Keep capabilities focused and independent
2. **Stable scenario IDs** - Never reuse SC-XXX IDs; they're immutable traceability anchors
3. **Minimum 2 verified_by** - Required for draft→active transition
4. **Update last_run** - Keep verification timestamps current for freshness scoring
5. **Document dependencies** - Use `dependencies` field for capability relationships
6. **Use lanes for multi-team capabilities** - `lanes: [publication, frontend]` allows features in both directories

## Validation Commands

```bash
# Full validation
node scripts/verify-capabilities.js

# Traceability check
node scripts/verify-traceability.mjs

# Change impact analysis
node scripts/change-impact.mjs --since HEAD~1

# Release readiness
node scripts/release-checklist.mjs
```

## Resources

- [Capability Registry Schema](capabilities/capabilities.yml)
- [Verification Script](scripts/verify-capabilities.js)
- [Coverage Report Generator](scripts/coverage-report.js)
- [CODEOWNERS](.github/CODEOWNERS)
- [CI Workflows](.github/workflows/)