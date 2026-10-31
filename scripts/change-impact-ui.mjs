#!/usr/bin/env node
// change-impact-ui.mjs — Generate a static HTML page for change impact analysis.
//
//   node scripts/change-impact-ui.mjs --output docs/impact/
//
// Delegates to change-impact.mjs with --output for HTML generation.

import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const ROOT = process.cwd();

function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--output');
  const output = outIdx !== -1 ? args[outIdx + 1] : 'docs/impact';

  const cmdArgs = ['scripts/change-impact.mjs', '--since', 'HEAD~1', '--output', output];
  const result = execSync(`node ${cmdArgs.join(' ')}`, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  console.log(result.trim());
}

main();
