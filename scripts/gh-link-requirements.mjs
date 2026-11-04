#!/usr/bin/env node
// gh-link-requirements.mjs — link every requirement to a GitHub issue & milestone.
//
//   node scripts/gh-link-requirements.mjs [--dry-run] [--update] [--repo owner/name] [--json]
//
// WHY THIS FILE EXISTS: each requirement in requirements/requirements.yml must be
// backed by a GitHub issue (one per requirement) filed under its capability's
// milestone. This script creates those issues (or updates existing ones), records
// the issue number and milestone back into requirements.yml, and is safe to run
// repeatedly thanks to the gh-sync:req-<id> idempotency key.
//
// Idempotent by construction: every issue carries `<!-- gh-sync:req-<id> -->` in
// its body, so a re-run finds the existing issue and updates it rather than
// duplicating. requirements.yml is rewritten line-oriented so every field other
// than github_issue / github_milestone is preserved byte-for-byte.

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  readCapabilities,
  readRequirements,
  namedKey,
  keysIn,
} from "./gh-lib.mjs"
import * as runner from "./gh-run.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

const USAGE = `usage: node scripts/gh-link-requirements.mjs [--dry-run] [--update] [--repo owner/name] [--json]

  --dry-run        report what would change; make no write
  --update         actually create/update issues and rewrite requirements.yml
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

/** Idempotency key comment for requirement `id`: <!-- gh-sync:req-<id> --> */
function reqKey(id) {
  return namedKey(`req-${id}`)
}

/** Build the issue body for one requirement. */
function buildBody(req) {
  return [
    reqKey(req.id),
    "",
    `# [requirement] ${req.id}`,
    "",
    `- **Capability:** ${req.capability}`,
    `- **Status:** ${req.status}`,
    `- **Since:** ${req.since}`,
    "",
    `## Requirement`,
    "",
    req.title,
    "",
    `## Traceability`,
    "",
    `- Milestone: ${req.capability} (capability)`,
    `- Labels: kind:task, req:${req.id}, capability:${req.capability}`,
    "",
    `This issue tracks the full lifecycle of requirement \`${req.id}\`. It is created`,
    `and kept in sync by \`scripts/gh-link-requirements.mjs\`; do not close it except`,
    `through that script's \`--update\` run.`,
    "",
  ].join("\n")
}

/** Issue labels for one requirement. */
function issueLabels(req) {
  return ["kind:task", `req:${req.id}`, `capability:${req.capability}`]
}

/** Rewrite requirements.yml, setting github_issue/github_milestone for given ids.
 *  Every other field and all formatting are preserved line-for-line. */
