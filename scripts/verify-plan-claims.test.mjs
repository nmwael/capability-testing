#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Regression test for scripts/verify-plan-claims.mjs
//
//   node scripts/verify-plan-claims.test.mjs
//
// The runner is offline by design (`--no-network`): the claims this suite pins
// are all decidable from the working tree and library/architect/stack-
// coordinates.mini.md, with no registry round-trip. That keeps the test
// deterministic in CI and on a disconnected box.
//
// WHY THIS FILE EXISTS: the fixtures used to live only in the gitignored
// `wip/` scratch dir. A subagent doing a code review rewrote two of them in
// place, and because they were untracked the damage was invisible to
// `git status` — the acceptance evidence silently degraded while still
// "passing". The fixtures are now committed, and this suite fails if the
// checker's verdict on any of them drifts.
//
// Exit 0 = every case matched. Exit 1 = at least one mismatch.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process"
import { existsSync, readdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, "..")
const CHECKER = resolve(SCRIPT_DIR, "verify-plan-claims.mjs")
const FIXTURES = resolve(SCRIPT_DIR, "test/fixtures/plans")

// Mirrors BLOCKING in scripts/verify-plan-claims.mjs. If the checker adds a
// blocking status, this suite must be updated deliberately — that is the point.
const BLOCKING = new Set(["MISSING", "REJECTED", "CONFLICT", "INSUFFICIENT"])

// Matching is intentional: a case fails if the blocking set differs by even one
// claim, in either direction. Fewer blockers than expected means the checker
// stopped catching a real defect; more means it started producing false
// positives on a legitimate plan (the clean fixture is the guard for that).
const CASES = [
  {
    fixture: "plan-rf-clean.md",
    why: "the corrected retrofit plan — a false positive here would block good plans",
    expectExit: 0,
    expectVerdict: "PASS",
    blockers: [],
  },
  {
    fixture: "plan-vague.md",
    why: "the architect's real vague plan — a test file named in a Check line that no subtask creates",
    expectExit: 1,
    expectVerdict: "FAIL",
    blockers: [{ status: "MISSING", matches: "test-frontend.bats" }],
  },
  {
    fixture: "plan-rf.md",
    why: "the canonical defect plan — a malformed scoped npm name and a forbidden KIE coordinate",
    expectExit: 1,
    expectVerdict: "FAIL",
    blockers: [
      { status: "MISSING", matches: "@types/vitejs/plugin-react" },
      { status: "CONFLICT", matches: "org.kie:kie-api:7.74.1.Final" },
    ],
  },
  {
    fixture: "plan-empty.md",
    why: "pins nothing — an unauditable plan must not read as clean",
    expectExit: 1,
    expectVerdict: "FAIL",
    blockers: [{ status: "INSUFFICIENT", matches: "the plan as a whole" }],
  },
]

let failures = 0
const fail = (msg) => {
  failures += 1
  console.log(`    FAIL  ${msg}`)
}
const ok = (msg) => console.log(`    ok    ${msg}`)

