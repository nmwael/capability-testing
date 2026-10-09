# Capability Testing

Prevent silent loss of product capabilities in a Quarkus + React modulith.

## Stack
- BDD: Cucumber, Gherkin
- Backend: Quarkus (Java)
- Frontend: React
- Testing: Quarkus Cucumber (io.quarkiverse.cucumber:quarkus-cucumber)

## Problem
Refactoring can accidentally remove or break business capabilities with no signal.

## Solution
* Capability registry `capabilities/capabilities.yml`
* BDD specs tagged `@cap:<id>`
* Structural gates: ArchUnit + Revapi + dependency-cruiser + API Extractor
* Traceability gate `scripts/verify-capabilities.js` enforced in CI

## Repo layout
```
capabilities/capabilities.yml
scripts/verify-capabilities.js
backend/  # Maven parent, common/billing/invoicing, api/internal/domain, ArchUnit, Revapi, Cucumber
frontend/ # Vite React TS, features/billing, features/invoicing, dep-cruiser, API Extractor
.github/workflows/ci.yml
```

## Capabilities
* `invoice.recalculate-penalty` active, owner billing
* `invoice.list` active, owner invoicing
* `bulk-csv-export` retired, restore_after 2027-Q1, tracked_by PROJ-889

## Local LLM stack (profile q)

The box runs the local `q` profile (from agentic-code-box):

- **qwen3-8b** (Q4_K_M) — llama-server on :8089, context 16384, slot 0; serves architect, researcher, reviewer, build, ui, artist
- **qwen2.5-coder-7b** (Q4_K_M) — llama-server on :8090, context 8192, slot 0; serves the coder role
- Expect ~9 GiB weights / ~10.9 GiB VRAM — a >=12 GiB GPU is required
- Routing: llama-server -> bifrost gateway :8082 -> opencode :4096

Lifecycle:
- `bash scripts/post-create.sh` — verify the box and scaffold the agent payload (postCreateCommand)
- `bash scripts/auto-startup.sh` — start the llama-server(s), bifrost and opencode serve (postStartCommand)
- `bash scripts/fetch-models.sh` — download GGUF weights into `models/`

Note: `.devcontainer/llm-lab-{models,roles}.json` are build-time inputs for the `models` feature — changing the profile requires `devcontainer up --workspace-folder .`.
`opencode.json` is generated from the same manifest on every `postCreate`, so hand edits to it do not survive.

## Run locally
```bash
node scripts/verify-capabilities.js
cd backend && mvn -B test
cd frontend && npm run typecheck && npx depcruise src --config .depcruiser.js
```

## Add a capability
1. Add entry to `capabilities.yml` with `verified_by` tests/features
2. Tag scenarios `@cap:<id>`
3. CI fails if references missing

## Retire safely
Set `status: retired`, `retired_at`, `restore_after`, `tracked_by`, `pr`. CI fails if `restore_after` passes.

## CI
Fast gates on PR: traceability, ArchUnit, dep-cruiser, Revapi.