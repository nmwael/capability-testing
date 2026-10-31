#!/usr/bin/env node
// release-checklist-ui.mjs — Generate a static HTML page for release checklist.
//
//   node scripts/release-checklist-ui.mjs --output docs/release/
//
// Delegates to release-checklist.mjs with --output for HTML generation.

import { execSync } from 'node:child_process';

const ROOT = process.cwd();

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--output');
  const output = outIdx !== -1 ? args[outIdx + 1] : 'docs/release';

  const result = execSync(
    `node scripts/release-checklist.mjs --output ${output}`,
    { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(result.trim());
}

main();
