## Phase 1 — Frontend: migrate to React Flow

* T1 — Update the frontend manifest and tooling
  - Files: frontend/package.json
  - Change: add dependencies "react": "19.3.0", "react-dom": "19.3.0", "reactflow": "11.11.4",
    "@types/react": "19.3.0", "@types/react-dom": "19.3.0", "@types/vitejs/plugin-react": "6.1.2";
    set script "build": "vite build --no-quiet --devtools"
  - Check: `node -e "JSON.parse(require('fs').readFileSync('frontend/package.json'))"` exits 0
  - Role: coder

* T2 — Add the rule-flow canvas component
  - Files: frontend/src/features/rules/RuleFlow.tsx
  - Change: `import { useFlowReturnValue } from 'react-flow-renderer'` then render
    `<ReactFlow nodes={nodes} edges={edges} controlled={false} />`; no stylesheet import
  - Check: `npx --no-install tsc --noEmit -p frontend/tsconfig.json` exits 0
  - Role: ui

## Phase 2 — Backend: Drools on Quarkus

* T3a — Add the Drools dependencies to the alerting module
  - Files: backend/alerting/pom.xml
  - Change: add org.kie:kie-api:7.74.1.Final plus org.drools:drools-core; do NOT use a BOM
  - Check: `mvn -q -pl alerting -am validate` exits 0
  - Role: coder

* T3b — Add the alert routing rule
  - Files: backend/alerting/src/main/resources/rules/alert-routing.drl
  - Change: create the rule with `fact { info.severity == "Extreme" }` and
    `eval( urgency.compareTo("Immediate") == 0 )`
  - Check: `test -f backend/alerting/src/main/resources/rules/alert-routing.drl` exits 0
  - Role: coder

## Phase 3 — Verify

* T5 — Run the build to verify the frontend
  - Files: frontend/package.json
  - Change: (none) run `npm run build` in frontend/
  - Check: build succeeds
  - Role: researcher

* T6 — Audit the whole change (mandatory gate)
  - Files: all files changed above
  - Change: (none) full review
  - Check: reviewer returns Result with status done
  - Role: reviewer

I am waiting for approval
