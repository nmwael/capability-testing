# Owner: the frontend runner (`npm run test:unit` — vitest + @testing-library/react
# over @xyflow/react). Not wired into `mvn test`.
#
# Capability: alert.cap-fields. The designer must offer every CAP v1.2 attribute the
# schema declares, each with the type and valid values it carries, so a warning
# officer can branch on any field the spec allows and never sees an invented value.
#
# The field list is the vendored OASIS schema's, not a hand-written one: the backing
# model is `backend/common/src/main/resources/cap-v1.2.xsd`, so "the schema's
# enumeration" below means one specific artefact. Every scenario is `@todo` because
# nothing implements the catalogue yet.

@cap:alert.cap-fields
@frontend
Feature: CAP field catalogue
  As a warning officer
  I want the designer to list every CAP v1.2 attribute with what it accepts
  So that I can route on any field the spec allows without inventing values

  @todo
  Scenario: The catalogue lists every attribute the schema declares
    Given the CAP schema is the vendored cap-v1.2.xsd
    When I open the field catalogue
    Then it lists every attribute the schema declares
    And each entry names the CAP element it comes from

  @todo
  Scenario: A closed-vocabulary field offers exactly the schema's enumeration
    Given the field catalogue is open
    When I inspect the severity field
    Then the values offered are Extreme, Severe, Moderate, Minor and Unknown
    And no value outside the schema's enumeration is offered

  @todo
  Scenario: Every field carries the type it is declared with
    Given the field catalogue is open
    When I inspect the sent field
    Then it is shown as a date and time
    And it is not offered free-form numeric input

  @todo
  Scenario: A field with no closed vocabulary is offered as free text
    Given the field catalogue is open
    When I inspect the headline field
    Then it is shown as free text

  @todo
  Scenario: The catalogue cannot drift from the schema
    Given the vendored CAP schema cap-v1.2.xsd
    When the catalogue is derived from that schema
    Then every closed vocabulary matches the schema's enumeration
    And an attribute removed from the schema is reported as missing
