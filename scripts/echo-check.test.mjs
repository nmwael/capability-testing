#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Regression test for scripts/echo-check.mjs
//
//   node scripts/echo-check.test.mjs
//
// WHY THIS FILE EXISTS: echo-check is the witness for the reviewer's verbatim
// contract ("my message IS the gate runner's stdout"). A witness that lies in
// either direction is worse than none: it would bless a paraphrased Result, or
// fail an exact one. The suite pins the whole verdict ladder against a synthetic
// session store, so it holds no opinion about the live reviewer session and
// never touches the real one:
//
//   E1  an exact copy                           -> byte-identical, exit 0
//   E2  the same bytes inside a ``` fence       -> identical-ignoring-fence, exit 0
//   E3  prose rewritten, verdict/findings same  -> findings-only, exit 1
//   E4  a finding changed                       -> differs, exit 1
//   E5  a session with no assistant text        -> exit 2
//   E6  a later assistant row with no text      -> the last TEXT row is used
//   E7  --find locates the session              -> exit 0, and 1 when absent
//   E8  --final captures the message under test -> the file holds the message
//   E9  --verify over a valid attestation       -> valid-attestation, exit 0
//   E10 --verify over a tampered attestation    -> invalid-attestation, exit 1
//   E11 usage: --help exits 0, an unknown flag exits 2
//   E12 the run leaves the session store byte-identical (read-only witness)
//
// Exit 0 = every case matched. Exit 1 = at least one mismatch.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(SCRIPT_DIR, "..")
const ECHO = resolve(SCRIPT_DIR, "echo-check.mjs")
const GATE = resolve(SCRIPT_DIR, "review-gate.mjs")

const TMP = mkdtempSync(join(tmpdir(), "echo-check-test-"))
const DB = join(TMP, "opencode.db")

let failures = 0
const fail = (msg) => {
  failures += 1
  console.log(`    FAIL  ${msg}`)
}
const ok = (msg) => console.log(`    ok    ${msg}`)

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex")
const run = (args) => spawnSync(process.execPath, [ECHO, ...args, "--json", "--db", DB], { cwd: ROOT, encoding: "utf8" })
const jsonOf = (res) => {
  try {
    return JSON.parse(res.stdout)
  } catch (err) {
    return { parse_error: err.message, stdout: res.stdout, stderr: res.stderr }
  }
}

// ---------------------------------------------------------------------------
// the fixture: one store, one expected stdout, one artifact
// ---------------------------------------------------------------------------

const ENVELOPE = {
  task_id: "T9",
  role: "reviewer",
  status: "done",
  summary: "one command, one finding",
  checks: [{ command: "true", outcome: "pass", evidence: "exit 0" }],
  findings: [{ severity: "low", path: "opencode.json:110", issue: "an advisory", suggestion: "leave as is" }],
}
const EXPECTED_FILE = join(TMP, "expected.json")
writeFileSync(EXPECTED_FILE, JSON.stringify(ENVELOPE))
const EXPECTED = readFileSync(EXPECTED_FILE, "utf8")

const FENCED = `\`\`\`json\n${EXPECTED}\n\`\`\``
const TAIL_FENCED = `${EXPECTED}\n\`\`\`` // the measured shape: a bare trailing fence
const PROSE_REWRITTEN = JSON.stringify({ ...ENVELOPE, summary: "I word this my own way." })
const FINDING_CHANGED = JSON.stringify({ ...ENVELOPE, findings: [{ severity: "high", path: "x", issue: "changed", suggestion: "x" }] })

// A valid attestation pointing at a real artifact file, and a tampered twin.
const ARTIFACT = join(TMP, "T9.envelope.json")
writeFileSync(ARTIFACT, JSON.stringify(ENVELOPE))
const ARTIFACT_BUF = readFileSync(ARTIFACT)
const POINTER = { path: ARTIFACT, sha256: sha256(ARTIFACT_BUF), bytes: ARTIFACT_BUF.length, checks: 1 }
const ATTESTATION = JSON.stringify({ ...ENVELOPE, summary: "my own prose", artifact: POINTER })
const TAMPERED = JSON.stringify({
  ...ENVELOPE,
  summary: "my own prose",
  artifact: POINTER,
  findings: [{ severity: "high", path: "x", issue: "not what the artifact says", suggestion: "none" }],
})

