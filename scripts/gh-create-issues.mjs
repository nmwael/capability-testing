#!/usr/bin/env node
// gh-create-issues.mjs — create the improvement issues from Plan #278.
//
//   node scripts/gh-create-issues.mjs [--dry-run] [--update] [--repo owner/name] [--json]
//
//   --dry-run   decide everything, write nothing
//   --update    also update existing issues whose body/labels/milestone differ
//   --repo      operate on this repo (default: the one in the cwd)
//   --json      print one JSON object instead of prose
//
// Every issue body carries an idempotency key of the form
//   <!-- gh-sync:issue-<capability>-<short-title> -->
// so a re-run updates rather than duplicates. Existing issues are matched on
// that key (state: all), never on title, so a hand-edited issue is reported as
// an update rather than silently duplicated.
//
// Reuses gh-lib.mjs (pure helpers) and gh-run.mjs (the only gh subprocesses).

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readCapabilities, keysIn, namedKey } from "./gh-lib.mjs"
import * as runner from "./gh-run.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

const USAGE = `usage: node scripts/gh-create-issues.mjs [--dry-run] [--update] [--repo owner/name] [--json]

  --dry-run   decide everything, write nothing
  --update    also patch existing issues whose body/labels/milestone differ
  --repo <slug>  operate on this repo (default: the one in the cwd)
  --json      print one JSON object instead of prose`

function parseArgs(argv) {
  const opts = { dryRun: false, update: false, repo: null, json: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dry-run") opts.dryRun = true
    else if (a === "--update") opts.update = true
    else if (a === "--json") opts.json = true
    else if (a === "--repo") opts.repo = argv[++i]
    else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0) }
    else { console.error(`unknown argument: ${a}\n\n${USAGE}`); process.exit(2) }
  }
  return opts
}

/** Lowercase a title into a short, dash-separated slug for idempotency keys. */
function slugify(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
}

