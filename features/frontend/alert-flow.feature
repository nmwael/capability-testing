# Owner: the frontend runner the retrofit installs (`npm run test:unit` — vitest +
# @testing-library/react over @xyflow/react). Not wired into `mvn test`.
#
# Capability: alert.flow. What a CAP alert looks like as a graph: the deliverable (info
# block) fans out to the channels the routing ruleset chose.

@cap:alert.flow
@todo
Feature: Alert distribution canvas
  As a dispatcher
  I want to see an alert's distribution as a graph
  So that I can tell at a glance who was warned and how

  Scenario: An alert renders as a React Flow canvas
    Given the alert "ALERT-001" is loaded with its routing decisions
    When the canvas is rendered
    Then the canvas holds one node for the alert
    And the canvas holds one node per channel the alert reached
    And an edge connects the alert to each channel
    And the graph is fitted to the viewport

  Scenario: The node reflects the alert's danger level
    Given the alert "ALERT-001" is of severity "Extreme" urgency "Immediate"
    When the canvas is rendered
    Then the alert node is styled as extreme
    And the styling differs from a "Minor" alert node

  Scenario: Clicking a channel node shows that dispatch
    Given the alert "ALERT-001" reached the channel "sirens"
    When the operator clicks the node labelled "sirens"
    Then a detail panel for the "sirens" dispatch is shown
    And the panel names the rule that chose the channel

  Scenario: Channels that were skipped are visible
    Given the alert "ALERT-001" did not reach the channel "social"
    When the canvas is rendered
    Then the node labelled "social" is shown as skipped

  Scenario: The distribution comes from the Quarkus backend
    Given the alerting endpoint is serving alert "ALERT-001"
    When the canvas is rendered
    Then the routing decisions are fetched from the alerting endpoint
