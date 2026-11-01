# Capability Development Tutorial

This tutorial walks you through creating a new capability from scratch: **`alert.silence`** - a capability to temporarily silence alerts during maintenance windows.

## Prerequisites

- Node.js 24+ and npm
- Java 17+ and Maven (for backend)
- Git

```bash
# Verify prerequisites
node --version  # v24+
java --version  # 17+
mvn --version   # 3.9+
git --version
```

## Step 1: Understand the Capability

**Capability**: `alert.silence`
- **Intent**: "Temporarily silence alerts during maintenance windows"
- **Owner**: `publication`
- **GitHub Team**: `@org/architects`
- **Requirements**: REQ-PUB-005 (new requirement for silencing)

## Step 2: Create the Feature File

Create the Gherkin feature file at `features/publication/alert-silence.feature`:

```gherkin
@cap:alert.silence
@req:REQ-PUB-005
Feature: Alert Silence
  As an operator
  I want to silence alerts temporarily
  So that maintenance windows don't generate noise

  Background:
    Given the alerting system is running
    And there are active alerts in the system

  @scenario:SC-PUB-020
  Scenario: Silence an active alert for a maintenance window
    Given an active alert "High CPU Usage" for service "payment-service"
    When I silence the alert for 30 minutes with reason "Scheduled maintenance"
    Then the alert should not fire for 30 minutes
    And the alert should show as "Silenced" in the dashboard
    And the silence reason should be visible

  @scenario:SC-PUB-021
  Scenario: Cancel a silence before it expires
    Given an alert "High CPU Usage" is silenced for 30 minutes
    When I cancel the silence early
    Then the alert should resume normal firing immediately
    And the silence history should show "Cancelled by operator"

  @scenario:SC-PUB-022
  Scenario: Silence multiple alerts by tag
    Given alerts tagged with "maintenance-window" are active
    When I silence all alerts with tag "maintenance-window" for 60 minutes
    Then all matching alerts should be silenced
    And the silence should apply to future alerts with that tag

  @scenario:SC-PUB-023
  Scenario: Silence expires automatically
    Given an alert is silenced for 15 minutes
    When 15 minutes pass
    Then the silence should expire automatically
    And the alert should resume normal firing
    And the silence history should show "Expired"
```

## Step 3: Add Capability Entry

Add to `capabilities/capabilities.yml`:

```yaml
  - id: alert.silence
    intent: "Temporarily silence alerts during maintenance windows"
    owner: publication
    github_team: "@org/architects"
    status: active
    lifecycle_state: active
    lifecycle_state_changed: "2026-11-01"
    since: 1.2.0
    verified_by:
      - type: bdd_feature
        ref: "features/publication/alert-silence.feature"
        scenarios: ["SC-PUB-020", "SC-PUB-021", "SC-PUB-022", "SC-PUB-023"]
        last_run: "2026-11-01T10:00:00Z"
```

## Step 4: Run Validation

```bash
# Validate the new capability
node scripts/verify-capabilities.js

# Check traceability
node scripts/verify-traceability.mjs
```

Expected output:
```
Capability traceability check PASSED (8 capabilities)
```

## Step 5: Implement Backend Logic

Create the backend implementation:

```java
// backend/alerting/src/main/java/com/example/alerting/service/AlertSilenceService.java
package com.example.alerting.service;

public interface AlertSilenceService {
    void silenceAlert(String alertId, Duration duration, String reason);
    void cancelSilence(String alertId);
    void silenceByTag(String tag, Duration duration, String reason);
    List<SilenceRecord> getSilenceHistory(String alertId);
}
```

## Step 5: Implement Frontend UI

Create the frontend components:

```tsx
// frontend/src/features/alert-silence/AlertSilencePanel.tsx
export function AlertSilencePanel({ alertId }: { alertId: string }) {
  const { silence, cancelSilence, history } = useAlertSilence(alertId);
  
  return (
    <Card>
      <CardHeader>Alert Silence</CardHeader>
      <CardContent>
        <SilenceForm onSilence={silence} />
        <SilenceHistory history={history} onCancel={cancelSilence} />
      </CardContent>
    </Card>
  );
}
```

