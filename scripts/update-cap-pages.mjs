#!/usr/bin/env node
// Update static capability HTML pages to add GitHub issue links for requirements

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const reqMap = {
  "alert.publish": [
    { id: "REQ-PUB-001", issue: 267 }
  ],
  "alert.route": [
    { id: "REQ-ALERT-001", issue: 271 }
  ],
  "alert.rule-design": [
    { id: "REQ-PUB-002", issue: 268 },
    { id: "REQ-FRONT-001", issue: 272 }
  ],
  "alert.rule-edit": [
    { id: "REQ-PUB-003", issue: 269 },
    { id: "REQ-FRONT-002", issue: 273 }
  ],
  "alert.flow": [
    { id: "REQ-PUB-004", issue: 270 },
    { id: "REQ-FRONT-003", issue: 274 }
  ],
  "alert.cap-fields": [
    { id: "REQ-FRONT-004", issue: 275 }
  ],
  "docs.onboarding": [
    { id: "REQ-DOCS-001", issue: 276 }
  ]
};

function updateCapPage(capId) {
  const filePath = resolve(`docs/coverage/cap-${capId}.html`);
  if (!existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  
  let content = readFileSync(filePath, 'utf-8');
  const reqs = reqMap[capId] || [];
  
  if (reqs.length === 0) {
    console.log(`No requirements for ${capId}`);
    return;
  }
  
  // Create the requirement links HTML
  const reqLinks = reqs.map(r => 
    `<a href="https://github.com/nmwael/capability-testing/issues/${r.issue}" target="_blank" rel="noopener"><code>${r.id}</code></a>`
  ).join(", ");
  
  // Find the meta line with "Since:" and add requirements after it
  const sinceRegex = /(<p class="meta">.*?Since: [\d.-]+)/;
  const match = content.match(sinceRegex);
  
  if (match) {
    const replacement = `${match[1]} · Requirements: ${reqLinks}</p>`;
    content = content.replace(sinceRegex, replacement);
    writeFileSync(resolve(`docs/coverage/cap-${capId}.html`), content);
    console.log(`Updated ${capId} with requirements: ${reqs.map(r => r.id).join(", ")}`);
  } else {
    console.log(`Could not find Since line in ${capId}`);
  }
}

for (const capId of Object.keys(reqMap)) {
  updateCapPage(capId);
}

console.log("Done updating capability pages.");