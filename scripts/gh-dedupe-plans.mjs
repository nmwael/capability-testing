#!/usr/bin/env node
// gh-dedupe-plans.mjs — close duplicate plan issues, keeping the latest.
//
// Fetches every issue labelled `kind:plan` (state=all), groups them by title
// (case-insensitive), and within each duplicate group keeps the issue with the
// highest number (the latest) and closes the rest with reason `not_planned`,
// after posting a comment linking to the kept issue.
//
// Safe by default: runs as a dry-run that only prints what it would do. Pass
// `--update` to actually write. `--json` emits machine-readable output.
//
// Imports primitives from ./gh-run.mjs (auth, repo slug, GitHub API calls).
// Pagination is handled explicitly: GitHub returns at most 100 issues per
// page, so we page `page=1,2,...` with `per_page=100` until a short page
// arrives.
//
// Idempotent: already-closed issues are skipped, so re-running never re-closes
// or errors on issues closed by a previous run.

import {
  requireAuth,
  repoSlug,
  ghJson,
  createIssueComment,
  listIssueComments,
  setIssueState,
} from "./gh-run.mjs"

const LABEL = "kind:plan"
const CLOSE_REASON = "not_planned"
const PER_PAGE = 100 // GitHub REST maximum per page

/** Parse CLI arguments. Defaults to a safe dry-run. */
function parseArgs(argv) {
  const opts = { dryRun: true, repo: null, json: false }
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dry-run") opts.dryRun = true
    else if (a === "--update") opts.dryRun = false
    else if (a === "--json") opts.json = true
    else if (a === "--repo") {
      opts.repo = argv[++i]
      if (opts.repo === undefined) throw new Error("--repo requires a value")
    } else {
      throw new Error(`unknown argument: ${a}`)
    }
  }
  return opts
}

/** Fetch every `kind:plan` issue (open + closed), paging 100 per page. */
function fetchPlanIssues(slug) {
  const issues = []
  let page = 1
  for (;;) {
    /** @type {any[]} */
    const pageIssues = ghJson([
      "api",
      `repos/${slug}/issues?state=all&labels=${encodeURIComponent(LABEL)}&per_page=${PER_PAGE}&page=${page}`,
    ]) || []
    const real = pageIssues.filter((it) => !it.pull_request)
    issues.push(...real)
    if (real.length < PER_PAGE) break
    page++
  }
  return issues
}

/** Group issues by title (case-insensitive), preserving the original title. */
function groupByTitle(issues) {
  const groups = new Map()
  for (const it of issues) {
    const key = String(it.title || "").toLowerCase()
    const g = groups.get(key)
    if (g) g.issues.push(it)
    else groups.set(key, { title: it.title, issues: [it] })
  }
  return groups
}

function main() {
  const opts = parseArgs(process.argv)
  const slug = opts.repo || repoSlug()
  requireAuth()

  const issues = fetchPlanIssues(slug)
  const groups = groupByTitle(issues)

  const duplicateGroups = []
  const actions = [] // { issue, keep } for each duplicate to close

  for (const g of groups.values()) {
    if (g.issues.length <= 1) continue
    // Highest number first = latest created = the one we keep.
    g.issues.sort((a, b) => b.number - a.number)
    const keep = g.issues[0]
    for (const it of g.issues.slice(1)) actions.push({ issue: it, keep })
    duplicateGroups.push({
      title: g.title,
      issueCount: g.issues.length,
      keep: keep.number,
      close: g.issues.slice(1).map((it) => it.number).sort((a, b) => a - b),
    })
  }

  // Largest duplicate groups first, then alphabetical for stable output.
  duplicateGroups.sort((a, b) => b.issueCount - a.issueCount || a.title.localeCompare(b.title))

  const report = {
    repo: slug,
    label: LABEL,
    dryRun: opts.dryRun,
    totalPlanIssues: issues.length,
    duplicateGroups,
    wouldClose: actions.length,
  }

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Plan issues labelled ${LABEL}: ${issues.length}`)
    console.log(`Duplicate title groups: ${duplicateGroups.length} (would close ${actions.length})`)
    for (const g of duplicateGroups) {
      console.log(`  "${g.title}": keep #${g.keep}, close #${g.close.join(", #")}`)
    }
  }

  if (opts.dryRun) {
    if (!opts.json) console.log("\nDry-run: no changes made. Pass --update to apply.")
    return 0
  }

  // Apply: comment + close each duplicate. Already-closed issues are skipped
  // (idempotent: a re-run never re-closes or errors on past closes).
  let closed = 0
  let skipped = 0
  // Batch-fetch all comments up front so the API is not called inside the loop (N+1).
  const commentsByIssue = new Map()
  for (const { issue } of actions) {
    commentsByIssue.set(issue.number, listIssueComments(slug, issue.number))
  }
  for (const { issue, keep } of actions) {
    if (issue.state === "closed") {
      skipped++
      if (!opts.json) console.log(`skip #${issue.number}: already closed`)
      continue
    }
    // Don't re-post a duplicate comment we already left on this issue.
    const already = (commentsByIssue.get(issue.number) || []).some(
      (c) => String(c.body || "").includes(`Duplicate of #${keep.number}`),
    )
    if (!already) {
      createIssueComment(
        slug,
        issue.number,
        `Duplicate of #${keep.number}. Closing as not_planned.`,
      )
    }
    setIssueState(slug, issue.number, "closed", CLOSE_REASON)
    closed++
    if (!opts.json) console.log(`closed #${issue.number} (duplicate of #${keep.number})`)
  }

  if (!opts.json) {
    console.log(`\nClosed ${closed}, skipped ${skipped} (already closed).`)
  }
  return 0
}

let exitCode = 0
try {
  exitCode = main()
} catch (err) {
  console.error(String(err.stack || err.message || err))
  exitCode = 1
}
process.exit(exitCode)
