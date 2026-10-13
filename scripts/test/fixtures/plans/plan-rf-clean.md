## Phase 1 — Frontend: React Flow
* T1 — Update the frontend manifest
  - Files: frontend/package.json
  - Change: add "react": "19.3.0", "react-dom": "19.3.0", "@xyflow/react": "12.12.0", "vite": "8.3.4"
  - Check: `node -e "JSON.parse(require('fs').readFileSync('frontend/package.json'))"` exits 0
  - Role: coder
## Phase 2 — Backend: Drools
* T2 — Add Drools to the invoicing module
  - Files: backend/invoicing/pom.xml
  - Change: import org.drools:drools-bom:10.2.0 (type pom, scope import); add org.drools:drools-core, org.kie:kie-api (versions managed by the BOM)
  - Check: `mvn -q -pl invoicing -am validate` exits 0
  - Role: coder
I am waiting for approval
