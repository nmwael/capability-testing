## Phase 1 — Backend: Quarkus + Drools Setup
* T1 — Verify Quarkus + Drools dependencies are added to pom.xml
  - Files: backend/pom.xml
  - Change: Add <dependencyManagement> section with Quarkus BOM and Drools BOM; add required Quarkus and Drools dependencies
  - Check: `mvn -q -pl backend -am validate` exits 0
  - Role: coder
* T2 — Implement Drools rule in alerting module
  - Files: backend/alerting/src/main/resources/rules/alert-routing.drl
  - Change: Create RULE "route-extreme-alert" with logic defining alert routing
  - Check: `grep -c 'RULE' backend/alerting/src/main/resources/rules/*.drl` is 1
  - Role: coder

## Phase 2 — Frontend: React Flow
* T3 — Configure React Flow frontend package.json
  - Files: frontend/package.json
  - Change: Set up React Flow dependencies (React, React-Flow, etc.)
  - Check: `bats test-frontend.bats` passes or tsconfig verifies React Flow import works
  - Role: ui
* T4 — Add React Flow component
  - Files: frontend/src/components/RuleFlow.tsx
  - Change: Render <ReactFlow nodes={nodes} edges={edges} /> from @xyflow/react
  - Check: `npx --no-install tsc --noEmit -p frontend/tsconfig.json` exits 0
  - Role: ui
