# Capability: alert.flow. The backend half: for one published alert, report which channels
# it reached and which it skipped, and which rule chose each reached channel. The canvas
# (features/frontend/alert-flow.feature) is the only reader of this.
#
# Deciding what a severity, urgency and certainty fan out to belongs to alert.route. This
# capability only reports the outcome for an alert that has already been published, so the
# two can be read independently: routing can change without this contract moving.

@cap:alert.flow
@backend
@todo
Feature: Serve an alert's distribution
  As a warning officer
  I want the channels one alert reached and those it skipped
  So that the canvas can show who was warned

  Scenario: The distribution names every channel and whether it was reached
    Given alert "ALERT-001" has been published
    When I read the distribution of "ALERT-001"
    Then the response lists the channels the alerting module can fire
    And the channel "sirens" is reported as reached
    And the channel "social" is reported as skipped

  Scenario: A reached channel names the rule that chose it
    Given alert "ALERT-001" has been published
    And its routing reached the channel "sirens" through the rule "severe"
    When I read the distribution of "ALERT-001"
    Then the entry for "sirens" names the rule "severe"

  Scenario: The distribution carries the alert's danger level
    Given alert "ALERT-001" has been published with severity "Extreme" and urgency "Immediate"
    When I read the distribution of "ALERT-001"
    Then the response reports severity "Extreme" and urgency "Immediate"

  Scenario: The distribution is JSON the canvas can read
    Given alert "ALERT-001" has been published
    When I read the distribution of "ALERT-001"
    Then the response is JSON
    And it names the alert's identifier and its list of channels

  Scenario: An alert that was never published has no distribution
    Given no alert "ALERT-404" has been published
    When I read the distribution of "ALERT-404"
    Then the response is 404

  Scenario: Reading a distribution fires nothing
    Given alert "ALERT-001" has been published
    When I read the distribution of "ALERT-001" twice
    Then both responses report the same channels
    And no further channel is fired by reading it
