#!/usr/bin/env node
// gh-backfill-journal.mjs — import MODEL-JOURNAL.md's numbered items as issues.
//
//   node scripts/gh-backfill-journal.mjs [--dry-run] [--min 1] [--max 49]
//                                        [--repo owner/name] [--delay 250] [--json]
//
// WHY THIS EXISTS: the repo's institutional memory is a 598-line markdown file
// that nothing can query, label, filter or assign. Its 49 numbered items are
// the record of what the agent pipeline actually got wrong and why, and that
// record is the thing most worth keeping — so it is imported into the tracker
// rather than deleted with the file.
//
// WHY IDEMPOTENT: a backfill that can only run once is a backfill that cannot
// be re-run after a failure, and this one makes ~50 network writes that can
// fail halfway. Every issue body carries a `<!-- gh-sync:journal-item-N -->`
// key; a re-run reads the existing issues, matches on that key, and creates
// nothing it already has. Nothing here is keyed on position or title, so a
// hand-edited issue is reported as an update rather than silently duplicated.
//
// WHY CLOSED ON ARRIVAL: these items are a historical record, not outstanding
// work. Importing them open would put 49 stale items in the tracker's queue and
// hide the genuinely open work. They are closed with reason "not planned",
// which is the closest thing GitHub has to "recorded, not a plan".
//
// The parse/classify/payload logic is in gh-lib.mjs and unit-tested offline in
// scripts/gh-lib.test.mjs; this file only does I/O and decisions.

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readCapabilities, parseJournalItems, buildJournalIssue, syncDecision, keysIn } from "./gh-lib.mjs"
import * as runner from "./gh-run.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

const USAGE = `usage: node scripts/gh-backfill-journal.mjs [--dry-run] [--min N] [--max N]
                                         [--journal <path>] [--repo owner/name]
                                         [--delay <ms>] [--json]

  --dry-run         decide everything, write nothing
  --min <n>         first journal item to import (default 1)
  --max <n>         last journal item to import (default 49: the pre-migration
                    record. Items 50+ were written after the tracker took over.)
  --journal <path>  source file (default MODEL-JOURNAL.md)
  --repo <slug>     operate on this repo (default: the one in the cwd)
  --delay <ms>      pause between content-creating calls (default 250; GitHub
                    throttles content creation at 80 requests/minute)
  --json            print one JSON object instead of prose`

function parseArgs(argv) {
  const opts = {
    dryRun: false, min: 1, max: 49, journal: "MODEL-JOURNAL.md",
    repo: null, delay: 250, json: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--dry-run") opts.dryRun = true
    else if (a === "--json") opts.json = true
    else if (a === "--min") opts.min = Number(argv[++i])
    else if (a === "--max") opts.max = Number(argv[++i])
    else if (a === "--journal") opts.journal = argv[++i]
    else if (a === "--repo") opts.repo = argv[++i]
    else if (a === "--delay") opts.delay = Number(argv[++i])
    else if (a === "--help" || a === "-h") { console.log(USAGE); process.exit(0) }
    else { console.error(`unknown argument: ${a}\n\n${USAGE}`); process.exit(2) }
  }
  if (!Number.isFinite(opts.min) || !Number.isFinite(opts.max) || opts.min > opts.max) {
    console.error("--min/--max must be numbers with --min <= --max")
    process.exit(2)
  }
  return opts
}

/** Synchronous sleep: the write loop is synchronous, and a rate-limit backoff
 *  needs to actually wait. */
