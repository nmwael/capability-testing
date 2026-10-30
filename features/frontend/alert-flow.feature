# Owner: the frontend runner the retrofit installs (`npm run test:unit` — vitest +
# @testing-library/react over @xyflow/react). Not wired into `mvn test`.
#
# Capability: alert.flow. What a CAP alert looks like as a graph: the deliverable (info
# block) fans out to the channels the routing ruleset chose.

@bdd
@cap:alert.flow
@frontend
Feature: Alert distribution canvas
  As a dispatcher
  I want to see an alert's distribution as a graph
  So that I can tell at a glance who was warned and how

  @scenario:SC-FRONT-001
  @req:REQ-FRONT-003
  Scenario: An alert renders as a React Flow canvas
    Given the alert "ALERT-001" is loaded with its routing decisions
    When the canvas is rendered
    Then the canvas holds one node for the alert
    And the canvas holds one node per channel the alert reached
    And an edge connects the alert to each channel
    And the graph is fitted to the viewport

  @scenario:SC-FRONT-002
  @req:REQ-FRONT-003
  Scenario: The node reflects the alert's danger level
    Given the alert "ALERT-001" is of severity "Extreme" urgency "Immediate"
    When the canvas is rendered
    Then the alert node is styled as extreme
    And the styling differs from a "Minor" alert node

  @scenario:SC-FRONT-003
  @req:REQ-FRONT-003
  Scenario: Clicking a channel node shows that dispatch
    Given the alert "ALERT-001" reached the channel "sirens"
    When the operator clicks the node labelled "sirens"
    Then a detail panel for the "sirens" dispatch is shown
    And the panel names the rule that chose the channel

  @scenario:SC-FRONT-004
  @req:REQ-FRONT-003
  Scenario: Channels that were skipped are visible
    Given the alert "ALERT-001" did not reach the channel "social"
    When the canvas is rendered
    Then the node labelled "social" is shown as skipped

  @scenario:SC-FRONT-005
  @req:REQ-FRONT-003
  Scenario: The distribution comes from the Quarkus backend
    Given the alerting endpoint is serving alert "ALERT-001"
    When the canvas is rendered
    Then the routing decisions are fetched from the alerting endpoint

  # --- When the backend cannot answer ---

  @scenario:SC-FRONT-006
  @req:REQ-FRONT-003
  Scenario: An unknown alert is reported, not drawn as an empty canvas
    Given the alerting endpoint does not hold alert "ALERT-404"
    When I open the canvas for "ALERT-404"
    Then the canvas reports that the alert is unknown
    And no alert node is drawn

  @scenario:SC-FRONT-007
  @req:REQ-FRONT-003
  Scenario: A fetch that fails is reported and can be retried
    Given the alerting endpoint is unreachable
    When the canvas is rendered
    Then the failure to reach the alerting endpoint is reported
    And I am offered a retry

  @scenario:SC-FRONT-008
  @req:REQ-FRONT-003
  Scenario: A slow alerting endpoint shows a loading state, not an empty canvas
    Given the alerting endpoint is slow to answer
    When the canvas is rendered
    Then a loading state is shown
    And the canvas is not shown as empty

  # --- What the nodes say ---

  @scenario:SC-FRONT-009
  @req:REQ-FRONT-003
  Scenario: Every channel appears exactly once, reached or skipped
    Given the alert "ALERT-001" reached the channel "sirens"
    And the alerting module can also fire the channel "social"
    When the canvas is rendered
    Then there is exactly one node labelled "sirens"
    And there is exactly one node labelled "social"
    And "sirens" is shown as reached while "social" is shown as skipped

  # --- Moving around the canvas ---

  @scenario:SC-FRONT-010
  @req:REQ-FRONT-003
  Scenario: The canvas can be zoomed, panned and fitted
    Given the alert "ALERT-001" reached the channel "sirens"
    When I zoom the canvas out
    And I pan the canvas
    And I choose fit to view
    Then every node is inside the visible area

  # --- Keyboard ---

  @scenario:SC-FRONT-011
  @req:REQ-FRONT-003
  Scenario: A channel node can be reached and opened with the keyboard
    Given the alert "ALERT-001" reached the channel "sirens"
    When I move focus through the canvas with the keyboard
    Then the node labelled "sirens" can be reached
    And opening it shows the "sirens" detail panel
