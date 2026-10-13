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
  publication/  alert.publish, alert.rule-design  → backend/publication (Quarkus, Cucumber, Drools)
  alerting/     alert.route                        → backend/alerting (Quarkus, Cucumber, Drools)
  frontend/     alert.flow, alert.rule-design      → frontend (React Flow; vitest runner, see below)
```

Backend modules consume their specs by copying `features/<module>/*.feature` into the module's test
resources (`<testResource>` in each `backend/<module>/pom.xml`), so the capability path in
`capabilities/capabilities.yml` keeps resolving from the repo root.

## Rules

1. **One capability ↔ one feature file.** The file carries the capability tag
   (`@cap:<capability.id>`), matching `verified_by` in `capabilities/capabilities.yml`.
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

## Running

```sh
node scripts/verify-capabilities.js      # every active capability's verified_by resolves
cd backend && mvn -B test                # backend specs (green; @todo excluded)
cd frontend && npm run test:unit         # frontend specs (lands with the retrofit)
```
