# PLAN.md — resume point

**Status:** the tooling round is **closed**; the retrofit is the only open item. `main == origin/main`;
working tree clean (see `git log -1` for the exact sha that carries this update).
**Written:** 2026-10-12. **Updated:** 2026-10-13.

This file is the handoff. It records where the work stopped, what to do next, and the
environment facts needed to pick it up without re-deriving them.

> **2026-10-13 progress.** Every §4 item except the retrofit is done and reviewer-gated:
> config-drift `987162f`, Track 1 `e822292`, LSP `27fbdb4`, fact-check stage `bc7d082`,
> F4/F5 + gate runner `1882a3c`, the gate's echo mechanic `a4aa9f5` + `71b3a90`,
> fact-checker hardening `1771fb2`, reviewer hardening `8daef2b`, GPU offload `8e93fbf`,
> then `c6851f5` closed the tooling round (`echo-check` promoted; the reviewer's inert
> temperature fixed), and **F9 (this commit)** makes a test run unable to invalidate a
> shipped attestation. §2, §3 and §5 below have been rewritten to match; §6 gained the verified
> V2.0.26 config facts.

---

## 1. Objective (why this work exists)

Make `@architect` do **one large plan and every step of it in a single continuous run**, guarded
by a **pre-approval fact-check stage** that finds the architect's own plan defects — then use it to
retrofit this repo: **React Flow on the frontend, Apache Drools on Quarkus on the backend**.

Requirements that shaped the design:

- The fact-check stage is a **dedicated agent** (`fact-checker`), independent of the `reviewer`.
- Model pins: `architect` stays on **granite 4.2-3b** (user declined qwen-9b, twice); granite holds the
  larger context (**131072 @ q4_0**); qwen 3.5-9b-mtp runs **q8_0** KV (not q4_0) and is the `coder`.
- The `coder` must be able to use LSP servers (permission granted).
- Commit and push; order was config-drift migration → coder fixes → this fact-check work.

## 2. Status snapshot

| Item | State | Commit |
|---|---|---|
| Config-drift migration | done, pushed | `987162f` |
| Track 1 fixes (F1–F5 of the earlier round) | done, pushed | `e822292` |
| LSP allow for `coder` | done, pushed | `27fbdb4` |
| Fact-check stage (agent + checker + playbook + roster) | done, pushed, reviewer-gated | `bc7d082` |
| F1–F3 (checker coverage, checker harden, gate backstop) | done, pushed | `e8d240a` |
| F4 (reviewer read-only hardening) + F5 (fixtures as a regression test) | done, pushed | `1882a3c` |
| Gate runner (`--attest`/`--verify`) — task accounting without transcription | done, pushed | `a4aa9f5`, `71b3a90` |
| Fact-checker hardening (evidence, banned phrasing, self-check) | done, pushed | `1771fb2` |
| Reviewer hardening (`--attest`, bounded output, verbatim discipline) | done, pushed | `8daef2b` |
| GPU offload made permanent in `scripts/auto-startup.sh` | done, pushed, measured | `8e93fbf` |
| `scripts/echo-check.mjs` — the witness for "the message was the runner's stdout" | done, pushed, tested offline | `c6851f5` |
| Reviewer temperature moved off inert `request.body` | done, pushed | `c6851f5` |
| F9 — a test run can no longer invalidate a shipped attestation | done, pushed, gated | this commit |
| React Flow / Drools retrofit | **not started — the only open item** | — |

**The gate is green and the artefact is current.** `RV-F12345` passes end-to-end
(`node scripts/review-gate.mjs --task RV-F12345` → 20 claims / 64 checks / `status: done` /
2 medium advisories, exit 0), and `wip/review-gate/RV-F12345.envelope.json` is the deliberate
`--attest --force` output of exactly that run (21 002 bytes, 64 checks, sha256 `97984608…`).
The reviewer no longer hand-copies anything: `--attest` writes the envelope and prints a short
attestation that `--verify` re-hashes. **Honest caveat:** the three earlier live reviewer
attestations no longer verify — their cited digests were destroyed by the very suite regression F9
fixes (recorded in §5, "attestation invalidation").

## 3. What landed in `e8d240a` (5 files, +452/−29)

