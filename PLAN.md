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

| Thing | State |
|---|---|
| Domain | **CAP v1.2** — registry (`capabilities/capabilities.yml`), module names, packages and specs all renamed from finance |
| Backing model | `backend/common/src/main/resources/cap-v1.2.xsd` — landed, verified to compile as a schema (`SchemaFactory.newSchema`) |
| Modules | `backend/pom.xml` reactor: `common` (XSD), `alerting` (routing rules), `publication` (publish + rule design); packages `com.example.alerting`, `com.example.publication` |
| Specs | `features/{publication,alerting,frontend}/*.feature` — all CAP, all `@todo` (red-first); suite green (`mvn -B test`) |
| Implementation | **not started** — no Drools dependency, no DRL, frontend is the `"^^"` stub |
| Model servers (granite `:8089`, qwen `:8090`) | **down** — this work is being done directly until they return |
| Working tree | CAP refactor uncommitted; `.gitignore` staged by an earlier session |

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

1. **T1 — Frontend manifest.** Replace the `frontend/package.json` stub: `react`/`react-dom`
   `19.3.0`, `@xyflow/react` `12.12.0`, `vite` `8.3.4`, `@vitejs/plugin-react` `6.1.2`,
   `typescript`, plus `dev`/`build`/`typecheck`/`test:unit` scripts and a minimal Vite config +
   `src/index.tsx` walking skeleton.
   *Checks:* `npm run typecheck`, `npm run build`, `npm run test:unit` all exit 0 in `frontend/`.
2. **T2 — CAP domain types from the XSD.** Generate/hand-write the CAP record types (alert, info,
   area, resource, the enumerated vocabularies) from `cap-v1.2.xsd` into `common`, so Java and
   TypeScript both read one model.
   *Checks:* the types' enumerations match the XSD exactly (pinned by the `alert.publish`
   "closed vocabularies" scenarios).
3. **T3 — Publication endpoint.** Quarkus endpoint(s) that accept, validate (XSD) and serve CAP
   alerts; `/q/health` reachable in test profile.
   *Checks:* `features/publication/alert-publish.feature` green (drop `@todo`), `mvn -B test` green,
   `AlertPublishIT` exercises a real payload.
4. **T4 — Drools on Quarkus.** `org.drools:drools-bom:10.2.0` in `backend/pom.xml`, `drools-core`/
   `drools-compiler` in `backend/alerting`, the ruleset exposed through a CDI producer (there is no
   official Quarkus Drools extension), and the default ruleset as `src/main/resources/rules/*.drl`.
   *Checks:* `features/alerting/alert-route.feature` green (drop `@todo`).
5. **T5 — Rule designer end-to-end (`alert.rule-design`).** The React Flow canvas that draws the
   graph (`features/frontend/alert-rule-designer.feature`), the save/compile endpoint, graph
   validation, DRL generation, and activation of the drawn ruleset.
   *Checks:* both `alert.rule-design` specs green (drop `@todo`); `AlertRuleDesignIT` exercises it.
6. **T6 — Distribution canvas (`alert.flow`).** Turn `AlertFlow.tsx` into the React Flow canvas fed
   by the routing decisions.
   *Checks:* `features/frontend/alert-flow.feature` green (drop `@todo`); depcruise passes.
7. **T7 — Docs.** `DEVELOPMENT.md` (done as the CAP/Basics refactor lands), `features/README.md`
   (current), capability registry kept in sync.

## 4. Verification (all must pass before the work is called done)

```sh
node scripts/verify-capabilities.js
java /tmp/XsdCheck.java                                        # or: schema compile in an IT
cd backend && mvn -B test
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
