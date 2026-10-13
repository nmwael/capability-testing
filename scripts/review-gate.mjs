#!/usr/bin/env node
// review-gate.mjs — run a declared checklist and emit ONE raw JSON Result
// envelope, so the envelope is machine-produced and valid by construction.
//
// WHY THIS EXISTS: a small local auditor (granite-4.2-3b) reads files and runs
// commands well enough, but it cannot reliably AUTHOR the `Result` envelope.
// Over five reviewer-gate attempts on one change set it produced: prose before
// the JSON, an unterminated object (a nested `]` and no closing `}`), an
// invalid `action: "read"` artifact, no `findings` array at all, and one empty
// final message after its output budget was entirely consumed by reasoning.
// Envelope authoring is mechanical, so it is taken away from the model: the
// auditor runs this script and its stdout — and only its stdout — is the
// envelope. The auditor still judges; it just no longer transcribes.
//
// The checklist is data, not code: a JSON file naming claims and the checks
// that substantiate them. Nothing here is reviewer-specific — the checklist
// declares its own `role`, so any role's envelope can be produced the same way.
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
//   node scripts/review-gate.mjs --list                  # claim ids + statements
//   node scripts/review-gate.mjs --validate result.json  # shape-check an envelope
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

import { readFileSync, existsSync, statSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { resolve, dirname, isAbsolute } from "node:path"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")
const DEFAULT_CHECKLIST = "scripts/test/fixtures/review/gate-f1-f5.claims.json"
const COMMAND_TIMEOUT_MS = 180000
const EVIDENCE_MAX = 220
const ENVELOPE_ROLES_NEEDING_FINDINGS = ["reviewer", "fact-checker"]

const USAGE = `usage: node scripts/review-gate.mjs [--task <id>] [--checklist <path>] [--quiet]
       node scripts/review-gate.mjs --list [--checklist <path>]
       node scripts/review-gate.mjs --validate <file|->

  --task <id>         envelope task_id (default: the checklist's task_id)
  --checklist <path>  checklist JSON (default: ${DEFAULT_CHECKLIST})
  --quiet             no progress on stderr
  --list              print claim ids and statements as JSON, run nothing
  --validate <file>   read a Result envelope from <path> ('-' = stdin) and
                      report {"valid":bool,"problems":[...]}
  --help              this text (stdout)

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
    problems.push("checks: missing")
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

function usageEnvelope(role, detail) {
  return {
    task_id: "(unknown)",
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
