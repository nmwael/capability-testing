# Capability Contribution Guide

This guide explains how to contribute to the capability contract system, including adding new capabilities, updating existing ones, and maintaining verification evidence.

## Quick Start

```bash
# 1. Fork and clone
git clone https://github.com/nmwael/capability-testing.git
cd capability-testing

# 2. Install dependencies
npm ci

# 3. Run validation
node scripts/verify-capabilities.js

# 4. Make your changes
# Edit capabilities/capabilities.yml
# Add feature files in features/<lane>/

# 5. Validate
node scripts/verify-capabilities.js
node scripts/verify-traceability.mjs

# 6. Submit PR
```

## Contribution Workflow

### 1. Adding a New Capability

1. **Reserve an ID** - Use kebab-case: `domain.feature` (e.g., `alert.routing`, `frontend.dashboard`)
2. **Choose owner** - `frontend`, `publication`, `alerting`, or `docs`
3. **Add to capabilities.yml** - Follow the schema in CONTRIBUTING-CAPABILITIES.md
4. **Create feature files** - Gherkin scenarios in `features/<owner>/`
5. **Implement tests** - Unit, integration, or e2e tests
6. **Run verification** - `node scripts/verify-capabilities.js`
7. **Open PR** - CI will validate automatically

### 2. Updating an Existing Capability

1. **Modify capabilities.yml** - Update intent, dependencies, verified_by, etc.
2. **Update feature files** - Add/modify scenarios with new `@scenario:SC-XXX` tags
3. **Update tests** - Ensure test coverage matches verified_by claims
4. **Run verification** - Ensure no regressions
5. **Open PR** - CI validates traceability and health metrics

### 3. Adding Verification Evidence

For each verified_by entry, ensure:

- **Type matches implementation**: `unit_test` for unit tests, `bdd_feature` for Gherkin, etc.
- **Ref is accurate**: Class name, feature file path, or test identifier
- **Quality metrics present**: `coverage`, `mutation_score`, `flakiness`, `last_run`
- **Scenarios listed**: For `bdd_feature`, include all `@scenario:SC-XXX` IDs

### 4. Lifecycle State Changes

| Transition | When | How |
|------------|------|-----|
| `draft` → `active` | Health ≥ 70, ≥2 verified_by | Change `lifecycle_state` and `lifecycle_state_changed` |
| `active` → `deprecated` | Health < 50 for 30 days | Automated advisory; manual change required |
| `deprecated` → `retired` | Health < 30 for 60 days | Automated advisory; manual change required |
| `deprecated` → `active` | Health recovered ≥ 70 | Change `lifecycle_state` and `lifecycle_state_changed` |

## Code Standards

### Gherkin Scenarios

```gherkin
@bdd
@cap:alert.flow
@frontend
Feature: Alert Flow Visualization

  @scenario:SC-FRONT-001
  @req:REQ-ALERT-001
  Scenario: Display alert distribution graph
    Given an alert is published
    When I navigate to the flow view
    Then the distribution graph renders
    And nodes represent alert destinations
```

**Rules:**
- One `@cap:` tag per feature file
- Lane tag required: `@frontend`, `@backend`, or `@docs`
- Stable `@scenario:SC-XXX` IDs (never reuse)
- `@req:REQ-XXX` for requirement traceability
- Scenario names: imperative mood, present tense

### Capability Registry (capabilities.yml)

**Indentation:** 2 spaces per level
```yaml
- id: alert.publish
  intent: "Publish an alert as a CAP v1.2 message"
  owner: publication
  github_team: "@org/architects"
  lanes: [publication, frontend]  # optional, for multi-lane
  lifecycle_state: active
  lifecycle_state_changed: "2026-01-15"
  dependencies: [alert.route]      # optional
  since: 1.0.0
  verified_by:
    - type: integration_test
      ref: "AlertPublishIT"
      coverage: 95
      mutation_score: 85
      flakiness: 0.01
      last_run: "2026-10-28T10:30:00Z"
    - type: bdd_feature
      ref: "features/publication/alert-publish.feature"
      scenarios: ["SC-PUB-001", "SC-PUB-002"]
      last_run: "2026-10-28T10:35:00Z"
```

