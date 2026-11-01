---
layout: default
title: Execution History
---

# Execution History

This page tracks CI/CD execution history with build metadata, test results, and regression comparisons.

<div class="card">
<h2>Overview</h2>
<p>Each CI/CD run is captured with commit SHA, branch, build ID, timestamp, environment, and test results. Historical runs are archived by date for trend analysis.</p>
</div>

## Recent Executions

<script>
// Client-side rendering of execution history
async function loadExecutionHistory() {
  try {
    const response = await fetch('{{ site.baseurl }}/execution-history/2026-11-01/');
    // Note: This would need a JSON index file or API endpoint
    // For now, showing static content
    document.getElementById('history-container').innerHTML = 
      '<p>Execution records available in <code>docs/execution-history/2026-11-01/</code></p>' +
      '<p>Run <code>node scripts/execution-history.mjs --compare FILE1 FILE2</code> to compare runs.</p>';
  } catch (e) {
    document.getElementById('history-container').innerHTML = 
      '<p>No execution history available yet. Run CI to generate records.</p>';
  }
}
loadExecutionHistory();
</script>

<div id="history-container">
  <p>Loading execution history...</p>
</div>

## Usage

```bash
# Capture current execution
node scripts/execution-history.mjs --capture

# Store test results
node scripts/execution-history.mjs --store path/to/results.xml

# Archive old runs
node scripts/execution-history.mjs --archive

# Compare two runs for regressions
node scripts/execution-history.mjs --compare docs/execution-history/date/run1.json docs/execution-history/date/run2.json
```

## See Also

- [Impact Analysis](/capability-testing/impact/) - Change impact reports
- [Release Checklist](/capability-testing/release/) - Release readiness gates
- [Coverage](/capability-testing/coverage/) - Capability-to-test traceability