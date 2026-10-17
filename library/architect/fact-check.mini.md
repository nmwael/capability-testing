# Fact-check (pre-approval plan verification)

**Purpose.** No plan reaches the human approval gate until an independent `fact-checker` has verified its
checkable claims. A self-check is not a fact-check: the same model that invented a coordinate will not
notice it invented it. This playbook defines what counts as a claim, where each claim must be grounded,
how findings are graded, and how the architect and the `fact-checker` exchange the work.

## 1. Claim taxonomy (what must be checked)

A **claim** is any assertion in the plan that can be true or false independently of taste. Every plan must
be auditable on these axes:

| Axis | Example | Checked against |
|---|---|---|
| npm package + version | `@xyflow/react@12.12.0`, `"vite": "8.3.4"` | `registry.npmjs.org` |
| npm name shape | `@types/vitejs/plugin-react` (invalid: 2 slashes) | name grammar |
| Bare package name | `@xyflow/react` named with no version, `React-Flow` | `registry.npmjs.org` |
| Maven coordinate | `org.drools:drools-bom:10.2.0`, `org.kie:kie-api` | `repo1.maven.org` |
| Repo path | `backend/alerting/src/main/resources/rules/alert-routing.drl`, `backend/common/src/main/resources/cap-v1.2.xsd` | the working tree |
| Imported module | `import { ReactFlow } from '@xyflow/react'` | registry + the plan's declared deps |
| CLI flag / subcommand | `vite --no-quiet --devtools` | the tool's `--help` / docs |
| API symbol / prop | `<ReactFlow controlled={false}>` | package types / docs |
| Ground rule | "DRL under `backend/src/**`" | `library/architect/stack-coordinates.mini.md` |
| Command + expected exit | `mvn -q -pl alerting -am validate` exits 0 | PATH + the working directory it runs from |
| Plan shape (BNF) | a subtask with no `- Check:` line, a bad `Role:` | the grammar in `.opencode/agents/architect.md` |

The mechanical checker (`scripts/verify-plan-claims.mjs`) covers the coordinate, name, path, import,
command and shape axes deterministically. The `fact-checker` must cover the rest by reading the referent —
and must cover the checklist in `.opencode/agents/fact-checker.md` step 3 (a)–(h) regardless, because
existence is not meaning.

## 2. The source-of-truth ladder

Ground a claim with the **first** rung that applies; never skip a rung to reach a convenient answer:

1. **The working tree**, cited as `path:line` — for anything about this repo's own files.
2. **`library/architect/stack-coordinates.mini.md`** — for versions/coordinates already verified for this box.
   If the plan contradicts this file, the file wins; the claim is a `CONFLICT`.
3. **The live registry** (`registry.npmjs.org`, `repo1.maven.org`) — for existence and version availability.
4. **The package's own docs / types** (`webfetch`) — for API shape (prop names, exports, flags).
5. **UNKNOWN** — when no rung applies. **`UNKNOWN` always beats guessing.** An unverifiable load-bearing
   claim is a `high` finding, not a pass.

## 3. Running the checker

The plan's canonical home is a GitHub **issue**, so publish it there and check it there:

```sh
gh issue create --repo <owner>/<name> \
  --title "Plan: <short label>" \
  --body "$(cat <<'PLAN'
<the plan, inlined verbatim>
PLAN
)" --label kind:plan --label hitl:awaiting-approval

node scripts/verify-plan-claims.mjs --issue <the number gh printed>
```

- Publish the plan **byte-for-byte**: the issue body is the artifact, and `--issue` fact-checks exactly the
  bytes GitHub returns. A reformatted body is a plan the architect did not write.
- `--issue <n>` needs `gh` and `GH_TOKEN`. It is the only networked input path; `--plan <file>` remains the
  offline form for a plan already on disk (`cat plan.md | node scripts/verify-plan-claims.mjs` reads stdin).
- Exit `0` = no blocking claim. Exit `1` = at least one `MISSING`, `REJECTED`, `CONFLICT`, or `INSUFFICIENT`.
- `--quiet` prints only the JSON payload; `--no-network` skips the registry lookups (use when offline —
  unverifiable claims then report `UNKNOWN`).
