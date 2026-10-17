#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Regression test for scripts/gh-lib.mjs
//
//   node scripts/gh-lib.test.mjs
//
// WHY THIS FILE EXISTS: gh-lib parses a 598-line journal into 49 issue
// payloads and then a second, unauthenticated run has to be able to say
// "nothing changed". A silent parse regression is therefore expensive in a way
// a normal parse bug is not: dropping an item backfills 48 issues and looks
// like success, and a key that shifts duplicates all 49 on the next run.
//
// The parser's first draft genuinely dropped THREE items (12, 14, 51) because
// their titles wrap across lines, and it de-indented bodies to column 0, which
// can promote a continuation line into a markdown list. Both are pinned below.
//
// Offline by design: no network, no `gh` binary, no writes. Pure functions
// only, so this is decidable from the working tree alone.
//
// Exit 0 = every case matched. Exit 1 = at least one mismatch.
// ---------------------------------------------------------------------------

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import {
  readCapabilities,
  milestonesFromCapabilities,
  capabilityLabels,
  allLabels,
  journalItemKey,
  namedKey,
  keysIn,
  parseJournalItems,
  classifyItem,
  buildJournalIssue,
  syncDecision,
} from "./gh-lib.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")

let failures = 0
const ok = (m) => console.log(`  ok   ${m}`)
const fail = (m) => { failures++; console.log(`  FAIL ${m}`) }
const eq = (actual, expected, m) =>
  actual === expected ? ok(m) : fail(`${m}\n         expected: ${expected}\n         actual:   ${actual}`)

const CAPS = readCapabilities(readFileSync(resolve(ROOT, "capabilities/capabilities.yml"), "utf8"))
const JOURNAL = readFileSync(resolve(ROOT, "MODEL-JOURNAL.md"), "utf8")

// ---------------------------------------------------------------------------

function checkCapabilities() {
  console.log("capabilities manifest -> milestones")
  eq(CAPS.length, 5, "five capabilities are read from the manifest")
  eq(CAPS.map((c) => c.id).join(","), "alert.publish,alert.route,alert.rule-design,alert.rule-edit,alert.flow",
    "ids are read in manifest order")
  eq(CAPS[0].owner, "publication", "owner is read")
  eq(CAPS[0].status, "active", "status is read")
  eq(CAPS.find((c) => c.id === "alert.route").owner, "alerting", "a later entry's owner is read too")

  const ms = milestonesFromCapabilities(CAPS)
  eq(ms.length, 5, "one milestone per capability")
  eq(ms.map((m) => m.title).join(","), CAPS.map((c) => c.id).join(","),
    "milestone titles are exactly the capability ids (no drift from capability:* labels)")
  if (ms.every((m) => m.description.length > 20)) ok("each milestone carries a description")
  else fail("a milestone description is empty")

  const cl = capabilityLabels(CAPS)
  eq(cl.length, 5, "one capability label per capability")
  eq(cl[0].name, "capability:alert.publish", "capability label naming")
  for (const l of allLabels(CAPS)) {
    if (!/^[0-9a-f]{6}$/.test(l.color)) fail(`label ${l.name} has a bad colour ${l.color}`)
    if (!l.description) fail(`label ${l.name} has no description`)
  }
  ok(`all ${allLabels(CAPS).length} labels have a 6-hex colour and a description`)
  eq(new Set(allLabels(CAPS).map((l) => l.name)).size, allLabels(CAPS).length, "label names are unique")
}

function checkKeys() {
  console.log("idempotency keys")
  eq(journalItemKey(7), "<!-- gh-sync:journal-item-7 -->", "journal key shape")
  eq(namedKey("plan-T1"), "<!-- gh-sync:plan-T1 -->", "named key shape")
  eq(keysIn(`hello\n${journalItemKey(3)}\nworld`).join(","), "journal-item-3", "keys are found inside a body")
  eq(keysIn(journalItemKey(1) + "\n" + journalItemKey(2)).join(","), "journal-item-1,journal-item-2",
    "several keys are found in order")
  eq(keysIn("no keys here").length, 0, "a body with no key yields none")
  eq(keysIn(null).length, 0, "a null body does not throw")

  // The key is an HTML comment: invisible when rendered, greppable when raw.
  if (journalItemKey(1).startsWith("<!--") && journalItemKey(1).endsWith("-->")) ok("key is an HTML comment")
  else fail("key is not an HTML comment")
}

