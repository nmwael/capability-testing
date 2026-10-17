#!/usr/bin/env node
// review-gate.mjs — run a declared checklist and emit ONE raw JSON Result
// envelope, so the envelope is machine-produced and valid by construction.
//
// WHY THIS EXISTS: a small local auditor — granite-4.2-3b when these failures
// were measured, whatever bounded model the stack now sets — reads files and
// runs commands well enough, but it cannot reliably AUTHOR the `Result` envelope.
// Over five reviewer-gate attempts on one change set it produced: prose before
// the JSON, an unterminated object (a nested `]` and no closing `}`), an
// invalid `action: "read"` artifact, no `findings` array at all, and one empty
// final message after its output budget was entirely consumed by reasoning.
// Envelope authoring is mechanical, so it is taken away from the model: the
// auditor runs this script and its stdout — and only its stdout — is the
// envelope. The auditor still judges; it just no longer transcribes.
//
// --attest, WHY IT EXISTS: taking envelope AUTHORING away from the model was
// not enough. Asked to echo an ~11.5 KB envelope (37 checks, the checklist has
// since grown to ~21.7 KB / 69 checks) verbatim the
// auditor still recomposed it — dropping 5 checks, truncating 21 evidence
// strings, altering a path and inventing 2 checks, then wrapping the JSON in a
// fence — because copying ~3k tokens byte-exactly is beyond it. So the bulk is
// taken away: --attest writes the whole envelope (checks[] included) to a file
// and prints an attestation under 2 KB carrying that file's path, size and
// sha256, plus the findings. --verify then re-hashes the file.
//
// MEASURED, and why --verify does not demand byte-identity: on the pinned 3B
// reviewer the message came out byte-identical once, fenced once, and — third
// run — with an invented `summary` and the `artifact` key dropped, while
// task_id/role/status/findings were copied exactly every time. So --verify
// compares the fields a paraphrase would corrupt (status, role, findings, and
// every claimed pointer field), resolves a missing pointer from task_id, and
// REPORTS a re-worded summary instead of pretending prose survives an echo.
// Prose was never the review; the findings are.
//
// The checklist is data, not code: a JSON file naming claims and the checks
// that substantiate them. Nothing here is reviewer-specific — the checklist
// declares its own `role`, so any role's envelope can be produced the same way.
//
// --issue, WHY IT EXISTS: an attestation that lives in gitignored scratch
// (`wip/review-gate/`) is invisible to the human and dies with the container.
// The tracker is now GitHub, so `--attest --issue <n>` posts the SAME envelope
// as a comment on issue <n> and prints an attestation whose `artifact.path` is
// `github:<owner>/<repo>#issuecomment-<id>`. Because the comment body is
// delimited by two fixed markers, a verifier extracts the envelope
// byte-exactly and the sha256 is unchanged from the file mode — the same
// envelope hashed either way. `--verify` dispatches on the `github:` scheme and
// fetches the comment through `gh`, so the paraphrase check survives the move
// off local disk. This is the ONLY network path in this file; every existing
// file-based run stays offline and unaffected.
//
// stdout  exactly one JSON object: the Result envelope. The only exceptions are
//         the explicitly requested --help and --list modes.
// stderr  progress and diagnostics, silenced by --quiet.
//
// Exit status
//   0  every claim passed                        -> Result.status = "done"
//   1  a claim failed, or a usage/config error   -> Result.status = "blocked"
//      (a usage error still prints an envelope, so the caller always gets a
//       well-formed Result to return)
//
// Usage
//   node scripts/review-gate.mjs --task RV-F12345
//   node scripts/review-gate.mjs --checklist scripts/test/fixtures/review/gate-f1-f5.claims.json
//   node scripts/review-gate.mjs --attest [--out <path>]  # full envelope to a file,
//                                                         # short attestation on stdout
//   node scripts/review-gate.mjs --verify result.json     # hash-check an attestation
//   node scripts/review-gate.mjs --list                  # claim ids + statements
//   node scripts/review-gate.mjs --validate result.json  # shape-check an envelope
//
// Environment
//   REVIEW_GATE_ATTEST_DIR  overrides the default attestation directory
//                           (wip/review-gate). Point it at scratch space to run
//                           the default path without disturbing a real artefact.
//
// Checklist shape
//   {
//     "task_id": "RV-F12345",          // default task id; --task overrides
//     "role": "reviewer",              // envelope role (default "reviewer")
//     "title": "F1-F5 change set",
//     "claims": [
//       { "id": "K1", "statement": "...", "severity": "high",
//         "checks": [
//           { "kind": "command", "run": "node ...", "expect_exit": 0,
//             "expect_stdout": "regex", "cite": "AGENTS.md:82" },
//           { "kind": "file_exists", "path": "AGENTS.md" },
//           { "kind": "file_contains", "path": "AGENTS.md", "pattern": "regex",
//             "flags": "i", "min": 1 },
//           { "kind": "file_not_contains", "path": "...", "pattern": "regex" }
//         ] }
//     ]
//   }

