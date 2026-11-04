# Wave Plan for Capability Testing Repository

This document defines the wave-based implementation structure for the improvements identified in the repository review.

## Wave Overview

| Wave | Theme | Issues | Parallel? |
|---|---|---|---|
| **Wave 1** | Data Integrity Fixes | #280, #281, #282 | Yes |
| **Wave 2** | Documentation Sync | #279, #283, #285 | Yes |
| **Wave 3** | Coverage Enhancements | #284 | — |

---

## Wave 1: Data Integrity Fixes

**Goal**: Fix data consistency bugs in the tracker and scripts.

### Issue #280: Fix REQ-PUB-002 github_issue value
- **Milestone**: alert.rule-design
- **Labels**: kind:defect, capability:alert.rule-design, role:coder
- **Acceptance**: REQ-PUB-002 in requirements/requirements.yml shows github_issue: 268 and coverage report links to correct issue

### Issue #281: Propagate reqIssueMap to all capability coverage pages
- **Milestone**: alert.publish
- **Labels**: kind:task, capability:alert.publish, role:coder
- **Acceptance**: All capability coverage pages (docs/coverage/cap-*.html) show requirement links to GitHub issues

### Issue #282: Update gh-lib.test.mjs expectations (7 capabilities)
- **Milestone**: alert.publish
- **Labels**: kind:task, capability:alert.publish, role:coder
- **Acceptance**: `node scripts/gh-lib.test.mjs` exits 0 with all tests passing

**Parallel execution**: All three issues can be worked on simultaneously as they touch different files.

---

## Wave 2: Documentation Sync

**Goal**: Align published documentation with the capability registry.

### Issue #279: Sync capabilities.md with capabilities.yml (generate from YAML)
- **Milestone**: docs.onboarding
- **Labels**: kind:task, capability:docs.onboarding, role:pipeline
- **Acceptance**: docs/capabilities.md is generated from capabilities/capabilities.yml; CI check fails on drift

### Issue #283: Add capability→requirement links on capabilities page
- **Milestone**: docs.onboarding
- **Labels**: kind:task, capability:docs.onboarding, role:coder
- **Acceptance**: docs/capabilities.md shows clickable links from each capability to its requirements' GitHub issues

### Issue #285: Update "since" dates to actual creation dates
- **Milestone**: docs.onboarding
- **Labels**: kind:task, capability:docs.onboarding, role:coder
- **Acceptance**: capabilities/capabilities.yml and requirements/requirements.yml show actual creation dates from git history/lifecycle_state_changed

**Parallel execution**: All three issues can be worked on simultaneously.

---

## Wave 3: Coverage Enhancements

**Goal**: Improve coverage report accessibility.

### Issue #284: Link frontend vitest HTML report from Pages
- **Milestone**: alert.frontend
- **Labels**: kind:task, capability:alert.frontend, role:coder
- **Acceptance**: GitHub Pages site links to frontend vitest HTML report; CI publishes report to gh-pages

**Sequential**: Single issue, no parallelism.

---

## Wave Execution Rules

1. **Wave 1 must complete before Wave 2 starts** (data integrity before doc sync)
2. **Wave 2 must complete before Wave 3 starts** (doc sync before coverage enhancements)
3. Within a wave, issues **can be worked in parallel** by different agents
4. Each issue requires:
   - Implementation by coder
   - Verification by researcher
   - Audit by reviewer
5. Wave completion = all issues in wave have reviewer status "done"

---

## Wave Tracking

Each wave has a tracking issue:
- **Wave 1 Tracking**: #286 (to be created)
- **Wave 2 Tracking**: #287 (to be created)
- **Wave 3 Tracking**: #288 (to be created)

Each tracking issue:
- Links to all wave issues
- Shows completion status
- Updated when an issue gets reviewer "done"

---

## CI Integration

Add to `.github/workflows/capability.yml`:
```yaml
jobs:
  wave-validation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node scripts/verify-traceability.mjs --check-github
      - run: node scripts/gh-lib.test.mjs
      # Fail if any wave tracking issue has unclosed child issues
```

---

## Acceptance Criteria for Full Plan

- [ ] All 7 Wave 1/2/3 issues have reviewer status "done"
- [ ] `node scripts/verify-traceability.mjs --check-github` passes
- [ ] `node scripts/gh-lib.test.mjs` passes
- [ ] `node scripts/verify-capabilities.js` passes
- [ ] GitHub Pages site shows all links working
- [ ] No stale data in requirements.yml or capabilities.yml