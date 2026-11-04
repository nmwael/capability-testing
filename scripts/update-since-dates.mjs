#!/usr/bin/env node
// Update "since" fields in capabilities.yml and requirements.yml to actual dates

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const capFile = resolve("capabilities/capabilities.yml");
const reqFile = resolve("requirements/requirements.yml");

// Capability since dates from lifecycle_state_changed
const capSinceDates = {
  "alert.publish": "2026-01-15",
  "alert.route": "2026-02-20",
  "alert.rule-design": "2026-03-10",
  "alert.rule-edit": "2026-04-05",
  "alert.flow": "2026-05-12",
  "alert.cap-fields": "2026-06-20",
  "docs.onboarding": "2026-09-01"
};

// Requirement since dates - use the capability's lifecycle_state_changed date
const reqSinceDates = {
  "REQ-PUB-001": "2026-01-15",   // alert.publish
  "REQ-PUB-002": "2026-03-10",   // alert.rule-design
  "REQ-PUB-003": "2026-04-05",   // alert.rule-edit
  "REQ-PUB-004": "2026-05-12",   // alert.flow
  "REQ-ALERT-001": "2026-02-20", // alert.route
  "REQ-FRONT-001": "2026-03-10", // alert.rule-design
  "REQ-FRONT-002": "2026-04-05", // alert.rule-edit
  "REQ-FRONT-003": "2026-05-12", // alert.flow
  "REQ-FRONT-004": "2026-06-20", // alert.cap-fields
  "REQ-DOCS-001": "2026-09-01"   // docs.onboarding
};

function updateCapabilities() {
  let content = readFileSync("capabilities/capabilities.yml", "utf-8");
  
  for (const [capId, date] of Object.entries(capSinceDates)) {
    // Replace the since line for this capability
    const regex = new RegExp(`(\\s*id: ${capId}\\n(?:.*\\n)*?\\s*since:\\s*)[^\\n]*`, 'm');
    content = content.replace(regex, `$1${date}`);
    console.log(`Updated ${capId} since to ${date}`);
  }
  
  writeFileSync("capabilities/capabilities.yml", content);
  console.log("Updated capabilities/capabilities.yml");
}

function updateRequirements() {
  let content = readFileSync("requirements/requirements.yml", "utf-8");
  
  for (const [reqId, date] of Object.entries(reqSinceDates)) {
    // Find the requirement block and update its since line
    const regex = new RegExp(`(\\s*id: ${reqId}\\n(?:.*\\n)*?\\s*since:\\s*)[^\\n]*`, 'm');
    content = content.replace(regex, `$1${date}`);
    console.log(`Updated ${reqId} since to ${date}`);
  }
  
  writeFileSync("requirements/requirements.yml", content);
  console.log("Updated requirements/requirements.yml");
}

updateCapabilities();
updateRequirements();
console.log("Done updating since dates.");