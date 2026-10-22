@bdd
@cap:alert.rule-design
@frontend
Feature: Rule Designer Rename Panel

  Scenario: Rename a rule using the rename panel
    Given the rule designer is open
    When I click on the "rule-designer-rename-panel" button
    And I enter a new rule name
    Then the rule name is updated
    And the "rule-designer-reopen-button" is shown to reopen the panel

  Scenario: Reopen the rename panel
    Given the rename panel has been closed
    When I click the "rule-designer-reopen-button"
    Then the rename panel is shown again
