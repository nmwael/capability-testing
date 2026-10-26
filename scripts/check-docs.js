#!/usr/bin/env node
// Docs onboarding validation: checks the docs directory and related files.
// Exit 0 if all checks pass, exit 1 otherwise.
//
//   node scripts/check-docs.js

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, 'features', 'docs');

function check() {
  const checks = [];

  // 1) features/docs directory exists
  const docsDirExists = fs.existsSync(DOCS_DIR);
  checks.push({
    name: 'features/docs directory exists',
    pass: docsDirExists,
    detail: docsDirExists ? 'OK' : 'NOT FOUND'
  });

  // 2) onboarding.feature exists with @docs and @cap:docs tags
  const onboardingFile = path.join(DOCS_DIR, 'onboarding.feature');
  const onboardingExists = fs.existsSync(onboardingFile);
  let hasDocsTag = false;
  let hasCapDocsTag = false;
  if (onboardingExists) {
    const text = fs.readFileSync(onboardingFile, 'utf8');
    hasDocsTag = /@docs/.test(text);
    hasCapDocsTag = /@cap:docs/.test(text);
  }
  checks.push({
    name: 'onboarding.feature has @docs and @cap:docs tags',
    pass: onboardingExists && hasDocsTag && hasCapDocsTag,
    detail: onboardingExists && hasDocsTag && hasCapDocsTag ? 'OK' :
      `onboardingExists=${onboardingExists} hasDocsTag=${hasDocsTag} hasCapDocsTag=${hasCapDocsTag}`
  });

  // 3) features/docs/onboarding.feature has @todo scenarios
  let hasTodoScenarios = false;
  if (onboardingExists) {
    const text = fs.readFileSync(onboardingFile, 'utf8');
    hasTodoScenarios = /@todo/.test(text);
  }
  checks.push({
    name: 'onboarding.feature has @todo scenarios',
    pass: onboardingExists && hasTodoScenarios,
    detail: onboardingExists && hasTodoScenarios ? 'OK' :
      `onboardingExists=${onboardingExists} hasTodoScenarios=${hasTodoScenarios}`
  });

  // 4) README.md has ## 📚 Documentation section
  const readmeFile = path.join(ROOT, 'README.md');
  const readmeExists = fs.existsSync(readmeFile);
  let hasDocsSection = false;
  if (readmeExists) {
    const text = fs.readFileSync(readmeFile, 'utf8');
    hasDocsSection = /## 📚 Documentation/.test(text);
  }
  checks.push({
    name: 'README.md has ## 📚 Documentation section',
    pass: readmeExists && hasDocsSection,
    detail: readmeExists && hasDocsSection ? 'OK' :
      `readmeExists=${readmeExists} hasDocsSection=${hasDocsSection}`
  });

  // 5) .gitignore includes frontend/.playwright/ and frontend/snapshots/
  const gitignoreFile = path.join(ROOT, '.gitignore');
  const gitignoreExists = fs.existsSync(gitignoreFile);
  let hasPlaywrightIgnore = false;
  let hasSnapshotsIgnore = false;
  if (gitignoreExists) {
    const text = fs.readFileSync(gitignoreFile, 'utf8');
    hasPlaywrightIgnore = /frontend\/\.playwright\//.test(text);
    hasSnapshotsIgnore = /frontend\/snapshots\//.test(text);
  }
  checks.push({
    name: '.gitignore includes frontend/.playwright/ and frontend/snapshots/',
    pass: gitignoreExists && hasPlaywrightIgnore && hasSnapshotsIgnore,
    detail: gitignoreExists && hasPlaywrightIgnore && hasSnapshotsIgnore ? 'OK' :
      `gitignoreExists=${gitignoreExists} hasPlaywrightIgnore=${hasPlaywrightIgnore} hasSnapshotsIgnore=${hasSnapshotsIgnore}`
  });

  // Determine overall result
  const allPass = checks.every(c => c.pass);
  if (!allPass) {
    console.error('Validation failed:');
    checks.filter(c => !c.pass).forEach(check => {
      console.error(`  - ${check.name}: ${check.detail}`);
    });
    process.exit(1);
  }

  console.log('All checks passed.');
  process.exit(0);
}

check();
