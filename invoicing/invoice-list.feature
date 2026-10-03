Feature: List invoices
  @cap:invoice.list
  As a customer
  I want to list invoices with filtering
  So that I can find my documents

  Scenario: List invoices with pagination
    Given there are 25 invoices
    When I request page 1 with size 10
    Then I receive 10 invoices
