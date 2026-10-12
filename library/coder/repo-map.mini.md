# Repo map — capability-testing (read this FIRST, before any exploration)

You are the `coder`. Read this file once at the start of every task instead of
exploring. If something you need is not here and not in your Directive, return
`status: blocked` with `"type":"ambiguous_spec"` — do NOT guess paths or versions.

## What this repo is

A HITL multi-agent harness (opencode) plus a small Quarkus/Drools + React demo app.

- `backend/` — Quarkus (Java release 17) Maven reactor + Apache Drools.
- `frontend/` — React + TypeScript + Vite (target: React Flow).
- `capabilities/capabilities.yml` — capability registry, verified by `scripts/verify-capabilities.js`.
- `.opencode/agents/` — agent definitions. `library/` — agent reference books. `wip/` — gitignored scratch.

## Where things live (exact paths)

| Area | Path |
|---|---|
| Maven reactor (parent POM) | `backend/pom.xml` (`com.example:capability-testing-backend`, packaging `pom`) |
| Reactor modules | `backend/common/`, `backend/billing/`, `backend/invoicing/` |
| Shared Java package | `backend/src/main/java/com/example/rules/InitialRuleset.java` — NOTE: `backend/src` is **NOT** a Maven module |
| Backend tests | `backend/<module>/src/test/java/...` (`*IT.java`, `*Test.java`, Cucumber `*Steps.java`) |
| ArchUnit boundary test | `backend/billing/src/test/java/com/example/billing/arch/ModuleBoundariesTest.java` |
| Cucumber features | `billing/recalculate-penalty.feature`, `invoicing/invoice-list.feature` |
| Frontend manifest | `frontend/package.json` |
| Frontend tsconfig | `frontend/tsconfig.json` (`jsx: react-jsx`, `include: ["src"]`, strict + noUnusedLocals/Parameters) |
| Frontend component example | `frontend/src/features/invoicing/InvoiceList.tsx`, `frontend/src/features/billing/RecalculatePenalty.tsx` |
| Frontend arch config | `frontend/.depcruiser.js`, `frontend/api-extractor.json` |
| Capability registry | `capabilities/capabilities.yml` |
| Registry check | `scripts/verify-capabilities.js` |

## Commands (use these EXACTLY; do not invent variants)

- Capability registry (repo root): `node scripts/verify-capabilities.js`
- Backend validate one module (repo root): `mvn -q -f backend/pom.xml -pl invoicing -am validate`
- Backend full test (from `backend/`): `mvn -B test`
- Frontend typecheck (from `frontend/`): `npm run typecheck`
- Frontend architecture check (from `frontend/`): `npx depcruise src --config .depcruiser.js`
- Frontend build (from `frontend/`): `npm run build`
- Parse-check a JSON file: `node -e "JSON.parse(require('fs').readFileSync('<path>','utf8'))"`

NEVER write `mvn -pl backend/invoicing` — that is not a valid reactor selector from the
repo root. Use `-f backend/pom.xml -pl invoicing -am`, or `cd backend && mvn -pl invoicing -am`.

## Conventions

- **Java:** package root `com.example.*`; JUnit 5 + ArchUnit (`ModuleBoundariesTest`) + Cucumber for acceptance. `maven.compiler.release` = 17.
- **Frontend:** function components in one folder per feature under `frontend/src/features/<feature>/`, `.tsx`, **named exports** (`export function InvoiceList() {}`). TS is strict with `noUnusedLocals`/`noUnusedParameters` on.
- **Capabilities:** every `active` capability must name a real `verified_by` test class or feature path; CI fails on stale entries.
- `DEVELOPMENT.md` expects the `frontend/package.json` scripts `typecheck` and `build`; when a Directive fixes that manifest, keep those script names.

## Traps that have burned previous tasks (avoid)

- Do NOT invent dependencies, versions, coordinates, or file paths. Use only values in your Directive or in `library/architect/stack-coordinates.mini.md`.
- `frontend/package.json` is currently a **stub** (`"react": "^^"`) with no usable version values — take real versions from the Directive, never from this file.
- There is **no** Quarkus Drools/KIE extension — never reference `io.quarkiverse.*` or `quarkus.kogito.*`.
- Do NOT create `beans.xml` or `quarkus-config.properties` unless a Directive explicitly asks.
- Do NOT re-read a file you have already read this task, and do NOT `grep`/`glob` for things this map already answers.

## Coordinates

Verified Maven/npm versions and ground rules: `library/architect/stack-coordinates.mini.md`.
