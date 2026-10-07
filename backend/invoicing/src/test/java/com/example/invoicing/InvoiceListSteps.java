package com.example.invoicing;

import java.util.ArrayList;
import java.util.List;

import jakarta.enterprise.context.ApplicationScoped;

import org.junit.jupiter.api.Assertions;

import io.cucumber.java.Before;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.Then;
import io.cucumber.java.en.When;

/**
 * Step definitions for invoicing/invoice-list.feature (capability invoice.list).
 *
 * The modulith ships no main sources yet, so this holds a tiny in-memory model:
 * enough to express the capability contract (page/size windowing over the full
 * result set) without inventing business rules the product does not have.
 */
@ApplicationScoped
public class InvoiceListSteps {

    private final List<String> invoices = new ArrayList<>();
    private List<String> received;

    @Before
    public void startFromACleanSlate() {
        invoices.clear();
        received = null;
    }

    @Given("there are {int} invoices")
    public void thereAreInvoices(int count) {
        invoices.clear();
        for (int i = 1; i <= count; i++) {
            invoices.add("inv-" + i);
        }
    }

    @When("I request page {int} with size {int}")
    public void iRequestPageWithSize(int page, int size) {
        Assertions.assertTrue(page >= 1, "pages are 1-based");
        int from = Math.min((page - 1) * size, invoices.size());
        int to = Math.min(from + size, invoices.size());
        received = new ArrayList<>(invoices.subList(from, to));
    }

    @Then("I receive {int} invoices")
    public void iReceiveInvoices(int expected) {
        Assertions.assertNotNull(received, "no page was requested");
        Assertions.assertEquals(expected, received.size(),
                "page must be windowed to the requested size");
    }
}
