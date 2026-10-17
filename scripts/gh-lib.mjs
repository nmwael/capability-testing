#!/usr/bin/env node
// gh-lib.mjs — the pure half of the GitHub work-tracker integration.
//
// WHY THIS FILE EXISTS: the repo's work tracking was a set of bespoke root
// `.md` documents (MODEL-JOURNAL.md, PLAN.md, ...) that only a human reading
// the repo could see. It is moving to GitHub itself: one Milestone per
// capability, one Issue per unit of work. That move needs two things that must
// NOT live inside a network call:
//
//   1. a mechanical mapping from the manifest (`capabilities/capabilities.yml`)
//      to milestone titles, and a fixed label vocabulary; and
//   2. a parser that turns the historical journal's numbered items into issue
//      payloads, each carrying an IDEMPOTENCY KEY so a re-run updates rather
//      than duplicates.
//
// Both are pure functions over strings, so they live here, are unit-tested in
// scripts/gh-lib.test.mjs with no network and no `gh` binary, and are shared by
// scripts/gh-ensure-milestones.mjs and scripts/gh-backfill-journal.mjs. The
// `gh` subprocess is deliberately absent from this module: a pure function that
// shells out cannot be tested offline, and an offline-tested parser is the only
// reason a 49-issue backfill can be run twice safely.
//
// No new dependency: `yaml` is not resolvable from the repo root, so the
// manifest is read with the same line-oriented scan the repo already uses in
// scripts/verify-capabilities.js:22-70.

// ---------------------------------------------------------------------------
// Manifest -> milestones
// ---------------------------------------------------------------------------

/**
 * Read `capabilities/capabilities.yml` with a line-oriented scan.
 *
 * Matches the shape the repo ships and nothing more: a top-level
 * `capabilities:` list of `- id: <dotted.id>` entries whose `intent`, `owner`
 * and `status` are simple `key: value` lines. Comments are stripped and quoted
 * scalars unquoted, exactly as scripts/verify-capabilities.js does.
 *
 * @param {string} text raw file contents
 * @returns {{id:string,intent:string,owner:string,status:string}[]}
 */
export function readCapabilities(text) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const caps = []
  let inList = false
  let current = null

  for (const line of lines) {
    if (/^capabilities:\s*$/.test(line)) { inList = true; continue }
    if (!inList) continue
    if (/^\S/.test(line)) break // a new top-level key ends the list

    const idMatch = line.match(/^\s*-\s+id:\s*(.+)$/)
    if (idMatch) {
      current = { id: unquote(idMatch[1]), intent: "", owner: "", status: "" }
      caps.push(current)
      continue
    }
    const kv = line.match(/^\s{2,}(intent|owner|status):\s*(.*)$/)
    if (kv && current) current[kv[1]] = unquote(kv[2])
  }

  if (!caps.length) throw new Error("readCapabilities: no capabilities found")
  for (const cap of caps) {
    if (!cap.id) throw new Error("readCapabilities: a capability is missing its id")
  }
  return caps
}

