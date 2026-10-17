# 🚀 DEVELOPMENT Guide

## 📚 Repository Overview

This repository is an LLM-orchestration devcontainer experiment built around the **OASIS Common
Alerting Protocol (CAP) v1.2** — a Quarkus modulith backend that publishes and routes CAP alerts, a
React/TypeScript frontend that visualises them, a capability registry that gates both, and the
agentic tooling (`@architect`, `reviewer`, `fact-checker`) used to drive changes through a HITL
pipeline.

- [`CAP v1.2 specification`](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html) — the
  protocol; [`CAP v1.2 schema (XSD)`](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2.xsd) —
  the **backing model**, vendored at `backend/common/src/main/resources/cap-v1.2.xsd`.
  Offline copies of both live in [`docs/cap-v1.2/`](docs/cap-v1.2/) (verbatim, do not edit).

Structure:

- `backend/` — Java/Maven reactor: `common` (vendored CAP XSD), `alerting` (Drools routing rules),
  `publication` (publish + validate + rule design). Quarkus 3.15.1, Java 17.
- `frontend/` — React + TypeScript: the alert distribution canvas and the routing rule designer
  (see *Frontend status* — currently a stub).
- `capabilities/capabilities.yml` — the capability registry; the source of truth for what exists and
  what is verified.
- `features/` — the BDD source of truth: one `.feature` per capability.
- `models/` — GGUF model weights (bind-mounted, gitignored).
- `scripts/` — operational tooling (startup, model fetch, verification gates).
- `PLAN.md`, `AGENTS.md`, `AGENTS_LIFECYCLE.md` — plan, orchestration rules, lifecycle guarantees.

---

## 🛠️ Initial Setup

The image ships without models and without running servers — both are intentional:

```bash
scripts/fetch-models.sh        # download GGUF weights per stack.json
bash scripts/auto-startup.sh   # probe GPU, start llama-server / bifrost
```

Services (once up):

| Service | Port |
|---|---|
| qwen3.5-9b-mtp (`llama-server`) | 8090 |
| bifrost | 8082 |
| opencode server | 4096 |

### Remote access

The opencode server on `:4096` always requires a password - authentication cannot be turned off. The password comes from the container environment variable `OPENCODE_PASSWORD`.

- **Web UI.** Open `http://<host>:4096/`. The app loads unauthenticated and then shows "Sign in required"; sign in as user `opencode` with the password.
- **Remote CLI.** `OPENCODE_PASSWORD=<pw> opencode --server http://<host>:4096`
- **Raw API.** `curl -u opencode:<pw> http://<host>:4096/api/info`

**Where the password comes from.** `.devcontainer/devcontainer.json` maps the host variable `OPENCODE_SERVER_PASSWORD` into the container as `OPENCODE_PASSWORD`. If the host variable is unset the value is empty and `opencode serve` falls back to a random per-boot password, printed only in `/tmp/opencode-serve.log`, so remote clients get `401`. `scripts/auto-startup.sh` warns at startup when the password is empty.

**Security.** `:4096` is forwarded by the devcontainer and the opencode API can run shell as root, so the password is a root-equivalent credential: keep it long and treat it as a secret.

### Capability traceability gate

Structural integrity check — must pass before you call work done:

```bash
node scripts/verify-capabilities.js
```

---

## 🧪 Behaviour-Driven Development (`features/`)

Every capability is pinned by a Gherkin spec **before** it is implemented — this is what makes the
`@architect` → `@coder` loop BDD-driven.

```bash
node scripts/verify-capabilities.js   # every active capability's verified_by resolves
cd backend && mvn -B test             # backend specs (@todo scenarios are filtered out)
cd frontend && npm run test:unit      # frontend specs (lands with the retrofit)
```

- Specs live in `features/<domain>/…feature`; one capability ↔ one file, tagged `@cap:<id>` and
  matched against `capabilities/capabilities.yml`.
- `@todo` marks behaviour that is not implemented yet; `backend/pom.xml` excludes it from the default
  run (`cucumber.filter.tags = not @todo`).
- **Implementing a spec means deleting its `@todo` tag — never editing the filter.**

Full layout and rules: `features/README.md`. The specs are CAP-specific: a publish is valid exactly
when the message validates against `cap-v1.2.xsd`.

---

## 💻 Frontend Development (React/Vite)

> **Status:** `frontend/package.json` is still a broken stub (`"react": "^^"`, only a `start`
> script). The retrofit (React Flow canvas + rule designer) is **not implemented yet** — see
> `PLAN.md` §3. Until then, the commands below are the *target* workflow, not a working one.

Planned workflow, from inside `frontend/`:

1. **Typecheck + dependency graph:**
   ```bash
   npm run typecheck && npx depcruise src --config .depcruiser.js
   ```
2. **Build:**
   ```bash
   npm run build
   ```

Components: `src/features/publication/AlertFlow.tsx` (distribution canvas) and
`src/features/alerting/AlertRuleDesigner.tsx` (routing rule designer).

---

## ⚙️ Backend Development (Java/Maven)

There is **no `pom.xml` at the repo root** — `backend/pom.xml` is the reactor, so all Maven
commands must be run from `backend/`:

```bash
cd backend && mvn -B test
```

Modules:

- `common` — the vendored CAP v1.2 schema (`src/main/resources/cap-v1.2.xsd`); the shared model.
- `publication` — `alert.publish`, `alert.rule-design`: CAP ingest/validation, the rule-design
  save/compile endpoint, `AlertPublishIT`, `AlertRuleDesignIT`.
- `alerting` — `alert.route`: the Drools ruleset behind routing, `AlertRouteIT`. DRL belongs under
  `backend/alerting/src/main/resources/rules/*.drl`.

Quarkus health endpoint (when a module runs): `/q/health`.

Drools is integrated as a **plain library through a CDI producer** — there is no official Quarkus
Drools extension (BOM: `org.drools:drools-bom:10.2.0`).

---

## 🤖 Agentic Tooling

Changes flow through the HITL pipeline: `@architect` plans → `@fact-checker` verifies the plan →
**human approval** → `@coder` implements → `@reviewer` gates. Scripts that back the gates:

```bash
node scripts/verify-plan-claims.mjs   # blueprint/claim checker for plans
node scripts/review-gate.mjs          # checklist runner (--attest / --verify)
node scripts/echo-check.mjs           # proves a reviewer message was the runner's stdout
```

Before approving a plan, a `@fact-checker` Result must be attached. See `AGENTS.md` (rules) and
`PLAN.md` (current status and resume point) — do not duplicate that policy here.

Web search is disabled for agents by design; use `webfetch`.

---

## 📝 Conventions

- Commit early and often; `main` pushes to `origin/main`.
- There is no GPG card in this container (`commit.gpgsign=false`), so commits may be unsigned.
- Never commit `models/*.gguf`.
