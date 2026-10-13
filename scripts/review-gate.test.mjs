#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Regression test for scripts/review-gate.mjs
//
//   node scripts/review-gate.test.mjs
//
// WHY THIS FILE EXISTS: the gate runner's whole value is that its stdout is
// ALWAYS exactly one valid Result envelope, on every path — success, failed
// claim, missing --checklist, malformed checklist JSON, unknown flag. A local
// auditor echoes that stdout verbatim as its final message, so one stray byte of
// prose, a missing `findings` array, or a `status: done` on a failed claim is
// the difference between a valid delegation Result and a rejected turn. This
// suite pins the contract:
//
//   1. the shipped F1-F5 checklist passes, and its envelope is valid
//   2. stdout is exactly one JSON object (no fence, no banner, no trailing text)
//   3. two runs of the same checklist are byte-identical (deterministic)
//   4. a claim that cannot hold -> exit 1, status blocked, blocker present
//   5. usage/config errors still yield a valid blocked envelope
//   6. --validate accepts the runner's own stdout, rejects broken envelopes
//   7. running the gate mutates nothing (the auditor is read-only)
//   8. checklist advisories reach findings[] without flipping status
//   9. --attest keeps the bulk out of the echo: a short attestation pointing at
//      the full envelope, which is itself valid
//  10. --verify re-hashes that artifact and rejects a paraphrased finding, a
//      corrupted sha256, a missing artifact file or a disagreeing check count,
//      while tolerating one fence, resolving a missing `artifact` pointer from
//      `task_id` and reporting a re-worded `summary` in `notes` (measured
//      reviewer behaviour: verdict/role/findings copy, prose does not)
//  11. --attest also leaves the working tree unchanged (its default artifact
//      path is gitignored scratch)
//  12. --attest refuses to overwrite a DIFFERING artifact (an artifact is
//      evidence and an attestation already points at it by hash) while an
//      unchanged one is rewritten harmlessly; --force overwrites deliberately
//  13. a suite run cannot invalidate an existing attestation: every --attest
//      case runs against scratch space via REVIEW_GATE_ATTEST_DIR, and the
//      shipped wip/review-gate/ directory is byte-identical before and after
//      the suite. (Measured regression: an earlier version of this suite
//      rewrote wip/review-gate/RV-F12345.envelope.json and orphaned two correct
//      reviewer attestations that pointed at its hash.)
//
// Deliberately NOT here: a case that runs the shipped F1-F5 checklist from
// inside the shipped F1-F5 checklist. That is infinite recursion, so the
// runner's own evidence is this suite's RESULT line, and the shipped checklist
// stays a list of claims about the change set under review.
//
// Exit 0 = every case matched. Exit 1 = at least one mismatch.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, "..")
const GATE = resolve(SCRIPT_DIR, "review-gate.mjs")
const SHIPPED_CHECKLIST = "scripts/test/fixtures/review/gate-f1-f5.claims.json"

let failures = 0
const fail = (msg) => {
  failures += 1
  console.log(`    FAIL  ${msg}`)
}
const ok = (msg) => console.log(`    ok    ${msg}`)

// The runner's default attestation directory (wip/review-gate) holds real
// evidence: an attestation points at an artefact by hash, so a test run that
// rewrote one would silently orphan a correct reviewer attestation (measured).
// REVIEW_GATE_ATTEST_DIR redirects the default path at scratch space, which is
// also how the two default-path cases below stay harmless.
const gate = (args, opts = {}) =>
  spawnSync(process.execPath, [GATE, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    ...opts,
    env: { ...process.env, REVIEW_GATE_ATTEST_DIR: ATTEST_SCRATCH, ...(opts.env || {}) },
  })

// The runner's own --validate is the envelope contract, so it is the oracle:
// the test cannot drift from the definition it pins.
const validateText = (text) => {
  const res = spawnSync(process.execPath, [GATE, "--validate", "-"], { cwd: ROOT, input: text, encoding: "utf8" })
  return { exit: res.status, verdict: JSON.parse(res.stdout) }
}

