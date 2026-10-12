# Stack coordinates (verified)

**Purpose.** The architect may name a coordinate, version, path, port, or command **only** if it is
listed here, cited from the repo as `path:line`, or returned by a `researcher` Result. Anything else is
`UNKNOWN` → delegate a fact-finding Directive first. Inventing a value fails the plan.

**Provenance.** Retrieved 2026-10-12 from Maven Central (<https://repo1.maven.org/maven2/>,
`search.maven.org`) and the npm registry (`registry.npmjs.org`). Re-verify before relying on it later.

## Backend — Quarkus 3.15.1 (Java 17) + Apache Drools

There is **no official Quarkus Drools/KIE extension** and **no `io.quarkiverse.drools`**. Integrate Drools
as a plain library and expose a `KieServices`/`KieContainer` through a CDI producer.

| Kind | Coordinate | Version | Notes |
|---|---|---|---|
| BOM | `org.drools:drools-bom` | `10.2.0` | import in `dependencyManagement` (`<type>pom</type>`, `<scope>import</scope>`) |
| runtime | `org.drools:drools-core` | managed | rule engine |
| runtime | `org.drools:drools-compiler` | managed | compiles DRL |
| runtime | `org.drools:drools-mvel` | managed | MVEL dialect |
| API | `org.kie:kie-api` | managed | `KieServices`, `KieContainer` |
| API | `org.kie:kie-internal` | managed | only if needed |

- **Do NOT use `org.kie:kie-bom`** — it is stale at `7.74.1.Final` (old KIE 7 line).
- **DRL placement rule:** put `.drl` files under a **real Maven module's** classpath, e.g.
  `backend/<module>/src/main/resources/rules/*.drl`. `backend/src/...` is **not** a module and is not on
  any classpath.
- Quarkus health endpoint is `/q/health` (SmallRye Health) — **not** `/actuator/health`.

## Frontend — React Flow

| Package | Version | Notes |
|---|---|---|
| `@xyflow/react` | `12.12.0` | React Flow **v12** (modern) |
| `reactflow` | `11.11.4` | React Flow v11 (legacy) |
| `react` | `19.3.0` | |
| `react-dom` | `19.3.0` | |
| `@types/react` | `19.3.0` | |
| `@types/react-dom` | `19.3.0` | |
| `vite` | `8.3.4` | build tool |
| `@vitejs/plugin-react` | `6.1.2` | Vite React plugin |
| `typescript` | `7.0.2` | |

- Frontend source lives under `frontend/`. Never place frontend source under `backend/`.

## Repo-specific ground rules

- Maven modules: `backend/common`, `backend/billing`, `backend/invoicing`.
- `backend/src/**` is a stray tree **outside** the modules — no build resource belongs there.
- Capability registry: `capabilities/capabilities.yml`, validated by `scripts/verify-capabilities.js`.
- Frontend today: `frontend/package.json` (broken placeholder — `"react": "^^"`, no build tool),
  `frontend/tsconfig.json`, `frontend/src/features/{invoicing,billing}/*.tsx`.
