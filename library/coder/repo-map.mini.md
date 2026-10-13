# Repo map — capability-testing (read this FIRST, before any exploration)

You are the `coder`. Read this file once at the start of every task instead of
exploring. If something you need is not here and not in your Directive, return
`status: blocked` with `"type":"ambiguous_spec"` — do NOT guess paths or versions.

## What this repo is

A HITL multi-agent harness (opencode) plus a **CAP v1.2 alerting application** — OASIS Common
Alerting Protocol. The backend is a Quarkus Maven reactor with Apache Drools routing rules; the
frontend is React + TypeScript (target: React Flow). The OASIS schema is the backing model.

- `backend/` — Quarkus (Java release 17) Maven reactor + Apache Drools; **CAP v1.2** domain.
- `frontend/` — React + TypeScript + Vite (target: React Flow): alert canvas + rule designer.
- `capabilities/capabilities.yml` — capability registry, verified by `scripts/verify-capabilities.js`.
- `features/` — the BDD source of truth (one `.feature` per capability).
- `.opencode/agents/` — agent definitions. `library/` — agent reference books. `wip/` — gitignored scratch.

## Where things live (exact paths)

| Area | Path |
|---|---|
| Maven reactor (parent POM) | `backend/pom.xml` (`com.example:capability-testing-backend`, packaging `pom`) |
| Reactor modules | `backend/common/`, `backend/alerting/`, `backend/publication/` |
| CAP backing model | `backend/common/src/main/resources/cap-v1.2.xsd` — the OASIS schema; note `backend/src` is **NOT** a Maven module |
| Backend tests | `backend/<module>/src/test/java/...` (`*IT.java`, `*Test.java`, Cucumber `*Steps.java`) |
| ArchUnit boundary test | `backend/alerting/src/test/java/com/example/alerting/arch/ModuleArchitectureTest.java` |
| Cucumber features | `features/alerting/alert-route.feature`, `features/publication/alert-publish.feature`, `features/publication/alert-rule-design.feature`; frontend specs in `features/frontend/` (vitest, not Maven) |
| Frontend manifest | `frontend/package.json` |
| Frontend tsconfig | `frontend/tsconfig.json` (`jsx: react-jsx`, `include: ["src"]`, strict + noUnusedLocals/Parameters) |
| Frontend component example | `frontend/src/features/publication/AlertFlow.tsx`, `frontend/src/features/alerting/AlertRuleDesigner.tsx` |
| Frontend arch config | `frontend/.depcruiser.js`, `frontend/api-extractor.json` |
| Capability registry | `capabilities/capabilities.yml` |
| Registry check | `scripts/verify-capabilities.js` |

## Commands (use these EXACTLY; do not invent variants)

- Capability registry (repo root): `node scripts/verify-capabilities.js`
- CAP schema compiles (repo root): `java scripts/xsd-check.java`
- Backend validate one module (repo root): `mvn -q -f backend/pom.xml -pl alerting -am validate`
- Backend full test (from `backend/`): `mvn -B test`
- Frontend typecheck (from `frontend/`): `npm run typecheck`
- Frontend architecture check (from `frontend/`): `npx depcruise src --config .depcruiser.js`
- Frontend build (from `frontend/`): `npm run build`
- Parse-check a JSON file: `node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'))"`

NEVER write `mvn -pl backend/alerting` — that is not a valid reactor selector from the repo root.
Use `-f backend/pom.xml -pl alerting -am`, or `cd backend && mvn -pl alerting -am`.

## Conventions

- **Java:** package root `com.example.*` (`com.example.alerting`, `com.example.publication`); JUnit 5 +
  ArchUnit (`ModuleArchitectureTest`) + Cucumber for acceptance; Drools via a CDI producer (there is no
  Quarkus Drools extension). `maven.compiler.release` = 17.
- **CAP:** the domain model is the OASIS schema `backend/common/src/main/resources/cap-v1.2.xsd`
  (namespace `urn:oasis:names:tc:emergency:cap:1.2`); its enumerations are closed — a publish is valid
  exactly when the message validates against it.
- **Frontend:** function components in one folder per feature under `frontend/src/features/<feature>/`, `.tsx`, **named exports** (`export function AlertFlow() {}`). TS is strict with `noUnusedLocals`/`noUnusedParameters` on.
- **Capabilities:** every `active` capability must name a real `verified_by` test class or feature path; CI fails on stale entries.
- **BDD:** every capability is pinned by a spec in `features/` before implementation; `@todo` = not
  implemented yet and is filtered out of `mvn test` by `cucumber.filter.tags`. Implementing a spec means
  deleting the tag — never editing the filter.
- `DEVELOPMENT.md` expects the `frontend/package.json` scripts `typecheck` and `build`; when a Directive fixes that manifest, keep those script names.

## Traps that have burned previous tasks (avoid)

- Do NOT invent dependencies, versions, coordinates, or file paths. Use only values in your Directive or in `library/architect/stack-coordinates.mini.md`.
- `frontend/package.json` is currently a **stub** (`"react": "^^"`) with no usable version values — take real versions from the Directive, never from this file.
- There is **no** Quarkus Drools/KIE extension — never reference `io.quarkiverse.*` or `quarkus.kogito.*`; Drools comes in through `org.drools:*` and a CDI producer.
- DRL belongs in a real module: `backend/alerting/src/main/resources/rules/*.drl`. Never put Java, DRL, or resources under `backend/src/**` — that is not a module.
- Do NOT create `beans.xml` or `quarkus-config.properties` unless a Directive explicitly asks.
- Do NOT re-read a file you have already read this task, and do NOT `grep`/`glob` for things this map already answers.

## Coordinates

Verified Maven/npm versions and ground rules: `library/architect/stack-coordinates.mini.md`.
