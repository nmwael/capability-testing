---
layout: default
title: Home
---

# Capability Contract & Project Status

## Project Goal

This project protects capabilities through explicit declaration, accountable owners, independent governance, traceable verification, and automated CI.

## Core Principles

- **Explicit Declaration**: Every capability is declared with its intent, owner, and verification criteria
- **Accountable Owners**: PO Architect and Test Manager serve as gates, with separation of duties
- **Independent Governance**: Governance decisions are made without capability owners' involvement
- **Traceable Verification**: Claims are distinguished from evidence; verification is automated
- **Automated CI**: Five CI jobs ensure traceability, backend stability, mention-check, frontend stability, and Playwright E2E

## Capability Summary

- **7 capabilities**: 6 active, 1 draft
- **96 scenarios**: 91 implemented (95% coverage)
- **Verification**: All checks pass (`scripts/verify-capabilities.js` PASSES, `scripts/check-docs.js` PASSES)

## Quick Links

- [Capabilities](/capabilities) - Full capability table with owners and status
- [CI & Reports](/reports) - CI jobs, coverage reports, and BDD tracking
- [Governance](/governance) - Roles, separation of duties, and approval policies