- **F1 — `scripts/verify-plan-claims.mjs`** (+404 lines): extracts bare package names; checks every
  `- Check:` command (program on `PATH`, command file exists in the repo, `mvn` needs a resolvable
  project); audits the architect's output grammar (BNF) shape; new **blocking `INSUFFICIENT`** status
  when no substantive claim can be extracted; `summary.substantive` / `summary.verdict` so a low
  claim count reads as suspicious rather than clean.
  - Refinement made during implementation (a superset of the approved wording, noted in the commit):
    registry 404 → `MISSING` (blocking); registry 200 → `UNKNOWN` (visible, non-blocking); a
    lowercase-shape name is looked up lowercased; `mvn` with no repo-root `pom.xml` and no `-f`/leading
    `cd` → `WARN` (non-blocking, keeps the clean fixture at exit 0).
- **F2 — `.opencode/agents/fact-checker.md`** (`:49–57`) + **`library/architect/fact-check.mini.md`**:
  mandatory non-mechanical checklist items (a)–(h); a checker-transcript-only Result is **invalid**;
  `INSUFFICIENT` or fewer than three substantive claims is itself a `high` finding.
- **F3 — `AGENTS.md`**: `:7` (hard gate now requires a `fact-checker` Result) and `:82` (orchestrator
  backstop — never present a plan without a Result; re-delegate with an **atomic, single-objective**
  Directive when the architect emits no tool call).
- **F4 (partial) — `.opencode/agents/reviewer.md`**: `edit: deny` added to the frontmatter (`:5–7`), so
  the "you cannot edit files" rule is enforced rather than requested.

### What landed after `e8d240a` (the tooling round is closed)

- **F4/F5 — `1882a3c`:** `edit: deny` plus the Read-only / scope / tool-budget discipline in
  `.opencode/agents/reviewer.md`, and the four acceptance fixtures promoted from gitignored `wip/`
  to `scripts/test/fixtures/plans/*.md` with `scripts/verify-plan-claims.test.mjs` over them.
- **Gate runner `--attest`/`--verify` — `a4aa9f5`, `71b3a90`.** The auditor no longer hand-copies a
  47-check envelope: `--attest` writes it to `wip/review-gate/<task_id>.envelope.json` and prints a
  ~1 KB attestation carrying that file's path/size/sha256 + findings; `--verify` re-hashes it and
  compares exactly what a paraphrase would corrupt (`task_id`, `role`, `status`, `findings`), tolerates
  one wrapping fence, resolves a dropped `artifact` pointer from `task_id`, and reports a re-worded
  `summary` in `notes` rather than failing a correct audit. An artifact is immutable evidence:
  `--attest` refuses to overwrite a differing one unless `--force`.
- **Hardening — `1771fb2` (fact-checker), `8daef2b` (reviewer).** Evidence rules and banned phrasing
  for the fact-checker; `--attest` as the reviewer's primary path, a bounded-output alias
  (`granite-4.2-3b-bounded`, `limit.output: 16384`) and the "Verbatim discipline (binding)" section.
- **`scripts/echo-check.mjs` + `scripts/echo-check.test.mjs` (`c6851f5`).** The witness for the
  verbatim claim: it reads the session store the runtime wrote (read-only) and grades the final
  message `byte-identical` / `identical-ignoring-fence` / `findings-only` / `differs`, with `--verify`
  driving the runner's own `--verify` over the extracted message. The scratch `wip/rg/` pair is
  promoted there, not merely moved. **Live proof at the time of that commit:** two reviewer sessions
  verified `valid` against the then-current `wip/review-gate/RV-F12345.envelope.json` (14 497 bytes,
  47 checks). That artefact no longer exists on disk — a later suite run rewrote it — so both
  attestations now return `invalid-attestation` (§5, "attestation invalidation").
- **Reviewer temperature (`c6851f5`).** `opencode.json` nested it under `request.body`, but the
  V2.0.26 `AgentConfig` defines **no `request` field** (see §6), so the setting was inert; the reviewer
  block now carries a top-level `"temperature": 0.1`, which the schema does define. The other seven
  agent blocks still nest theirs under `request.body` — recorded as advisory `F4b`, not silently fixed.
- **F9 — a test run can no longer invalidate an attestation (this commit).** `checkReadOnly` in
  `scripts/review-gate.test.mjs` used to `rmSync` the shipped artefact and then let `--attest` rewrite
  it — and `checkAttestMode` attested to the same default path — so **every suite run silently
  replaced** `wip/review-gate/RV-F12345.envelope.json` and orphaned any attestation citing its hash.
  Now `scripts/review-gate.mjs` *and* `scripts/echo-check.mjs` resolve the default directory through
  `REVIEW_GATE_ATTEST_DIR`; the suite runs every default-path `--attest` case against scratch space
  (`ATTEST_SCRATCH`), and a new case asserts `wip/review-gate/` is **byte-identical before and after**
  the suite. The only remaining write to the shipped path is a deliberate `--attest --force`. Pinned
  as `K20` (8 checks), including a `file_not_contains` that keeps the destructive `rmSync` from coming
  back and a probe that proves the redirect is honoured rather than vacuously true.