const db = new DatabaseSync(DB)
db.exec("create table session_message (session_id text, type text, data text, seq integer)")
const insert = db.prepare("insert into session_message (session_id, type, data, seq) values (?, ?, ?, ?)")
let seq = 0
const row = (sid, type, payload) => insert.run(sid, type, JSON.stringify(payload), (seq += 1))
const assistant = (sid, text) => row(sid, "assistant", { agent: "reviewer", model: { id: "granite-4.2-3b" }, content: [{ type: "text", text }] })

row("ses_match", "user", { text: "please review the retrofit" })
assistant("ses_match", EXPECTED)
assistant("ses_fenced", FENCED)
assistant("ses_tail_fenced", TAIL_FENCED)
assistant("ses_prose", PROSE_REWRITTEN)
assistant("ses_changed", FINDING_CHANGED)
row("ses_empty", "user", { text: "no answer yet" })
assistant("ses_attest", ATTESTATION)
assistant("ses_tampered", TAMPERED)
// The last assistant row of ses_textfree carries a tool call only: no text part.
// echo-check must walk back to the previous row that does have text.
row("ses_textfree", "user", { text: "one question" })
assistant("ses_textfree", EXPECTED)
row("ses_textfree", "assistant", { agent: "reviewer", content: [{ type: "tool", name: "bash", input: "true" }] })
db.close()

const DB_DIGEST_BEFORE = sha256(readFileSync(DB))

// ---------------------------------------------------------------------------
// cases
// ---------------------------------------------------------------------------

function checkExact() {
  const res = run(["ses_match", "--expect-file", EXPECTED_FILE])
  const r = jsonOf(res)
  if (res.status !== 0) return fail(`exact copy: exit ${res.status}, expected 0 (${res.stderr.trim()})`)
  if (r.verdict !== "byte-identical") return fail(`exact copy: verdict ${JSON.stringify(r.verdict)}`)
  if (r.byte_identical !== true) return fail("exact copy: byte_identical was not true")
  if (r.agent !== "reviewer") return fail(`exact copy: agent ${JSON.stringify(r.agent)}`)
  ok("an exact copy is byte-identical (exit 0)")
}

function checkTextFreeRow() {
  const res = run(["ses_textfree", "--expect-file", EXPECTED_FILE])
  const r = jsonOf(res)
  if (res.status !== 0 || r.verdict !== "byte-identical") {
    return fail(`text-free last row: exit ${res.status}, verdict ${JSON.stringify(r.verdict)} (expected the last TEXT row)`)
  }
  ok("a trailing text-free assistant row is skipped (last text row wins)")
}

function checkFenced() {
  for (const [sid, label] of [
    ["ses_fenced", "a full fence"],
    ["ses_tail_fenced", "a bare trailing fence"],
  ]) {
    const res = run([sid, "--expect-file", EXPECTED_FILE])
    const r = jsonOf(res)
    if (res.status !== 0) {
      fail(`${label}: exit ${res.status}, expected 0`)
    } else if (r.verdict !== "identical-ignoring-fence") {
      fail(`${label}: verdict ${JSON.stringify(r.verdict)}`)
    } else if (r.fenced !== true) {
      fail(`${label}: fenced was not true`)
    } else {
      ok(`${label}: identical once removed (exit 0)`)
    }
  }
}

function checkProse() {
  const res = run(["ses_prose", "--expect-file", EXPECTED_FILE])
  const r = jsonOf(res)
  if (res.status !== 1) return fail(`rewritten prose: exit ${res.status}, expected 1`)
  if (r.verdict !== "findings-only") return fail(`rewritten prose: verdict ${JSON.stringify(r.verdict)}, expected "findings-only"`)
  if (r.findings_match !== true) return fail("rewritten prose: findings_match was not true")
  ok("a rewritten summary is findings-only, NOT an exact echo (exit 1)")
}

function checkChangedFinding() {
  const res = run(["ses_changed", "--expect-file", EXPECTED_FILE])
  const r = jsonOf(res)
  if (res.status !== 1) return fail(`changed finding: exit ${res.status}, expected 1`)
  if (r.verdict !== "differs") return fail(`changed finding: verdict ${JSON.stringify(r.verdict)}, expected "differs"`)
  if (r.findings_match !== false) return fail("changed finding: findings_match was not false")
  ok("a changed finding is a plain diff (exit 1)")
}

function checkEmpty() {
  const res = run(["ses_empty", "--expect-file", EXPECTED_FILE])
  if (res.status !== 2) return fail(`no assistant text: exit ${res.status}, expected 2`)
  if (!res.stderr.includes("no assistant text message")) fail(`no assistant text: stderr ${JSON.stringify(res.stderr)}`)
  else ok("a session with no assistant text exits 2")
}