function writeRequirementFields(text, updates) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  let currentId = null
  const out = []
  for (const line of lines) {
    const mId = line.match(/^ {2}- id:\s*(\S+)/)
    if (mId) {
      currentId = mId[1]
      out.push(line)
      continue
    }
    const upd = currentId ? updates[currentId] : null
    if (upd) {
      const mIssue = line.match(/^ {4}github_issue:\s*.*$/)
      if (mIssue) {
        out.push(`    github_issue: ${upd.github_issue}`)
        continue
      }
      const mMile = line.match(/^ {4}github_milestone:\s*.*$/)
      if (mMile) {
        out.push(`    github_milestone: "${upd.github_milestone}"`)
        continue
      }
    }
    out.push(line)
  }
  return out.join("\n")
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const reqText = readFileSync(resolve(ROOT, "requirements/requirements.yml"), "utf8")
  const capText = readFileSync(resolve(ROOT, "capabilities/capabilities.yml"), "utf8")
  const requirements = readRequirements(reqText)
  const caps = readCapabilities(capText)

  const report = {
    repo: null,
    dry_run: opts.dryRun,
    requirements: [],
  }

  const write = (fn) => {
    if (!opts.dryRun) fn()
  }

  const auth = runner.requireAuth()
  const slug = opts.repo || runner.repoSlug()
  report.repo = slug
  report.authenticated_as = auth.login

  // --- milestones: one per capability, title = capability id ---------------
  const milestones = []
  for (const cap of caps) milestones.push({ title: cap.id, description: cap.intent || "" })
  const fetchedMilestones = runner.listMilestones(slug)
  const existingMilestones = new Map(fetchedMilestones.map((m) => [m.title, m]))
  const milestoneByTitle = new Map(fetchedMilestones.map((m) => [m.title, m]))
  for (const want of milestones) {
    if (!existingMilestones.get(want.title)) {
      write(() => {
        const created = runner.createMilestone(slug, want)
        if (created) milestoneByTitle.set(want.title, created)
      })
      // In dry-run the milestone is never actually created, so populate a mock
      // entry so later lookups (e.g. linking requirements) do not fail with
      // "milestone not found".
      if (opts.dryRun) milestoneByTitle.set(want.title, { title: want.title, number: null })
    }
  }

  // --- labels: ensure the ones we attach exist -----------------------------
  const wantedLabels = []
  for (const req of requirements) {
    wantedLabels.push({ name: "kind:task", color: "0e8a16", description: "A unit of work to be done" })
    wantedLabels.push({ name: `req:${req.id}`, color: "fbca04", description: `Requirement ${req.id}: ${req.title}` })
    wantedLabels.push({ name: `capability:${req.capability}`, color: "bfd4f2", description: `Work touching capability ${req.capability}` })
  }
  // dedupe by name
  const uniqLabels = []
  const seen = new Set()
  for (const l of wantedLabels) {
    if (seen.has(l.name)) continue
    seen.add(l.name)
    uniqLabels.push(l)
  }
  const existingLabels = new Map(runner.listLabels(slug).map((l) => [l.name, l]))
  for (const want of uniqLabels) {
    if (!existingLabels.get(want.name)) {
      write(() => runner.createLabel(slug, want))
    }
  }

  // --- existing issues keyed by idempotency key ----------------------------
  const existingIssues = runner.listIssues(slug)
  const keyToIssue = new Map()
  for (const issue of existingIssues) {
    for (const k of keysIn(issue.body || "")) {
      keyToIssue.set(k, issue)
    }
  }

  const updates = {} // req.id -> { github_issue, github_milestone }
  const results = []

  for (const req of requirements) {
    const key = reqKey(req.id)
    const milestone = milestoneByTitle.get(req.capability)
    if (!milestone) {
      throw new Error(`milestone not found for capability ${req.capability} (req ${req.id})`)
    }
    const milestoneNumber = milestone.number

    let action, number
    if (req.github_issue && Number(req.github_issue) > 0) {
      // already linked: update that issue
      action = "update"
      number = Number(req.github_issue)
    } else {
      const found = keyToIssue.get(`req-${req.id}`)
      if (found) {
        action = "update"
        number = found.number
      } else {
        action = "create"
        number = null
      }
    }

    const payload = {
      title: `[requirement] ${req.id}`,
      body: buildBody(req),
      labels: issueLabels(req),
    }
    if (milestoneNumber != null) payload.milestone = milestoneNumber

    let createdNumber = number
    if (action === "create") {
      write(() => {
        createdNumber = runner.createIssue(slug, payload)
      })
      report.requirements.push({ id: req.id, action: "create", issue: createdNumber, milestone: req.capability })
    } else {
      write(() => runner.updateIssue(slug, number, payload))
      report.requirements.push({ id: req.id, action: "update", issue: number, milestone: req.capability })
    }

    updates[req.id] = { github_issue: createdNumber, github_milestone: req.capability }
  }

  // write back requirements.yml (only github_issue / github_milestone change)
  write(() => {
    writeFileSync(resolve(ROOT, "requirements/requirements.yml"), writeRequirementFields(reqText, updates), "utf8")
  })

  emit(report, opts)
}

function emit(report, opts) {
  if (opts.json) {
    console.log(JSON.stringify(report, null, 2))
    return
  }
  const noun = report.dry_run ? "would " : ""
  console.log(`repo: ${report.repo}  (authenticated as ${report.authenticated_as})${report.dry_run ? "  [DRY RUN]" : ""}`)
  console.log(`\nrequirements:`)
  for (const r of report.requirements) {
    console.log(`  ${r.id}: ${noun}${r.action} -> issue #${r.issue}  milestone: ${r.milestone}`)
  }
}

try {
  main()
} catch (err) {
  console.error(`\nERROR: ${err.message}`)
  process.exit(1)
}
