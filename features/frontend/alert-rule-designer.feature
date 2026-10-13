# Owner: the frontend runner the retrofit installs (`npm run test:unit` — vitest +
# @testing-library/react over @xyflow/react). Not wired into `mvn test`.
#
# Capability: alert.rule-design. This is the authoring half; the backend contract it
# feeds lives in features/publication/alert-rule-design.feature.

@cap:alert.rule-design
@todo
Feature: Alert routing rule designer canvas
  As a warning officer
  I want to draw the routing rules as a graph
  So that changing who gets warned does not need a developer

  Scenario: The palette offers the two node kinds a rule needs
    Given the rule designer is open
    Then the palette offers a condition node
    And the palette offers an action node

  Scenario: Adding a node places it on the canvas
    Given the rule designer is open
    When I add a condition node from the palette
    Then the canvas holds one condition node
    And the node is selected so its CAP field can be chosen

  Scenario: A condition node exposes the CAP vocabularies
    Given the canvas holds a condition node
    When I inspect the condition node
    Then it offers a CAP field from severity, urgency or certainty
    And the values offered are the schema's enumeration for that field

  Scenario: Connecting a condition to an action draws a rule path
    Given the canvas holds a condition node "severe" and an action node "broadcast"
    When I drag from "severe" to "broadcast"
    Then an edge connects "severe" to "broadcast"
    And the pair forms a rule path

  Scenario: The default ruleset comes back as the starting example
    Given the rule designer is open for the first time
    Then the canvas shows the default routing graph
    And the example holds one condition per danger level
    And every condition is connected to an action node

  Scenario: An unconnected action node is flagged
    Given the canvas holds an action node "orphan" with no incoming edge
    Then "orphan" is marked invalid
    And the generate action is disabled

  Scenario: Generating rules posts the drawn graph and reports back
    Given the canvas holds a valid rule path
    When I choose generate rules
    Then the drawn graph is posted to the rule design endpoint
    And the response's rule count is shown
    And the canvas is left unchanged so it can be edited again

  Scenario: Reopening the designer restores the saved graph
    Given the graph "tornado-routing" was saved in an earlier session
    When I open the rule designer
    Then the canvas shows the saved graph "tornado-routing"
