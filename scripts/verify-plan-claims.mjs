#!/usr/bin/env node
// verify-plan-claims.mjs — deterministic fact-checker for architect plans.
//
// The architect may only name a coordinate, version, path, command, or symbol
// that is verifiable. A language model cannot reliably audit its own plan, so
// this script does the part that cannot be hallucinated: it extracts the
// machine-checkable claims from a plan and validates them against authoritative
// sources.
//
//   npm packages/versions  -> https://registry.npmjs.org
//   Maven coordinates      -> https://repo1.maven.org/maven2
//   repo file paths        -> the working tree
//   bare package names     -> https://registry.npmjs.org (existence only)
//   `- Check:` commands    -> PATH / the working tree
//   reference conflicts    -> library/architect/stack-coordinates.mini.md
//
// A plan that names almost nothing checkable is not "clean" — it is unauditable.
// When no substantive claim can be extracted the checker returns INSUFFICIENT
// (blocking) instead of an empty PASS, so a vague plan cannot sail through.
//
// Exit status
//   0  no blocking claim
//   1  at least one MISSING / REJECTED / CONFLICT / INSUFFICIENT claim
//   2  usage error (plan not found, etc.)
//
// Usage
//   node scripts/verify-plan-claims.mjs --plan wip/plan.md
//   cat wip/plan.md | node scripts/verify-plan-claims.mjs
//   node scripts/verify-plan-claims.mjs --plan wip/plan.md --quiet   # JSON only

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { builtinModules } from "node:module"
import { spawnSync } from "node:child_process"

const ROOT = process.cwd()
const REF_PATH = "library/architect/stack-coordinates.mini.md"
const NPM_REGISTRY = "https://registry.npmjs.org"
const MAVEN_CENTRAL = "https://repo1.maven.org/maven2"
const HTTP_TIMEOUT_MS = 15000

const BLOCKING = new Set(["MISSING", "REJECTED", "CONFLICT", "INSUFFICIENT"])

// JSON keys that look like npm names but never are.
const NON_PACKAGE_KEYS = new Set([
  "version", "schemaVersion", "name", "main", "module", "types", "typings",
  "target", "lib", "jsx", "engines", "type", "exports", "files", "release",
  "description", "author", "license", "private", "sideEffects", "browserslist",
  "node", "engines", "packageManager", "resolution", "overrides", "resolutions",
])

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)])

const RE_SCOPED_NAME = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/
const RE_PLAIN_NAME = /^[a-z0-9][a-z0-9._-]*$/

function packageNameProblem(name) {
  if (RE_PLAIN_NAME.test(name)) return null
  if (RE_SCOPED_NAME.test(name)) return null
  if (name.includes("/")) {
    return "malformed package name — a scoped package has exactly one '/', as in @scope/name"
  }
  return "not a valid package name"
}

// A name written as a dependency but whose *shape* is impossible for npm.
function packageShapeProblem(name) {
  if (/[A-Z]/.test(name)) return "uppercase letters (npm names are lowercase)"
  if (name.includes("_")) return "an underscore (npm names use '-' or '.')"
  return packageNameProblem(name)
}

// --------------------------------------------------------------------------
// bare package names + `- Check:` commands
// --------------------------------------------------------------------------

// A line only yields bare package names when it talks about dependencies.
const RE_DEP_CTX =
  /\b(?:dependencies|devDependencies|peerDependencies|dependency|deps?|npm|pnpm|yarn|package\.json|install|version|pin)\b/i