### Verification already run (all green)

```sh
node --check scripts/verify-plan-claims.mjs
node --check scripts/review-gate.mjs
node --check scripts/review-gate.test.mjs
node scripts/verify-capabilities.js                 # PASS
node scripts/verify-plan-claims.test.mjs            # PASS — 4 fixtures
node scripts/review-gate.test.mjs                   # PASS — incl. "wip/review-gate/ is byte-identical after the suite"
node scripts/echo-check.test.mjs                    # PASS — 18 assertions
node scripts/review-gate.mjs --task RV-F12345       # exit 0, status done — 20 claims / 64 checks
```

(The F9 claim was verified by hashing `wip/review-gate/RV-F12345.envelope.json` around a run of every
one of those suites: unchanged, sha256 `97984608…`.)

Acceptance fixtures (committed by F5, no longer gitignored `wip/`):

| Fixture | Expected | Why |
|---|---|---|
| `scripts/test/fixtures/plans/plan-rf-clean.md` | **exit 0** | the corrected retrofit plan |
| `scripts/test/fixtures/plans/plan-rf.md` | **exit 1** | carries the two canonical blockers (malformed `@types/vitejs/plugin-react`; `org.kie:kie-api:7.74.1.Final` CONFLICT vs the reference) |
| `scripts/test/fixtures/plans/plan-vague.md` | **exit 1** | the architect's real vague plan — blocked by `MISSING` `test-frontend.bats` |
| `scripts/test/fixtures/plans/plan-empty.md` | **exit 1** | pins nothing → `INSUFFICIENT` |

## 4. Resume checklist (in order)

1. ~~**Finish F4 — `.opencode/agents/reviewer.md`.**~~ **DONE** (`1882a3c`): read-only/scope/budget
   discipline, the escaped-JSON `blocker` example, and the `AGENTS.md` roster row.
2. ~~**F5 — commit the acceptance fixtures as a regression test.**~~ **DONE** (`1882a3c`):
   `scripts/test/fixtures/plans/*.md` + `scripts/verify-plan-claims.test.mjs`.
3. ~~**Run the mandatory `reviewer` gate** over F1–F4.~~ **DONE**: `RV-F12345` is green
   (20 claims / 64 checks / `status: done`, exit 0) and the artefact is attested. The two live sessions
   this line originally cited are now `invalid-attestation` — their artefact was rewritten by the suite
   (F9, §5). The fix is in; the lost bytes are not recoverable.
4. **Retrofit — the only open item.** Re-run `@architect` on: *"please make this repo be about react
   flow for front end and apache drools using quarkus for backend"* — confirm the gate fires (a
   `fact-checker` `Result` must be attached **before** approval), approve, execute the corrected plan,
   finish with the reviewer gate. Then run
   `node scripts/echo-check.mjs <reviewer-session> --verify` and keep the attestation artefact.
5. **Optional follow-ups, not blockers:** migrate the other seven agents' `request.body.temperature`
   (§3, advisory `F4b`); drop the inert `action: execute` deny from `reviewer.md:9` and
   `fact-checker.md:9` (advisory `F4`); register `stack-coordinates.mini.md` in the library manifest.

## 5. Open risks and known defects

- **Reviewer malfunction — CLOSED.** Root cause of the ungated commit: it ran 20 tool calls with no
  Result, globbed `**/*.md` (45k tokens) and **rewrote two acceptance fixtures mid-review**. Fixed by
  F4 (read-only discipline + `edit: deny`), F5 (fixtures committed, so loss is visible in `git status`)
  and the echo rework: the reviewer now runs `--attest`, and `scripts/echo-check.mjs --verify` proves
  the audit mechanically. Historical detail kept above in git history.
- **The architect still will not reliably emit tool calls on a broad brief.** Measured six times now:
  it deliberates (24k–79k reasoning chars) and then either returns a stub plan, *prints* the Directive
  JSON as prose (4×), spawns 17 `fact-checker` children without converging and then emits
  `status:"done"` with a **fabricated** summary ("verified … no high severity findings") and a
  `findings[]` of non-findings ("file exists on disk") — i.e. **no valid fact-check `Result` at all**,
  so the turn is invalid per the gate backstop — or, handed the atomic one-action re-delegation,
  delegates to a `researcher` instead of the mandated single `fact-checker` call. The workaround —
  "your one action this turn is a `subagent` TOOL CALL", with the plan inlined verbatim and nothing
  else in the turn — is what `F3` and `AGENTS.md § Orchestration Flow` step 2 encode. **Still the
  retrofit's biggest execution risk**; the retrofit has *not* been approved and no code has been
  written for it (`wip/fact-check/plan.md` fails `scripts/verify-plan-claims.mjs`: `MISSING` subtask
  shape, `Check:` lines that name no executable command, a Check that asserts its own tautology).