import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { spawnSync } from "node:child_process"
import { resolve, dirname, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"
import { requireAuth, repoSlug, createIssueComment, listIssueComments, getIssueComment } from "./gh-run.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")
const DEFAULT_CHECKLIST = "scripts/test/fixtures/review/gate-f1-f5.claims.json"
const COMMAND_TIMEOUT_MS = 180000
const EVIDENCE_MAX = 220
const ENVELOPE_ROLES_NEEDING_FINDINGS = ["reviewer", "fact-checker"]
// Where --attest writes by default, and where --verify resolves a message whose
// `artifact` pointer is missing. Overridable so a test or CI run can exercise
// the default path without touching a real artefact: rewriting one invalidates
// every attestation already pointing at its hash. Measured in practice — this
// suite's own `--attest` case rewrote wip/review-gate/RV-F12345.envelope.json
// and orphaned two correct reviewer attestations.
const ATTEST_DIR = process.env.REVIEW_GATE_ATTEST_DIR || "wip/review-gate"

const USAGE = `usage: node scripts/review-gate.mjs [--task <id>] [--checklist <path>] [--quiet]
       node scripts/review-gate.mjs --attest [--out <path> | --issue <n>] [--task <id>]
       node scripts/review-gate.mjs --list [--checklist <path>]
       node scripts/review-gate.mjs --validate <file|->
       node scripts/review-gate.mjs --verify <file|-> [--issue <n>]

  --task <id>         envelope task_id (default: the checklist's task_id)
  --checklist <path>  checklist JSON (default: ${DEFAULT_CHECKLIST})
  --quiet             no progress on stderr
  --list              print claim ids and statements as JSON, run nothing
  --attest            run the gate, WRITE the full envelope to a file and print a
                      short attestation (its path, bytes and sha256) instead, so
                      the caller echoes ~1 KB rather than the whole envelope
  --issue <n>         with --attest: post the full envelope as a comment on
                      issue <n> instead of writing a file, and point the
                      attestation at that comment (artifact.path =
                      github:<repo>#issuecomment-<id>)
                      with --verify: resolve a message's missing 'artifact'
                      pointer from the newest envelope comment on issue <n>
  --out <path>        where --attest writes the full envelope
                      (default: ${ATTEST_DIR}/<task_id>.envelope.json)
  --force             with --attest, overwrite an existing artifact whose
                      content differs. Refused by default: an artifact is
                      evidence, and rewriting it invalidates any attestation
                      already pointing at its hash
  --validate <file>   read a Result envelope from <path> ('-' = stdin) and
                      report {"valid":bool,"problems":[...]}
  --verify <file>     read a reviewer's message, re-hash the artifact it points
                      at, and report whether status/role/findings match that
                      envelope. The pointer may be a local file OR a
                      github:<repo>#issuecomment-<id> comment. One wrapping
                      markdown fence is tolerated ({fenced:true}); a message
                      with no 'artifact' pointer resolves the default artifact
                      from its task_id (or, with --issue, from that issue), and
                      a re-worded 'summary' is reported in notes rather than
                      treated as load-bearing
  --help              this text (stdout)

Environment
  REVIEW_GATE_ATTEST_DIR  default attestation directory (default:
                          ${ATTEST_DIR}). Point it at scratch space to exercise
                          the default path without disturbing a real artifact.
                          Superseded by --issue, which keeps the artifact in the
                          tracker instead.

stdout is exactly one JSON Result object on every normal run.`

// ---------------------------------------------------------------------------
// tiny helpers
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    task: null,
    checklist: DEFAULT_CHECKLIST,
    quiet: false,
    list: false,
    validate: undefined,
    verify: undefined,
    attest: false,
    out: null,
    force: false,
    issue: null,
    help: false,
    problem: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const takeValue = () => {
      if (i + 1 >= argv.length) return null
      i += 1
      return argv[i]
    }
    if (arg === "--task") {
      const v = takeValue()
      if (v === null) opts.problem = opts.problem || "--task needs a value"
      else opts.task = v
    } else if (arg === "--checklist") {
      const v = takeValue()
      if (v === null) opts.problem = opts.problem || "--checklist needs a path"
      else opts.checklist = v
    } else if (arg === "--validate") {
      const v = takeValue()
      if (v === null) opts.problem = opts.problem || "--validate needs a file"
      else opts.validate = v
    } else if (arg === "--verify") {
      const v = takeValue()
      if (v === null) opts.problem = opts.problem || "--verify needs a file"
      else opts.verify = v
    } else if (arg === "--attest") {
      opts.attest = true
    } else if (arg === "--force") {
      opts.force = true
    } else if (arg === "--out") {
      const v = takeValue()
      if (v === null) opts.problem = opts.problem || "--out needs a path"
      else opts.out = v
    } else if (arg === "--issue") {
      const v = takeValue()
      if (v === null || !/^\d+$/.test(String(v))) {
        opts.problem = opts.problem || "--issue needs a positive integer"
      } else {
        opts.issue = Number(v)
      }
    } else if (arg === "--quiet") {
      opts.quiet = true
    } else if (arg === "--list") {
      opts.list = true
    } else if (arg === "--help" || arg === "-h") {
      opts.help = true
    } else {
      opts.problem = opts.problem || `unknown argument '${arg}'`
    }
  }
  if (opts.out && !opts.attest) opts.problem = opts.problem || "--out only applies with --attest"
  if (opts.out && opts.issue) opts.problem = opts.problem || "--out and --issue are mutually exclusive (the envelope goes either to a file or to an issue, not both)"
  if (opts.issue && !opts.attest && opts.verify === undefined) {
    opts.problem = opts.problem || "--issue applies to --attest or --verify"
  }
  return opts
}