### Quality Metrics

| Metric | Source | Target |
|--------|--------|--------|
| Coverage | JaCoCo (backend), Vitest (frontend) | ≥ 80% |
| Mutation Score | PIT (backend) | ≥ 75% |
| Flakiness | CI history | ≤ 0.05 (5%) |
| Last Run | CI timestamp | ≤ 30 days old |

## Validation

### Local Validation

```bash
# Capability contract
node scripts/verify-capabilities.js

# Traceability (requirements ↔ specs ↔ tests)
node scripts/verify-traceability.mjs

# Change impact (what capabilities affected by changes)
node scripts/change-impact.mjs --since HEAD~1

# Release readiness
node scripts/release-checklist.mjs

# Coverage report
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

### CI Validation

On every PR, the following run automatically:

1. **verify-capabilities.js** - Contract validation
2. **verify-traceability.mjs** - Traceability check
3. **regression-check.mjs** - Health regression detection
4. **pr-comment.mjs** - Posts summary to PR

### Health Score

Each capability gets a 0-100 health score:

- **Coverage (40%)** - Average test coverage from verified_by
- **Mutation (30%)** - Mutation testing effectiveness
- **Flakiness (20%)** - 1 - flakiness rate
- **Freshness (10%)** - Recency of last verification run

**Thresholds:**
- 🟢 ≥ 80: Healthy
- 🟡 60-79: Warning
- 🔴 < 60: Critical

## Common Tasks

### Add Feature File to Existing Capability

1. Create `features/<lane>/new-feature.feature`
2. Add `@cap:existing.capability` tag
3. Add `@scenario:SC-XXX` tags to scenarios
4. Add to `verified_by` in capabilities.yml:
   ```yaml
   - type: bdd_feature
     ref: "features/<lane>/new-feature.feature"
     scenarios: ["SC-XXX-001", "SC-XXX-002"]
     last_run: "2026-01-15T10:00:00Z"
   ```

### Fix Lane Consistency Error

If feature file in `features/frontend/` but capability owner is `publication`:

```yaml
# Option 1: Add lanes (preferred for shared capabilities)
lanes: [publication, frontend]

# Option 2: Change owner (if truly frontend-owned)
owner: frontend
```

### Fix Orphaned Feature Warning

Feature file exists but not in any verified_by:

1. Find capability via `@cap:` tag in feature file
2. Add feature file to that capability's `verified_by`
3. Run `node scripts/verify-capabilities.js` to confirm

### Fix CODEOWNERS Error

Feature file not covered by CODEOWNERS:

1. Add to `.github/CODEOWNERS`:
   ```
   /features/frontend/my-feature.feature  @org/architects
   ```
2. Ensure capability's `github_team` matches

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `expected exactly one @cap: tag` | Missing or multiple @cap: tags | Add exactly one `@cap:xxx` tag |
| `@cap:xxx references unknown capability` | Typo in capability ID | Match ID in capabilities.yml |
| `Reference not found: AlertPublishIT` | Test class doesn't exist | Create test or fix ref |
| `health score 45 below critical threshold` | Low coverage/mutation/flakiness | Improve tests, update metrics |
| `invalid lifecycle transition` | Wrong state change | Follow transition rules |

## Resources

- [Capability Development Tutorial](CONTRIBUTING-CAPABILITIES.md)
- [Capability Registry](capabilities/capabilities.yml)
- [Verification Script](scripts/verify-capabilities.js)
- [Coverage Report](scripts/coverage-report.js)
- [CI Workflows](.github/workflows/)
- [CODEOWNERS](.github/CODEOWNERS)