- **Attestation invalidation (F9 — fixed, damage is not reversible).** A suite run used to rewrite
  `wip/review-gate/RV-F12345.envelope.json`, and the artefact's own history on this checkout proves
  it: 12 737 B / 41 checks → 14 497 B / 47 → 17 478 B / 56 → 21 002 B / 64 (the last one deliberate,
  `--attest --force`). Consequence: **all three** reviewer sessions that attested an earlier state now
  fail `node scripts/echo-check.mjs <session> --verify` with `invalid-attestation` — two mismatch on
  `findings[]` (they carry no `artifact` pointer, so the runner resolves the *current* artefact from
  `task_id`), and one still cites sha256 `ac1b930e…`, 12 737 bytes, 41 checks. The destroyed bytes are
  unrecoverable (the file is gitignored scratch, never committed), so F9 prevents recurrence without
  restoring the evidence: the redirect plus the byte-identity assertion are the fix, and the shipped
  artefact was refreshed deliberately rather than silently.
- **The fact-checker is improved but noisy when live.** It records the (a)–(h) checklist in `summary`
  and emits a step-3 `high`, but it has produced duplicate findings, one invalid `severity:"pass"`,
  extra `checks`/`artifacts` fields, and dismissed `UNKNOWN` package names. One later iteration also
  **downgraded the central plan defect `high`→`medium`** and asserted that `llama-server` does not
  support `--n-gpu-layers` — false, `llama-server --help` lists `-ngl, --gpu-layers, --n-gpu-layers N`.
  Treat this as a granite-3B reliability limit, not a prompt gap: **read its findings, do not trust
  its severity.**
- **The gate verifies shape, not freshness.** `--verify` re-hashes the artefact but does not re-run the
  gate, so it is only meaningful while the tree is unchanged — the echo is a point-in-time witness.
  Corollary (F9): a checklist change makes the shipped artefact stale, and `--attest` then *refuses*
  to overwrite it; refresh deliberately with `--attest --force` when you intend to re-baseline.
- **`library/architect/stack-coordinates.mini.md` is not registered** in `library/manifest.json` or
  `library/README.md` (pre-existing gap, deliberately out of scope — the checker reads it by path).
- **Doc drift:** `AGENTS.md` references `scripts/generate-opencode.jq`, which does not exist.
- **GPG:** `user.signingkey` is a smartcard key and the card is unreachable here
  (`gpg --card-status` → *OpenPGP card not available: Forbidden*). `commit.gpgsign=false` is set
  globally; recent commits are unsigned by necessity and no history was rewritten.

## 6. Environment facts (do not re-derive)

**Services / models**
- granite-4.2-3b on `:8089`; qwen3.5-9b-mtp on `:8090`; bifrost on `:8082`; opencode server on `:4096`.
- All agents on granite except `coder` (qwen 3.5-9b-mtp). `experimental.subagent_depth: 2`.
- Local-only unless `CLOUD_MODE=true`. `websearch` is disabled for agents by design — use `webfetch`.
- Agent prompts are read **per call**; a running server picks up edited agent files without a restart
  (proven for the architect prompt and the `fact-checker` agent).

**Repo shape (relevant to the retrofit)**
- **No `pom.xml` at the repo root.** `backend/pom.xml` is the reactor: modules `common`, `billing`,
  `invoicing` (`:12–14`), Quarkus 3.15.1, release 17. Drools integration target:
  `backend/invoicing/pom.xml`; DRL must live under a real module,
  e.g. `backend/<module>/src/main/resources/rules/*.drl`.
- `frontend/package.json` is a **broken stub**: `"react": "^^"`, `"react-dom": "^^"`,
  `"@types/react": "^^"`, and only a `start` script. It blocks the retrofit outright.
- Retrofit target: `frontend/src/features/invoicing/InvoiceList.tsx`.

**Verified retrofit coordinates**
- npm: `react@19.3.0`, `react-dom@19.3.0`, `@xyflow/react@12.12.0`, `reactflow@11.11.4`, `vite@8.3.4`,
  `@vitejs/plugin-react@6.1.2`, `typescript@7.0.2`.