const RE_CHECK_LINE = /^\s*[-*]?\s*Check\s*:\s*(.*)$/i
const RE_TICK_SPAN = /`([^`]+)`/g
const RE_LIST_SPAN = /\(([^()]*)\)/g
const RE_QUOTED_SPAN = /"([^"]+)"/g
const RE_NPM_NAMEISH = /^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/
const RE_VERSIONISH = /^\d[\dA-Za-z.+_-]*$/
const RE_SHELL_PROGRAM = /[\/\\]|\.(?:sh|mjs|cjs|js|bats|py|rb|pl)$/i

// Words that show up in "add React Flow dependencies (React, ..., etc.)" and are
// not package names. Anything here is never reported as a bare package name.
const PKG_STOPWORDS = new Set([
  "etc", "and", "or", "the", "with", "without", "plus", "via", "all", "none",
  "see", "also", "then", "into", "from", "this", "that", "not", "no", "may",
  "new", "old", "any", "some", "one", "two", "both", "full", "only", "same",
  "files", "file", "dir", "folder", "path", "paths", "name", "names", "code",
  "build", "test", "tests", "lint", "typecheck", "types", "type", "src", "app",
  "add", "added", "adding", "use", "using", "set", "setup", "update", "updated",
  "install", "installed", "depend", "deps", "dependency", "dependencies",
  "dev", "prod", "main", "core", "common", "lib", "libs", "module", "modules",
])
// Shell builtins are legal command heads but are not on PATH for `command -v`.
const SHELL_BUILTINS = new Set([
  "cd", "test", "[", "echo", "printf", "export", "set", "true", "false",
  "source", ".", ":", "read", "if", "for", "while", "then", "fi", "do", "done",
  "exit", "eval", "exec", "unset", "local", "return", "shift", "trap",
])

const ROOT_HAS_POM = existsSync(resolve(ROOT, "pom.xml"))

const onPathCache = new Map()
function onPath(program) {
  if (SHELL_BUILTINS.has(program)) return true
  if (onPathCache.has(program)) return onPathCache.get(program)
  let ok = false
  try {
    const r = spawnSync("sh", ["-c", 'command -v -- "$1" >/dev/null 2>&1', "sh", program], {
      stdio: "ignore",
    })
    ok = r.status === 0
  } catch {
    ok = false
  }
  onPathCache.set(program, ok)
  return ok
}

// --------------------------------------------------------------------------
// argument + input handling
// --------------------------------------------------------------------------

function usage() {
  process.stderr.write(
    "usage: node scripts/verify-plan-claims.mjs [--plan <file>] [--quiet] [--no-network]\n" +
      "       cat plan.md | node scripts/verify-plan-claims.mjs\n",
  )
}

function parseArgs(argv) {
  const opts = { planPath: null, quiet: false, network: true }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--plan" || a === "-p") opts.planPath = argv[++i]
    else if (a === "--quiet" || a === "-q") opts.quiet = true
    else if (a === "--no-network") opts.network = false
    else if (a === "--help" || a === "-h") { usage(); process.exit(0) }
    else if (a.startsWith("-")) { usage(); process.exit(2) }
    else opts.planPath = a
  }
  return opts
}

function readPlan(opts) {
  if (opts.planPath) {
    const p = resolve(ROOT, opts.planPath)
    if (!existsSync(p)) {
      process.stderr.write(`error: plan file not found: ${opts.planPath}\n`)
      process.exit(2)
    }
    return readFileSync(p, "utf8")
  }
  if (process.stdin.isTTY) {
    usage()
    process.exit(2)
  }
  return readFileSync(0, "utf8")
}

// --------------------------------------------------------------------------
// claim extraction
// --------------------------------------------------------------------------

const SEMVER = String.raw`\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?`

const RE_JSON_PAIR = new RegExp(String.raw`"([A-Za-z0-9@._/-]+)"\s*:\s*"(${SEMVER})"`, "g")
const RE_NPM_INLINE = new RegExp(
  String.raw`(?<![\w@/.:-])((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)*)@(${SEMVER})`,
  "g",
)
const RE_MAVEN_V = /\b([a-z][a-z0-9_.-]*\.[a-z0-9_.-]+):([a-z][a-z0-9_.-]+):([0-9][0-9A-Za-z._-]*)\b/g
const RE_MAVEN_NO_V = /\b([a-z][a-z0-9_.-]*\.[a-z0-9_.-]+):([a-z][a-z0-9_.-]+)\b/g
const RE_FILE_TOKEN =
  /(?:^|[\s`"'([])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.(?:json|tsx|ts|mjs|cjs|js|md|ya?ml|xml|drl|bats|sh|java|kt|kts|gradle|proto|sql|cfg|ini|env|lock|py|go|rs|rb|php|cs|cpp|cc|hpp|h|vue|svelte|scss|css|html|toml|properties|feature|gguf))(?![A-Za-z0-9])/g
