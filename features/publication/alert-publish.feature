@cap:alert.publish
@todo
Feature: Publish CAP alerts
  As a warning officer
  I want to publish an alert as a CAP v1.2 message
  So that any CAP-compliant system can consume it

  # The backing model is the OASIS CAP v1.2 schema (backend/common/src/main/resources/cap-v1.2.xsd):
  # a publish is valid exactly when the message validates against it.

  Scenario: A well-formed alert validates against the CAP 1.2 schema
    Given an alert with identifier "ALERT-001" sender "warning@example.org" sent "2026-10-13T09:00:00+00:00"
    And the alert is of status "Actual" msgType "Alert" and scope "Public"
    And it carries one info block with event "Tornado Warning" urgency "Immediate" severity "Extreme" certainty "Observed"
    When I publish the alert
    Then the alert is accepted
    And the published message validates against the CAP 1.2 schema

  Scenario: A CAP message round-trips through the schema unchanged
    Given the alert "ALERT-001" has been published
    When I read it back
    Then every element the schema declares is present with the same value

  Scenario: The schema's closed vocabularies are enforced
    Given an alert with status "AlmostActual"
    When I publish the alert
    Then the alert is rejected
    And the failure names the invalid element "status"

  Scenario: The same guard applies to the info block
    Given an info block with urgency "Yesterday"
    When I publish the alert
    Then the alert is rejected
    And the failure names the invalid element "urgency"

  Scenario: A cancel message must reference the alert it cancels
    Given an alert with msgType "Cancel" and no references element
    When I publish the alert
    Then the alert is rejected
    And the failure names the missing element "references"

  Scenario: An update references the alert it updates
    Given an alert with msgType "Update" and references "warning@example.org,ALERT-001,2026-10-13T09:00:00+00:00"
    When I publish the alert
    Then the alert is accepted

  Scenario: Draft messages may be persisted but never dispatched
    Given an alert with status "Draft"
    When I publish the alert
    Then the alert is stored
    And no routing rules are evaluated for it