function runCase(c) {
  console.log(`\n${c.fixture} — ${c.why}`)
  const fixturePath = resolve(FIXTURES, c.fixture)

  if (!existsSync(fixturePath)) {
    fail(`fixture missing: ${fixturePath}`)
    return
  }

  const res = spawnSync(
    process.execPath,
    [CHECKER, "--plan", fixturePath, "--no-network", "--quiet"],
    { cwd: ROOT, encoding: "utf8" },
  )

  // The checker must be run from the repo root (it resolves paths against
  // process.cwd()), so a non-0/1 exit is itself a failure worth surfacing.
  if (res.status !== 0 && res.status !== 1) {
    fail(`checker exited ${res.status} (expected 0 or 1); stderr: ${res.stderr.trim()}`)
    return
  }
  if (res.status !== c.expectExit) {
    fail(`exit ${res.status}, expected ${c.expectExit}`)
  } else {
    ok(`exit ${res.status}`)
  }

  let payload
  try {
    payload = JSON.parse(res.stdout)
  } catch (err) {
    fail(`stdout is not JSON: ${err.message}`)
    return
  }

  if (payload.summary.verdict !== c.expectVerdict) {
    fail(`verdict ${payload.summary.verdict}, expected ${c.expectVerdict}`)
  } else {
    ok(`verdict ${payload.summary.verdict}`)
  }

  const got = payload.claims.filter((claim) => BLOCKING.has(claim.status))
  if (got.length !== c.blockers.length) {
    fail(`${got.length} blocking claim(s), expected ${c.blockers.length}`)
  }
  for (const expected of c.blockers) {
    const hit = got.find(
      (claim) =>
        claim.status === expected.status &&
        `${claim.source} ${claim.evidence}`.includes(expected.matches),
    )
    if (hit) {
      ok(`${expected.status} ${expected.matches}`)
    } else {
      fail(`no ${expected.status} claim mentioning '${expected.matches}'`)
    }
  }
  for (const claim of got) {
    const declared = c.blockers.some(
      (expected) =>
        claim.status === expected.status &&
        `${claim.source} ${claim.evidence}`.includes(expected.matches),
    )
    if (!declared) {
      fail(`unexpected blocking claim: [${claim.status}] ${claim.source} — ${claim.evidence}`)
    }
  }
}

// Every fixture on disk must have a case — otherwise a fixture can rot unwatched.
function checkCasesAreComplete() {
  const onDisk = readdirSync(FIXTURES)
    .filter((f) => f.endsWith(".md"))
    .sort()
  const named = CASES.map((c) => c.fixture).sort()
  const uncovered = onDisk.filter((f) => !named.includes(f))
  const missing = named.filter((f) => !onDisk.includes(f))
  console.log("fixture coverage")
  if (uncovered.length) fail(`fixture(s) on disk with no test case: ${uncovered.join(", ")}`)
  if (missing.length) fail(`test case(s) with no fixture on disk: ${missing.join(", ")}`)
  if (!uncovered.length && !missing.length) ok(`${onDisk.length} fixtures, all covered`)
}

// ---------------------------------------------------------------------------
// argument contract for the issue input path
//
// These cases never reach the network: each one is rejected by argv validation
// before any `gh` call, so the suite stays offline. The issue path's happy path
// is exercised against a live tracker rather than here — a test that needs a
// credential to pass does not belong in a suite that must run disconnected.
// ---------------------------------------------------------------------------
function checkArgContract() {
  console.log("\nargument contract (--issue)")
  const cases = [
    {
      argv: ["--plan", "x", "--issue", "5"],
      expectExit: 2,
      why: "--plan and --issue are mutually exclusive",
    },
    {
      argv: ["--issue", "abc"],
      expectExit: 2,
      why: "a non-numeric --issue is rejected rather than parsed as NaN",
    },
    {
      argv: ["--issue"],
      expectExit: 2,
      why: "a bare --issue is rejected rather than silently reading stdin",
    },
  ]
  for (const c of cases) {
    const res = spawnSync(process.execPath, [CHECKER, ...c.argv], { cwd: ROOT, encoding: "utf8" })
    if (res.status !== c.expectExit) {
      fail(`${c.why}: exit ${res.status}, expected ${c.expectExit} (stderr: ${res.stderr.trim().split("\n")[0] || ""})`)
    } else {
      ok(`${c.why} (exit ${res.status})`)
    }
  }
  // The help text must advertise the new input path, or the feature is
  // undiscoverable from the CLI.
  const help = spawnSync(process.execPath, [CHECKER, "--help"], { cwd: ROOT, encoding: "utf8" })
  const text = `${help.stdout || ""}${help.stderr || ""}`
  if (text.includes("--issue <n>")) ok("--help documents --issue")
  else fail("--help does not mention --issue")
}

console.log(`plan-claim checker regression suite — ${CASES.length} cases (offline)`)
checkCasesAreComplete()
for (const c of CASES) runCase(c)
checkArgContract()

console.log(
  failures
    ? `\nRESULT: FAIL — ${failures} assertion(s) failed.`
    : `\nRESULT: PASS — all ${CASES.length} cases matched.`,
)
process.exit(failures ? 1 : 0)
