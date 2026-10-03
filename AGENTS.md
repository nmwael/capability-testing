# Agent Behavior Contract - capability-testing

This repo focuses on **capability testing** using **Cucumber/Gherkin** with **Quarkus (backend)** and **React (frontend)**.

## Project goals
- BDD: Discovery → Formulation → Automation
- Capability-driven: organize features by business capabilities, not technical layers
- Tests describe behavior (what/why), avoid leaking UI/impl details into Gherkin

## Tech stack
- BDD: Cucumber + Gherkin
- Backend: Quarkus (Java), quarkus-cucumber (io.quarkiverse.cucumber:quarkus-cucumber 1.3.0)
- Frontend: React
- Reports: Cucumber JSON/JUnit/HTML

## Role specialization (cloud mode)
- architect: capability model, test strategy, scenario decomposition, HITL gate
- researcher: domain discovery, example mapping, edge cases
- ai-researcher: BDD patterns, Quarkiverse Cucumber, living docs, traceability
- coder: Java step defs/glue, Quarkus @QuarkusTest, @ScenarioScope, hooks, utilities; React test support
- reviewer: Gherkin quality (clear, unambiguous, reusable), step reuse, isolation, assertions
- build: CI, tags/profiles, parallelism, reporting, env
- ui: React journey/component alignment, locators, accessibility
- artist: capability/feature maps, diagrams, living docs visuals

## Conventions
- Features in `src/test/resources/features/` (or `features/`) grouped by capability/domain
- Step defs in `src/test/java/**/steps/`, glue packages under test root
- Prefer domain language; use Background/Rules/Examples; tag by capability (`@capability:...`)
- @ScenarioScope for shared state per scenario
- Keep features implementation-agnostic (backend API or UI journey)
- Follow HITL: architect plan → human approval → implementation (per AGENTS.md in repo)
- Cloud mode only (opencode provider). No local models.

## Verification
- Run Cucumber tests via Maven/Gradle (check README/pom.xml first)
- Verify reports generated; ensure features parse and steps resolve