function sleepSync(ms) {
  if (ms <= 0) return
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** Retry a mutating call on a GitHub secondary/primary rate limit. */
function withRetry(fn, label, attempts = 4) {
  let wait = 2000
  for (let attempt = 1; ; attempt++) {
    try {
      return fn()
    } catch (err) {
      const msg = String(err.message || err)
      const throttled = /rate limit|abuse|secondary|HTTP 403|HTTP 429/i.test(msg)
      if (!throttled || attempt >= attempts) throw err
      console.error(`  throttled on ${label}, waiting ${wait}ms (attempt ${attempt}/${attempts})`)
      sleepSync(wait)
      wait *= 2
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const caps = readCapabilities(readFileSync(resolve(ROOT, "capabilities/capabilities.yml"), "utf8"))
  const journalPath = resolve(ROOT, opts.journal)
  const items = parseJournalItems(readFileSync(journalPath, "utf8"), { min: opts.min, max: opts.max })

  if (!items.length) {
    console.error(`no journal items in range ${opts.min}..${opts.max} of ${opts.journal}`)
    process.exit(1)
  }

  const auth = runner.requireAuth()
  const slug = opts.repo || runner.repoSlug()

  // Existing issues, keyed by the sync key inside their body. `state: all` so a
  // re-run matches the closed issues this script created.
  const byKey = new Map()
  let scanned = 0
  for (const issue of runner.listIssues(slug)) {
    scanned++
    for (const key of keysIn(issue.body)) byKey.set(key, issue)
  }

  const report = {
    repo: slug, authenticated_as: auth.login, dry_run: opts.dryRun,
    range: [opts.min, opts.max], journal: opts.journal,
    existing_issues_scanned: scanned,
    created: [], updated: [], closed: [], skipped: [],
  }

  // GitHub's API wants `not_planned` (underscore); the CLI's `--reason` takes
  // "not planned" (space). Passing the CLI spelling to the API is a 422.
  const isOpen = (issue) => String(issue.state || "").toUpperCase() !== "CLOSED"

  for (const item of items) {
    const decision = syncDecision(item, caps, byKey)

    if (decision.action === "skip") {
      // The desired state of a backfilled item is CLOSED. A matching issue that
      // is still open — a partially-applied earlier run, for instance — is
      // converged here, because "skip" would otherwise strand it open forever.
      const issue = decision.issue
      if (isOpen(issue)) {
        if (!opts.dryRun) {
          withRetry(() => runner.setIssueState(slug, issue.number, "closed", "not_planned"), `close #${issue.number}`)
          sleepSync(opts.delay)
        }
        report.closed.push({ n: item.n, number: issue.number, title: item.title })
      } else {
        report.skipped.push({ n: item.n, number: issue.number, title: item.title })
      }
      continue
    }

    if (decision.action === "update") {
      if (!opts.dryRun) {
        withRetry(() => runner.updateIssue(slug, decision.issue.number, decision.payload), `update #${item.n}`)
        if (isOpen(decision.issue)) {
          withRetry(() => runner.setIssueState(slug, decision.issue.number, "closed", "not_planned"), `close #${decision.issue.number}`)
        }
        sleepSync(opts.delay)
      }
      report.updated.push({ n: item.n, number: decision.issue.number, title: item.title })
      continue
    }

    // create
    if (opts.dryRun) {
      report.created.push({ n: item.n, number: null, title: item.title, labels: decision.payload.labels })
      continue
    }
    const number = withRetry(() => runner.createIssue(slug, decision.payload), `create #${item.n}`)
    withRetry(() => runner.setIssueState(slug, number, "closed", "not_planned"), `close #${number}`)
    report.created.push({ n: item.n, number, title: item.title, labels: decision.payload.labels })
    sleepSync(opts.delay)
  }

  emit(report, opts)
}

function emit(report, opts) {
  const mode = report.dry_run ? "DRY RUN — nothing written" : "applied"
  if (opts.json) { console.log(JSON.stringify(report, null, 2)); return }
  console.log(`repo: ${report.repo}  (authenticated as ${report.authenticated_as})  [${mode}]`)
  console.log(`journal: ${report.journal}, items ${report.range[0]}..${report.range[1]}`)
  console.log(`existing issues scanned: ${report.existing_issues_scanned}`)
  console.log("")
  for (const c of report.created) {
    const num = c.number === null ? "(would create)" : `#${c.number}`
    console.log(`  create  item ${String(c.n).padStart(2)} -> ${num.padEnd(14)} ${truncate(c.title)}`)
  }
  for (const u of report.updated) {
    console.log(`  update  item ${String(u.n).padStart(2)} -> #${String(u.number).padEnd(13)} ${truncate(u.title)}`)
  }
  for (const c of report.closed) {
    console.log(`  close   item ${String(c.n).padStart(2)} -> #${String(c.number).padEnd(13)} ${truncate(c.title)}`)
  }
  console.log("")
  console.log(`totals: ${report.created.length} create, ${report.updated.length} update, ` +
    `${report.closed.length} close, ${report.skipped.length} skip`)
}

function truncate(s, n = 68) {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

try {
  main()
} catch (err) {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
}
