# features/ — the BDD source of truth

Every capability this repo claims is pinned by a Gherkin `.feature` file here **before** any
implementation exists. `@architect` plans against these specs; `@coder` implements them; a task is
done when its scenarios are green, not when the code looks done.

The repository is about the **OASIS Common Alerting Protocol (CAP) v1.2** — see
[docs.oasis-open.org/emergency/cap/v1.2](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html).
The backing model is the official schema: `backend/common/src/main/resources/cap-v1.2.xsd`, so a
spec may say "validates against the CAP 1.2 schema" and mean one specific artefact.

## Layout

```
features/
  publication/  alert.publish, alert.rule-design, alert.rule-edit, alert.flow  → backend/publication (Quarkus, Cucumber, Drools)
  alerting/     alert.route                                                    → backend/alerting (Quarkus, Cucumber, Drools)
  frontend/     alert.flow, alert.rule-design, alert.rule-edit                  → frontend (React Flow; vitest runner, see below)
```

Every file also states its side as a tag — **`@backend`** under `publication/` and `alerting/`,
**`@frontend`** under `frontend/`. The tag and the directory are checked against each other by
`scripts/verify-capabilities.js`, so a spec cannot sit silently on the wrong side.

Backend modules consume their specs by copying `features/<module>/*.feature` into the module's test
resources (`<testResource>` in each `backend/<module>/pom.xml`), so the capability path in
`capabilities/capabilities.yml` keeps resolving from the repo root. A `@frontend` file is never
copied into a backend module, so the Maven filter stays as it is (`not @todo`).

## Rules

1. **One capability ↔ one feature file per lane.** A capability that spans both sides gets one
   `@backend` file and one `@frontend` file — never a single mixed file. Each file carries the
   capability tag (`@cap:<capability.id>`), matching `verified_by` in
   `capabilities/capabilities.yml`, and exactly one lane tag (`@backend` / `@frontend`).
2. **Every step must be executable.** A scenario whose steps do not exist yet is not a bug — it is
   the work, but it must be marked.
3. **`@todo` means "not implemented yet".** `backend/pom.xml` filters these out of the default run
   (`cucumber.filter.tags = not @todo`), so the suite stays green while the specs accumulate.
   **Implementing a spec means deleting its `@todo` tag — never editing the filter.**
4. **Pin shapes, not invented business rules.** Scenarios assert contracts (an Extreme alert routes
   to at least as many channels as a Moderate one; the CAP vocabularies are closed) — actual
   thresholds stay product decisions.
5. **Frontend specs live under `features/frontend/`** and are owned by the frontend runner
   (`npm run test:unit` from `frontend/`, vitest). They are intentionally not wired into Maven.

## Requirement and scenario IDs

Every scenario carries a stable, globally unique id and a link to a requirement:

```
  @scenario:SC-PUB-001
  @req:REQ-PUB-001
  Scenario: A well-formed alert validates against the CAP 1.2 schema
```

- **`REQ-<LANE>-<nnn>`** — one requirement per (capability, lane) pair, stored in
  `requirements/requirements.yml` with a `capability:` field naming the capability it covers.
  The inverse (which requirements cover a capability) is derived by the gate, not stored twice.
- **`@scenario:SC-<LANE>-<nnn>`** — allocated once per scenario, never renumbered, never reused.
  Rewording or reordering a scenario leaves its id unchanged. Split, merge, or delete retires the
  id into `features/.retired-ids.yml`.
- **`@req:<id>`** — links each scenario to exactly one requirement; the requirement's
  `capability:` must match the file's `@cap:` tag.
- **Git remains the source of truth** for Gherkin and automated tests — there is no separate
  test-case repository or external TMS. These tags live in the `.feature` files themselves.

Run the gate:

```sh
node scripts/verify-traceability.mjs   # requirements ↔ capabilities ↔ scenarios, no dangling refs
node scripts/verify-capabilities.js    # verified_by resolves; lane tag matches directory
```

## Running

```sh
node scripts/verify-capabilities.js      # verified_by resolves; each file's lane tag matches its directory
node scripts/capability-report.js       # capability matrix + progress (--summary FILE for a job summary)
cd backend && mvn -B test                # backend specs (green; @todo excluded)
cd frontend && npm run test:unit         # frontend specs (lands with the retrofit)
```
