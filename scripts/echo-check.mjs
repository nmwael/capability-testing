#!/usr/bin/env node
// ---------------------------------------------------------------------------
// echo-check: DID the message an agent sent equal the bytes the gate printed?
//
// WHY THIS EXISTS. `scripts/review-gate.mjs --attest` reduces the audit to a
// ~1 KB attestation, and the reviewer's contract says the message IS the
// runner's stdout, verbatim. That is a claim, and a claim needs a witness.
// This is the witness: it reads the session store the runtime wrote (read-only,
// no transcription), so "the echo was exact" can be checked instead of asserted.
//
//   node scripts/echo-check.mjs <sessionID> [--attest] [--task <id>]
//       compare that session's LAST assistant text message against the gate's
//       stdout for the task, byte for byte
//   node scripts/echo-check.mjs <sessionID> --verify
//       run `node scripts/review-gate.mjs --verify` over the extracted message:
//       the mechanical check of the attestation (status/role/findings, sha256)
//   node scripts/echo-check.mjs --find "<substring>"
//       list sessions whose user messages contain the substring
//
// VERDICTS (compare mode)
//   byte-identical            the message and the runner printed the same bytes
//   identical-ignoring-fence  the same bytes once ONE wrapping markdown fence
//                             is removed (measured: a bare trailing ``` line)
//   findings-only             task_id/role/status/findings agree but the prose
//                             `summary` was rewritten -- use --verify for the
//                             load-bearing verdict; the echo was NOT exact
//   differs                   they disagree
//
// Exit 0 = byte-identical / identical-ignoring-fence, or, with --verify, a valid
// attestation. Exit 1 = any other verdict (findings-only, differs, invalid).
// Exit 2 = usage error, store missing, or no assistant text message.
//
// The store is opened READ-ONLY. The only files written are the optional
// --final capture and a temp file that --verify needs.
// ---------------------------------------------------------------------------

import { spawnSync } from "node:child_process"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, "..")
const GATE = join(ROOT, "scripts", "review-gate.mjs")
const ATTEST_DIR = "wip/review-gate"
const DEFAULT_DB = join(homedir(), ".local", "share", "opencode", "opencode.db")
const DEFAULT_TASK = "RV-F12345"

const USAGE = `usage: node scripts/echo-check.mjs <sessionID> [options]
       node scripts/echo-check.mjs --find <substring> [--json]

  <sessionID>          session whose last assistant text message is checked
  --find <substring>   list sessions whose user messages contain <substring>
  --db <path>          session store (default: $OPENCODE_DB or
                       ~/.local/share/opencode/opencode.db)
  --task <id>          gate task id (default ${DEFAULT_TASK})
  --checklist <path>   forward --checklist to the gate
  --attest             expect the gate's short attestation: run it with
                       --attest --out ${ATTEST_DIR}/<task>.envelope.json
  --expect <command>   compare against this command's stdout instead of the gate
  --expect-file <path> compare against this file's contents
  --final <path>       save the extracted message here
  --verify             run the gate's --verify over the extracted message
  --json               machine-readable report on stdout
  --quiet              no human-readable report (only the exit status)
  --help               this text

exit 0 = the message and the runner agree (byte-identical, or identical once a
         wrapping fence is removed; with --verify, a valid attestation)
exit 1 = they disagree (findings-only, differs, or --verify says invalid)
exit 2 = usage error, missing store, or no assistant text message`

// ---------------------------------------------------------------------------
// argv
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = {
    session: null,
    find: null,
    db: process.env.OPENCODE_DB || DEFAULT_DB,
    task: DEFAULT_TASK,
    checklist: null,
    attest: false,
    expect: null,
    expectFile: null,
    final: null,
    verify: false,
    json: false,
    quiet: false,
    help: false,
    problem: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    const takeValue = () => {
      if (i + 1 >= argv.length) {
        opts.problem = opts.problem || `${arg} needs a value`
        return null
      }
      i += 1
      return argv[i]
    }
    const assign = (key) => {
      const v = takeValue()
      if (v !== null) opts[key] = v
    }
    if (arg === "--find") assign("find")
    else if (arg === "--db") assign("db")
    else if (arg === "--task") assign("task")
    else if (arg === "--checklist") assign("checklist")
    else if (arg === "--expect") assign("expect")
    else if (arg === "--expect-file") assign("expectFile")
    else if (arg === "--final") assign("final")
    else if (arg === "--attest") opts.attest = true
    else if (arg === "--verify") opts.verify = true
    else if (arg === "--json") opts.json = true
    else if (arg === "--quiet") opts.quiet = true
    else if (arg === "--help" || arg === "-h") opts.help = true
    else if (arg.startsWith("--")) opts.problem = opts.problem || `unknown argument '${arg}'`
    else if (opts.session === null) opts.session = arg
    else opts.problem = opts.problem || `unexpected positional argument '${arg}'`
  }
  if (!opts.help && opts.session === null && opts.find === null) {
    opts.problem = opts.problem || "needs a <sessionID> or --find"
  }
  if (opts.expect && opts.expectFile) opts.problem = opts.problem || "--expect and --expect-file are mutually exclusive"
  return opts
}

