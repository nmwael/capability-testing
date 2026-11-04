# Night Shift — Unattended Automation Window

## Overview

**Night Shift** is a declared unattended window during which agents proceed autonomously on approved plans without human approval gates. It is **not** time-triggered — it starts only when a human explicitly declares "night shift" in a message.

## Declaration

To start Night Shift, a human says:
```
night shift
```

Nothing else starts it — not a clock, not a marker file, not an environment variable.

## Window Duration

- **Starts**: At declaration time
- **Ends**: **10:00 UTC the next day** (hard stop)
- **Max duration**: < 24 hours (declaration before 10:00 expires at next 10:00)

At 10:00 UTC, agents stop immediately, report what landed with `path:line` references, and wait for instructions.

## Rules That Change During Night Shift

| Rule | Day Mode | Night Shift |
|---|---|---|
| Plan approval (HITL) | Required | **Waived** — architect proceeds straight to execution |
| Fact-checker gate | Required before approval | **Required** — fact-checker posts plan as COMMENT on work-item issue, audits with `--night-shift` flag |
| "I am waiting for approval" | Required | **Forbidden** — never say this |
| Question tool | Allowed | **Forbidden** — no questions, ambiguities resolved by architect's best judgment |
| Documentation updates | Allowed | **Frozen** for active capabilities — only new docs for inactive capabilities |
| `@todo` tags | Removable | **Retained** on draft capabilities |

## Rules That Stay the Same

- Fact-checker must still clear all `high` findings before execution
- Mandatory reviewer gate still required for every code task
- No new tool/package installs (HITL gate)
- Verification protocol still applies (read file, `git status`, re-run checks)
- GitHub tracker discipline still applies (no `@handle` mentions, proper closing)

## Automation

The `.github/workflows/night-shift.yml` workflow runs:

1. **22:00 UTC daily** — Night Shift setup:
   - Ensures capability milestones exist
   - Seeds requirement labels
   - Links requirements to GitHub issues
   - Posts Night Shift start status issue

2. **On demand / 10:00 UTC** — Reconciliation:
   - Compares open issues with actual git state
   - Comments status on partially-done issues
   - Reopens/annotates issues that no longer match reality

3. **Continuous** — Verification:
   - Runs traceability check with `--night-shift` flag
   - Runs capability verification
   - Runs gh-lib tests

## Night Shift Plan Format

During Night Shift, the architect's plan:
- Is posted as a **COMMENT on the work-item issue** (not a new `kind:plan` issue)
- Is audited with `node scripts/verify-plan-claims.mjs --issue <n> --night-shift`
- Missing "I am waiting for approval" is a WARN, not a blocking finding
- Proceeds straight to execution after clean fact-check

## Hard Stop Procedure (10:00 UTC)

At 10:00 UTC exactly:

1. Agents stop immediately, even mid-subtask
2. Report what landed with `path:line` references
3. Post status to the work-item issue
4. Wait for human instructions

No extensions, no grace period.

## Night Shift vs Day Mode Comparison

| Aspect | Day Mode | Night Shift |
|---|---|---|
| Plan approval | Human via `question` tool | Waived — auto-proceed after fact-check |
| Fact-checker posts to | New `kind:plan` issue | Comment on work-item issue |
| Fact-checker flags | Blocking = stop | `--night-shift` flag, missing wait = WARN |
| Questions allowed | Yes (`question` tool) | No — resolve autonomously |
| Documentation | Can update | Frozen for active capabilities |
| End condition | Human says "approved" | 10:00 UTC hard stop |

## Best Practices

1. **Declare early** — gives maximum window (< 24 hours)
2. **Clear the fact-checker first** — no `high` findings allowed
3. **Use wave structure** — group related issues for parallel execution
4. **Document ambiguities** — record decisions in tracker, not in messages
5. **Reconcile at end** — ensure tracker matches reality

## Related Files

- `AGENTS.md` — Night Shift rules (lines 38-67)
- `.github/workflows/night-shift.yml` — Automation workflow
- `scripts/verify-plan-claims.mjs` — Supports `--night-shift` flag
- `scripts/gh-ensure-milestones.mjs` — Milestone automation
- `scripts/gh-seed-req-labels.mjs` — Label seeding
- `scripts/gh-link-requirements.mjs` — Requirement↔issue linking