function checkFind() {
  const res = run(["--find", "retrofit", "--json"])
  const r = jsonOf(res)
  if (res.status !== 0) return fail(`--find: exit ${res.status}, expected 0`)
  if (!Array.isArray(r.sessions) || r.sessions.length !== 1 || r.sessions[0] !== "ses_match") {
    return fail(`--find: sessions ${JSON.stringify(r.sessions)}, expected ["ses_match"]`)
  }
  ok("--find located exactly the session that mentions the needle")
  const none = run(["--find", "no-such-needle-anywhere"])
  if (none.status !== 1) fail(`--find with no hit: exit ${none.status}, expected 1`)
  else ok("--find exits 1 when nothing matches")
}

function checkFinal() {
  const out = join(TMP, "captured.json")
  const res = run(["ses_fenced", "--expect-file", EXPECTED_FILE, "--final", out])
  if (res.status !== 0) return fail(`--final: exit ${res.status}, expected 0`)
  if (!existsSync(out)) return fail("--final did not write the file")
  const text = readFileSync(out, "utf8")
  if (text !== FENCED) return fail(`--final captured ${text.length} bytes, expected the raw message (${FENCED.length})`)
  ok("--final captured the raw message under test")
}

function checkVerify() {
  const res = run(["ses_attest", "--verify"])
  const r = jsonOf(res)
  const problems = r.verify && r.verify.problems ? r.verify.problems.join("; ") : res.stderr.trim()
  if (res.status !== 0) return fail(`--verify valid: exit ${res.status}, expected 0 (${problems})`)
  if (!r.verify || r.verify.valid !== true) return fail(`--verify valid: ${JSON.stringify(r.verify)}`)
  if (r.verdict !== "valid-attestation") return fail(`--verify valid: verdict ${JSON.stringify(r.verdict)}`)
  ok(`--verify accepted the attestation (${r.verify.sha256.slice(0, 12)}..., ${r.verify.checks} check)`)
}

function checkVerifyTampered() {
  const res = run(["ses_tampered", "--verify"])
  const r = jsonOf(res)
  if (res.status !== 1) return fail(`--verify tampered: exit ${res.status}, expected 1`)
  if (!r.verify || r.verify.valid !== false) return fail("--verify tampered: verdict was not invalid")
  if (r.verdict !== "invalid-attestation") return fail(`--verify tampered: verdict ${JSON.stringify(r.verdict)}`)
  if (!(r.verify.problems || []).some((p) => p.startsWith("findings:"))) {
    return fail(`--verify tampered: expected a findings problem, got ${JSON.stringify(r.verify.problems)}`)
  }
  ok("--verify rejected the tampered finding (exit 1)")
}

function checkUsage() {
  const help = run(["--help"])
  if (help.status !== 0 || !help.stdout.includes("usage: node scripts/echo-check.mjs")) fail(`--help: exit ${help.status}`)
  else ok("--help exits 0 with usage")
  const unknown = run(["--nope"])
  if (unknown.status !== 2) fail(`unknown flag: exit ${unknown.status}, expected 2`)
  else ok("an unknown flag exits 2")
  const bare = run([])
  if (bare.status !== 2) fail(`no session id: exit ${bare.status}, expected 2`)
  else ok("a missing session id exits 2")
}

// ---------------------------------------------------------------------------

console.log("echo-check regression suite")
{
  const list = spawnSync(process.execPath, [GATE, "--list"], { cwd: ROOT, encoding: "utf8" })
  if (list.status !== 0) fail("the shipped gate checklist is not loadable (--verify's oracle)")
  else ok("the shipped gate checklist loads (--verify's oracle)")
}
checkExact()
checkTextFreeRow()
checkFenced()
checkProse()
checkChangedFinding()
checkEmpty()
checkFind()
checkFinal()
checkVerify()
checkVerifyTampered()
checkUsage()
{
  const after = sha256(readFileSync(DB))
  if (after === DB_DIGEST_BEFORE) ok("the session store is byte-identical after every case")
  else fail("a case mutated the session store (echo-check must be a read-only witness)")
}

rmSync(TMP, { recursive: true, force: true })

console.log(failures ? `\nRESULT: FAIL — ${failures} assertion(s) failed.` : "\nRESULT: PASS — echo-check honoured every verdict it claims.")
process.exit(failures ? 1 : 0)
