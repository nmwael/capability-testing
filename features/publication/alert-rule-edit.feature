# Capability: alert.rule-edit. The backend half: the publication module accepts the rule
# graph JSON the designer posts, replaces the stored graph with it, and hands the same
# JSON shape back. The designer half lives in features/frontend/alert-rule-edit.feature.
#
# Compiling a graph to Drools and rejecting malformed graphs (orphans, duplicate ids,
# cycles) belong to alert.rule-design; this capability owns only the JSON exchange and
# the replace-on-repost semantics an edit needs.

@cap:alert.rule-edit
@backend
@todo
Feature: Exchange a routing rule graph as JSON
  As the publication module
  I want to accept and return a routing graph as JSON
  So that the designer can change routing without a redeploy

  Scenario: A posted graph is accepted and stored under its name
    Given the rule design endpoint is running
    When I post the JSON graph "tornado-routing"
    Then the request is accepted
    And the graph is stored under the name "tornado-routing"

  Scenario: A stored graph comes back in the same JSON shape
    Given the JSON graph "tornado-routing" has been stored
    When I fetch the graph "tornado-routing"
    Then the response is JSON with a "name", a list of "nodes" and a list of "edges"
    And it holds the nodes that were posted

  Scenario: A second post replaces the stored graph
    Given the JSON graph "tornado-routing" has been stored with the condition "severe"
    When I post "tornado-routing" again with the condition "severe" removed
    Then fetching "tornado-routing" returns the graph without the condition "severe"

  Scenario: An edit for a graph that was never stored is refused
    Given the rule design endpoint holds no graph "ghost"
    When I post an edit for the graph "ghost" that is not a create
    Then the request is rejected with 404

  Scenario: Malformed JSON is rejected with the reason
    Given the rule design endpoint is running
    When I post a body that is not a rule graph
    Then the request is rejected with 400
    And the response names the problem
