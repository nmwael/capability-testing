---
layout: default
title: Impact Analysis
---

# Impact Analysis

This page shows change impact analysis reports generated from Git commits. It maps changed files to affected capabilities and requirements.

<div class="card">
<h2>Overview</h2>
<p>Change impact analysis traces code changes through the capability graph to identify which capabilities and requirements are affected by a change.</p>
</div>

## Latest Impact Report

<script>
// Client-side rendering of latest impact report
async function loadImpactReport() {
  try {
    const response = await fetch('{{ site.baseurl }}/impact/impact.md');
    if (response.ok) {
      const text = await response.text();
      document.getElementById('impact-container').innerHTML = '<pre>' + escapeHtml(text) + '</pre>';
    } else {
      document.getElementById('impact-container').innerHTML = 
        '<p>No impact report available yet. Run <code>node scripts/change-impact.mjs --since HEAD~1 --output docs/impact</code> to generate.</p>';
    }
  } catch (e) {
    document.getElementById('impact-container').innerHTML = 
      '<p>Error loading impact report.</p>';
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
}

loadImpactReport();
</script>

<div id="impact-container">
  <p>Loading impact report...</p>
</div>

## Usage

```bash
# Analyze changes since last commit
node scripts/change-impact.mjs --since HEAD~1 --output docs/impact

# Analyze changes in a PR
node scripts/change-impact.mjs --since origin/main --output docs/impact

# View report
cat docs/impact/impact.md
```

## See Also

- [Execution History](/capability-testing/execution-history/) - CI/CD execution tracking
- [Release Checklist](/capability-testing/release/) - Release readiness gates
- [Coverage](/capability-testing/coverage/) - Capability-to-test traceability