function resolveUnderRoot(p) {
  return isAbsolute(p) ? p : resolve(ROOT, p)
}

function clip(s, n = EVIDENCE_MAX) {
  const flat = String(s).replace(/\s+/g, " ").trim()
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat
}

function firstLine(s) {
  return (
    String(s || "")
      .split("\n")
      .find((l) => l.trim()) || ""
  )
}

function emit(envelope) {
  process.stdout.write(`${JSON.stringify(envelope, null, 2)}\n`)
}

// Uniform per-check outcome.
function result(command, passed, evidence, detail, path = null, line = 0) {
  return {
    command,
    outcome: passed ? "pass" : "fail",
    evidence,
    failed: !passed,
    detail,
    path,
    line,
  }
}

// ---------------------------------------------------------------------------
// one check
// ---------------------------------------------------------------------------

function runCheck(check, log) {
  const kind = check && check.kind
  const label = kind === "command" ? `command ${clip(check.run, 90)}` : `${kind} ${check.path}`
  log(`    check  ${label}`)

  if (kind === "command") {
    const res = spawnSync("/bin/sh", ["-c", check.run], {
      cwd: ROOT,
      encoding: "utf8",
      timeout: check.timeout_ms || COMMAND_TIMEOUT_MS,
    })
    const exit = res.status === null ? -1 : res.status
    const expectExit = check.expect_exit === undefined ? 0 : check.expect_exit
    const stdout = res.stdout || ""
    const stderr = res.stderr || ""
    const reasons = []
    if (exit !== expectExit) reasons.push(`exit ${exit}, expected ${expectExit}`)
    if (check.expect_stdout) {
      let re = null
      try {
        re = new RegExp(check.expect_stdout)
      } catch (err) {
        reasons.push(`bad expect_stdout regex: ${err.message}`)
      }
      if (re && !re.test(stdout)) reasons.push(`stdout does not match /${check.expect_stdout}/`)
    }
    const cite = typeof check.cite === "string" ? check.cite.split(":") : null
    const seen = firstLine(stdout) || firstLine(stderr) || "(no output)"
    const evidence =
      reasons.length === 0
        ? `exit ${exit}${firstLine(stdout) ? ` · ${clip(firstLine(stdout), 150)}` : ""}`
        : `${reasons.join("; ")}; got: ${clip(seen, 140)}`
    return result(
      check.run,
      reasons.length === 0,
      evidence,
      reasons.join("; "),
      cite ? cite[0] : null,
      cite && cite.length > 1 ? Number(cite[cite.length - 1]) || 0 : 0,
    )
  }

  if (kind === "file_exists") {
    const full = resolveUnderRoot(check.path)
    const present = existsSync(full) && statSync(full).isFile()
    return result(
      `file_exists ${check.path}`,
      present,
      present ? `${check.path} exists` : `${check.path} is MISSING`,
      `${check.path} not found`,
      check.path,
      0,
    )
  }

  if (kind === "file_contains" || kind === "file_not_contains") {
    const path = check.path
    const full = resolveUnderRoot(path)
    const command = `${kind} ${path} /${check.pattern}/`
    if (!existsSync(full)) {
      return result(command, false, `${path} is MISSING`, `${path} not found`, path, 0)
    }
    let re = null
    try {
      // `g`/`y` make RegExp.test stateful across calls; strip them.
      re = new RegExp(check.pattern, String(check.flags || "").replace(/[gy]/g, ""))
    } catch (err) {
      return result(command, false, `bad pattern regex: ${err.message}`, `invalid regex /${check.pattern}/`, path, 0)
    }
    const wantMatch = kind === "file_contains"
    const min = check.min === undefined ? 1 : check.min
    const source = readFileSync(full, "utf8")
    const hits = []
    if (check.whole_file) {
      // Whole-file regex: needed when a claim only holds across lines (e.g. a
      // frontmatter block whose `- action: edit` is followed by `effect: deny`).
      let whole = null
      try {
        re = new RegExp(check.pattern, String(check.flags || "").replace(/[gy]/g, ""))
      } catch (err) {
        return result(command, false, `bad pattern regex: ${err.message}`, `invalid regex /${check.pattern}/`, path, 0)
      }
      const m = re.exec(source)
      if (m) {
        hits.push({
          line: source.slice(0, m.index).split("\n").length,
          text: m[0],
        })
      }
    } else {
      source.split("\n").forEach((text, i) => {
        if (re.test(text)) hits.push({ line: i + 1, text })
      })
    }
    const passed = wantMatch ? hits.length >= min : hits.length === 0
    let evidence
    let detail
    if (wantMatch) {
      evidence = passed
        ? `${path}:${hits[0].line}: ${clip(hits[0].text, 120)}${hits.length > 1 ? ` (+${hits.length - 1} more)` : ""}`
        : `${path}: /${check.pattern}/ matched ${hits.length}×, expected at least ${min}`
      detail = `expected /${check.pattern}/ in ${path}`
    } else {
      evidence = passed
        ? `${path}: /${check.pattern}/ absent, as required`
        : `${path}:${hits[0].line}: forbidden /${check.pattern}/ — ${clip(hits[0].text, 110)}`
      detail = `expected /${check.pattern}/ to be absent from ${path}`
    }
    return result(command, passed, evidence, detail, path, hits.length ? hits[0].line : 0)
  }

  return result(
    `${String(kind)} ${check && check.path ? check.path : ""}`.trim(),
    false,
    `unknown check kind '${kind}'`,
    `unsupported check kind '${kind}'`,
    check && check.path ? check.path : null,
    0,
  )
}

