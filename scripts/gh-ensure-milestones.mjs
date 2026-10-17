#!/usr/bin/env node
// gh-ensure-milestones.mjs — install the tracker's milestones and labels.
//
//   node scripts/gh-ensure-milestones.mjs [--dry-run] [--repo owner/name] [--json]
//
// WHY THIS EXISTS: work tracking moves to GitHub, where a Milestone is the
// capability and a label is the vocabulary. Both must exist before an issue can
// carry them — `gh` DROPS a label it does not recognise at create time without
// failing, so a missing label is a silent loss of classification on a public
// tracker. Hence a dedicated, idempotent, runnable-at-any-time installer rather
// than labels being sprinkled through the backfill.
//
// Idempotent by construction: milestones are keyed by title and labels by name,
// so a second run creates nothing. Existing entries are only patched when their
// description/colour actually differs, and only with --update.
//
// THE MAPPING IS DERIVED, NOT DUPLICATED: milestone titles come from
// `capabilities/capabilities.yml` via gh-lib, so a capability added to the
// manifest appears here without editing this file — the same
// single-source-of-truth rule the repo already applies to stack.json
// (AGENTS.md, "Conventions when modifying").
//
// Exit 0 = tracker is in the desired state (or --dry-run showed it would be).

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readCapabilities, milestonesFromCapabilities, allLabels } from "./gh-lib.mjs"
import * as runner from "./gh-run.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

const USAGE = `usage: node scripts/gh-ensure-milestones.mjs [--dry-run] [--update] [--repo owner/name] [--json]

  --dry-run        report what would change; make no write
  --update         also patch existing milestones/labels whose text differs
  --repo <slug>    operate on this repo (default: the one in the cwd)
  --json           print the report as one JSON object instead of prose`

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

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const caps = readCapabilities(readFileSync(resolve(ROOT, "capabilities/capabilities.yml"), "utf8"))
  const milestones = milestonesFromCapabilities(caps)
  const labels = allLabels(caps)

  const report = {
    repo: null,
    dry_run: opts.dryRun,
    milestones: { created: [], unchanged: [], updated: [] },
    labels: { created: [], unchanged: [], updated: [] },
  }

  const auth = runner.requireAuth()
  const slug = opts.repo || runner.repoSlug()
  report.repo = slug
  report.authenticated_as = auth.login

  // A dry run takes the SAME path as the real run and simply declines to write,
  // so what it reports is what would actually happen. An earlier version
  // short-circuited here and listed every desired milestone and label as "would
  // create" without ever reading remote state — so on a fully-populated tracker
  // it reported an empty one, which is the opposite of what a dry run is for.
  const write = (fn) => {
    if (!opts.dryRun) fn()
  }

  const existingMilestones = new Map(runner.listMilestones(slug).map((m) => [m.title, m]))
  for (const want of milestones) {
    const have = existingMilestones.get(want.title)
    if (!have) {
      write(() => runner.createMilestone(slug, want))
      report.milestones.created.push(want.title)
    } else if ((have.description || "") === want.description) {
      report.milestones.unchanged.push(have.title)
    } else if (opts.update) {
      write(() => runner.updateMilestone(slug, have.number, want))
      report.milestones.updated.push(have.title)
    } else {
      report.milestones.unchanged.push(have.title)
    }
  }

  const existingLabels = new Map(runner.listLabels(slug).map((l) => [l.name, l]))
  for (const want of labels) {
    const have = existingLabels.get(want.name)
    if (!have) {
      write(() => runner.createLabel(slug, want))
      report.labels.created.push(want.name)
    } else if ((have.color || "") === want.color && (have.description || "") === want.description) {
      report.labels.unchanged.push(want.name)
    } else if (opts.update) {
      write(() => runner.updateLabel(slug, want.name, want))
      report.labels.updated.push(want.name)
    } else {
      report.labels.unchanged.push(want.name)
    }
  }

  emit(report, opts, opts.dryRun)
}

function emit(report, opts, dryRun) {
  if (opts.json) { console.log(JSON.stringify(report, null, 2)); return }
  const noun = dryRun ? "would create" : "created"
  console.log(`repo: ${report.repo}  (authenticated as ${report.authenticated_as})${dryRun ? "  [DRY RUN]" : ""}`)
  console.log(`\nmilestones (one per capability):`)
  console.log(`  ${noun}: ${report.milestones.created.join(", ") || "(none)"}`)
  if (report.milestones.updated.length) console.log(`  updated: ${report.milestones.updated.join(", ")}`)
  if (report.milestones.unchanged.length) console.log(`  already present: ${report.milestones.unchanged.length}`)
  console.log(`\nlabels:`)
  console.log(`  ${noun}: ${report.labels.created.join(", ") || "(none)"}`)
  if (report.labels.updated.length) console.log(`  updated: ${report.labels.updated.join(", ")}`)
  if (report.labels.unchanged.length) console.log(`  already present: ${report.labels.unchanged.length}`)
}

try {
  main()
} catch (err) {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
}