function underRoot(p) {
  return isAbsolute(p) ? p : resolve(ROOT, p)
}

// ---------------------------------------------------------------------------
// session store (read-only)
// ---------------------------------------------------------------------------

function openStore(path) {
  if (!existsSync(path)) return { error: `session store ${path} not found` }
  try {
    return { db: new DatabaseSync(path, { readOnly: true }) }
  } catch (err) {
    return { error: `cannot open ${path}: ${err.message}` }
  }
}

function textParts(content) {
  return (Array.isArray(content) ? content : [])
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim()
}

function parseRow(data) {
  try {
    const d = JSON.parse(data)
    return d && typeof d === "object" ? d : null
  } catch {
    return null
  }
}

// The final message is what the archivist (and the reviewer's contract) cares
// about. Assistant rows can carry tool calls or empty text; walk back to the
// most recent row that actually has text.
function lastAssistantText(db, sessionId) {
  const rows = db.prepare("select data from session_message where session_id = ? and type = 'assistant' order by seq desc").all(sessionId)
  for (const r of rows) {
    const d = parseRow(r.data)
    if (!d) continue
    const text = textParts(d.content)
    if (text) {
      return {
        text,
        agent: typeof d.agent === "string" ? d.agent : null,
        model: typeof d.model === "string" ? d.model : (d.model && d.model.id) || null,
      }
    }
  }
  return null
}

function findSessions(db, needle) {
  const rows = db.prepare("select session_id, data from session_message where type = 'user'").all()
  const hits = []
  for (const r of rows) {
    const d = parseRow(r.data)
    if (!d) continue
    const text = typeof d.text === "string" ? d.text : textParts(d.content)
    if (text && text.includes(needle) && !hits.includes(r.session_id)) hits.push(r.session_id)
  }
  return hits
}

// A bounded model that copies a JSON payload may still wrap it in a fence
// (measured: a bare trailing ``` line). Removing ONE leading and/or trailing
// fence is not laxity -- a fence cannot hide content from --verify's sha256 --
// it is what separates "wrapped the same bytes" from "wrote different bytes".
function stripFence(raw) {
  let text = String(raw).trim()
  let fenced = false
  const open = text.match(/^```[A-Za-z]*[ \t]*\r?\n/)
  if (open) {
    fenced = true
    text = text.slice(open[0].length)
  }
  const close = text.match(/\r?\n?```[ \t]*$/)
  if (close) {
    fenced = true
    text = text.slice(0, text.length - close[0].length)
  }
  if (fenced) text = text.trim()
  return { text, fenced }
}

// ---------------------------------------------------------------------------
// the expected stdout
// ---------------------------------------------------------------------------

function expectedText(opts) {
  if (opts.expectFile) {
    const p = underRoot(opts.expectFile)
    if (!existsSync(p)) return { error: `--expect-file ${opts.expectFile} not found` }
    return { text: readFileSync(p, "utf8").trim(), source: `file ${opts.expectFile}` }
  }
  if (opts.expect) {
    const r = spawnSync("sh", ["-c", opts.expect], { cwd: ROOT, encoding: "utf8" })
    if (r.error) return { error: `--expect failed: ${r.error.message}` }
    if (r.status !== 0) return { error: `--expect exited ${r.status}: ${(r.stderr || "").trim().slice(0, 200)}` }
    return { text: (r.stdout || "").trim(), source: `command ${opts.expect}` }
  }
  const args = [GATE, "--task", opts.task]
  if (opts.checklist) args.push("--checklist", opts.checklist)
  if (opts.attest) args.push("--attest", "--out", `${ATTEST_DIR}/${opts.task}.envelope.json`)
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" })
  if (r.error) return { error: `running the gate failed: ${r.error.message}` }
  if (!(r.stdout || "").trim()) {
    return { error: `the gate exited ${r.status} with no stdout: ${(r.stderr || "").trim().slice(0, 200)}` }
  }
  return { text: (r.stdout || "").trim(), source: `gate --task ${opts.task}${opts.attest ? " --attest" : ""}` }
}

