---
layout: default
title: Release Checklist
---

# Release Checklist

This page shows the automated release readiness checklist with verification gates.

<div class="card">
<h2>Overview</h2>
<p>The release checklist runs 6 verification gates ensuring all capabilities are verified, all requirements have scenario coverage, traceability gates pass, and execution evidence exists.</p>
</div>

## Latest Release Checklist

<script>
// Client-side rendering of latest release checklist
async function loadReleaseChecklist() {
  try {
    const response = await fetch('{{ site.baseurl }}/release/checklist.md');
    if (response.ok) {
      const text = await response.text();
      document.getElementById('release-container').innerHTML = '<pre>' + escapeHtml(text) + '</pre>';
    } else {
      document.getElementById('release-container').innerHTML = 
        '<p>No checklist available yet. Run <code>node scripts/release-checklist.mjs --output docs/release</code> to generate.</p>';
    }
  } catch (e) {
    document.getElementById('release-container').innerHTML = 
      '<p>Error loading release checklist.</p>';
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

loadReleaseChecklist();
</script>

<div id="release-container">
  <p>Loading release checklist...</p>
</div>

## Gates

| # | Check | Description |
|---|-------|-------------|
| 1 | Verified By References | All capabilities have `verified_by` references |
| 2 | Requirement Coverage | All requirements have scenario coverage |
| 3 | Scenario Tags | All scenarios have `@req:` and `@scenario:` tags |
| 4 | Traceability Gate | `verify-traceability.mjs` passes |
| 5 | Execution Evidence | Execution records exist |
| 6 | Reference Resolution | All `verified_by` references resolve to files |

## Usage

```bash
# Run release checklist
node scripts/release-checklist.mjs --output docs/release

# View checklist
cat docs/release/checklist.md
```

## See Also

- [Execution History](/capability-testing/execution-history/) - CI/CD execution tracking
- [Impact Analysis](/capability-testing/impact/) - Change impact reports
- [Coverage](/capability-testing/coverage/) - Capability-to-test traceability