const expectValid = (text, label) => {
  const { exit, verdict } = validateText(text)
  if (verdict.valid && exit === 0) return ok(`${label}: envelope valid`)
  return fail(`${label}: envelope rejected — exit ${exit}, ${verdict.problems.join("; ")}`)
}

// stdout must be exactly one JSON object: the strictness is the point, so parse
// the whole string (trailing prose or a closing fence makes JSON.parse throw).
const expectSingleJsonObject = (stdout, label) => {
  if (stdout.includes("```")) return fail(`${label}: stdout contains a markdown fence`)
  let payload
  try {
    payload = JSON.parse(stdout.trim())
  } catch (err) {
    return fail(`${label}: stdout is not exactly one JSON object — ${err.message}`)
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return fail(`${label}: stdout is not a JSON object`)
  }
  return payload
}

const TMP = mkdtempSync(join(tmpdir(), "review-gate-test-"))

// Scratch space for every default-path --attest case (see `gate` above).
const ATTEST_SCRATCH = join(TMP, "attest-scratch")

const SHIPPED_ATTEST_DIR = resolve(ROOT, "wip/review-gate")
const dirSnapshot = (dir) => {
  if (!existsSync(dir)) return "(absent)"
  return readdirSync(dir)
    .sort()
    .map((name) => `${name} ${createHash("sha256").update(readFileSync(join(dir, name))).digest("hex")}`)
    .join("\n")
}
// Captured before any case runs; the shipped-artefact case compares afterwards.
const SHIPPED_BEFORE = dirSnapshot(SHIPPED_ATTEST_DIR)
const writeChecklist = (name, body) => {
  const path = join(TMP, name)
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body, null, 2))
  return path
}

// ---------------------------------------------------------------------------

function checkShippedGate() {
  console.log("shipped F1-F5 checklist")

  const first = gate(["--quiet"])
  if (first.status !== 0) {
    fail(`exit ${first.status}, expected 0 — a shipped-checklist failure means F1-F5 regressed: ${first.stderr.trim()}`)
    return
  }
  ok("exit 0")

  if (first.stderr !== "") fail(`--quiet still wrote to stderr: ${JSON.stringify(first.stderr.slice(0, 120))}`)
  else ok("--quiet leaves stderr empty")

  const envelope = expectSingleJsonObject(first.stdout, "shipped gate")
  if (!envelope) return
  ok("stdout is exactly one JSON object")
  expectValid(first.stdout, "shipped gate")

  if (envelope.task_id !== "RV-F12345") fail(`task_id ${JSON.stringify(envelope.task_id)}`)
  else ok("task_id RV-F12345")
  if (envelope.role !== "reviewer") fail(`role ${JSON.stringify(envelope.role)}`)
  if (envelope.status !== "done") fail(`status ${JSON.stringify(envelope.status)}, expected done`)
  else ok("status done")

  // checks[].length must equal the sum of the checklist's checks, so a claim
  // silently dropped from the checklist is caught here.
  const listed = JSON.parse(gate(["--list", "--quiet"]).stdout)
  const declared = listed.claims.reduce((n, c) => n + c.checks, 0)
  if (envelope.checks.length !== declared) fail(`checks ${envelope.checks.length}, expected ${declared}`)
  else ok(`${envelope.checks.length} checks, matching the checklist`)
  if (envelope.checks.some((c) => c.outcome !== "pass")) fail("a checks[] entry did not pass on the shipped checklist")

  // Advisories are findings that do not affect the status: a done gate may still
  // carry a reviewer's defect note, and the count must match the checklist.
  if (!Array.isArray(envelope.findings)) fail("findings is not an array")
  else if (envelope.findings.length !== listed.advisories) {
    fail(`${envelope.findings.length} findings, expected the checklist's ${listed.advisories} advisor(y/ies)`)
  } else {
    ok(`${envelope.findings.length} advisory finding(s), status still done`)
  }

  // Determinism: same checklist, same bytes. Evidence must be reproducible.
  const second = gate(["--quiet"])
  if (second.stdout === first.stdout) ok("second run is byte-identical")
  else fail("second run differs — the gate is not deterministic")

  // --task overrides the checklist's task_id.
  const overridden = gate(["--quiet", "--task", "T-OVERRIDE"])
  const payload = expectSingleJsonObject(overridden.stdout, "--task override")
  if (payload && payload.task_id === "T-OVERRIDE") ok("--task overrides the checklist task_id")
  else fail("--task did not override the envelope task_id")
}

