@cap:invoice.recalculate-penalty
Feature: Recalculate penalty
  As a billing operator
  I want to recalculate late payment penalty
  So that invoices reflect correct amount

  Scenario: Apply penalty to closed invoice
    Given an invoice with id "inv-123" is closed
    When I recalculate penalty for "inv-123"
    Then the penalty amount is updated