- Maven: `org.drools:drools-bom:10.2.0`.
- There is **no official Quarkus Drools extension** — integrate Drools as a plain library through a CDI
  producer. Quarkus health endpoint is `/q/health`.

**Registry / PATH quirks the checker relies on**
- npm names are lowercase: `React`→404 (`react`→200), `React-Flow`→404 (`react-flow`→200),
  `TypeScript`→404 (`typescript`→200).
- On `PATH`: `bats`, `npm`, `npx`, `node`, `mvn`, `pnpm`, `yarn`. **MISSING**: `mvnw`, `gradle`, `tsc`,
  `vite`, `depcruise`.
- `-pl <module>` validation was **deliberately dropped**: `-pl` is CWD-dependent, so a naive existence
  check passes even though `mvn -pl backend` from the repo root fails (no root pom). Commands are
  surfaced and graded by the `fact-checker` (F2) instead.

**LSP (established — do not re-litigate):** OpenCode v2.0.26 never starts LSP servers on the agent
read/edit path in this container — five controlled attempts produced zero spawns, zero downloads, and
an empty `~/.cache/opencode`. Prefer CLI checks: `npm run typecheck`, `mvn -B test`, `depcruise`,
`node scripts/verify-capabilities.js`.

**OpenCode v2.0.26 config shapes:** `providers.<id>.{name,package,settings,headers,models}`;
`agents.<id>.{model,steps,temperature,prompt,tools,permissions,mode,...}` — the published schema
(`https://opencode.ai/config.json`) has **no `request` field on `AgentConfig`**, so every
`agents.*.request.body.temperature` block in `opencode.json` was inert; the `reviewer` is the one
migrated to a top-level `temperature`. `permissions` is an ordered `{action,resource,effect}` list
where the **last match wins**; the real actions are `shell` (the shell tool), `edit` (write/patch) and
`subagent` (task) — an `action: execute` rule matches nothing and is inert, so `edit: deny` is the
enforced read-only guarantee; there is no `lsp` action and `*` matches everything. A per-model
`limit.output` (e.g. the `granite-4.2-3b-bounded` alias, 16384) is what bounds a step, not
`request.body`.

**Attestation scratch (F9):** the default attestation directory is `wip/review-gate`, overridable with
`REVIEW_GATE_ATTEST_DIR` — honoured by `scripts/review-gate.mjs` (default path *and* the `--verify`
`task_id` fallback), by `scripts/echo-check.mjs`, and documented in `--help`.
`scripts/review-gate.test.mjs` points it at scratch space, so **a suite run cannot touch a real
artefact**; it asserts `wip/review-gate/` is byte-identical before and after. A checklist change leaves
the shipped artefact stale and `--attest` then refuses it — re-baseline deliberately with
`node scripts/review-gate.mjs --task RV-F12345 --attest --force`.

**The session store (for `scripts/echo-check.mjs`):** `~/.local/share/opencode/opencode.db` (SQLite,
open **read-only**), table `session_message(session_id, type, data, seq)`; an assistant row's
`data.content[]` text parts are the message, and `data.agent` / `data.model.id` name the author. The
final message is the last `type='assistant'` row that actually carries text.

**GPU / servers:** `nvidia-smi` is **not installed** — use `llama-server --list-devices`; logs live in
`/tmp/llama-server-*.log`; `-ngl` / `--gpu-layers` / `--n-gpu-layers` are all accepted (the last
rejected plan claimed otherwise). `scripts/auto-startup.sh` probes the device and applies the offload
permanently; measured 138.69 tok/s on GPU vs 10.5 on CPU for granite. MTP spec-decoding on GPU cost
0.79 tok/s vs 38.2 off, so `scripts/auto-startup.sh` gates MTP accordingly. Bifrost runs via
`start-bifrost` (forks `bifrost-http`; kill both or `:8082` stays held).

## 7. Deliberately out of scope

- Registering `library/architect/stack-coordinates.mini.md` in the library manifest/README.
- ~~Promoting the `wip/` fixtures to committed tests~~ — **done** (F5, `1882a3c`).
- Migrating the other seven agent blocks off the inert `request.body` (advisory `F4b`), and removing
  the inert `action: execute` deny from the reviewer/fact-checker frontmatter (advisory `F4`).
- Re-litigating the LSP verdict, the model pins, or the GPG signing situation.
- `wip/` is gitignored scratch and is not part of the shipped stack (cleaned on 2026-10-13; the two
  tools that were worth keeping were promoted to `scripts/echo-check.mjs` and its test).