function checkFailedClaims() {
  console.log("failed claims")

  const path = writeChecklist("negative.claims.json", {
    task_id: "T-BAD",
    role: "reviewer",
    title: "negative-control",
    claims: [
      {
        id: "B1",
        statement: "a claim that cannot hold",
        severity: "high",
        checks: [{ kind: "file_contains", path: "AGENTS.md", pattern: "THIS_STRING_IS_NOT_IN_AGENTS_MD" }],
      },
      {
        id: "B2",
        statement: "a file that is not there",
        severity: "medium",
        checks: [{ kind: "file_exists", path: "no/such/file.md" }],
      },
      {
        id: "B3",
        statement: "a command that fails",
        severity: "high",
        checks: [
          { kind: "command", run: "printf 'partial evidence\\n'; exit 3" },
          { kind: "command", run: "true" },
        ],
      },
    ],
  })

  const res = gate(["--checklist", path, "--quiet"])
  if (res.status !== 1) fail(`exit ${res.status}, expected 1`)
  else ok("exit 1")

  const envelope = expectSingleJsonObject(res.stdout, "failed-claim gate")
  if (!envelope) return
  expectValid(res.stdout, "failed-claim gate")

  if (envelope.status !== "blocked") fail(`status ${JSON.stringify(envelope.status)}, expected blocked`)
  else ok("status blocked")

  if (envelope.findings.length !== 3) fail(`${envelope.findings.length} findings, expected 3 (one per failing claim)`)
  else ok("3 findings, one per failing claim")
  for (const id of ["B1", "B2", "B3"]) {
    if (envelope.findings.some((f) => f.claim === id)) ok(`${id}: finding present`)
    else fail(`${id}: no finding`)
  }
  for (const finding of envelope.findings) {
    if (!["high", "medium", "low"].includes(finding.severity)) fail(`findings severity ${JSON.stringify(f.severity)}`)
  }
  if (!envelope.summary.includes("3")) fail(`summary does not report the failing claim count: ${envelope.summary}`)
  else ok(`summary: ${envelope.summary}`)

  const byClaim = {}
  envelope.findings.forEach((f) => {
    byClaim[f.claim] = f
  })
  const wanted = { B1: "high", B2: "medium", B3: "high" }
  Object.entries(wanted).forEach(([id, severity]) => {
    const finding = byClaim[id]
    if (!finding) fail(`${id}: no finding`)
    else if (finding.severity !== severity) fail(`${id}: severity ${finding.severity}, expected ${severity}`)
    else ok(`${id}: severity ${severity} preserved`)
  })

  const blocker = JSON.parse(envelope.blocker)
  if (blocker.type !== "validation_failed") fail(`blocker.type ${blocker.type}`)
  else if (!blocker.detail || !blocker.suggested_action) fail("blocker is missing detail or suggested_action")
  else ok("blocker decodes to validation_failed with detail + suggested_action")

  const findingsCount = envelope.findings.length
  const checksFailed = envelope.checks.filter((c) => c.outcome === "fail").length
  if (checksFailed === findingsCount) ok(`${findingsCount} findings for ${checksFailed} failed checks`)
  else fail(`${findingsCount} findings for ${checksFailed} failed checks`)
}