const RE_IMPORT_SPEC = /(?:from\s*|import\s*|require\(\s*)["'`]([^"'`\s]+)["'`]/g
const RE_IMPORT_BARE = /\bfrom\s+([A-Za-z@][A-Za-z0-9._/-]*)/g
const RE_DEP_BLOCK = /"(devDependencies|dependencies)"\s*:\s*\{([^}]*)\}/g
const RE_DEP_KEY = /"((?:@[^"\s/]+\/)?[a-z0-9][a-z0-9._-]*)"\s*:/g

function packageOf(spec) {
  if (spec.startsWith("@")) {
    const parts = spec.split("/")
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null
  }
  return spec.split("/")[0] || null
}

function extractClaims(text) {
  const claims = new Map()
  const seen = (key) => claims.has(key)

  // declared dependency names, for import <-> dependency alignment
  const declared = new Set()
  for (const m of text.matchAll(RE_DEP_BLOCK)) {
    for (const k of m[2].matchAll(RE_DEP_KEY)) declared.add(k[1])
  }

  // npm name@version written as `"name": "1.2.3"` (package.json snippets)
  for (const m of text.matchAll(RE_JSON_PAIR)) {
    const [, name, version] = m
    if (NON_PACKAGE_KEYS.has(name)) continue
    if (name.includes("/") && !name.startsWith("@")) continue
    const key = `npm:${name}@${version}`
    if (!seen(key)) claims.set(key, { kind: "npm", name, version, source: `"${name}": "${version}"` })
  }

  // npm name@version written inline
  for (const m of text.matchAll(RE_NPM_INLINE)) {
    const [, name, version] = m
    if (NON_PACKAGE_KEYS.has(name)) continue
    const key = `npm:${name}@${version}`
    if (!seen(key)) claims.set(key, { kind: "npm", name, version, source: `${name}@${version}` })
  }

  // Maven group:artifact:version
  const mavenSeen = new Set()
  for (const m of text.matchAll(RE_MAVEN_V)) {
    const [, group, artifact, version] = m
    mavenSeen.add(`${group}:${artifact}`)
    const key = `maven:${group}:${artifact}:${version}`
    if (!seen(key)) {
      claims.set(key, { kind: "maven", group, artifact, version, source: `${group}:${artifact}:${version}` })
    }
  }

  // Maven group:artifact (version managed / omitted)
  for (const m of text.matchAll(RE_MAVEN_NO_V)) {
    const [, group, artifact] = m
    const pair = `${group}:${artifact}`
    const key = `maven-any:${pair}`
    // a pinned form of the same pair was already recorded; don't double-report
    if (mavenSeen.has(pair) || seen(key)) continue
    claims.set(key, { kind: "maven", group, artifact, version: null, source: pair })
  }

  // repo file paths
  for (const m of text.matchAll(RE_FILE_TOKEN)) {
    const p = m[1].replace(/^\.\//, "").replace(/[).,;:]+$/, "")
    if (p.startsWith("/") || p.includes("://")) continue
    const key = `path:${p}`
    if (!seen(key)) claims.set(key, { kind: "path", path: p, source: p })
  }

  // bare module specifiers from import/require
  for (const m of text.matchAll(RE_IMPORT_SPEC)) {
    const spec = m[1]
    if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#")) continue
    if (BUILTINS.has(spec)) continue
    const pkg = packageOf(spec)
    if (!pkg) continue
    const key = `import:${pkg}`
    if (seen(key)) continue
    claims.set(key, {
      kind: "import",
      name: pkg,
      source: `import '${spec}'`,
      declared: declared.has(pkg),
    })
  }

  // `from @scope/name` written without quotes (an import named in prose)
  for (const m of text.matchAll(RE_IMPORT_BARE)) {
    const spec = m[1].replace(/[.,;:'"`)\]]+$/, "")
    if (!spec || spec.startsWith(".") || spec.startsWith("/") || spec.startsWith("#")) continue
    if (!/^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(spec)) continue
    if (!/[-@./]/.test(spec)) continue
    const pkg = packageOf(spec)
    if (!pkg) continue
    const key = `import:${pkg}`
    if (seen(key)) continue
    claims.set(key, {
      kind: "import",
      name: pkg,
      source: `from ${spec} (unquoted import)`,
      declared: declared.has(pkg),
    })
  }

  // ------------------------------------------------------------------
  // bare package names: a dependency the plan names but does not pin
  // ------------------------------------------------------------------

  const covered = new Set()
  for (const c of claims.values()) if (c.kind === "npm" || c.kind === "import") covered.add(c.name)

  const addPkgName = (raw, source) => {
    const name = String(raw).trim().replace(/[.,;:]+$/, "")
    if (!name || name.length < 2) return
    if (!RE_NPM_NAMEISH.test(name)) return
    if (RE_VERSIONISH.test(name)) return
    if (PKG_STOPWORDS.has(name.toLowerCase())) return
    if (covered.has(name)) return
    covered.add(name)
    const key = `pkgname:${name}`
    if (seen(key)) return
    claims.set(key, { kind: "pkgname", name, source })
  }

  // keys of a declared dependency block ("dependencies": { "x": "^1.2.3" })
  for (const m of text.matchAll(RE_DEP_BLOCK)) {
    for (const k of m[2].matchAll(RE_DEP_KEY)) addPkgName(k[1], `"${k[1]}": ...`)
  }

  // names listed in prose on a dependency line: `backticks`, "quotes", (a, b, c)
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim()
    if (!line || !RE_DEP_CTX.test(line)) continue
    for (const re of [RE_TICK_SPAN, RE_QUOTED_SPAN, RE_LIST_SPAN]) {
      re.lastIndex = 0
      for (const m of line.matchAll(re)) {
        for (const part of m[1].split(/[,;|]/)) addPkgName(part, line)
      }
    }
  }

  // ------------------------------------------------------------------
  // `- Check:` lines: the command that is supposed to prove the subtask
  // ------------------------------------------------------------------

  let checkLines = 0
  const pathsInCheck = new Set()
  for (const rawLine of text.split("\n")) {
    const m = rawLine.match(RE_CHECK_LINE)
    if (!m) continue
    checkLines++
    const body = m[1].trim()
    RE_TICK_SPAN.lastIndex = 0
    const spans = [...body.matchAll(RE_TICK_SPAN)].map((s) => s[1].trim()).filter(Boolean)
    if (spans.length === 0) {
      const key = `check:${body}`
      if (!seen(key)) {
        claims.set(key, {
          kind: "check",
          source: `Check: ${body}`,
          note: "this Check line names no executable command, so nothing can verify it",
        })
      }
      continue
    }
    for (const span of spans) {
      RE_FILE_TOKEN.lastIndex = 0
      for (const p of span.matchAll(RE_FILE_TOKEN)) {
        pathsInCheck.add(p[1].replace(/^\.\//, "").replace(/[).,;:]+$/, ""))
      }
      for (const seg of span.split("&&")) {
        const command = seg.trim()
        if (!command) continue
        const key = `cmd:${command}`
        if (seen(key)) continue
        claims.set(key, {
          kind: "command",
          command,
          program: command.split(/\s+/)[0],
          span,
          source: `Check: \`${span}\``,
        })
      }
    }
  }

  // ------------------------------------------------------------------
  // cross-reference: what the plan creates vs what it merely runs
  // ------------------------------------------------------------------

  const filesDeclared = []
  for (const rawLine of text.split("\n")) {
    const m = rawLine.match(/^\s*-\s*Files\s*:\s*(.*)$/i)
    if (!m) continue
    RE_FILE_TOKEN.lastIndex = 0
    for (const p of m[1].matchAll(RE_FILE_TOKEN)) {
      filesDeclared.push(p[1].replace(/^\.\//, "").replace(/[).,;:]+$/, ""))
    }
  }
  const declaredByFiles = (p) =>
    filesDeclared.some((f) => {
      const d = f.replace(/\/+$/, "")
      return f === p || p.startsWith(`${d}/`) || f.startsWith(`${p}/`)
    })

  for (const c of claims.values()) {
    if (c.kind !== "path") continue
    c.createdByPlan = declaredByFiles(c.path)
    c.referencedByCheck = pathsInCheck.has(c.path)
  }

  // a bare basename only ever seen as the tail of a longer path is noise
  const longerPaths = [...claims.values()]
    .filter((c) => c.kind === "path" && c.path.includes("/"))
    .map((c) => c.path)
  for (const [key, c] of [...claims]) {
    if (c.kind === "path" && !c.path.includes("/") && longerPaths.some((p) => p.endsWith(`/${c.path}`))) {
      claims.delete(key)
    }
  }

  if (checkLines === 0) {
    claims.set("check:<none>", {
      kind: "check",
      source: "the plan as a whole",
      note: "the plan states no `- Check:` line — no subtask carries a verification step",
    })
  }

  return { claims: [...claims.values()], declared }
}

// --------------------------------------------------------------------------
// reference (stack-coordinates.mini.md)
// --------------------------------------------------------------------------

const RE_CELL_MAVEN = /^[a-z][a-z0-9_.-]*\.[a-z0-9_.-]+:[a-z][a-z0-9_.-]+$/
const RE_CELL_NPM = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z][a-z0-9._-]*$/
const RE_CELL_VERSION = /^(managed|\d+\.\d+\.\d+[0-9A-Za-z.+_-]*)$/i

function loadReference() {
  const ref = { versions: new Map(), rejected: new Set(), loaded: false }
  const p = resolve(ROOT, REF_PATH)
  if (!existsSync(p)) return ref
  ref.loaded = true

  for (const raw of readFileSync(p, "utf8").split("\n")) {
    const line = raw.trim()

    // "- **Do NOT use `org.kie:kie-bom`** — ..." -> rejected
    for (const m of line.matchAll(/Do NOT use[^`]*`([^`]+)`/gi)) ref.rejected.add(m[1].trim())

    if (!line.startsWith("|")) continue
    const cells = line
      .split("|")
      .map((c) => c.trim().replace(/`/g, ""))
      .filter((c) => c !== "")
    if (cells.length < 2) continue
    if (cells.some((c) => /^(kind|coordinate|version|package|notes?|name)$/i.test(c))) continue
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue

    // shape-agnostic: a maven coordinate cell, else an npm name cell
    const coordinate =
      cells.find((c) => RE_CELL_MAVEN.test(c)) ||
      cells.find((c) => RE_CELL_NPM.test(c) && !/^managed$/i.test(c))
    if (!coordinate) continue
    const version = cells.find((c) => RE_CELL_VERSION.test(c)) || ""
    ref.versions.set(coordinate, /^managed$/i.test(version) ? "managed" : version)
  }
  return ref
}

// --------------------------------------------------------------------------
// network checks
// --------------------------------------------------------------------------

async function fetchWithTimeout(url, network) {
  if (!network) return { ok: false, status: 0, offline: true }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" })
    return { ok: res.ok, status: res.status, res }
  } catch (err) {
    return { ok: false, status: 0, error: String(err && err.message ? err.message : err) }
  } finally {
    clearTimeout(timer)
  }
}

const npmCache = new Map()
async function npmPackument(name, network) {
  if (npmCache.has(name)) return npmCache.get(name)
  const problem = packageNameProblem(name)
  let result
  if (problem) {
    result = { status: "MISSING", detail: problem }
  } else {
    const r = await fetchWithTimeout(`${NPM_REGISTRY}/${name.replace("/", "%2f")}`, network)
    if (r.ok && r.res) {
      try {
        const body = await r.res.json()
        result = { status: "OK", versions: Object.keys(body.versions || {}) }
      } catch {
        result = { status: "UNKNOWN", detail: "registry response not JSON" }
      }
    } else if (r.offline) {
      result = { status: "UNKNOWN", detail: "network disabled" }
    } else if (r.status === 404) {
      result = { status: "MISSING", detail: "404 from registry.npmjs.org" }
    } else {
      result = { status: "UNKNOWN", detail: `registry error (${r.status || r.error || "no response"})` }
    }
  }
  npmCache.set(name, result)
  return result
}

const mavenCache = new Map()
async function mavenMetadata(group, artifact, network) {
  const key = `${group}:${artifact}`
  if (mavenCache.has(key)) return mavenCache.get(key)
  const url = `${MAVEN_CENTRAL}/${group.replace(/\./g, "/")}/${artifact}/maven-metadata.xml`
  const r = await fetchWithTimeout(url, network)
  let result
  if (r.ok && r.res) {
    const xml = await r.res.text()
    result = { status: "OK", versions: [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]) }
  } else if (r.offline) {
    result = { status: "UNKNOWN", detail: "network disabled" }
  } else if (r.status === 404) {
    result = { status: "MISSING", detail: "404 from repo1.maven.org" }
  } else {
    result = { status: "UNKNOWN", detail: `central error (${r.status || r.error || "no response"})` }
  }
  mavenCache.set(key, result)
  return result
}

// --------------------------------------------------------------------------
// validation
// --------------------------------------------------------------------------

async function validate(claim, ref, opts) {
  const out = { ...claim, status: "UNKNOWN", evidence: "" }

  if (claim.kind === "npm") {
    const meta = await npmPackument(claim.name, opts.network)
    if (meta.status === "MISSING") {
      out.status = "MISSING"
      out.evidence = meta.detail
    } else if (meta.status === "OK") {
      if (meta.versions.includes(claim.version)) {
        out.status = "OK"
        out.evidence = `${claim.name}@${claim.version} exists on npm`
      } else {
        out.status = "MISSING"
        out.evidence = `${claim.name} exists but version ${claim.version} does not (latest: ${meta.versions.at(-1)})`
      }
    } else {
      out.evidence = meta.detail
    }
  } else if (claim.kind === "maven") {
    const meta = await mavenMetadata(claim.group, claim.artifact, opts.network)
    if (meta.status === "MISSING") {
      out.status = "MISSING"
      out.evidence = `${claim.group}:${claim.artifact} not found on Maven Central`
    } else if (meta.status === "OK") {
      if (!claim.version) {
        out.status = "OK"
        out.evidence = `${claim.group}:${claim.artifact} exists (version not pinned)`
      } else if (meta.versions.includes(claim.version)) {
        out.status = "OK"
        out.evidence = `${claim.group}:${claim.artifact}:${claim.version} exists on Maven Central`
      } else {
        out.status = "MISSING"
        out.evidence = `${claim.group}:${claim.artifact} exists but version ${claim.version} does not`
      }
    } else {
      out.evidence = meta.detail
    }
  } else if (claim.kind === "path") {
    const abs = resolve(ROOT, claim.path)
    if (!abs.startsWith(ROOT)) {
      out.status = "WARN"
      out.evidence = "outside the repo"
    } else if (existsSync(abs)) {
      out.status = "OK"
      out.evidence = "exists on disk"
    } else if (claim.referencedByCheck && !claim.createdByPlan) {
      out.status = "MISSING"
      out.evidence =
        "referenced by a `- Check:` line, but it is not on disk and no `- Files:` line creates it — that check cannot pass"
    } else {
      out.status = "WARN"
      out.evidence = "not on disk (may be a file the plan intends to create)"
    }
  } else if (claim.kind === "import") {
    const meta = await npmPackument(claim.name, opts.network)
    if (meta.status === "MISSING") {
      out.status = "MISSING"
      out.evidence = `imported module '${claim.name}' is not resolvable: ${meta.detail}`
    } else if (meta.status === "OK") {
      if (claim.declared) {
        out.status = "OK"
        out.evidence = `${claim.name} exists and is a declared dependency`
      } else {
        out.status = "WARN"
        out.evidence = `${claim.name} exists on npm but is NOT among the plan's declared dependencies`
      }
    } else {
      out.evidence = meta.detail
    }
  } else if (claim.kind === "pkgname") {
    const problem = packageShapeProblem(claim.name)
    if (problem) {
      const lower = claim.name.toLowerCase()
      const alt = await npmPackument(lower, opts.network)
      if (alt.status === "OK") {
        out.status = "UNKNOWN"
        out.evidence = `named as a dependency, but '${claim.name}' is not a valid npm name (${problem}) — the package is probably '${lower}'`
      } else if (alt.status === "MISSING") {
        out.status = "MISSING"
        out.evidence = `'${claim.name}' is not a valid npm name (${problem}) and '${lower}' does not exist on npm either`
      } else {
        out.evidence = alt.detail
      }
    } else {
      const meta = await npmPackument(claim.name, opts.network)
      if (meta.status === "MISSING") {
        out.status = "MISSING"
        out.evidence = `named as a dependency but '${claim.name}' was not found on registry.npmjs.org`
      } else if (meta.status === "OK") {
        out.status = "UNKNOWN"
        out.evidence = `'${claim.name}' exists on npm but the plan pins no version — nothing here proves it is the intended package`
      } else {
        out.evidence = meta.detail
      }
    }
  } else if (claim.kind === "command") {
    const program = claim.program || ""
    const span = claim.span || ""
    if (RE_SHELL_PROGRAM.test(program)) {
      const p = program.replace(/^\.\//, "")
      if (existsSync(resolve(ROOT, p))) {
        out.status = "OK"
        out.evidence = `\`${program}\` exists in the repo and is executable`
      } else {
        out.status = "MISSING"
        out.evidence = `the command file \`${program}\` does not exist in the repo, so this check cannot run`
      }
    } else if (!onPath(program)) {
      out.status = "MISSING"
      out.evidence = `\`${program}\` is not on PATH in this container, so this check cannot run as written`
    } else if (
      /^(?:\.\/)?mvnw?$/.test(program) &&
      !ROOT_HAS_POM &&
      !/(?:^|\s)-f(?:\s|=)|--file/.test(span) &&
      !/\bcd\s+\S/.test(span)
    ) {
      out.status = "WARN"
      out.evidence = "there is no pom.xml at the repo root and the command has no `-f <pom>` and no leading `cd <dir>`, so mvn cannot resolve a project from here"
    } else {
      out.status = "OK"
      out.evidence = `\`${program}\` is available`
    }
  } else if (claim.kind === "check") {
    out.status = "UNKNOWN"
    out.evidence = claim.note || "this Check line cannot be verified mechanically"
  }

  // reference cross-check (stack-coordinates.mini.md is authoritative)
  const names = []
  if (claim.kind === "npm" || claim.kind === "import" || claim.kind === "pkgname") names.push(claim.name)
  if (claim.kind === "maven") names.push(`${claim.group}:${claim.artifact}`, claim.group)
  for (const n of names) {
    if (ref.rejected.has(n)) {
      out.status = "REJECTED"
      out.evidence = `${n} is explicitly forbidden by ${REF_PATH}`
      break
    }
  }

  if (out.status !== "REJECTED" && claim.kind === "maven") {
    const expected = ref.versions.get(`${claim.group}:${claim.artifact}`)
    if (expected === "managed" && claim.version) {
      out.status = "CONFLICT"
      out.evidence = `${REF_PATH} marks ${claim.group}:${claim.artifact} as "managed" — do not pin a version`
    }
  }
  if (out.status !== "REJECTED" && claim.kind === "npm") {
    const expected = ref.versions.get(claim.name)
    if (expected && expected !== "managed" && expected !== claim.version) {
      out.status = "CONFLICT"
      out.evidence = `${REF_PATH} lists ${claim.name} as ${expected}, the plan says ${claim.version}`
    }
  }

  return out
}

// --------------------------------------------------------------------------
// output-grammar (BNF) shape audit
// --------------------------------------------------------------------------

// .opencode/agents/architect.md:199-218 — a plan turn is `phase { phase } wait`,
// and every subtask carries exactly the four labelled lines below.
const ROLE_TERMINALS = new Set(["coder", "researcher", "reviewer", "ui", "artist", "fact-checker"])
const RE_PHASE_HEAD = /^##\s+Phase\s+\d+\s+[—–-]/m
const RE_SUBTASK_HEAD = /^\s*\*\s+T\d+(?:\.\d+)?\s+[—–-]/
const REQUIRED_SUBTASK_LINES = ["Files", "Change", "Check", "Role"]

function auditShape(text) {
  const findings = []
  const lines = text.split("\n")
  const starts = []
  lines.forEach((l, i) => {
    if (RE_SUBTASK_HEAD.test(l)) starts.push(i)
  })
  const hasPhase = RE_PHASE_HEAD.test(text)
  // Not a plan turn (a `wait`/`status`/`blocked` fragment): the plan grammar has nothing to check.
  if (starts.length === 0 && !hasPhase) return findings

  if (starts.length > 0 && !hasPhase) {
    findings.push({
      status: "MISSING",
      source: "plan shape",
      evidence:
        "subtasks were found but no `## Phase <n> — <title>` header: the grammar is `plan ::= phase { phase } wait` (.opencode/agents/architect.md:206)",
    })
  }
  if (hasPhase && starts.length === 0) {
    findings.push({
      status: "MISSING",
      source: "plan shape",
      evidence:
        'a phase header was found but no `* T<n> — <title>` subtask: the grammar is `phase ::= "## Phase " INT " — " LINE NL { subtask }` (.opencode/agents/architect.md:206-207)',
    })
  }

  starts.forEach((start, n) => {
    const end = n + 1 < starts.length ? starts[n + 1] : lines.length
    const block = lines.slice(start, end)
    const id = (lines[start].match(/T\d+(?:\.\d+)?/) || ["T?"])[0]
    for (const label of REQUIRED_SUBTASK_LINES) {
      const re = new RegExp(String.raw`^\s*-\s*${label}\s*:`, "i")
      if (!block.some((l) => re.test(l))) {
        findings.push({
          status: "MISSING",
          source: `subtask ${id}`,
          evidence: `no \`- ${label}: \` line — the subtask production requires Files, Change, Check and Role (.opencode/agents/architect.md:208-212)`,
        })
      }
    }
    const roleLine = block.map((l) => l.match(/^\s*-\s*Role\s*:\s*[`"']?([A-Za-z-]+)/i)).find(Boolean)
    if (roleLine) {
      const role = roleLine[1].toLowerCase()
      if (!ROLE_TERMINALS.has(role)) {
        findings.push({
          status: "MISSING",
          source: `subtask ${id}`,
          evidence: `role '${role}' is not a ROLE terminal (coder | researcher | reviewer | ui | artist | fact-checker) (.opencode/agents/architect.md:218)`,
        })
      }
    }
  })

  if (!/^\s*I am waiting for approval\s*$/m.test(text) && !/^\s*BLOCKED:/m.test(text)) {
    findings.push({
      status: "WARN",
      source: "plan shape",
      evidence:
        "the turn does not end with the `wait` production (`I am waiting for approval`) or a `blocked` turn (.opencode/agents/architect.md:206,214)",
    })
  }

  return findings
}

// --------------------------------------------------------------------------
// main
// --------------------------------------------------------------------------

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const plan = readPlan(opts)
  const ref = loadReference()
  const { claims } = extractClaims(plan)

  const results = await Promise.all(claims.map((c) => validate(c, ref, opts)))
  for (const f of auditShape(plan)) results.push({ kind: "shape", ...f })

  const substantive = results.filter(
    (r) => r.kind !== "check" && r.kind !== "command" && r.kind !== "shape",
  )
  if (substantive.length === 0) {
    results.push({
      kind: "plan",
      status: "INSUFFICIENT",
      source: "the plan as a whole",
      evidence:
        "no substantive claim could be extracted: the plan names no verifiable file path, version, coordinate, import or package. An unauditable plan is not a clean plan.",
    })
  }

  const rank = (s) => (BLOCKING.has(s) ? 0 : s === "WARN" ? 1 : s === "UNKNOWN" ? 2 : 3)
  results.sort((a, b) => rank(a.status) - rank(b.status) || a.source.localeCompare(b.source))

  const blockers = results.filter((r) => BLOCKING.has(r.status))
  const payload = {
    plan: opts.planPath || "<stdin>",
    reference: ref.loaded ? REF_PATH : `${REF_PATH} (missing)`,
    summary: {
      total: results.length,
      substantive: substantive.length,
      checkCommands: results.filter((r) => r.kind === "command").length,
      blocking: blockers.length,
      verdict: blockers.length ? "FAIL" : "PASS",
      byStatus: results.reduce((acc, r) => ((acc[r.status] = (acc[r.status] || 0) + 1), acc), {}),
    },
    claims: results,
  }

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)

  if (!opts.quiet) {
    const icon = {
      OK: "ok  ",
      MISSING: "FAIL",
      REJECTED: "FAIL",
      CONFLICT: "FAIL",
      INSUFFICIENT: "FAIL",
      WARN: "warn",
      UNKNOWN: "?   ",
    }
    process.stderr.write(
      `\nplan claim check — ${payload.summary.total} claim(s), ${substantive.length} substantive, ` +
        `${payload.summary.checkCommands} check command(s), ${blockers.length} blocking  [${payload.reference}]\n`,
    )
    for (const r of results) {
      process.stderr.write(`  [${icon[r.status] || r.status}] ${r.source} — ${r.evidence}\n`)
    }
    if (blockers.length) {
      process.stderr.write(
        `\nRESULT: FAIL — ${blockers.length} claim(s) must be fixed before the plan can be approved.\n`,
      )
    } else {
      process.stderr.write("\nRESULT: PASS — no blocking claim.\n")
      if (substantive.length < 3) {
        process.stderr.write(
          `NOTE: only ${substantive.length} substantive claim(s) — the plan may be too vague to audit.\n`,
        )
      }
    }
  }

  process.exit(blockers.length ? 1 : 0)
}

main().catch((err) => {
  process.stderr.write(`verify-plan-claims: ${err && err.stack ? err.stack : err}\n`)
  process.exit(2)
})