function jsonParse(text) {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// ---------------------------------------------------------------------------
// reporting
// ---------------------------------------------------------------------------

function report(result, opts) {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return
  }
  if (opts.quiet) return
  const out = [`echo-check: session ${result.session_id}`]
  if (result.agent) out.push(`  agent                  ${result.agent}${result.model ? ` (${result.model})` : ""}`)
  out.push(`  expected from          ${result.expected_source}`)
  if (result.expected_bytes !== null) out.push(`  expected size          ${result.expected_bytes} bytes`)
  out.push(`  message size           ${result.message_bytes} bytes${result.fenced ? " (inside a markdown fence)" : ""}`)
  if (result.final_file) out.push(`  message saved to       ${result.final_file}`)
  out.push(`  byte-identical         ${result.byte_identical === null ? "n/a" : result.byte_identical ? "YES" : "no"}`)
  out.push(`  fence removed          ${result.identical_ignoring_fence === null ? "n/a" : result.identical_ignoring_fence ? "YES" : "no"}`)
  if (result.keys) out.push(`  message keys           ${result.keys.join(", ") || "(none)"}`)
  if (result.findings_match !== undefined) out.push(`  findings match         ${result.findings_match ? "YES" : "NO"}`)
  if (result.artifact_match !== undefined) {
    out.push(`  artifact pointer       ${result.artifact_match === null ? "not in the message" : result.artifact_match ? "matches" : "DIFFERS"}`)
  }
  if (result.verify) {
    out.push(`  verify                 ${result.verify.valid ? "valid" : "INVALID"}`)
    if (result.verify.artifact) out.push(`  artifact               ${result.verify.artifact} (${result.verify.bytes} bytes, ${result.verify.checks} checks)`)
    for (const p of result.verify.problems || []) out.push(`  problem                ${p}`)
    for (const n of result.verify.notes || []) out.push(`  note                   ${n}`)
  }
  for (const n of result.notes || []) out.push(`  note                   ${n}`)
  out.push(`  verdict                ${result.verdict}`)
  process.stdout.write(`${out.join("\n")}\n`)
}

// ---------------------------------------------------------------------------
// modes
// ---------------------------------------------------------------------------

function compareMode(db, opts) {
  const got = lastAssistantText(db, opts.session)
  if (!got) {
    process.stderr.write(`echo-check: no assistant text message in ${opts.session}\n`)
    return 2
  }
  const expected = expectedText(opts)
  if (expected.error) {
    process.stderr.write(`echo-check: ${expected.error}\n`)
    return 2
  }

  const raw = got.text.trim()
  const gotStripped = stripFence(raw)
  const expStripped = stripFence(expected.text)
  const byteIdentical = raw === expected.text
  const identicalIgnoringFence = gotStripped.text === expStripped.text

  const result = {
    session_id: opts.session,
    agent: got.agent,
    model: got.model,
    expected_source: expected.source,
    expected_bytes: Buffer.byteLength(expected.text),
    message_bytes: Buffer.byteLength(raw),
    fenced: gotStripped.fenced,
    byte_identical: byteIdentical,
    identical_ignoring_fence: identicalIgnoringFence,
    notes: [],
  }
  if (opts.final) {
    const file = underRoot(opts.final)
    writeFileSync(file, raw)
    result.final_file = file
  }

  const gotJson = jsonParse(gotStripped.text)
  const expJson = jsonParse(expStripped.text)
  if (gotJson.ok && expJson.ok && gotJson.value && expJson.value) {
    result.keys = Object.keys(gotJson.value)
    result.missing_keys = Object.keys(expJson.value).filter((k) => !(k in gotJson.value))
    result.extra_keys = Object.keys(gotJson.value).filter((k) => !(k in expJson.value))
    if (result.missing_keys.length) result.notes.push(`message is missing key(s): ${result.missing_keys.join(", ")}`)
    if (result.extra_keys.length) result.notes.push(`message has extra key(s): ${result.extra_keys.join(", ")}`)
    if (expJson.value.findings !== undefined || gotJson.value.findings !== undefined) {
      result.findings_match = same(gotJson.value.findings, expJson.value.findings)
    }
    if (expJson.value.artifact !== undefined || gotJson.value.artifact !== undefined) {
      const a = gotJson.value.artifact
      const b = expJson.value.artifact
      result.artifact_match =
        b === undefined ? false : a === undefined ? false : same(a.path, b.path) && same(a.sha256, b.sha256) && same(a.bytes, b.bytes) && same(a.checks, b.checks)
      if (result.artifact_match === false) result.notes.push("artifact pointer differs from the runner's (path/sha256/bytes/checks)")
    }
  }

  if (byteIdentical) result.verdict = "byte-identical"
  else if (identicalIgnoringFence) {
    result.verdict = "identical-ignoring-fence"
    result.notes.push("the message wrapped the runner's bytes in a markdown fence; content is unchanged")
  } else {
    const loadBearing =
      result.findings_match === true &&
      same(gotJson.ok ? gotJson.value.task_id : undefined, expJson.ok ? expJson.value.task_id : undefined) &&
      same(gotJson.ok ? gotJson.value.role : undefined, expJson.ok ? expJson.value.role : undefined) &&
      same(gotJson.ok ? gotJson.value.status : undefined, expJson.ok ? expJson.value.status : undefined)
    result.verdict = loadBearing ? "findings-only" : "differs"
    if (loadBearing) {
      result.notes.push("task_id/role/status/findings agree but the bytes differ (prose was rewritten); the echo was NOT exact -- run --verify for the load-bearing verdict")
    }
  }
  result.ok = byteIdentical || identicalIgnoringFence

  report(result, opts)
  return result.ok ? 0 : 1
}

