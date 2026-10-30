@cap:alert.route
@backend
Feature: Route CAP alerts by danger level
  As a dispatcher
  I want an alert's severity, urgency and certainty to decide how it is sent
  So that extreme warnings reach people before minor notices do

  # Driven by the same ruleset contract as features/publication/alert-rule-design.feature;
  # this feature pins the shipped default ruleset (the graph's starting example).

  @scenario:SC-ALERT-001
  @req:REQ-ALERT-001
  Scenario: An extreme immediate alert fan-outs to every channel
    Given a ruleset is active
    When an alert with severity "Extreme" urgency "Immediate" certainty "Observed" is received
    Then the alert is dispatched to every configured channel
    And the dispatch is recorded as a broadcast

  @scenario:SC-ALERT-002
  @req:REQ-ALERT-001
  Scenario: A minor unexpected alert does not broadcast
    Given a ruleset is active
    When an alert with severity "Minor" urgency "Future" certainty "Unlikely" is received
    Then the alert is dispatched but not broadcast

  @scenario:SC-ALERT-003
  @req:REQ-ALERT-001
  Scenario: More danger is never routed to fewer channels
    Given a ruleset is active
    When two alerts are received, one with severity "Extreme" and one with severity "Moderate"
    Then the "Extreme" alert's channel count is at least the "Moderate" alert's channel count

  @scenario:SC-ALERT-004
  @req:REQ-ALERT-001
  Scenario: The alert's area decides which regional channels fire
    Given a ruleset is active
    And channels exist for area "Riverside County" and for area "Lakeside County"
    When an alert whose area is "Riverside County" is received
    Then only the "Riverside County" channel is dispatched

  @scenario:SC-ALERT-005
  @req:REQ-ALERT-001
  Scenario: Test alerts never reach a person
    Given a ruleset is active
    When an alert with status "Test" and severity "Extreme" is received
    Then the alert is routed to the test channel only

  @scenario:SC-ALERT-006
  @req:REQ-ALERT-001
  Scenario: Routing decisions remember which rule fired
    Given a ruleset is active
    When an alert with urgency "Immediate" is received
    Then the routing decision names the rule that fired
