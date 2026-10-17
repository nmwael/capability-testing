> ## ⛔ FROZEN — moved to GitHub Issues (2026-10-17)
>
> **All work tracking for this repository now lives in
> [GitHub Issues](https://github.com/nmwael/capability-testing/issues).** This document is kept as a
> **historical record only**. It is **frozen** — do not add to it, and do not treat it as the source of
> truth for what is planned, claimed or done; **issues are**.
>
> - Work tracker: <https://github.com/nmwael/capability-testing/issues>
> - Milestones — one per capability: <https://github.com/nmwael/capability-testing/milestones>
> - Labels: `kind:*`, `role:*`, `capability:*`, `hitl:awaiting-approval` / `hitl:approved`
>
> **A plan's canonical home is now an issue, not this file.** The architect drafts the plan, the
> `fact-checker` publishes it as a `kind:plan` + `hitl:awaiting-approval` issue, and approval lands on
> that issue — see `.opencode/agents/architect.md`. The text below is unchanged and still readable
> (`DEVELOPMENT.md` and the alerting frontend still cite it), but it is no longer where plans live.

# PLAN.md — retrofit plan (BDD-driven)

**Objective:** this repository is a **CAP v1.2 alerting system** — OASIS [Common Alerting
Protocol](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html) (offline copies of the
spec and schema in [`docs/cap-v1.2/`](docs/cap-v1.2/)), with the official schema
(`backend/common/src/main/resources/cap-v1.2.xsd`, byte-identical to `docs/cap-v1.2/CAP-v1.2.xsd`) as
the **backing model**. The retrofit: **React Flow on the frontend** (distribution canvas + rule
designer), **Apache Drools on Quarkus on the backend** (routing ruleset), driven **BDD-first** — every
capability is pinned by a spec under `features/` before any implementation exists.

**Direction changes:** the earlier invoice/finance domain and the tooling round before it are gone;
their history lives in git, not in this file. No journaling here — this is the forward plan only.

---

## 1. Current state (facts)

*Last updated 2026-10-16 (autonomous run, human away).*

| Thing | State |
|---|---|
| Domain | **CAP v1.2** — registry (`capabilities/capabilities.yml`), module names, packages and specs all CAP |
| Backing model | `backend/common/src/main/resources/cap-v1.2.xsd` — landed, compiles as a schema |
| Modules | `backend/pom.xml` reactor: `common` (XSD), `alerting` (routing rules), `publication` (publish + rule design); packages `com.example.alerting`, `com.example.publication` |
| **Backend lane** | **GREEN and COMMITTED** — `3d9e584 test(cap): backend lane green — alerting + publication specs pass`. `cd backend && mvn -B clean test` = BUILD SUCCESS (`common`, `alerting` 14 tests, `publication` 34 scenarios, 0 failures — was 12 before the retrofit) |
| Drools (T4) | **done** — `org.drools:drools-bom:10.2.0` in `backend/pom.xml`; `drools-core`/`drools-compiler` in `backend/alerting`; ruleset at `backend/alerting/src/main/resources/rules/alert-routing.drl` |
| Specs (T2/T3/T5-backend) | `features/**/*.feature` — **no `@todo` left**; only `features/README.md` prose still mentions the tag |
| **Frontend lane** | **IN PROGRESS — this is the only red lane.** `cd frontend && npm run test:unit` = **14 failed \| 30 passed (44)**; `npm run typecheck` clean; `npm run build` SUCCESS; `npx depcruise` passes but vacuously (rule targets obsolete dirs) |
| Frontend components | `alert-flow/AlertFlow.tsx` — **green**, its 10 spec tests pass. `alert-rule-designer/AlertRuleDesigner.tsx` — 387 lines: real palette, node kinds (CAP fields + channels), Undo/Redo, duplicate/cycle/orphan validation, rename, legend — **but no async load** (no heading, no Loading/offline state, no default routing graph) |
| React Flow | `@xyflow/react@12.12.0` **can** mount; it exposes `ariaLabelConfig` (`node.a11yDescription.default`, `node.a11yDescription.keyboardDisabled`, `edge.a11yDescription.default`). We deliberately do **not** blank it |
| Model servers | `qwen3.5-9b-mtp` on `:8090` (`parallel=2`; slot 0 = coder, slot 1 = non-coder), bifrost `:8082`, opencode `:4096` |
| Working tree | Backend green state committed (`3d9e584`); frontend lane, `MODEL-JOURNAL.md` (items 1–21), the dev-profile CORS edit and the new `features/frontend/*` are uncommitted/untracked. Two stray untracked files sit at the repo root: `Result.json`, `opencode_result.json` |

## 2. The specs — BDD source of truth

One capability ↔ one `.feature`. `@todo` means "behaviour the retrofit has not implemented yet" and
is excluded from the default run (`cucumber.filter.tags = not @todo` in `backend/pom.xml`).
**Implementing a spec means deleting its `@todo` tag — never editing the filter.**

| Spec | Capability | Pins |
|---|---|---|
| `features/publication/alert-publish.feature` | `alert.publish` | CAP v1.2 validation against the XSD; closed vocabularies enforced by name; cancel/update `references`; round-trip; `Draft` stored but never routed |
| `features/publication/alert-rule-design.feature` | `alert.rule-design` | drawn graph → DRL; conditions read the CAP info block; orphan action / duplicate id / cycle rejected; redraw replaces rules |
| `features/alerting/alert-route.feature` | `alert.route` | shipped default ruleset: Ext/Imm/Obs → broadcast; minor/future not; area-scoped channels; `Test` never reaches a person; the firing rule is recorded |
| `features/frontend/alert-flow.feature` | `alert.flow` | **React Flow**: alert node + one node per channel, fan-out edges, severity styling, skipped channels visible, dispatch detail, data from the backend |
| `features/frontend/alert-rule-designer.feature` | `alert.rule-design` | **React Flow**: palette (condition/action), CAP vocabulary exposed per field, connect a path, default graph, invalid-path flagging, generate posts the graph |

## 3. Plan — atomic subtasks (one objective each)

*Status as of 2026-10-16: T1–T4 and T6 are done; only **T5's frontend half** is red.*

1. **T1 — Frontend manifest.** ✅ **done.** `frontend/package.json` carries `react`/`react-dom`
   `19.3.0`, `@xyflow/react` `12.12.0`, `vite` `8.3.4`, `@vitejs/plugin-react` `6.1.2`,
   `typescript` `6.0.3`, vitest, dependency-cruiser, plus `dev`/`build`/`typecheck`/`test:unit`
   scripts, a Vite config and `src/index.tsx`.
   *Checks:* `npm run typecheck` clean, `npm run build` SUCCESS. `npm run test:unit` is red **only**
   for the T5 designer tests below — not a manifest problem.
2. **T2 — CAP domain types from the XSD.** ✅ **done.** Types generated/hand-written from
   `cap-v1.2.xsd` into `common`; enumerations pinned by the `alert.publish` closed-vocabulary
   scenarios (green).
3. **T3 — Publication endpoint.** ✅ **done.** Quarkus endpoint(s) accept, validate (XSD) and serve
   CAP alerts. `features/publication/alert-publish.feature` green, `mvn -B clean test` green.
   *Note:* the endpoint is `POST /alerts` (`application/xml`) and the store is an in-memory
   `ConcurrentHashMap` — a fresh boot is empty, so `GET /alerts/{id}/distribution` 404s until
   something is published.
4. **T4 — Drools on Quarkus.** ✅ **done.** `drools-bom:10.2.0`, `drools-core`/`drools-compiler` in
   `backend/alerting`, ruleset `backend/alerting/src/main/resources/rules/alert-routing.drl`.
   `features/alerting/alert-route.feature` green.
5. **T5 — Rule designer end-to-end (`alert.rule-design`).** 🟡 **half done.** Backend half
   (save/compile endpoint, graph validation, DRL generation) is GREEN — `features/publication/
   alert-rule-design.feature` + `alert-rule-edit.feature` pass. Frontend half (the React Flow
   authoring canvas) is **RED** — see §7.
6. **T6 — Distribution canvas (`alert.flow`).** ✅ **done.** `AlertFlow.tsx` is the React Flow canvas
   fed by routing decisions; `features/frontend/alert-flow.feature` is green (its 10 unit tests
   pass); depcruise passes.
7. **T7 — Docs.** 🟡 kept current (`DEVELOPMENT.md`, `features/README.md`, capability registry).
   Refresh once the frontend lane closes.

## 4. Verification (all must pass before the work is called done)

```sh
node scripts/verify-capabilities.js
# schema compile: the old `java /tmp/XsdCheck.java` is dead (that file does not exist);
# the equivalent is the schema-compile IT under backend/common
cd backend && mvn -B clean test
cd frontend && npm run typecheck && npm run build && npm run test:unit
cd frontend && npx depcruise src --config .depcruiser.js
```

## 5. Environment facts (do not re-derive)

- **No `pom.xml` at the repo root.** `backend/pom.xml` is the reactor (`common`, `alerting`,
  `publication`), Quarkus 3.15.1, Java 17. Maven runs happen from `backend/`.
- **CAP v1.2 model** — schema at `backend/common/src/main/resources/cap-v1.2.xsd`; target namespace
  `urn:oasis:names:tc:emergency:cap:1.2`; the `alert` element's vocabularies are closed
  (`status`, `msgType`, `scope`, `category`, `responseType`, `urgency`, `severity`, `certainty`),
  `sent`/`effective`/`onset`/`expires` carry a timezone-offset `xs:dateTime` pattern, and
  `info` is the block every routing rule reads.
- **Verified coordinates** — npm: `react@19.3.0`, `react-dom@19.3.0`, `@xyflow/react@12.12.0`,
  `reactflow@11.11.4`, `vite@8.3.4`, `@vitejs/plugin-react@6.1.2`, `typescript@7.0.2`.
  Maven: `org.drools:drools-bom:10.2.0`.
- **No official Quarkus Drools extension** — integrate Drools as a plain library through a CDI
  producer. Quarkus health endpoint is `/q/health`.
- **PATH:** `bats`, `npm`, `npx`, `node`, `mvn`, `pnpm`, `yarn`. Missing: `mvnw`, `gradle`, `tsc`,
  `vite`, `depcruise` — invoke those through `npx`/`npm run` until the manifest is repaired.
- **LSP does not work here** (established; do not re-litigate) — use CLI checks instead.
- `websearch` is disabled for agents by design; use `webfetch`. npm registry names are lowercase.

## 6. Out of scope

- The closed tooling round and its follow-ups (migrating agents' temperature off `request.body`,
  dropping the inert `action: execute` deny, registering `stack-coordinates.mini.md`) — git history.
- Model pins, the LSP verdict, GPG (no card here; commits may be unsigned).
- `wip/` is gitignored scratch, not shipped.

---

## 7. Where to resume — the frontend lane (T5 frontend half)

Everything else in this plan is green; the **only** red gate is `cd frontend && npm run test:unit`,
which is **14 failed | 30 passed (44)**. The failing set and the reason for each is pinned here so a
fresh session does not re-derive it.

**Helpers already in place.** `frontend/vitest.setup.ts` polyfills `ResizeObserver` +
`DOMMatrixReadOnly` and installs a URL-keyed `fetch` mock (`/slow` never settles, `/fail` → 500,
`ALERT-404`/`alert-404` → 404, anything else → the ALERT-001 demo payload). `frontend/vite.config.ts`
wires it via `setupFiles`. `frontend/src/vite-env.d.ts` adds the Vite client types.

**The correction pattern the repo already accepted.** The green `AlertFlow.test.tsx` asserts against
`/X|Loading/i` — the async component's first paint — because the specs are worded for a graph, not for
a DOM. The designer tests were generated the same way but *without* a Loading escape hatch and
*without* the Given/When steps some of them need, so they fail on `getByText`, which throws on **zero
or multiple** matches. Correcting them the same way AlertFlow's were corrected is the approved route
("correct the defective assertions rather than bend component text" — and **never** add text to a
component to satisfy a regex).

**(a) The component genuinely lacks behaviour — implement it (the real work):**
- `smoke.test.tsx > renders the routing rule designer` — the designer has no `<h2>Alert rule
  designer</h2>`. Its sibling `AlertFlow.tsx:53` has `<h2>Alert flow</h2>`; mirror it.
- `shows a loading state when the endpoint is slow` — the designer never fetches, so there is no
  loading state.
- `keeps the graph editable when the backend is unreachable` — no offline branch.
- `shows the default routing graph on first open` — no default-graph fallback.

  One coherent task: give `AlertRuleDesigner.tsx` the same async structure as `AlertFlow.tsx` (h2 +
  `loading|ok|error` state + `useEffect` fetch of `${endpoint}/${graphName}` + offline notice + a
  default routing graph of one condition per danger level, each wired to an action; `<ReactFlow>`
  stays mounted in **every** status). A coder directive for exactly this was written but **never
  landed** — its architect session returned without delegating, so the file is still 387 lines with no
  fetch.

**(b) The assertion is defective — correct the assertion (enumerate every changed line):**
- `places a condition node on the canvas when added` — asserts `/condition node/i`, which the UI never
  renders; the node is titled `Condition`.
- `exposes the CAP vocabularies on a condition node` — asserts on first render, but the scenario needs
  a condition node to exist; after adding one the regex matches **three** spans, so `getByText` throws
  on multiple.
- `keeps both nodes when an edge is removed`, `refuses a duplicate node id`, `enables generate when an
  orphan is connected`, `supports adding a node with the keyboard`, `supports selecting every node with
  the keyboard` — each asserts a state that only exists **after** the interaction its scenario
  describes, on a first render that never performs it (and several of their alternation regexes also
  match multiple elements).
- `offers the alerting channels on an action node` — the footer legend already renders
  `Channels: sirens broadcast social`, so the regex matches several elements at once.
- `alert-rule-edit` `opens a saved graph as editable nodes` / `keeps the CAP field when changing a
  condition value` / `keeps the incoming edge when renaming an action node` — `getByText('tornado-
  routing')`, `getByText('severity')` and `getByText('Rename:')` use exact matching, and the first two
  target an `<input value>` / a `severity: ` span that no `getByText` call can see on a first render.

**🔴 Constraint violation to fix first.** `frontend/src/features/alert-rule-edit/AlertRuleEdit.test.tsx`
was **rewritten by a coder** (mtime 08:56, after the component at 08:55), replacing the spec's regex
assertions with literal `getByText('Save')` / `getByText('Unsaved changes')` presence checks — e.g. the
"leaves no dangling condition when deleting an action node" scenario now asserts `Unsaved changes`.
That is test-bending, not a correction. Restore spec-faithful assertions.

**How to reproduce the red:**

```sh
cd frontend && npm run test:unit            # 14 failed | 30 passed (44)
cd frontend && npx vitest run src/features/alert-rule-designer src/features/alert-rule-edit
cd frontend && npx vitest run src/smoke.test.tsx
```

**Then close the plan.** Full §4 verification, the `reviewer` gate on the frontend lane, and commit.
Two environment notes for §4: the old `java /tmp/XsdCheck.java` line is dead — that file does not
exist; the equivalent is the schema-compile IT under `backend/common`. And `npm run test:e2e`
(Playwright) cannot run in this container at all: chromium 1248 is installed but `libglib-2.0.so.0`
is absent and there is no system browser and no `DISPLAY`, so e2e/screenshots need an approval-gated
`npx playwright install-deps`. The gate is `test:unit`, which is vitest — not e2e.