function verifyMode(db, opts) {
  const got = lastAssistantText(db, opts.session)
  if (!got) {
    process.stderr.write(`echo-check: no assistant text message in ${opts.session}\n`)
    return 2
  }
  const stripped = stripFence(got.text)
  const file = opts.final ? underRoot(opts.final) : join(tmpdir(), `echo-check-${process.pid}-${Date.now()}.json`)
  writeFileSync(file, stripped.text)

  const r = spawnSync(process.execPath, [GATE, "--verify", file], { cwd: ROOT, encoding: "utf8" })
  const parsed = jsonParse((r.stdout || "").trim())
  const verdict = parsed.ok ? parsed.value : null

  const result = {
    session_id: opts.session,
    agent: got.agent,
    model: got.model,
    expected_source: "scripts/review-gate.mjs --verify (load-bearing: status/role/findings/sha256)",
    expected_bytes: null,
    message_bytes: Buffer.byteLength(stripped.text),
    fenced: stripped.fenced,
    message_file: file,
    byte_identical: null,
    identical_ignoring_fence: null,
    verify: verdict,
    verify_exit: r.status,
    notes: [],
    verdict: verdict ? (verdict.valid ? "valid-attestation" : "invalid-attestation") : "verify-error",
  }
  if (!verdict) result.notes.push(`the gate printed no JSON: ${(r.stderr || "").trim().slice(0, 200)}`)
  result.ok = !!(verdict && verdict.valid === true)

  report(result, opts)
  return result.ok ? 0 : 1
}

function findMode(db, opts) {
  const hits = findSessions(db, opts.find)
  if (opts.json) {
    process.stdout.write(`${JSON.stringify({ needle: opts.find, sessions: hits }, null, 2)}\n`)
  } else if (!opts.quiet) {
    if (hits.length === 0) process.stdout.write(`no session contains '${opts.find}'\n`)
    for (const sid of hits) {
      const m = lastAssistantText(db, sid)
      process.stdout.write(`${sid}  final-message: ${m ? `${Buffer.byteLength(m.text)} bytes` : "none"}\n`)
    }
  }
  return hits.length > 0 ? 0 : 1
}

// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (opts.help) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }
  if (opts.problem) {
    process.stderr.write(`echo-check: ${opts.problem}\n\n${USAGE}\n`)
    return 2
  }

  const store = openStore(opts.db)
  if (store.error) {
    process.stderr.write(`echo-check: ${store.error}\n`)
    return 2
  }

  if (opts.find !== null) return findMode(store.db, opts)
  if (opts.verify) return verifyMode(store.db, opts)
  return compareMode(store.db, opts)
}

process.exit(main())