- Statuses: `OK`, `MISSING` (does not exist / cannot run), `REJECTED` (forbidden by the reference),
  `CONFLICT` (contradicts the reference), `WARN` (suspicious but not fatal, e.g. an import outside the
  declared deps), `UNKNOWN` (could not be checked — e.g. offline, or a name pinned to no version),
  `INSUFFICIENT` (the plan named nothing substantive).
- `summary.substantive` counts the claims that actually pin the plan down (paths, versions, coordinates,
  imports, package names) — check-command and shape rows are reported but not counted. Fewer than three
  substantive claims means the plan is too vague to audit, and `INSUFFICIENT` (zero) is blocking: an
  unauditable plan is not a clean plan.
- The checker proves **existence**, not **correctness of use**. `react-flow-renderer` is a real npm package;
  that it is the wrong one for a v12 plan is the `fact-checker`'s judgement, informed by the `WARN`.

## 4. Severity and the blocking rule

| Severity | Meaning | Blocks approval? |
|---|---|---|
| `high` | Claim is false, forbidden by the reference, or unverifiable **and** load-bearing. | **YES** — until fixed or dropped |
| `medium` | Probably wrong or incomplete; not load-bearing on its own. | No, but must be reported |
| `low` | Hygiene: an unstaged path, a missing courtesy note. | No |

The architect may not present a plan carrying an unresolved `high`. If a `high` claim is genuinely
required, the architect names the human decision it needs instead of silently keeping the claim.

A `Result` whose `findings` are only the checker's own output is **not a fact-check** — the checker proves
existence, never meaning, so the `fact-checker` must also work the (a)–(h) checklist in its own system
prompt (shape, reference, modified files, commands, roles, dependencies, success criteria, symbols). A
plan that pins nothing is `INSUFFICIENT`: the checker fails it, and the finding is `high`, not a pass.

## 5. The architect → fact-checker Directive

One Directive, the plan inlined verbatim (the specialist sees nothing else):

```json
{
  "task_id": "F1",
  "role": "fact-checker",
  "objective": "Fact-check plan P1 before human approval",
  "context": "<FULL plan text, verbatim — every phase and subtask>",
  "files": ["frontend/package.json", "backend/alerting/pom.xml"],
  "success_criteria": [
    "scripts/verify-plan-claims.mjs run against the inlined plan",
    "every high finding cites path:line, a URL, or raw checker output"
  ],
  "iteration": 1
}
```

The reply is a `Result` with `findings[]` (`{severity, claim, source, issue, suggestion}`). On the second
round, increment `iteration`. After two rounds with an open `high`, the architect stops and reports
`BLOCKED` — the loop is deliberately bounded.

## 6. Repo-specific traps already observed

- `@types/vitejs/plugin-react` — not a package; `@vitejs/plugin-react` ships its own types.
- `org.kie:kie-api` pinned to `7.74.1.Final` — the stale KIE 7 line; it is BOM-managed by
  `org.drools:drools-bom`. Pinning it is a `CONFLICT`.
- `react-flow-renderer` / `reactflow` in a plan that pins `@xyflow/react@12.x` — a v10/v11 package in a v12
  plan.
- Vite flags invented by pattern-matching (`--no-quiet`, `--devtools`) — verify against the tool, never infer.
- A `.drl` under `backend/src/**` — that tree is not a Maven module and is on no classpath.
- A `frontend/` Vite app with no `index.html` (and no `src/main.tsx`) — `vite build` then has no entry.
- A package named in prose (`React-Flow`, `React`) — not a valid npm name (uppercase is impossible in npm);
  the checker reports it `UNKNOWN`, because a name with no version pin is invisible to every version check.
- A file named in a `- Check:` line that no `- Files:` line creates (`bats test-frontend.bats`) —
  `MISSING`: the check can never pass, so the subtask is not implemented.
- `mvn -pl <module>` with no `pom.xml` at the repo root and no `-f <pom>` or leading `cd <dir>` — Maven
  cannot resolve a project from there (`WARN`), so the claimed "exits 0" is false.
- A plan that pins no version, coordinate or command at all, so the checker extracts nothing —
  `INSUFFICIENT`, which blocks. Silence is not cleanliness.
