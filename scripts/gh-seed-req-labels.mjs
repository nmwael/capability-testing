#!/usr/bin/env node
// gh-seed-req-labels.mjs — install the `req:*` requirement labels.
//
//   node scripts/gh-seed-req-labels.mjs [--dry-run] [--update] [--repo owner/name] [--json]
//
// WHY THIS EXISTS: every requirement in requirements/requirements.yml gets a
// `req:<id>` label so issues can be classified by the requirement they trace
// to. Labels must exist before an issue can carry them — `gh` DROPS a label it
// does not recognise at create time without failing — so a dedicated,
// idempotent, runnable-at-any-time installer keeps the vocabulary in sync with
// the requirements manifest.
//
// Idempotent by construction: labels are keyed by name, so a second run
// creates nothing. Existing entries are only patched when their colour or
// description actually differs, and only with --update.
//
// Each label carries the idempotency key `gh-sync:req-label-${req.id}` so a
// re-run updates rather than duplicates.

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { readRequirements, requirementLabels } from "./gh-lib.mjs"
import * as runner from "./gh-run.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

const USAGE = `usage: node scripts/gh-seed-req-labels.mjs [--dry-run] [--update] [--repo owner/name] [--json]

  --dry-run        report what would change; make no write
  --update         also patch existing labels whose text differs
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
  const requirements = readRequirements(readFileSync(resolve(ROOT, "requirements/requirements.yml"), "utf8"))
  const labels = requirementLabels(requirements)

  const report = {
    repo: null,
    dry_run: opts.dryRun,
    labels: { created: [], unchanged: [], updated: [] },
  }

  const auth = runner.requireAuth()
  const slug = opts.repo || runner.repoSlug()
  report.repo = slug
  report.authenticated_as = auth.login

  // A dry run takes the SAME path as the real run and simply declines to write,
  // so what it reports is what would actually happen.
  const write = (fn) => {
    if (!opts.dryRun) fn()
  }

  const existingLabels = new Map(runner.listLabels(slug).map((l) => [l.name, l]))
  for (const want of labels) {
    const reqId = want.name.slice("req:".length)
    const key = `gh-sync:req-label-${reqId}`
    const have = existingLabels.get(want.name)
    if (!have) {
      write(() => runner.createLabel(slug, want))
      report.labels.created.push(`${want.name} (${key})`)
    } else if ((have.color || "") === want.color && (have.description || "") === want.description) {
      report.labels.unchanged.push(have.name)
    } else if (opts.update) {
      write(() => runner.updateLabel(slug, want.name, want))
      report.labels.updated.push(`${want.name} (${key})`)
    } else {
      report.labels.unchanged.push(have.name)
    }
  }

  emit(report, opts, opts.dryRun)
}

function emit(report, opts, dryRun) {
  if (opts.json) { console.log(JSON.stringify(report, null, 2)); return }
  const noun = dryRun ? "would create" : "created"
  console.log(`repo: ${report.repo}  (authenticated as ${report.authenticated_as})${dryRun ? "  [DRY RUN]" : ""}`)
  console.log(`\nrequirement labels (req:*, one per requirement):`)
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
