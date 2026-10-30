# Owner: the frontend runner the retrofit installs (`npm run test:unit` — vitest +
# @testing-library/react over @xyflow/react). Not wired into `mvn test`.
#
# Capability: alert.rule-design. This is the authoring half; the backend contract it
# feeds lives in features/publication/alert-rule-design.feature.

@bdd
@cap:alert.rule-design
@frontend
Feature: Alert routing rule designer canvas
  As a warning officer
  I want to draw the routing rules as a graph
  So that changing who gets warned does not need a developer

  @scenario:SC-FRONT-020
  @req:REQ-FRONT-001
  Scenario: The palette offers the two node kinds a rule needs
    Given the rule designer is open
    Then the palette offers a condition node
    And the palette offers an action node

  @scenario:SC-FRONT-021
  @req:REQ-FRONT-001
  Scenario: Adding a node places it on the canvas
    Given the rule designer is open
    When I add a condition node from the palette
    Then the canvas holds one condition node
    And the node is selected so its CAP field can be chosen

  @scenario:SC-FRONT-022
  @req:REQ-FRONT-001
  Scenario: A condition node exposes the CAP vocabularies
    Given the canvas holds a condition node
    When I inspect the condition node
    Then it offers a CAP field from severity, urgency or certainty
    And the values offered are the schema's enumeration for that field

  @scenario:SC-FRONT-023
  @req:REQ-FRONT-001
  Scenario: Connecting a condition to an action draws a rule path
    Given the canvas holds a condition node "severe" and an action node "broadcast"
    When I drag from "severe" to "broadcast"
    Then an edge connects "severe" to "broadcast"
    And the pair forms a rule path

  @scenario:SC-FRONT-024
  @req:REQ-FRONT-001
  Scenario: The default ruleset comes back as the starting example
    Given the rule designer is open for the first time
    Then the canvas shows the default routing graph
    And the example holds one condition per danger level
    And every condition is connected to an action node

  @scenario:SC-FRONT-025
  @req:REQ-FRONT-001
  Scenario: An unconnected action node is flagged
    Given the canvas holds an action node "orphan" with no incoming edge
    Then "orphan" is marked invalid
    And the generate action is disabled

  @scenario:SC-FRONT-026
  @req:REQ-FRONT-001
  Scenario: Generating rules posts the drawn graph and reports back
    Given the canvas holds a valid rule path
    When I choose generate rules
    Then the drawn graph is posted to the rule design endpoint
    And the response's rule count is shown
    And the canvas is left unchanged so it can be edited again

  @scenario:SC-FRONT-027
  @req:REQ-FRONT-001
  Scenario: Reopening the designer restores the saved graph
    Given the graph "tornado-routing" was saved in an earlier session
    When I open the rule designer
    Then the canvas shows the saved graph "tornado-routing"

  # --- Changing what has been drawn ---

  @scenario:SC-FRONT-028
  @req:REQ-FRONT-001
  Scenario: Removing an edge keeps both of its nodes
    Given the canvas holds a condition node "severe" connected to an action node "broadcast"
    When I remove the edge from "severe" to "broadcast"
    Then the canvas still holds "severe" and "broadcast"
    And "broadcast" has no incoming edge

  @scenario:SC-FRONT-029
  @req:REQ-FRONT-001
  Scenario: Undo restores the graph to its previous state
    Given the canvas holds a condition node "severe" connected to an action node "broadcast"
    When I add a condition node "minor"
    And I undo the last change
    Then the canvas holds no condition node "minor"
    And "severe" is still connected to "broadcast"

  @scenario:SC-FRONT-030
  @req:REQ-FRONT-001
  Scenario: Redo reapplies what undo removed
    Given the canvas holds a condition node "severe" connected to an action node "broadcast"
    When I add a condition node "minor"
    And I undo the last change
    And I redo the last change
    Then the canvas holds the condition node "minor"

  # --- Validation while drawing ---

  @scenario:SC-FRONT-031
  @req:REQ-FRONT-001
  Scenario: A duplicate node id is refused as it is typed
    Given the canvas holds a condition node "severe"
    And the canvas holds a second condition node
    When I rename the second condition node to "severe"
    Then the name "severe" is marked as taken
    And the generate action is disabled

  @scenario:SC-FRONT-032
  @req:REQ-FRONT-001
  Scenario: A cycle cannot be connected
    Given the canvas holds a condition node "a" connected to an action node "b"
    When I try to draw an edge from "b" to "a"
    Then the edge is refused
    And the only edge on the canvas is the one from "a" to "b"

  @scenario:SC-FRONT-033
  @req:REQ-FRONT-001
  Scenario: Connecting an orphan action node enables generate
    Given the canvas holds an action node "orphan" with no incoming edge
    Then the generate action is disabled
    When I connect a condition node to "orphan"
    Then the generate action is enabled

  # --- What an action node can fire ---

  @scenario:SC-FRONT-034
  @req:REQ-FRONT-001
  Scenario: An action node offers the channels the alerting module can fire
    Given the rule designer is open
    When I inspect an action node
    Then the channels offered are the ones the alerting module can fire

  # --- Moving around the canvas ---

  @scenario:SC-FRONT-035
  @req:REQ-FRONT-001
  Scenario: The canvas can be zoomed and panned
    Given the canvas holds a condition node "severe" connected to an action node "broadcast"
    When I zoom the canvas out
    And I pan the canvas
    Then both nodes are still on the canvas
    And the connection between them is unchanged

  @scenario:SC-FRONT-036
  @req:REQ-FRONT-001
  Scenario: The canvas can be fitted back to the graph
    Given the canvas has been zoomed and panned away from its nodes
    When I choose fit to view
    Then every node is inside the visible area

  # --- Naming the graph and leaving the designer ---

  @scenario:SC-FRONT-037
  @req:REQ-FRONT-001
  Scenario: An unnamed graph is named before it can be generated
    Given the canvas holds a valid rule path
    And the graph has no name
    When I choose generate rules
    Then I am asked for a graph name
    And nothing is posted before a name is given

  @scenario:SC-FRONT-038
  @req:REQ-FRONT-001
  Scenario: Leaving with unsaved changes warns first
    Given I have changed a condition and not saved
    When I try to leave the designer
    Then I am warned about the unsaved change

  # --- Keyboard ---

  @scenario:SC-FRONT-039
  @req:REQ-FRONT-001
  Scenario: A node can be added without a mouse
    Given the rule designer is open
    When I add a condition node from the palette with the keyboard
    Then the canvas holds one condition node
    And the new node has focus

  @scenario:SC-FRONT-040
  @req:REQ-FRONT-001
  Scenario: Every node can be reached and selected with the keyboard
    Given the canvas holds a condition node "severe" connected to an action node "broadcast"
    When I move focus through the canvas with the keyboard
    Then each node can be reached
    And each node can be selected

  # --- Backend states ---

  @scenario:SC-FRONT-041
  @req:REQ-FRONT-001
  Scenario: A slow rule design endpoint shows a loading state, not an empty canvas
    Given the rule design endpoint is slow to answer
    When I open the graph "tornado-routing"
    Then a loading state is shown
    And the canvas is not shown as empty

  @scenario:SC-FRONT-042
  @req:REQ-FRONT-001
  Scenario: An unreachable backend leaves the browser's graph editable
    Given the rule design endpoint is unreachable
    When I open the graph "tornado-routing"
    Then the graph already in the browser is still editable
    And the failure to reach the backend is reported

  # --- First run ---

  @scenario:SC-FRONT-043
  @req:REQ-FRONT-001
  Scenario: An empty canvas says how to start
    Given I have cleared the canvas
    Then the canvas suggests starting from the palette
    And the canvas offers a way to open a saved graph

  # --- A smooth canvas: wiring, travel, clarity and cost ---
  #
  # The acceptance criteria for the approved "designer cleanup" pass
  # (ergonomics + visual polish + performance). All scenarios are pinned by
  # AlertRuleDesigner.test.tsx. Interaction-only sub-steps (minimap click-to-pan,
  # drag-to-grid alignment, viewport-only drawing) are asserted through the
  # ReactFlow props because jsdom cannot exercise them. Tracked in the GitHub
  # tracker under capability alert.rule-design.
  
  @scenario:SC-FRONT-044
  @req:REQ-FRONT-001
  Scenario: A node can be wired to another through its handles
    Given the canvas holds a condition node and an action node
    When I drag from the condition node's right handle to the action node's left handle
    Then a rule path connects them
    And the action node offers no outgoing handle

  @scenario:SC-FRONT-045
  @req:REQ-FRONT-001
  Scenario: The canvas offers a minimap
    Given the canvas holds more nodes than fit on screen
    Then a minimap shows the whole graph
    And choosing a point on the minimap moves the view there

  @scenario:SC-FRONT-046
  @req:REQ-FRONT-001
  Scenario: A dragged node lands on the grid
    Given the rule designer is open
    When I drag a node and release it
    Then its position is aligned to the grid
    And two nodes dropped one grid cell apart line up

  @scenario:SC-FRONT-047
  @req:REQ-FRONT-001
  Scenario: Backspace deletes the selected node exactly once
    Given the canvas holds one selected condition node
    When I press Backspace
    Then the node is removed
    And no second deletion is attempted

  @scenario:SC-FRONT-048
  @req:REQ-FRONT-001
  Scenario: Typing in a text field does not trigger a canvas shortcut
    Given the graph name field has focus
    When I type the letter "c"
    Then the graph name receives the character
    And no condition node is added

  @scenario:SC-FRONT-049
  @req:REQ-FRONT-001
  Scenario: A disabled generate control says what is missing
    Given the canvas holds an action node with no incoming edge
    When I look at the generate control
    Then it is not available
    And the canvas says which rule the graph is missing

  @scenario:SC-FRONT-050
  @req:REQ-FRONT-001
  Scenario: The two node kinds are visually distinguishable
    Given the canvas holds a condition node and an action node
    When I look at the canvas without selecting either
    Then the condition node and the action node carry different chrome
    And each node says which kind it is

  @scenario:SC-FRONT-051
  @req:REQ-FRONT-001
  Scenario: Selecting a node is not an edit
    Given a graph with a condition node and an action node and no unsaved changes
    When I select the action node without changing it
    Then the graph is still not marked as having unsaved changes

  @scenario:SC-FRONT-052
  @req:REQ-FRONT-001
  Scenario: The canvas draws only the nodes in view
    Given the canvas holds a graph larger than the viewport
    When I pan to one corner of the graph
    Then only the nodes inside the viewport are drawn