function unquote(raw) {
  return raw.split("#")[0].trim().replace(/^['"]|['"]$/g, "")
}

/**
 * One Milestone per capability, per the agreed mapping.
 * Title is the capability id so `capability:<id>` labels and milestone titles
 * cannot drift apart.
 */
export function milestonesFromCapabilities(caps) {
  return caps.map((cap) => ({
    title: cap.id,
    description: [
      cap.intent,
      "",
      `Owner: ${cap.owner}. Status: ${cap.status}.`,
      "",
      `Declared in \`capabilities/capabilities.yml\`; verified by ${cap.id}-scoped feature files.`,
    ].join("\n"),
  }))
}

// ---------------------------------------------------------------------------
// Label vocabulary
// ---------------------------------------------------------------------------

/** The complete label set the integration installs, in one place. */
export const LABELS = [
  { name: "kind:defect", color: "d73a4a", description: "A defect or failure that was surfaced" },
  { name: "kind:task", color: "0e8a16", description: "A unit of work to be done" },
  { name: "kind:tracking", color: "5319e7", description: "Tracking or meta issue" },
  { name: "role:architect", color: "1d76db", description: "Concerning the architect role" },
  { name: "role:coder", color: "1d76db", description: "Concerning the coder role" },
  { name: "role:reviewer", color: "1d76db", description: "Concerning the reviewer role" },
  { name: "role:fact-checker", color: "1d76db", description: "Concerning the fact-checker role" },
  { name: "role:researcher", color: "1d76db", description: "Concerning the researcher role" },
  { name: "role:ui", color: "1d76db", description: "Concerning the ui role" },
  { name: "role:artist", color: "1d76db", description: "Concerning the artist role" },
  { name: "role:pipeline", color: "1d76db", description: "Concerning the harness or pipeline, no single role" },
  { name: "hitl:awaiting-approval", color: "fbca04", description: "Blocked on human approval (HITL)" },
  { name: "hitl:approved", color: "0e8a16", description: "Human approval obtained" },
  { name: "source:journal", color: "c5def5", description: "Backfilled from MODEL-JOURNAL.md" },
]

/** Derive the per-capability label names from the manifest. */
export function capabilityLabels(caps) {
  return caps.map((cap) => ({
    name: `capability:${cap.id}`,
    color: "bfd4f2",
    description: `Work touching capability ${cap.id}`,
  }))
}

/** The full label set: static vocabulary + one label per capability. */
export function allLabels(caps) {
  return [...LABELS, ...capabilityLabels(caps)]
}

// ---------------------------------------------------------------------------
// Idempotency keys
// ---------------------------------------------------------------------------

// An HTML comment, so it is invisible in the rendered issue but greppable in
// the raw body. The backfill keys on it, which is what makes a second run an
// update instead of 49 duplicates.
const KEY_PREFIX = "gh-sync:"

/** Key for the issue importing journal item `n`. */
export function journalItemKey(n) {
  return `<!-- ${KEY_PREFIX}journal-item-${n} -->`
}

/** Key for an issue owned by a future tool (plans, attestations, ...). */
export function namedKey(name) {
  return `<!-- ${KEY_PREFIX}${name} -->`
}

/** Extract every gh-sync key present in a body, in order. */
export function keysIn(body) {
  const out = []
  const re = new RegExp(`<!--\\s*${KEY_PREFIX}([a-z0-9-]+)\\s*-->`, "g")
  let m
  while ((m = re.exec(body || "")) !== null) out.push(m[1])
  return out
}

// ---------------------------------------------------------------------------
// MODEL-JOURNAL.md -> issue payloads
// ---------------------------------------------------------------------------

const SECTION_HEADING = /^##\s+Pipeline run\b/m
const ITEM_START = /^(\d+)\.\s+\*\*/
const ANY_HEADING = /^#{1,6}\s/

/**
 * Parse the numbered items of the historical journal.
 *
 * Scope is the `## Pipeline run — underway issues` section through end of file
 * — the section that carries the continuous 1..N numbering. The `## Open
 * questions` list above it also numbers from 1 and must not be picked up, so
 * the scan starts at that heading rather than at the top of the file.
 *
 * A title may WRAP: items 12, 14 and 51 in the shipped journal open with
 * `N. **` on one line and close the title with `**` on the next, because the
 * file is hard-wrapped at ~100 columns. Requiring the closing `**` on the same
 * line silently dropped three items on the first run of this parser, which is
 * exactly the kind of miss a 49-item backfill cannot afford, so the title is
 * accumulated across lines until its terminator is found.
 *
 * Bodies are REFLOWED, not de-indented: wrapped source lines are joined with a
 * space and blank lines are kept as paragraph breaks. Leaving the original
 * 4-space indent would turn every continuation into a markdown code block, and
 * stripping it would promote continuation lines that happen to start with `-`
 * or `#` into lists and headings.
 *
 * @param {string} markdown
 * @param {{min?:number,max?:number}} [range] inclusive item-number filter
 * @returns {{n:number,title:string,body:string}[]}
 */
export function parseJournalItems(markdown, range = {}) {
  const min = range.min ?? 1
  const max = range.max ?? Number.MAX_SAFE_INTEGER
  const text = markdown.replace(/\r\n/g, "\n")
  const start = text.search(SECTION_HEADING)
  if (start < 0) throw new Error("parseJournalItems: journal section heading not found")
  // The section ends at the next LEVEL-2 heading, but spans `###` subsections
  // (`### Autonomous run — continued` is inside it). Without this boundary a
  // numbered list in any later `##` section is absorbed as more items — the
  // shipped journal only escapes that by luck, because its `## Open questions`
  // happens to sit above the pipeline heading.
  const fromStart = text.slice(start)
  const firstBreak = fromStart.indexOf("\n")
  const afterHeading = fromStart.slice(firstBreak + 1)
  const nextL2 = afterHeading.search(/^##\s/m)
  const section = nextL2 < 0 ? fromStart : fromStart.slice(0, firstBreak + 1 + nextL2)
  const lines = section.split("\n")

  const items = []
  let current = null
  let titleOpen = false

  const flush = () => {
    if (!current) return
    current.body = reflow(current.bodyLines)
    delete current.bodyLines
    items.push(current)
    current = null
    titleOpen = false
  }

  for (const line of lines) {
    if (titleOpen) {
      // Still inside a wrapped title: consume up to (and past) the `**`.
      const close = line.indexOf("**")
      if (close < 0) {
        current.title = `${current.title} ${line.trim()}`.trim()
      } else {
        current.title = cleanTitle(`${current.title} ${line.slice(0, close).trim()}`)
        const rest = line.slice(close + 2).trim()
        if (rest) current.bodyLines.push(rest)
        titleOpen = false
      }
      continue
    }

    const m = line.match(ITEM_START)
    if (m) {
      flush()
      const after = line.replace(ITEM_START, "")
      const close = after.indexOf("**")
      current = { n: Number(m[1]), title: "", bodyLines: [] }
      if (close < 0) {
        current.title = after.trim()
        titleOpen = true
      } else {
        current.title = cleanTitle(after.slice(0, close))
        const rest = after.slice(close + 2).trim()
        if (rest) current.bodyLines.push(rest)
      }
      continue
    }

    // A heading always ends the current item, so a later section's items are
    // not silently absorbed as continuation lines.
    if (ANY_HEADING.test(line)) { flush(); continue }
    if (current) current.bodyLines.push(line)
  }
  flush()

  return items.filter((it) => it.n >= min && it.n <= max)
}

function cleanTitle(raw) {
  return raw.trim().replace(/\.$/, "")
}

/** Join wrapped source lines into paragraphs, keeping blank-line breaks. */
function reflow(lines) {
  const out = []
  let para = []
  const push = () => {
    if (para.length) { out.push(para.join(" ")); para = [] }
  }
  for (const line of lines) {
    const t = line.trim()
    if (t === "") { push(); out.push("") } else { para.push(t) }
  }
  push()
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim()
}

const ROLE_WORDS = [
  "architect", "coder", "reviewer", "fact-checker", "researcher", "ui", "artist",
]

/**
 * Classify one journal item into labels.
 *
 * Deliberately conservative and mechanical: every imported issue is
 * `kind:defect` + `source:journal` (the journal records things that went
 * wrong), a `role:*` label is added only when a role name appears in the
 * TITLE — a title is short enough that a mention is about that role, whereas
 * scanning the body would tag almost everything — and `capability:*` when the
 * body names a capability id verbatim.
 *
 * @param {{n:number,title:string,body:string}} item
 * @param {{id:string}[]} caps
 */
export function classifyItem(item, caps) {
  const labels = ["kind:defect", "source:journal"]
  const title = item.title.toLowerCase()

  const roles = ROLE_WORDS.filter((r) =>
    new RegExp(`(^|[^a-z-])${r.replace("-", "\\-")}([^a-z-]|$)`, "i").test(title))
  if (roles.length) {
    for (const r of roles) labels.push(`role:${r}`)
  } else {
    labels.push("role:pipeline")
  }

  // Capability mentions are rare in this journal; check the whole text.
  const haystack = `${item.title}\n${item.body}`
  for (const cap of caps) {
    if (haystack.includes(cap.id)) labels.push(`capability:${cap.id}`)
  }
  return labels
}

/**
 * Build the issue payload for one journal item: a closed issue whose body is
 * the journal text plus the idempotency key.
 */
export function buildJournalIssue(item, caps) {
  return {
    title: `[journal #${item.n}] ${item.title}`,
    body: [
      journalItemKey(item.n),
      "",
      `> Backfilled from \`MODEL-JOURNAL.md\`, item ${item.n}.`,
      "",
      item.body,
    ].join("\n").trim() + "\n",
    labels: classifyItem(item, caps),
  }
}

/**
 * Incremental sync decision for one item, given the issues that already exist.
 *
 * @param {{n:number,title:string,body:string}} item
 * @param {Map<string,{number:number,title:string,body:string}>} existing key -> issue
 * @returns {{action:"create"|"update"|"skip", issue?:object, payload?:object}}
 */
export function syncDecision(item, caps, existing) {
  const payload = buildJournalIssue(item, caps)
  const key = `journal-item-${item.n}`
  const found = existing.get(key)
  if (!found) return { action: "create", payload }
  if (found.title === payload.title && (found.body || "").trim() === payload.body.trim()) {
    return { action: "skip", issue: found, payload }
  }
  return { action: "update", issue: found, payload }
}