// ---------------------------------------------------------------------------
// envelope assembly
// ---------------------------------------------------------------------------

function buildEnvelope(checklist, taskId, claimResults) {
  const checks = []
  const findings = []
  const failedIds = []

  claimResults.forEach((entry) => {
    const claim = entry.claim
    let claimFailed = false
    entry.results.forEach((r) => {
      checks.push({ claim: claim.id, command: r.command, outcome: r.outcome, evidence: r.evidence })
      if (!r.failed) return
      claimFailed = true
      findings.push({
        severity: claim.severity || "high",
        claim: claim.id,
        path: r.path || "(command)",
        line: r.line || 0,
        issue: `${claim.statement} — ${r.detail}`,
        suggestion: claim.suggestion || `make the claim true, then re-run the gate`,
      })
    })
    if (claimFailed) failedIds.push(claim.id)
  })

  const total = claimResults.length
  const passed = total - failedIds.length
  const status = failedIds.length === 0 ? "done" : "blocked"
  const title = checklist.title || "declared checklist"
  const summary =
    status === "done"
      ? `${passed}/${total} ${title} claims verified; every check shows live command output or a path:line match.`
      : `${passed}/${total} ${title} claims verified; ${failedIds.length} failed: ${failedIds.join(", ")}.`

  const envelope = {
    task_id: taskId,
    role: checklist.role || "reviewer",
    status,
    summary,
    checks,
    findings,
  }
  // Advisories are review findings the mechanical checks cannot express (e.g. a
  // rule that reads as a control but is inert). They never change the status:
  // the checklist's checks decide "done" vs "blocked", and an advisory rides
  // along as a finding on either.
  const advisories = Array.isArray(checklist.advisories) ? checklist.advisories : []
  advisories.forEach((a) => {
    findings.push({
      severity: a.severity || "low",
      claim: a.claim || "(advisory)",
      path: a.path || "(checklist)",
      line: a.line || 0,
      issue: a.issue,
      suggestion: a.suggestion,
    })
  })
  if (status !== "done") {
    envelope.blocker = JSON.stringify({
      type: "validation_failed",
      detail: `${failedIds.length} of ${total} gate claims failed: ${failedIds.join(", ")}`,
      suggested_action: "revise_plan",
    })
  }
  return envelope
}

function blockedEnvelope(taskId, role, detail, type = "tool_error", path = DEFAULT_CHECKLIST) {
  return {
    task_id: taskId || "(unknown)",
    role,
    status: "blocked",
    summary: `Cannot run the gate: ${detail}`,
    checks: [],
    findings: [
      {
        severity: "high",
        claim: "(gate runner)",
        path,
        line: 0,
        issue: detail,
        suggestion: "pass a readable --checklist, or repair the checklist JSON, then re-run",
      },
    ],
    blocker: JSON.stringify({ type, detail, suggested_action: "ask_human" }),
  }
}

// ---------------------------------------------------------------------------
// --attest mode: the full envelope goes to a file, a short attestation to stdout
// ---------------------------------------------------------------------------

function sha256Hex(body) {
  return createHash("sha256").update(body).digest("hex")
}

function safeName(taskId) {
  return String(taskId || "(unknown)").replace(/[^A-Za-z0-9._-]/g, "_")
}

// The attestation is a valid Result envelope in its own right (role-appropriate
// findings included) that replaces checks[] with an `artifact` pointer. The
// pointer is what makes paraphrase detectable: --verify re-hashes the file.
function attestEnvelope(full, artifactPath, body) {
  const artifact = {
    path: artifactPath,
    sha256: sha256Hex(body),
    bytes: Buffer.byteLength(body),
    checks: Array.isArray(full.checks) ? full.checks.length : 0,
  }
  const attestation = {
    task_id: full.task_id,
    role: full.role,
    status: full.status,
    summary: `${full.summary} Full envelope: ${artifactPath} (${artifact.checks} checks, ${artifact.bytes} bytes, sha256 ${artifact.sha256.slice(0, 12)}…).`,
    artifact,
    findings: full.findings,
  }
  if (full.blocker !== undefined) attestation.blocker = full.blocker
  return attestation
}

