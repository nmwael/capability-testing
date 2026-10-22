# Owner: the frontend runner (`npm run test:unit` — vitest + @testing-library/react over
# @xyflow/react). Not wired into `mvn test`.
#
# Capability: alert.rule-edit. The designer half: open a routing graph that is already
# saved, change it, and post the changed graph back as JSON. The backend half — the
# endpoint that accepts and echoes that JSON — lives in
# features/publication/alert-rule-edit.feature.
#
# The graph is the wire format between the two halves, so its JSON shape is pinned here,
# where it is produced. The sibling capability alert.rule-design owns drawing a graph from
# scratch and compiling it to Drools; this one owns changing one that already exists.

@bdd @cap:alert.rule-edit
@frontend
Feature: Edit a saved routing rule graph
  As a warning officer
  I want to change a routing rule that is already saved
  So that I can adjust who gets warned without redrawing the whole graph

  Scenario: A saved graph opens in the designer as editable nodes
    Given the rule design endpoint holds the graph "tornado-routing"
    When I open the graph "tornado-routing" for editing
    Then the canvas shows that graph's nodes and edges
    And every node can be changed

  Scenario: The graph crosses the wire as JSON
    Given the rule design endpoint holds the graph "tornado-routing"
    When I open the graph "tornado-routing" for editing
    Then the graph is JSON with a "name", a list of "nodes" and a list of "edges"
    And a condition node has "kind" "condition", a "field" and a "value"
    And an action node has "kind" "action" and a "channel"
    And an edge has "from" and "to"

  Scenario: Changing a condition's value leaves the rest of the graph alone
    Given I am editing the graph "tornado-routing"
    When I change the condition "severe" to the value "Moderate"
    Then the condition "severe" shows the value "Moderate"
    And the values offered are still the schema's enumeration for that field
    And every other node and edge is unchanged

  Scenario: Renaming an action node keeps its incoming edge
    Given I am editing the graph "tornado-routing"
    When I rename the action node "broadcast" to "sirens"
    Then an edge still connects "severe" to "sirens"
    And no edge points at a node that is no longer on the canvas

  Scenario: Deleting an action node leaves no dangling condition
    Given I am editing the graph "tornado-routing"
    When I delete the action node "broadcast"
    Then no edge starts at the condition "severe"
    And the generate action reports the graph as incomplete

  Scenario: Saving an edit posts the changed graph as JSON
    Given I am editing the graph "tornado-routing"
    When I change the condition "severe" to the value "Moderate"
    And I save the graph
    Then the JSON posted contains the value "Moderate"
    And the response's rule count is shown

  Scenario: A rejected save leaves the edit on the canvas
    Given I am editing the graph "tornado-routing"
    When I save a graph the endpoint rejects
    Then the rejection is shown
    And the canvas still holds my unsaved change

  Scenario: An edit round-trips through the backend
    Given I am editing the graph "tornado-routing"
    When I change the condition "severe" to the value "Moderate"
    And I save the graph and open it again
    Then the condition "severe" shows the value "Moderate"