## Step 6: Add Tests

### Backend Integration Test

```java
// backend/alerting/src/test/java/com/example/alerting/AlertSilenceIT.java
@SpringBootTest
class AlertSilenceIT {
    
    @Autowired AlertSilenceService service;
    
    @Test
    void shouldSilenceAlertForDuration() {
        // Given
        String alertId = createTestAlert();
        
        // When
        service.silenceAlert(alertId, Duration.ofMinutes(30), "Maintenance");
        
        // Then
        assertTrue(alertRepository.findById(alertId).get().isSilenced());
    }
}
```

### Frontend Unit Test

```tsx
// frontend/src/features/alert-silence/AlertSilencePanel.test.tsx
import { render, screen } from '@testing-library/react';
import { AlertSilencePanel } from './AlertSilencePanel';

test('shows silence form and history', () => {
  render(<AlertSilencePanel alertId="test-alert" />);
  
  expect(screen.getByText('Alert Silence')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /silence/i })).toBeInTheDocument();
});
```

## Step 7: Run Full Validation

```bash
# Run all capability validations
node scripts/verify-capabilities.js

# Check traceability
node scripts/verify-traceability.mjs

# Check change impact
node scripts/change-impact.mjs --since HEAD~1

# Generate coverage report
node scripts/coverage-report.js \
  --surefire 'backend/**/target/surefire-reports/TEST-*.xml' \
  --vitest frontend/reports/junit.xml \
  --features features \
  --out docs/coverage

# Run release checklist
node scripts/release-checklist.mjs
```

## Step 8: Commit and Push

```bash
git add features/publication/alert-silence.feature
git add capabilities/capabilities.yml
git commit -m "feat: add alert.silence capability

- Add alert.silence capability for maintenance window silencing
- Add BDD feature file with 4 scenarios
- Add capability entry with github_team and lifecycle_state"
```

```bash
git push origin main
```

## Step 9: Verify CI Passes

Check the GitHub Actions workflow:
1. Go to Actions tab
2. Wait for "Capability Validation" workflow
3. Verify all jobs pass:
   - ✅ validate
   - ✅ regression-check
   - ✅ pr-comment (on PR)

## Step 10: Check Coverage Report

Visit the GitHub Pages coverage report:
- URL: `https://nmwael.github.io/capability-testing/coverage/`
- Verify `alert.silence` appears in the report
- Check health score is calculated

## Summary Checklist

- [ ] Feature file created with @cap: and @req: tags
- [ ] Capability entry added to capabilities.yml
- [ ] github_team field set correctly
- [ ] lifecycle_state and lifecycle_state_changed set
- [ ] verified_by entries with scenarios array
- [ ] Backend implementation started
- [ ] Frontend components created
- [ ] Tests written for both backend and frontend
- [ ] All validation scripts pass
- [ ] CI pipeline passes
- [ ] Coverage report updated

## Next Steps

1. **Add integration tests** for the backend service
2. **Add frontend E2E tests** with Playwright
3. **Update requirements** if new REQ- ids were introduced
4. **Monitor health metrics** in the coverage report
5. **Consider adding mutation tests** for critical paths

## Troubleshooting

### "Lane consistency failed"
- Check that feature files are in the correct directory for the owner
- Verify `lanes` field matches feature file locations

### "No matching test found"
- Ensure test names match scenario names semantically
- Check that `@scenario:` IDs match between feature and test

### "Lifecycle transition invalid"
- Verify valid state transitions (draft→active→deprecated→retired)
- Check that `lifecycle_state_changed` is set when changing state

### "CODEOWNERS validation failed"
- Ensure `.github/CODEOWNERS` has patterns for the capability's feature directories
- Verify `github_team` matches a team in CODEOWNERS

## Resources

- [Capability Schema Reference](CONTRIBUTING.md#capability-schema)
- [Validation Scripts](CONTRIBUTING.md#validation-scripts)
- [Health Metrics](CONTRIBUTING.md#health-metrics)
- [Lifecycle Management](CONTRIBUTING.md#lifecycle-management)
- [Coverage Report](https://nmwael.github.io/capability-testing/coverage/)