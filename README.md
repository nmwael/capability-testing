# Capability Testing

Prevent silent loss of product capabilities in a Quarkus + React modulith.

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