function checkUsageErrors() {
  console.log("usage and config errors")

  const cases = [
    { label: "missing checklist", argv: ["--checklist", "no/such/checklist.json"] },
    { label: "unknown flag", argv: ["--nope"] },
    { label: "checklist without a value", argv: ["--checklist"] },
    { label: "unparseable checklist", argv: ["--checklist", writeChecklist("broken.claims.json", "{ not json")] },
  ]

  for (const c of cases) {
    const res = gate([...c.argv, "--quiet"])
    if (res.status !== 1) fail(`${c.label}: exit ${res.status}, expected 1`)
    const envelope = expectSingleJsonObject(res.stdout, c.label)
    if (!envelope) continue
    if (envelope.status !== "blocked") fail(`${c.label}: status ${envelope.status}, expected blocked`)
    const { verdict } = validateText(res.stdout)
    if (!verdict.valid) fail(`${c.label}: envelope rejected — ${verdict.problems.join("; ")}`)
    else ok(`${c.label}: blocked envelope, valid`)
  }
}

function checkValidateMode() {
  console.log("--validate mode")

  const shipped = gate(["--quiet"])
  const accepted = validateText(shipped.stdout)
  if (accepted.verdict.valid && accepted.exit === 0) ok("accepts the runner's own stdout")
  else fail(`rejected the runner's own stdout: ${accepted.verdict.problems.join("; ")}`)

  const broken = [
    {
      label: "done with no checks and no findings",
      text: JSON.stringify({ task_id: "T9", role: "reviewer", status: "done", summary: "looks done" }),
    },
    {
      label: "blocked with no blocker",
      text: JSON.stringify({ task_id: "T9", role: "reviewer", status: "blocked", summary: "x", checks: [], findings: [] }),
    },
    {
      label: "blocker as prose, not a JSON string",
      text: JSON.stringify({
        task_id: "T9",
        role: "reviewer",
        status: "blocked",
        summary: "x",
        checks: [],
        findings: [],
        blocker: "scripts/fetch.sh not found",
      }),
    },
    {
      label: "prose before the JSON",
      text: `Here is my result:\n${JSON.stringify({
        task_id: "T9",
        role: "reviewer",
        status: "done",
        summary: "x",
        checks: [{ command: "x", outcome: "pass", evidence: "y" }],
        findings: [],
      })}`,
    },
    {
      label: "invalid check outcome",
      text: JSON.stringify({
        task_id: "T9",
        role: "reviewer",
        status: "done",
        summary: "x",
        checks: [{ command: "x", outcome: "ok", evidence: "y" }],
        findings: [],
      }),
    },
  ]

  for (const c of broken) {
    const { exit, verdict } = validateText(c.text)
    if (verdict.valid || exit !== 1) fail(`${c.label}: accepted (exit ${exit})`)
    else ok(`${c.label}: rejected`)
  }

  const missing = spawnSync(process.execPath, [GATE, "--validate", "no/such/result.json"], { cwd: ROOT, encoding: "utf8" })
  const verdict = JSON.parse(missing.stdout)
  if (!verdict.valid && missing.status === 1) ok("missing file: rejected")
  else fail("missing file was accepted")
}

function checkListMode() {
  console.log("--list mode")

  const res = gate(["--list"])
  if (res.status !== 0) return fail(`--list exit ${res.status}`)
  let payload
  try {
    payload = JSON.parse(res.stdout)
  } catch (err) {
    return fail(`--list stdout is not JSON: ${err.message}`)
  }
  if (!Array.isArray(payload.claims) || payload.claims.length < 10) {
    fail(`--list reported ${payload.claims ? payload.claims.length : 0} claims, expected the full shipped checklist`)
  } else {
    ok(`--list reports ${payload.claims.length} claims`)
  }
  if (payload.claims.some((c) => !c.id || !c.statement || typeof c.checks !== "number")) {
    fail("--list claim entries are missing id/statement/checks")
  } else {
    ok("every claim has an id, a statement and a check count")
  }
}