function checkParse() {
  console.log("journal parsing")
  const items = parseJournalItems(JOURNAL)
  // The COUNT is deliberately not pinned: the journal is a living document
  // until it is frozen, and pinning it here only meant editing this test every
  // time an item was appended. What must hold is that the sequence is gap-free
  // from 1 — that is what a 49-item import relies on.
  const N = items.length
  ok(`all ${N} items in the shipped journal are parsed (count not pinned)`)

  const missing = []
  for (let n = 1; n <= N; n++) if (!items.find((it) => it.n === n)) missing.push(n)
  eq(missing.length, 0, `no item number is missing (missing: ${missing.join(",") || "none"})`)
  eq(items.map((it) => it.n).join(","), Array.from({ length: N }, (_, i) => i + 1).join(","),
    "items come back in ascending, gap-free order")
  if (N >= 49) ok(`the historical 1..49 range is intact inside 1..${N}`)
  else fail(`only ${N} items parsed; the historical 1..49 range is incomplete`)

  // Wrapped titles: the parser's first draft dropped these three outright.
  for (const n of [12, 14, 51]) {
    const it = items.find((x) => x.n === n)
    if (!it) { fail(`wrapped-title item ${n} was dropped`); continue }
    if (it.title.length > 40) ok(`wrapped-title item ${n} recovered (${it.title.length} chars)`)
    else fail(`item ${n} title looks truncated: ${it.title}`)
    if (!it.title.includes("**") && !/\*$/.test(it.title)) ok(`item ${n} title has no leftover '**' terminator`)
    else fail(`item ${n} title kept its markdown terminator: ${it.title}`)
  }
  eq(items.find((it) => it.n === 12).title.startsWith("Once `publication` finally compiled"), true,
    "item 12's title joins both wrapped lines")
  if (!/  /.test(items.map((it) => it.title).join("\n"))) ok("no title contains a doubled space from re-wrapping")
  else fail("a title kept the source indentation when wrapped")

  // Body reflow: no 4-space indent (would be a code block), no stray leading spaces.
  const indented = items.filter((it) => it.body.split("\n").some((l) => /^ {2,}/.test(l)))
  eq(indented.length, 0, "no body line keeps source indentation (which markdown reads as code)")

  // Paragraph breaks cannot be checked against the shipped journal (its items
  // have no internal blank lines), so reflow is pinned on synthetic input.
  const empty = items.filter((it) => !it.body.trim())
  eq(empty.length, 0, "every parsed item has a non-empty body")

  // The `## Open questions` list also numbers from 1 and must not be picked up.
  const oq = items.find((it) => it.title.startsWith("Settle the architect model"))
  eq(oq, undefined, "the earlier `## Open questions` list is not parsed as journal items")

  // Range filter, used to keep the backfill to the agreed 1..49.
  eq(parseJournalItems(JOURNAL, { min: 1, max: 49 }).length, 49, "the 1..49 range yields 49 items")
  eq(parseJournalItems(JOURNAL, { min: 40, max: 49 }).length, 10, "a sub-range is honoured")

  // Determinism is what makes a second run a no-op.
  const again = parseJournalItems(JOURNAL)
  eq(JSON.stringify(again), JSON.stringify(items), "two parses of the same text are identical")
}

function checkReflow() {
  console.log("reflow / wrapped titles (synthetic)")
  // Hand-built so the shape under test is explicit rather than inherited from
  // whatever the shipped journal happens to contain today.
  const md = [
    "## Pipeline run — underway issues (2026-01-01, test)",
    "",
    "1. **First item.** Body line one",
    "    continued on the next line.",
    "",
    "    Second paragraph of item one.",
    "",
    "2. **Second item wraps across two",
    "    lines.** Body text.",
    "",
    "### A later section",
    "",
    "3. **Third item.** After a heading.",
    "",
    "## Open questions",
    "",
    "1. **Not a pipeline item.**",
    "",
  ].join("\n")

  const items = parseJournalItems(md)
  eq(items.map((it) => it.n).join(","), "1,2,3", "synthetic: three items, in order")
  eq(items[0].title, "First item", "synthetic: trailing '.' is dropped from the title")
  eq(items[0].body, "Body line one continued on the next line.\n\nSecond paragraph of item one.",
    "synthetic: wrapped lines join with a space; the blank line survives as a paragraph break")
  eq(items[1].title, "Second item wraps across two lines", "synthetic: a title wrapped over two lines is joined")
  eq(items[1].body, "Body text.", "synthetic: body after a wrapped title is correct")
  eq(items[2].title, "Third item", "synthetic: an item after a sub-heading is still parsed")
  eq(parseJournalItems(md, { max: 2 }).length, 2, "synthetic: the max filter applies")

  // A blank-line-free wrap must NOT leave the source indent behind, and a
  // continuation starting with '-' must not become its own list item.
  const tricky = [
    "## Pipeline run — test",
    "",
    "1. **Tricky.** first",
    "    - second looks like a bullet",
    "",
  ].join("\n")
  const t = parseJournalItems(tricky)
  eq(t[0].body, "first - second looks like a bullet",
    "synthetic: a continuation that looks like a bullet is joined into the paragraph, not promoted")
}