const HEX64 = /^[0-9a-f]{64}$/

// A model that otherwise copies an envelope exactly may still wrap it in a
// markdown fence (measured: a trailing ``` line). A fence is a wrapper, not a
// paraphrase — it cannot hide the content, because the sha256 check re-hashes
// the artifact — so --verify tolerates ONE leading/trailing fence and reports
// it, rather than failing a Result whose content is provably intact. Prose that
// a fence does not delimit is still a parse error. --validate stays strict: it
// pins the authored-envelope contract, not the forwarding step.
function stripFence(raw) {
  const m = raw.match(/^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/)
  if (m) return { text: m[1].trim(), fenced: true }
  return { text: raw, fenced: false }
}

// ---------------------------------------------------------------------------
// the issue transport (the only network path in this file)
// ---------------------------------------------------------------------------

// An artifact may live in an issue comment rather than on disk. The comment
// body is delimited by two fixed markers so the envelope can be extracted
// byte-exactly: `sha256` then hashes the same string in both modes, which is
// what lets an attestation written by file mode be verified from a comment and
// vice versa. The markers are HTML comments, so they render as nothing.
const ENVELOPE_BEGIN = "<!-- gh-sync:envelope-begin -->"
const ENVELOPE_END = "<!-- gh-sync:envelope-end -->"
const GITHUB_SCHEME = "github:"

// `artifactText` is the exact bytes that get hashed — identical to the file
// mode's `${JSON.stringify(envelope, null, 2)}\n`.
function issueCommentBody(envelope, artifactText, taskId) {
  return [
    `<!-- gh-sync:envelope ${taskId} -->`,
    "",
    `Full review-gate envelope for \`${taskId}\` (role \`${envelope.role}\`, status \`${envelope.status}\`).`,
    "Body is delimited by the markers below so a verifier can extract it byte-exactly.",
    "",
    ENVELOPE_BEGIN,
    artifactText + ENVELOPE_END,
    "",
  ].join("\n")
}

function extractEnvelopeText(body) {
  const text = String(body || "")
  const i = text.indexOf(ENVELOPE_BEGIN)
  const j = text.indexOf(ENVELOPE_END)
  if (i < 0 || j < 0 || j < i) return null
  let inner = text.slice(i + ENVELOPE_BEGIN.length, j)
  if (inner.startsWith("\n")) inner = inner.slice(1)
  return inner
}