function checkReadOnly() {
  console.log("read-only invariant")
  const gitStatus = () => spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" })
  const before = gitStatus()
  if (before.status !== 0) return ok("skipped (git unavailable)")
  gate(["--quiet"])
  const after = gitStatus()
  if (after.stdout === before.stdout) ok("working tree unchanged by a gate run")
  else fail(`the gate modified the working tree:\n${after.stdout}`)

  // --attest writes its artifact to gitignored scratch by default, so it must
  // not dirty the working tree either. Earlier versions of this case deleted the
  // shipped artifact first and let --attest rewrite it — which invalidated any
  // attestation already pointing at its hash. The artifact now lands in
  // REVIEW_GATE_ATTEST_DIR (scratch, outside the repo), and the default path is
  // only asserted to be gitignored, never written.
  gate(["--attest", "--quiet"])
  const attested = gitStatus()
  if (attested.stdout === before.stdout) ok("working tree unchanged by an --attest run")
  else fail(`--attest modified the working tree:\n${attested.stdout}`)

  const ignored = spawnSync("git", ["check-ignore", "-q", "wip/review-gate/RV-F12345.envelope.json"], {
    cwd: ROOT,
    encoding: "utf8",
  })
  if (ignored.status === 0) ok("the default artifact path is gitignored scratch")
  else fail("wip/review-gate/RV-F12345.envelope.json is not gitignored")
}

// Case 13. The suite must not be able to damage evidence. Everything above runs
// against scratch space; this asserts the shipped evidence directory is exactly
// as it was, and that the default path really was redirected (a redirect that
// silently did nothing would otherwise look identical to a clean run).
function checkShippedArtefactsUntouched() {
  console.log("shipped attestation directory")
  if (existsSync(join(ATTEST_SCRATCH, "RV-F12345.envelope.json"))) {
    ok("default-path --attest cases landed in REVIEW_GATE_ATTEST_DIR, not wip/review-gate/")
  } else {
    fail("the default-path --attest cases did not run against REVIEW_GATE_ATTEST_DIR")
  }
  const after = dirSnapshot(SHIPPED_ATTEST_DIR)
  const count = after === "(absent)" ? 0 : after.split("\n").length
  if (after === SHIPPED_BEFORE) ok(`wip/review-gate/ is byte-identical after the suite (${count} file(s), ${SHIPPED_BEFORE === "(absent)" ? "directory absent" : `sha256 ${String(SHIPPED_BEFORE.split(" ")[1]).slice(0, 12)}…`})`)
  else fail(`the suite changed wip/review-gate/:\n  before: ${SHIPPED_BEFORE}\n  after:  ${after}`)
}