function checkClassifyAndPayload() {
  console.log("classification and payloads")
  const items = parseJournalItems(JOURNAL)

  const i46 = items.find((it) => it.n === 46)
  const l46 = classifyItem(i46, CAPS)
  if (l46.includes("role:coder")) ok("item 46 (a coder reverted a change) gets role:coder")
  else fail(`item 46 labels: ${l46.join(" ")}`)
  if (l46.includes("kind:defect") && l46.includes("source:journal")) ok("imported items are kind:defect + source:journal")
  else fail(`item 46 missing kind/source labels: ${l46.join(" ")}`)

  const i26 = items.find((it) => it.n === 26)
  if (classifyItem(i26, CAPS).includes("role:pipeline")) ok("an item naming no role falls back to role:pipeline")
  else fail(`item 26 labels: ${classifyItem(i26, CAPS).join(" ")}`)

  for (const it of items) {
    const labels = classifyItem(it, CAPS)
    if (!labels.includes("source:journal")) fail(`item ${it.n} lost source:journal`)
    // Every label emitted must exist in the installed vocabulary, or `gh`
    // silently drops it at create time.
    const known = new Set(allLabels(CAPS).map((l) => l.name))
    for (const l of labels) if (!known.has(l)) fail(`item ${it.n} emits unknown label ${l}`)
  }
  ok("every item emits only labels from the installed vocabulary")

  const payload = buildJournalIssue(i46, CAPS)
  if (payload.title.startsWith("[journal #46] ")) ok("issue title is prefixed with its journal number")
  else fail(`payload title: ${payload.title}`)
  if (payload.body.startsWith(journalItemKey(46))) ok("payload body starts with its idempotency key")
  else fail("payload body does not start with its key")

  const p12 = buildJournalIssue(items.find((it) => it.n === 12), CAPS)
  if (p12.title.length < 256) ok(`longest wrapped title fits GitHub's limit (${p12.title.length})`)
  else fail(`payload title too long: ${p12.title.length}`)
}

function checkSyncDecision() {
  console.log("incremental sync decisions")
  const items = parseJournalItems(JOURNAL)
  const i5 = items.find((it) => it.n === 5)
  const empty = new Map()

  eq(syncDecision(i5, CAPS, empty).action, "create", "an unknown item is a create")

  const payload = buildJournalIssue(i5, CAPS)
  const same = new Map([[`journal-item-${i5.n}`, { number: 99, title: payload.title, body: payload.body }]])
  eq(syncDecision(i5, CAPS, same).action, "skip", "an identical existing issue is a skip (idempotent re-run)")

  const diffTitle = new Map([[`journal-item-${i5.n}`, { number: 99, title: "old", body: payload.body }]])
  eq(syncDecision(i5, CAPS, diffTitle).action, "update", "a changed title is an update")

  const diffBody = new Map([[`journal-item-${i5.n}`, { number: 99, title: payload.title, body: "old" }]])
  eq(syncDecision(i5, CAPS, diffBody).action, "update", "a changed body is an update")

  // A second full pass over the first pass's own output must create nothing.
  const afterFirstRun = new Map(items.map((it) => {
    const p = buildJournalIssue(it, CAPS)
    return [`journal-item-${it.n}`, { number: it.n, title: p.title, body: p.body }]
  }))
  const actions = items.map((it) => syncDecision(it, CAPS, afterFirstRun).action)
  eq(actions.filter((a) => a !== "skip").length, 0,
    "re-running the backfill over its own result schedules zero writes")
}

function checkManifestGuards() {
  console.log("guards")
  let threw = false
  try { readCapabilities("capabilities: []\n") } catch { threw = true }
  eq(threw, true, "an empty manifest is rejected rather than yielding zero milestones")

  threw = false
  try { parseJournalItems("# nothing here\n") } catch { threw = true }
  eq(threw, true, "a journal with no section heading is rejected rather than yielding zero items")
}

// ---------------------------------------------------------------------------

console.log("gh-lib regression suite")
checkCapabilities()
checkKeys()
checkParse()
checkReflow()
checkClassifyAndPayload()
checkSyncDecision()
checkManifestGuards()

console.log(failures
  ? `\nRESULT: FAIL — ${failures} assertion(s) failed.`
  : "\nRESULT: PASS — the pure half of the GitHub integration behaved as specified.")
process.exit(failures ? 1 : 0)