/** The 7 improvement issues, one entry each. Milestone is a capability name. */
const ISSUES = [
  {
    title: "Sync capabilities.md with capabilities.yml (generate from YAML)",
    milestone: "docs.onboarding",
    kind: "task",
    capability: "docs.onboarding",
    role: "pipeline",
    body: `## Problem

capabilities.md is hand-maintained and drifts from capabilities/capabilities.yml,
which is the source of truth for the capability registry.

## Desired state

Generate capabilities.md from capabilities.yml (single source of truth), so the
published capabilities page always matches the registry. Add a CI check that
fails on drift.

## Labels

kind:task, capability:docs.onboarding, role:pipeline

## Milestone

docs.onboarding`,
  },
  {
    title: "Fix REQ-PUB-002 github_issue value in requirements/requirements.yml",
    milestone: "alert.rule-design",
    kind: "defect",
    capability: "alert.rule-design",
    role: "coder",
    body: `## Problem

REQ-PUB-002 in requirements/requirements.yml names github_issue 268, but issue
268 carries requirement REQ-PUB-002 under alert.rule-design while the value
points at the wrong tracker item (the issue it references does not belong to
this requirement).

## Desired state

Correct the github_issue value so REQ-PUB-002 links to the issue that actually
tracks it, keeping requirements.yml consistent with the tracker.

## Labels

kind:defect, capability:alert.rule-design, role:coder

## Milestone

alert.rule-design`,
  },
  {
    title: "Propagate reqIssueMap to all capability coverage pages",
    milestone: "alert.publish",
    kind: "task",
    capability: "alert.publish",
    role: "coder",
    body: `## Problem

The reqIssueMap (requirement → GitHub issue linkage) is only populated on some
capability coverage pages, so traceability is incomplete across the registry.

## Desired state

Propagate reqIssueMap to every capability coverage page so each capability's
coverage page links its requirements to their tracker issues.

## Labels

kind:task, capability:alert.publish, role:coder

## Milestone

alert.publish`,
  },
  {
    title: "Update gh-lib.test.mjs expectations (7 capabilities)",
    milestone: "alert.publish",
    kind: "task",
    capability: "alert.publish",
    role: "coder",
    body: `## Problem

scripts/gh-lib.test.mjs carries expectations for the capability count that no
longer match the 7 capabilities in capabilities/capabilities.yml.

## Desired state

Update gh-lib.test.mjs expectations to reflect the 7 capabilities so the
offline parser tests stay green as the registry grows.

## Labels

kind:task, capability:alert.publish, role:coder

## Milestone

alert.publish`,
  },
  {
    title: "Add capability→requirement links on capabilities page",
    milestone: "docs.onboarding",
    kind: "task",
    capability: "docs.onboarding",
    role: "coder",
    body: `## Problem

The capabilities page lists capabilities but does not link each one to the
requirements it satisfies, so readers cannot trace from capability to
requirement.

## Desired state

Add capability→requirement links on the capabilities page so each capability
links to its covering requirements (the inverse of the one-directional
capability: field in requirements.yml).

## Labels

kind:task, capability:docs.onboarding, role:coder

## Milestone

docs.onboarding`,
  },
  {
    title: "Link frontend vitest HTML report from Pages",
    milestone: "alert.frontend",
    kind: "task",
    capability: "alert.frontend",
    role: "coder",
    body: `## Problem

The frontend vitest HTML report is produced in CI but is not linked from the
GitHub Pages site, so it is hard to find and review.

## Desired state

Link the frontend vitest HTML report from the GitHub Pages site so test reports
are discoverable alongside capability documentation.

## Labels

kind:task, capability:alert.frontend, role:coder

## Milestone

alert.frontend`,
  },
  {
    title: 'Update "since" dates to actual creation dates',
    milestone: "docs.onboarding",
    kind: "task",
    capability: "docs.onboarding",
    role: "coder",
    body: `## Problem

The "since" fields in capabilities/capabilities.yml and requirements/requirements.yml
carry version placeholders (1.0.0 / 1.2.0) instead of actual creation dates.

## Desired state

Replace the placeholder "since" values with the real creation dates of each
capability and requirement, so the registry reflects history accurately.

## Labels

kind:task, capability:docs.onboarding, role:coder

## Milestone

docs.onboarding`,
  },
]

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const caps = readCapabilities(
    readFileSync(resolve(ROOT, "capabilities/capabilities.yml"), "utf8")
  )

  const auth = runner.requireAuth()
  const slug = opts.repo || runner.repoSlug()

  // Existing issues, keyed by the sync key inside their body. `state: all` so a
  // re-run matches closed issues this script created.
  const byKey = new Map()
  let scanned = 0
  for (const issue of runner.listIssues(slug)) {
    scanned++
    for (const key of keysIn(issue.body)) byKey.set(key, issue)
  }

  // Milestones by title, creating any that are missing (e.g. alert.frontend).
  const byMilestoneTitle = new Map(runner.listMilestones(slug).map((m) => [m.title, m]))
  function milestoneNumber(title) {
    let m = byMilestoneTitle.get(title)
    if (!m) {
      const created = runner.createMilestone(slug, {
        title,
        description: `Work touching capability ${title}.`,
      })
      m = created
      byMilestoneTitle.set(title, m)
    }
    return m.number
  }

  // Known label names, creating any that are missing.
  const existingLabels = new Set(runner.listLabels(slug).map((l) => l.name))
  function ensureLabel(name) {
    if (!existingLabels.has(name)) {
      runner.createLabel(slug, { name, color: "bfd4f2", description: `Work touching ${name}` })
      existingLabels.add(name)
    }
  }

  const report = {
    repo: slug,
    authenticated_as: auth.login,
    dry_run: opts.dryRun,
    existing_issues_scanned: scanned,
    created: [],
    updated: [],
    skipped: [],
  }

  const write = (fn) => { if (!opts.dryRun) fn() }

  for (const issue of ISSUES) {
    const key = namedKey(`issue-${issue.capability}-${slugify(issue.title)}`)
    const payload = {
      title: issue.title,
      body: [key, "", issue.body].join("\n").trim() + "\n",
      labels: [`kind:${issue.kind}`, `capability:${issue.capability}`, `role:${issue.role}`],
    }
    if (issue.milestone) payload.milestone = milestoneNumber(issue.milestone)

    // Ensure labels exist before referencing them (the REST API rejects unknown
    // labels; gh issue create silently drops them, but we use gh api directly).
    for (const label of payload.labels) ensureLabel(label)

    const found = byKey.get(key)
    if (!found) {
      write(() => {
        const number = runner.createIssue(slug, payload)
        report.created.push({ number, title: issue.title, milestone: issue.milestone, labels: payload.labels })
      })
      continue
    }

    const sameBody = (found.body || "").trim() === payload.body.trim()
    const sameLabels = JSON.stringify(
      (found.labels || []).map((l) => l.name).sort()
    ) === JSON.stringify(payload.labels.slice().sort())
    const sameMilestone = (found.milestone && found.milestone.number) === payload.milestone

    if (sameBody && sameLabels && sameMilestone) {
      report.skipped.push({ number: found.number, title: issue.title })
      continue
    }

    if (opts.update) {
      const patch = {}
      if (!sameBody) patch.body = payload.body
      if (!sameLabels) patch.labels = payload.labels
      if (!sameMilestone) patch.milestone = payload.milestone
      write(() => runner.updateIssue(slug, found.number, patch))
      report.updated.push({ number: found.number, title: issue.title })
    } else {
      report.skipped.push({ number: found.number, title: issue.title, reason: "differs, use --update" })
    }
  }

  emit(report, opts)
}

function emit(report, opts) {
  const mode = report.dry_run ? "DRY RUN — nothing written" : "applied"
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  console.log(`repo: ${report.repo}  (authenticated as ${report.authenticated_as})  [${mode}]`)
  console.log(`existing issues scanned: ${report.existing_issues_scanned}`)
  console.log("")
  for (const c of report.created) {
    console.log(`  create  #${String(c.number).padEnd(14)} ${c.title}  [${c.milestone}]`)
  }
  for (const u of report.updated) {
    console.log(`  update  #${String(u.number).padEnd(13)} ${u.title}`)
  }
  for (const s of report.skipped) {
    const why = s.reason ? ` (${s.reason})` : ""
    console.log(`  skip    #${String(s.number).padEnd(13)} ${s.title}${why}`)
  }
  console.log("")
  console.log(`totals: ${report.created.length} create, ${report.updated.length} update, ${report.skipped.length} skip`)
}

try {
  main()
} catch (err) {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
}