function checkAttestMode() {
  console.log("--attest mode")

  // Make sure the default artifact for the default task exists and is current:
  // the no-pointer case below resolves it from task_id. This lands in
  // REVIEW_GATE_ATTEST_DIR (scratch), never in the shipped wip/review-gate/.
  gate(["--attest", "--quiet"])

  const out = join(TMP, "attested.envelope.json")
  const res = gate(["--attest", "--out", out, "--quiet"])
  if (res.status !== 0) return fail(`--attest exit ${res.status}, expected 0`)

  const attestation = expectSingleJsonObject(res.stdout, "--attest")
  if (!attestation) return
  expectValid(res.stdout, "--attest attestation")

  if (attestation.checks !== undefined) fail("--attest printed checks[]: the bulk is meant to stay in the artifact")
  else ok("the attestation carries no checks[]")

  const artifact = attestation.artifact
  if (!artifact || typeof artifact !== "object") return fail("--attest printed no artifact pointer")
  ok(`artifact pointer: ${artifact.path} (${artifact.bytes} bytes, sha256 ${String(artifact.sha256).slice(0, 12)}…)`)

  // The whole point: the echo burden must shrink. If the attestation is not
  // substantially smaller than the file it points at, nothing was gained.
  const shortBytes = Buffer.byteLength(res.stdout)
  if (artifact.bytes <= shortBytes) {
    fail(`artifact ${artifact.bytes} bytes is not larger than the ${shortBytes}-byte attestation`)
  } else {
    ok(`echo burden ${shortBytes} bytes against ${artifact.bytes} in the artifact (${(artifact.bytes / shortBytes).toFixed(1)}x smaller)`)
  }

  // The artifact must be the full envelope, and still a valid one.
  expectValid(readFileSync(resolve(ROOT, artifact.path), "utf8"), "--attest artifact")

  const again = gate(["--attest", "--out", out, "--quiet"])
  if (again.stdout === res.stdout) ok("--attest is deterministic")
  else fail("--attest differs between runs")

  // --verify is the guarantee: it re-hashes the file the attestation names.
  const attPath = join(TMP, "attestation.json")
  writeFileSync(attPath, res.stdout)
  const verified = gate(["--verify", attPath, "--quiet"])
  const verdict = JSON.parse(verified.stdout)
  if (verified.status === 0 && verdict.valid) ok("--verify accepts the attestation it produced")
  else fail(`--verify rejected its own attestation: ${verdict.problems.join("; ")}`)

  // ...and it must reject every way a model could paraphrase it, which is the
  // failure this mode exists to catch.
  const tampers = [
    { label: "a paraphrased finding", edit: (a) => { a.findings[0].suggestion = "fix it" } },
    { label: "a corrupted sha256", edit: (a) => { a.artifact.sha256 = "0".repeat(64) } },
    { label: "an artifact path that does not exist", edit: (a) => { a.artifact.path = "wip/no-such-envelope.json" } },
    { label: "a check count that disagrees with the artifact", edit: (a) => { a.artifact.checks = 1 } },
  ]
  for (const t of tampers) {
    const copy = JSON.parse(res.stdout)
    t.edit(copy)
    const tamperedPath = join(TMP, `tampered-${tampers.indexOf(t)}.json`)
    writeFileSync(tamperedPath, JSON.stringify(copy, null, 2))
    const bad = gate(["--verify", tamperedPath, "--quiet"])
    const badVerdict = JSON.parse(bad.stdout)
    if (badVerdict.valid || bad.status !== 1) fail(`${t.label}: accepted (exit ${bad.status})`)
    else ok(`${t.label}: rejected — ${badVerdict.problems[0]}`)
  }

  // A model that copies the attestation exactly may still wrap it in a fence
  // (measured: a trailing ``` line). --verify tolerates one fence and reports
  // it, but the fence must not hide a paraphrase.
  const fencedPath = join(TMP, "fenced.json")
  writeFileSync(fencedPath, `\`\`\`json\n${res.stdout.trim()}\n\`\`\`\n`)
  const fenced = gate(["--verify", fencedPath, "--quiet"])
  const fencedVerdict = JSON.parse(fenced.stdout)
  if (fenced.status === 0 && fencedVerdict.valid && fencedVerdict.fenced === true) {
    ok("a wrapping fence is tolerated and reported (fenced: true)")
  } else {
    fail(`a wrapping fence was rejected: ${fencedVerdict.problems.join("; ")}`)
  }
  const fencedTamper = JSON.parse(res.stdout)
  fencedTamper.findings[0].severity = "high"
  writeFileSync(fencedPath, `\`\`\`json\n${JSON.stringify(fencedTamper, null, 2)}\n\`\`\``)
  const fencedBad = JSON.parse(gate(["--verify", fencedPath, "--quiet"]).stdout)
  if (fencedBad.valid) fail("a fence hid a paraphrased finding")
  else ok("a fence does not hide a paraphrased finding")

  // MEASURED reviewer shape (third run): task_id/role/status/findings copied
  // exactly, the non-canonical `artifact` key dropped and the prose `summary`
  // rewritten. Failing that would fail a correct audit, so --verify resolves the
  // artifact from task_id and reports the summary in `notes` — while still
  // comparing the fields a paraphrase would corrupt.
  const measured = JSON.parse(res.stdout)
  delete measured.artifact
  measured.summary = "17/17 claims verified; all checks pass. Full envelope written."
  const measuredPath = join(TMP, "measured.json")
  writeFileSync(measuredPath, JSON.stringify(measured, null, 2))
  const measuredVerdict = JSON.parse(gate(["--verify", measuredPath, "--quiet"]).stdout)
  if (measuredVerdict.valid && measuredVerdict.notes.some((n) => /summary/.test(n))) {
    ok("no pointer + reworded summary verifies (artifact resolved from task_id; summary in notes)")
  } else {
    fail(`the measured reviewer shape did not verify: ${JSON.stringify(measuredVerdict.problems)}`)
  }
  const measuredTamper = JSON.parse(measuredPath ? readFileSync(measuredPath, "utf8") : "{}")
  measuredTamper.findings[0].severity = "high"
  writeFileSync(measuredPath, JSON.stringify(measuredTamper, null, 2))
  const measuredBad = JSON.parse(gate(["--verify", measuredPath, "--quiet"]).stdout)
  if (!measuredBad.valid) ok("without a pointer, a paraphrased finding is still rejected")
  else fail("a paraphrase slipped through the task_id fallback")

  // An artifact is EVIDENCE, and an attestation already points at it by hash.
  // Rewriting it with different content would invalidate that attestation
  // silently (measured in practice: a later --attest to the default path made an
  // earlier, correct attestation fail --verify). So a differing artifact must
  // be refused unless --force overwrites deliberately.
  const immutable = join(TMP, "immutable.envelope.json")
  writeFileSync(immutable, '{"stale":true}\n')
  const refused = gate(["--attest", "--out", immutable, "--quiet"])
  const refusal = (() => {
    try {
      return JSON.parse(refused.stdout)
    } catch {
      return null
    }
  })()
  if (refused.status === 1 && refusal && refusal.status === "blocked" && /--force/.test(String(refusal.summary))) {
    ok("refuses to overwrite a differing artifact without --force")
  } else {
    fail(`expected a blocked refusal, got exit ${refused.status}: ${String(refused.stdout).slice(0, 120)}`)
  }
  if (readFileSync(immutable, "utf8") === '{"stale":true}\n') ok("the refused artifact is left untouched")
  else fail("the refused artifact was modified")
  const forced = gate(["--attest", "--out", immutable, "--force", "--quiet"])
  if (forced.status === 0 && JSON.parse(forced.stdout).artifact) ok("--force overwrites deliberately")
  else fail(`--force did not produce an attestation (exit ${forced.status})`)
  expectValid(readFileSync(immutable, "utf8"), "--attest --force artifact")
  const forcedVerify = JSON.parse(gate(["--verify", (() => {
    const p = join(TMP, "forced-attestation.json")
    writeFileSync(p, forced.stdout)
    return p
  })()], "--quiet").stdout)
  if (forcedVerify.valid) ok("the forced artifact re-hashes against a fresh attestation")
  else fail(`the forced attestation did not verify: ${forcedVerify.problems.join("; ")}`)
}

function checkShippedChecklistIsComplete() {
  console.log("shipped checklist sanity")
  const res = gate(["--list", "--checklist", SHIPPED_CHECKLIST])
  if (res.status !== 0) return fail(`shipped checklist is not loadable: ${res.stderr.trim()}`)
  ok(`shipped checklist loads (${SHIPPED_CHECKLIST})`)
}

// ---------------------------------------------------------------------------

console.log("review-gate regression suite")
checkShippedChecklistIsComplete()
checkShippedGate()
checkFailedClaims()
checkUsageErrors()
checkValidateMode()
checkListMode()
checkReadOnly()
checkAttestMode()
checkShippedArtefactsUntouched()
rmSync(TMP, { recursive: true, force: true })

console.log(failures ? `\nRESULT: FAIL — ${failures} assertion(s) failed.` : "\nRESULT: PASS — the gate runner honoured every envelope guarantee.")
process.exit(failures ? 1 : 0)
