@cap:alert.rule-design
@backend
Feature: Design alert routing rules as a graph
  As a warning officer
  I want to draw the routing rules as a graph
  So that changing who gets warned does not need a developer

  # The canvas (features/frontend/alert-rule-designer.feature) is the authoring surface;
  # this feature pins what the backend owes: accept a drawn graph, compile it into a
  # Drools ruleset, and let that ruleset route real CAP alerts. Shapes, not thresholds.

  Scenario: A drawn graph compiles to a Drools ruleset
    Given a rule graph named "tornado-routing" containing a condition node "severe" and an action node "broadcast"
    And an edge from "severe" to "broadcast"
    When I save the graph to the rule design endpoint
    Then the response contains one saved rule
    And the rule's condition comes from "severe"
    And the rule's action comes from "broadcast"

  Scenario: The compiled ruleset is real Drools
    Given the graph "tornado-routing" has been saved
    When I compile the ruleset
    Then the generated DRL declares a rule per path in the graph
    And the ruleset loads into the Drools rule engine

  Scenario: The condition nodes read the CAP info block
    Given the graph "tornado-routing" has a condition on severity "Extreme"
    And its ruleset is activated
    When a CAP alert with severity "Extreme" urgency "Immediate" is received
    Then the action node's channel is fired for that alert

  Scenario: An alert outside the condition is not routed
    Given the graph "tornado-routing" has a condition on severity "Extreme"
    And its ruleset is activated
    When a CAP alert with severity "Minor" is received
    Then no action node fires for that alert

  Scenario: An action node with no incoming condition is rejected
    Given a rule graph containing an action node "orphan"
    And no edge points at "orphan"
    When I save the graph to the rule design endpoint
    Then the graph is rejected
    And the response names the orphan node "orphan"

  Scenario: Two nodes cannot share an id
    Given a rule graph containing two condition nodes both named "severe"
    When I save the graph to the rule design endpoint
    Then the graph is rejected
    And the response names the duplicated node "severe"

  Scenario: A cycle cannot be drawn
    Given a rule graph with an edge from "severe" to "broadcast" and an edge from "broadcast" to "severe"
    When I save the graph to the rule design endpoint
    Then the graph is rejected
    And the response reports a cycle

  Scenario: Redrawing the graph replaces the rules that were there before
    Given the graph "tornado-routing" was saved with one condition
    When I save "tornado-routing" again with the action removed
    Then the compiled ruleset holds no rule without an action
    And the previous rule no longer fires
