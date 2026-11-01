#!/usr/bin/env node
/**
 * Post capability validation results as a PR comment.
 * Updates existing comment if one exists, otherwise creates new.
 */

import { readFileSync } from 'fs';
import { execSync } from 'child_process';

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch (e) {
    return '';
  }
}

function getPRNumber() {
  return process.env.PR_NUMBER || exec('gh pr view --json number -q .number 2>/dev/null') || '';
}

function getRepo() {
  return process.env.REPO || exec('gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null') || '';
}

function readValidationOutput() {
  try {
    return readFileSync('artifacts/validation-output.txt', 'utf8');
  } catch {
    return '';
  }
}

function readRegressionOutput() {
  try {
    return readFileSync('artifacts/regression-output.txt', 'utf8');
  } catch {
    return '';
  }
}

function parseValidation(output) {
  const lines = output.split('\n');
  const warnings = [];
  const errors = [];
  let inWarnings = false;
  let inErrors = false;
  
  for (const line of lines) {
    if (line.includes('Capability traceability check has warnings:')) {
      inWarnings = true;
      inErrors = false;
      continue;
    }
    if (line.includes('Capability traceability check FAILED:')) {
      inErrors = true;
      inWarnings = false;
      continue;
    }
    if (line.includes('Capability traceability check PASSED')) {
      inWarnings = false;
      inErrors = false;
      continue;
    }
    if (line.startsWith('  - ')) {
      if (inWarnings) warnings.push(line.slice(4));
      if (inErrors) errors.push(line.slice(4));
    }
  }
  
  return { warnings, errors, passed: errors.length === 0 };
}

function parseRegression(output) {
  const regressions = [];
  if (output.includes('REGRESSIONS DETECTED:')) {
    const lines = output.split('\n');
    let inRegressions = false;
    for (const line of lines) {
      if (line.includes('REGRESSIONS DETECTED:')) {
        inRegressions = true;
        continue;
      }
      if (inRegressions && line.startsWith('  - ')) {
        regressions.push(line.slice(4));
      }
      if (inRegressions && !line.startsWith('  ') && line.trim()) {
        inRegressions = false;
      }
    }
  }
  return regressions;
}

function getHealthScores() {
  const output = exec('node -e "const d=require(\"./scripts/verify-capabilities.js\"); const data=d.readYamlSimple(\"capabilities/capabilities.yml\"); data.capabilities.forEach(c=>{const vb=Array.isArray(c.verified_by)?c.verified_by:[]; let cs=0,ms=0,fl=0,cc=0,mc=0,fc=0,lr=null; for(const e of vb){if(!e||typeof e!==\"object\")continue; if(e.coverage!==undefined){const v=parseInt(e.coverage);if(!isNaN(v)){cs+=v;cc++;}} if(e.mutation_score!==undefined){const v=parseInt(e.mutation_score);if(!isNaN(v)){ms+=v;mc++;}} if(e.flakiness!==undefined){const v=parseFloat(e.flakiness);if(!isNaN(v)){fl+=v;fc++;}} if(e.last_run){const d=new Date(e.last_run);if(!isNaN(d.getTime())&&(!lr||d>lr))lr=d;}} if(cc>0||mc>0){const ca=cc>0?cs/cc:50; const ma=mc>0?ms/mc:50; const fa=fc>0?fl/fc:0.1; let fr=1; if(lr){const ds=(Date.now()-lr.getTime())/(1000*60*60*24); fr=Math.max(0,1-ds/365);} const hs=Math.round(ca*0.4+ma*0.3+(1-fa)*100*0.2+fr*100*0.1); console.log(c.id+':'+Math.max(0,Math.min(100,hs)));}})" 2>&1');
  
  const health = {};
  for (const line of output.split('\n')) {
    const [id, score] = line.split(':');
    if (id && score) health[id] = parseInt(score);
  }
  return health;
}

function findExistingComment(prNumber, repo) {
  try {
    const output = exec(`gh api repos/${repo}/issues/${prNumber}/comments --jq '.[] | select(.user.login=="github-actions[bot]") | select(.body | contains("Capability Validation")) | .id'`);
    return output.trim() || null;
  } catch {
    return null;
  }
}

function postComment(prNumber, repo, body, commentId = null) {
  if (commentId) {
    exec(`gh api --method PATCH repos/${repo}/issues/comments/${commentId} -f body="${body.replace(/"/g, '\\"')}"`);
    console.log(`Updated comment ${commentId}`);
  } else {
    exec(`gh api repos/${repo}/issues/${prNumber}/comments -f body="${body.replace(/"/g, '\\"')}"`);
    console.log('Created new comment');
  }
}

function generateReport(validation, regression, healthScores) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  let body = `## 📊 Capability Validation Report\n\n`;
  body += `*Generated: ${timestamp} UTC*\n\n`;
  
  // Overall status
  const overallPass = validation.passed && regression.length === 0;
  body += overallPass ? '✅ **Overall: PASSED**\n\n' : '❌ **Overall: FAILED**\n\n';
  
  // Health scores table
  const health = healthScores;
  if (Object.keys(health).length > 0) {
    body += '### Capability Health Scores\n\n';
    body += '| Capability | Health Score |\n';
    body += '|------------|--------------|\n';
    for (const [id, score] of Object.entries(health)) {
      const emoji = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴';
      body += `| ${id} | ${emoji} ${score}% |\n`;
    }
    body += '\n';
  }
  
  // Validation results
  body += '### Validation Results\n\n';
  if (validation.passed) {
    body += '✅ All validation checks passed\n\n';
  } else {
    body += `❌ ${validation.errors.length} error(s), ${validation.warnings.length} warning(s)\n\n`;
  }
  
  if (validation.warnings.length > 0) {
    body += '#### Warnings\n';
    for (const w of validation.warnings) {
      body += `- ${w}\n`;
    }
    body += '\n';
  }
  
  if (validation.errors.length > 0) {
    body += '#### Errors\n';
    for (const e of validation.errors) {
      body += `- ${e}\n`;
    }
    body += '\n';
  }
  
  // Regression check
  body += '### Regression Check\n\n';
  if (regression.length === 0) {
    body += '✅ No regressions detected\n\n';
  } else {
    body += `❌ ${regression.length} regression(s) detected:\n`;
    for (const r of regression) {
      body += `- ${r}\n`;
    }
    body += '\n';
  }
  
  body += '---\n';
  body += `*Report generated by [Capability Validation](https://github.com/${exec('gh repo view --json nameWithOwner -q .nameWithOwner')}/actions)*`;
  
  return body;
}

function main() {
  const prNumber = getPRNumber();
  const repo = getRepo();
  
  if (!prNumber || !repo) {
    console.log('Not a PR environment, skipping comment');
    process.exit(0);
  }
  
  console.log(`Posting comment for PR #${prNumber} in ${repo}`);
  
  const validationOutput = readValidationOutput();
  const regressionOutput = readRegressionOutput();
  
  const validation = parseValidation(validationOutput);
  const regression = parseRegression(regressionOutput);
  const healthScores = getHealthScores();
  
  const body = generateReport(validation, regression, healthScores);
  
  const existingCommentId = findExistingComment(prNumber, repo);
  postComment(prNumber, repo, body, existingCommentId);
}

main();