// The comment is read as JSON (never via --jq, which appends a newline) because
// that is what keeps the extracted bytes identical to what was hashed. The
// transport itself lives in gh-run.mjs, which is the only module that shells
// out to `gh`.
function readGithubArtifact(pathStr) {
  const m = String(pathStr).match(/^github:([^#]+)#issuecomment-(\d+)$/)
  if (!m) throw new Error(`malformed github artifact path ${pathStr}`)
  const comment = getIssueComment(m[1], m[2])
  const text = extractEnvelopeText(comment.body)
  if (text === null) throw new Error(`comment ${m[2]} carries no gh-sync envelope block`)
  return { body: Buffer.from(text, "utf8"), path: pathStr }
}

function latestEnvelopeComment(slug, issue) {
  const comments = listIssueComments(slug, issue)
  for (let i = comments.length - 1; i >= 0; i -= 1) {
    if (String(comments[i].body || "").includes(ENVELOPE_BEGIN)) return comments[i]
  }
  return null
}

function verifyAttestation(rawInput, opts = {}) {
  const { text: raw, fenced } = stripFence(rawInput)
  let attestation
  try {
    attestation = JSON.parse(raw)
  } catch (err) {
    return { valid: false, fenced, problems: [`not valid JSON: ${err.message}`] }
  }
  if (attestation === null || typeof attestation !== "object" || Array.isArray(attestation)) {
    return { valid: false, fenced, problems: ["attestation must be one JSON object"] }
  }

  const problems = []
  const notes = []
  let a = attestation.artifact

  // Measured with the pinned 3B reviewer: it copies task_id/role/status/findings
  // unaltered every time, but it rewrites the prose `summary` and drops
  // non-canonical keys such as `artifact`. So an absent pointer is not treated
  // as fabrication — the artifact is resolved from `task_id` instead. What must
  // match is exactly what a paraphrase would corrupt: the verdict, the role,
  // the status and the findings. (With a pointer present, everything it claims
  // is checked too, hash included.)
  if (a === undefined) {
    if (opts.issue) {
      // The measured reviewer drops the non-canonical `artifact` key, so with
      // --issue the envelope is resolved from the newest envelope comment on
      // that issue instead of from a file that no longer exists.
      try {
        requireAuth()
        const slug = repoSlug()
        const comment = latestEnvelopeComment(slug, opts.issue)
        if (!comment) {
          problems.push(`artifact: missing, and issue #${opts.issue} carries no envelope comment`)
        } else {
          a = { path: `${GITHUB_SCHEME}${slug}#issuecomment-${comment.id}` }
          notes.push(`no artifact pointer; resolved ${a.path} from issue #${opts.issue}`)
        }
      } catch (err) {
        problems.push(`artifact: missing and it could not be resolved from issue #${opts.issue}: ${err.message}`)
      }
    } else if (!isNonEmptyString(attestation.task_id)) {
      problems.push("artifact: missing and there is no task_id to resolve the default artifact from")
    } else {
      a = { path: `${ATTEST_DIR}/${safeName(attestation.task_id)}.envelope.json` }
      notes.push(`no artifact pointer; resolved ${a.path} from task_id ${attestation.task_id}`)
    }
  } else if (a === null || typeof a !== "object" || Array.isArray(a)) {
    problems.push("artifact: must be an object")
    a = null
  } else {
    if (!isNonEmptyString(a.path)) problems.push("artifact.path: missing")
    if (!HEX64.test(String(a.sha256))) problems.push("artifact.sha256: not a 64-character lowercase hex digest")
    if (typeof a.bytes !== "number") problems.push("artifact.bytes: missing")
    if (typeof a.checks !== "number") problems.push("artifact.checks: missing")
  }
  if (problems.length) return { valid: false, fenced, notes, problems }

  let body
  if (String(a.path).startsWith(GITHUB_SCHEME)) {
    try {
      body = readGithubArtifact(a.path).body
    } catch (err) {
      return { valid: false, fenced, notes, problems: [`artifact ${a.path} could not be fetched: ${err.message}`] }
    }
  } else {
    const full = resolveUnderRoot(a.path)
    if (!existsSync(full)) return { valid: false, fenced, notes, problems: [`artifact ${a.path} not found`] }
    body = readFileSync(full)
  }
  const digest = sha256Hex(body)
  if (typeof a.sha256 === "string" && digest !== a.sha256) {
    problems.push(`artifact.sha256 mismatch: message says ${a.sha256}, file hashes to ${digest}`)
  }
  if (typeof a.bytes === "number" && Buffer.byteLength(body) !== a.bytes) {
    problems.push(`artifact.bytes mismatch: message says ${a.bytes}, file is ${Buffer.byteLength(body)} bytes`)
  }

  const text = body.toString("utf8")
  let envelope = null
  try {
    envelope = JSON.parse(text)
  } catch (err) {
    problems.push(`artifact is not JSON: ${err.message}`)
  }
  if (envelope) {
    for (const key of ["task_id", "role", "status"]) {
      if (JSON.stringify(attestation[key]) !== JSON.stringify(envelope[key])) {
        problems.push(`${key}: message ${JSON.stringify(attestation[key])} but artifact ${JSON.stringify(envelope[key])}`)
      }
    }
    // The findings are the reviewer's judgement and the contract requires them
    // inline, so they are the one part a model could paraphrase by hand.
    // Comparing them to the artifact is what closes that hole.
    if (JSON.stringify(attestation.findings) !== JSON.stringify(envelope.findings)) {
      problems.push("findings: the message's findings[] do not match the artifact's — paraphrased, not copied")
    }
    if (JSON.stringify(attestation.blocker) !== JSON.stringify(envelope.blocker)) {
      problems.push("blocker: the message's blocker does not match the artifact's")
    }
    if (typeof a.checks === "number" && a.checks !== (Array.isArray(envelope.checks) ? envelope.checks.length : 0)) {
      problems.push(`artifact.checks: message says ${a.checks}, artifact has ${(envelope.checks || []).length}`)
    }
    // Prose is the one field a bounded model rewrites rather than copies. It is
    // reported, never silently accepted, and never load-bearing: the verdict
    // (status), the role and the findings are what is compared.
    if (attestation.summary !== undefined && attestation.summary !== envelope.summary) {
      notes.push("summary: the message words its own summary instead of copying the runner's — reported, not load-bearing (status/role/findings are what is compared)")
    }
    const inner = validateEnvelope(text)
    inner.problems.forEach((p) => problems.push(`artifact is not a valid envelope: ${p}`))
  }

  return {
    valid: problems.length === 0,
    fenced,
    notes,
    problems,
    artifact: a.path,
    sha256: typeof a.sha256 === "string" ? a.sha256 : digest,
    bytes: typeof a.bytes === "number" ? a.bytes : Buffer.byteLength(body),
    checks: typeof a.checks === "number" ? a.checks : (Array.isArray(envelope && envelope.checks) ? envelope.checks.length : 0),
  }
}

// ---------------------------------------------------------------------------
// --validate mode
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0
}

function validateEnvelope(raw) {
  let payload
  try {
    payload = JSON.parse(raw)
  } catch (err) {
    return { valid: false, problems: [`not valid JSON: ${err.message}`] }
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, problems: ["envelope must be one JSON object"] }
  }

  const problems = []
  if (!isNonEmptyString(payload.task_id)) problems.push("task_id: missing or empty")
  if (!isNonEmptyString(payload.role)) problems.push("role: missing or empty")
  if (!["done", "blocked", "needs_input"].includes(payload.status)) {
    problems.push(`status: '${payload.status}' is not done|blocked|needs_input`)
  }
  if (!isNonEmptyString(payload.summary)) problems.push("summary: missing or empty")

  if (payload.status !== "done" && !isNonEmptyString(payload.blocker)) {
    problems.push("blocker: required when status is not 'done'")
  }
  if (payload.status === "done" && payload.blocker !== undefined) {
    problems.push("blocker: must be absent when status is 'done'")
  }
  if (isNonEmptyString(payload.blocker)) {
    try {
      const decoded = JSON.parse(payload.blocker)
      if (!isNonEmptyString(decoded.type)) problems.push("blocker: decoded object has no 'type'")
      if (!isNonEmptyString(decoded.detail)) problems.push("blocker: decoded object has no 'detail'")
      if (!isNonEmptyString(decoded.suggested_action)) problems.push("blocker: decoded object has no 'suggested_action'")
    } catch (err) {
      problems.push(`blocker: must be a JSON-encoded string: ${err.message}`)
    }
  }

  if (payload.checks === undefined) {
    if (payload.artifact === undefined) {
      problems.push("checks: missing (an attestation instead carries 'artifact')")
    } else if (payload.artifact === null || typeof payload.artifact !== "object" || Array.isArray(payload.artifact)) {
      problems.push("artifact: must be an object")
    } else {
      const a = payload.artifact
      if (!isNonEmptyString(a.path)) problems.push("artifact.path: missing")
      if (!HEX64.test(String(a.sha256))) problems.push("artifact.sha256: not a 64-character lowercase hex digest")
      if (typeof a.bytes !== "number") problems.push("artifact.bytes: missing")
      if (typeof a.checks !== "number") problems.push("artifact.checks: missing")
    }
  } else if (!Array.isArray(payload.checks)) {
    problems.push("checks: must be an array")
  } else {
    payload.checks.forEach((c, i) => {
      if (c === null || typeof c !== "object") {
        problems.push(`checks[${i}]: not an object`)
        return
      }
      if (!isNonEmptyString(c.command)) problems.push(`checks[${i}].command: missing`)
      if (!["pass", "fail", "skip"].includes(c.outcome)) problems.push(`checks[${i}].outcome: '${c.outcome}' invalid`)
      if (!isNonEmptyString(c.evidence)) problems.push(`checks[${i}].evidence: missing`)
    })
  }

  if (payload.findings === undefined) {
    if (roleNeedsFindings(payload.role)) problems.push(`findings: required for role '${payload.role}'`)
  } else if (!Array.isArray(payload.findings)) {
    problems.push("findings: must be an array")
  } else {
    payload.findings.forEach((f, i) => {
      if (f === null || typeof f !== "object") {
        problems.push(`findings[${i}]: not an object`)
        return
      }
      if (!["high", "medium", "low"].includes(f.severity)) problems.push(`findings[${i}].severity: '${f.severity}' invalid`)
      if (!isNonEmptyString(f.issue)) problems.push(`findings[${i}].issue: missing`)
      if (!isNonEmptyString(f.suggestion)) problems.push(`findings[${i}].suggestion: missing`)
      if (f.path === undefined && f.source === undefined) problems.push(`findings[${i}]: needs a path or a source`)
    })
  }
  return { valid: problems.length === 0, problems }
}

function roleNeedsFindings(role) {
  return ENVELOPE_ROLES_NEEDING_FINDINGS.includes(role)
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

function usageEnvelope(role, detail, taskId = "(unknown)") {
  return {
    task_id: taskId,
    role,
    status: "blocked",
    summary: `Cannot run the gate: ${detail}`,
    checks: [],
    findings: [
      {
        severity: "high",
        claim: "(gate runner)",
        path: "(argv)",
        line: 0,
        issue: detail,
        suggestion: "fix the invocation, then re-run",
      },
    ],
    blocker: JSON.stringify({ type: "tool_error", detail, suggested_action: "retry" }),
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const log = (msg) => {
    if (!opts.quiet) process.stderr.write(`${msg}\n`)
  }

  if (opts.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  if (opts.validate !== undefined) {
    let text = null
    if (opts.validate === "-") {
      text = readFileSync(0, "utf8")
    } else {
      const full = resolveUnderRoot(opts.validate)
      if (existsSync(full)) text = readFileSync(full, "utf8")
    }
    const verdict =
      text === null
        ? { valid: false, problems: [`${opts.validate} not found`] }
        : validateEnvelope(text.trim())
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`)
    return verdict.valid ? 0 : 1
  }

  if (opts.verify !== undefined) {
    let text = null
    if (opts.verify === "-") {
      text = readFileSync(0, "utf8")
    } else {
      const full = resolveUnderRoot(opts.verify)
      if (existsSync(full)) text = readFileSync(full, "utf8")
    }
    const verdict =
      text === null
        ? { valid: false, problems: [`${opts.verify} not found`] }
        : verifyAttestation(text.trim(), opts)
    process.stdout.write(`${JSON.stringify(verdict, null, 2)}\n`)
    return verdict.valid ? 0 : 1
  }

  if (opts.problem) {
    process.stderr.write(`review-gate: ${opts.problem}\n${USAGE}\n`)
    emit(usageEnvelope("reviewer", opts.problem))
    return 1
  }

  const checklistPath = resolveUnderRoot(opts.checklist)
  if (!existsSync(checklistPath)) {
    process.stderr.write(`review-gate: checklist ${opts.checklist} not found\n`)
    emit(usageEnvelope("reviewer", `checklist ${opts.checklist} not found`))
    return 1
  }

  let checklist
  try {
    checklist = JSON.parse(readFileSync(checklistPath, "utf8"))
  } catch (err) {
    process.stderr.write(`review-gate: checklist ${opts.checklist} is not valid JSON\n`)
    emit(usageEnvelope("reviewer", `checklist is not valid JSON: ${err.message}`))
    return 1
  }

  const claims = Array.isArray(checklist.claims) ? checklist.claims : []
  const role = checklist.role || "reviewer"
  const taskId = opts.task || checklist.task_id || "(unknown)"

  if (opts.list) {
    process.stdout.write(
      `${JSON.stringify(
        {
          task_id: taskId,
          title: checklist.title || "",
          claims: claims.map((c) => ({ id: c.id, statement: c.statement, checks: (c.checks || []).length })),
          advisories: Array.isArray(checklist.advisories) ? checklist.advisories.length : 0,
        },
        null,
        2,
      )}\n`,
    )
    return 0
  }

  log(`review-gate: ${checklist.title || opts.checklist} — running ${claims.length} claims`)
  const claimResults = claims.map((claim) => {
    log(`  claim  ${claim.id}`)
    const results = (claim.checks || []).map((check) => runCheck(check, log))
    const failed = results.filter((r) => r.failed).length
    log(`  claim  ${claim.id} -> ${failed === 0 ? "pass" : `fail (${failed} check(s))`}`)
    return { claim, results }
  })

  const envelope = buildEnvelope(checklist, taskId, claimResults)

  if (opts.attest) {
    const body = `${JSON.stringify(envelope, null, 2)}\n`

    if (opts.issue) {
      // The envelope goes into the tracker instead of scratch. No overwrite
      // guard is needed: a comment is immutable, so a re-run appends a new
      // attestation rather than invalidating the hash of an existing one.
      try {
        requireAuth()
        const slug = repoSlug()
        const created = createIssueComment(slug, opts.issue, issueCommentBody(envelope, body, taskId))
        const artifactPath = `${GITHUB_SCHEME}${slug}#issuecomment-${created.id}`
        emit(attestEnvelope(envelope, artifactPath, body))
      } catch (err) {
        process.stderr.write(`review-gate: --attest --issue could not post to #${opts.issue}: ${err.message}\n`)
        emit(usageEnvelope(role, `--attest --issue could not post to #${opts.issue}: ${err.message}`, taskId))
        return 1
      }
      return envelope.status === "done" ? 0 : 1
    }

    const rel = opts.out || `${ATTEST_DIR}/${safeName(taskId)}.envelope.json`
    const full = resolveUnderRoot(rel)
    try {
      mkdirSync(dirname(full), { recursive: true })
      // An artifact is evidence: some attestation may already point at this
      // file by sha256. Rewriting it with different content invalidates that
      // attestation silently, so refuse unless --force says so deliberately.
      if (existsSync(full) && !opts.force) {
        const existing = readFileSync(full, "utf8")
        if (existing !== body) {
          emit(
            usageEnvelope(
              role,
              `--attest would overwrite ${rel}, whose content differs (the tree or the checklist changed since it was written). Any attestation already pointing at that file would be invalidated; pass --force to overwrite deliberately, or --out to write elsewhere.`,
              taskId,
            ),
          )
          return 1
        }
      }
      writeFileSync(full, body)
      emit(attestEnvelope(envelope, rel, body))
    } catch (err) {
      process.stderr.write(`review-gate: --attest could not write ${rel}: ${err.message}\n`)
      emit(usageEnvelope(role, `--attest could not write ${rel}: ${err.message}`, taskId))
      return 1
    }
    return envelope.status === "done" ? 0 : 1
  }

  emit(envelope)
  return envelope.status === "done" ? 0 : 1
}

function run() {
  try {
    return main()
  } catch (err) {
    process.stderr.write(`review-gate: unexpected error: ${err && err.stack ? err.stack : err}\n`)
    emit({
      task_id: "(unknown)",
      role: "reviewer",
      status: "blocked",
      summary: "Cannot run the gate: the runner raised an unexpected error.",
      checks: [],
      findings: [
        {
          severity: "high",
          claim: "(gate runner)",
          path: "scripts/review-gate.mjs",
          line: 0,
          issue: `unexpected runner error: ${err && err.message ? err.message : String(err)}`,
          suggestion: "fix the runner or the checklist, then re-run",
        },
      ],
      blocker: JSON.stringify({
        type: "tool_error",
        detail: err && err.message ? err.message : String(err),
        suggested_action: "ask_human",
      }),
    })
    return 1
  }
}

process.exit(run())
