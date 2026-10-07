package com.example.billing;

import java.util.HashMap;
import java.util.Map;

import jakarta.enterprise.context.ApplicationScoped;

import org.junit.jupiter.api.Assertions;

import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * Step definitions for billing/recalculate-penalty.feature
 * (capability invoice.recalculate-penalty).
 *
 * The modulith ships no main sources yet, so this holds a tiny in-memory model:
 * enough to express the capability contract (penalty can only be recalculated on
 * a closed invoice) without inventing business rules the product does not have.
 */
@ApplicationScoped
public class PenaltySteps {

    record Invoice(String id, boolean closed, boolean penaltyUpdated) {
    }

    private final Map<String, Invoice> invoices = new HashMap<>();
    private String lastRecalculated;

    @Before
    public void startFromACleanSlate() {
        invoices.clear();
        lastRecalculated = null;
    }

    @Given("an invoice with id {string} is closed")
    public void anInvoiceIsClosed(String id) {
        invoices.put(id, new Invoice(id, true, false));
    }

    @When("I recalculate penalty for {string}")
    public void iRecalculatePenalty(String id) {
        Invoice invoice = invoices.get(id);
        Assertions.assertNotNull(invoice, "invoice " + id + " must exist before recalculation");
        Assertions.assertTrue(invoice.closed(), "only a closed invoice can have its penalty recalculated");
        invoices.put(id, new Invoice(id, true, true));
        lastRecalculated = id;
    }

    @Then("the penalty amount is updated")
    public void thePenaltyAmountIsUpdated() {
        Assertions.assertNotNull(lastRecalculated, "no penalty was recalculated");
        Invoice invoice = invoices.get(lastRecalculated);
        Assertions.assertNotNull(invoice, "invoice " + lastRecalculated + " must still exist");
        Assertions.assertTrue(invoice.penaltyUpdated(),
                "penalty of invoice " + lastRecalculated + " must be marked updated");
    }
}
