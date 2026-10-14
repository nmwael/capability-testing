package com.example.publication;

import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import io.cucumber.java.en.Then;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Assertions;
import java.util.*;

/**
 * Glue code for alert-publish.feature scenarios.
 */
public class AlertPublishSteps {

    @Inject
    AlertResource resource;

    @Inject
    CapValidator validator;

    @io.cucumber.java.Before
    public void obtainBeans() {
        if (resource == null) {
            resource = jakarta.enterprise.inject.spi.CDI.current().select(AlertResource.class).get();
        }
        if (validator == null) {
            validator = jakarta.enterprise.inject.spi.CDI.current().select(CapValidator.class).get();
        }
    }

    String lastXml;
    String identifier = "ALERT-001";
    Response lastResponse;
    AlertResource.PublishResult lastResult;

    String senderValue = "warning@example.org";
    String sentValue = "2026-10-13T09:00:00+00:00";
    String statusValue = "Actual";
    String msgTypeValue = "Alert";
    String scopeValue = "Public";

    String eventValue = "Tornado Warning";
    String urgencyValue = "Immediate";
    String severityValue = "Extreme";
    String certaintyValue = "Observed";
    String referencesValue = null;

    /**
     * Build a valid CAP v1.2 alert XML with the given parameters.
     */
    private String buildXml() {
        String status = (statusValue == null) ? "Actual" : statusValue;
        String msgType = (msgTypeValue == null) ? "Alert" : msgTypeValue;
        String scope = (scopeValue == null) ? "Public" : scopeValue;

        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\">\n");
        sb.append("  <identifier>").append(identifier).append("</identifier>\n");
        sb.append("  <sender>").append(senderValue).append("</sender>\n");
        sb.append("  <sent>").append(sentValue).append("</sent>\n");
        sb.append("  <status>").append(status).append("</status>\n");
        sb.append("  <msgType>").append(msgType).append("</msgType>\n");
        sb.append("  <scope>").append(scope).append("</scope>\n");

        if (eventValue != null || urgencyValue != null || severityValue != null || certaintyValue != null) {
            sb.append("  <info>\n");
            if (eventValue != null) {
                sb.append("    <event>").append(eventValue).append("</event>\n");
            }
            if (urgencyValue != null) {
                sb.append("    <urgency>").append(urgencyValue).append("</urgency>\n");
            }
            if (severityValue != null) {
                sb.append("    <severity>").append(severityValue).append("</severity>\n");
            }
            if (certaintyValue != null) {
                sb.append("    <certainty>").append(certaintyValue).append("</certainty>\n");
            }
            sb.append("  </info>\n");
        }

        if (referencesValue != null) {
            sb.append("  <references>").append(referencesValue).append("</references>\n");
        }

        sb.append("</alert>");
        return sb.toString();
    }

    @Given("^an alert with identifier \"(.*)\" sender \"(.*)\" sent \"(.*)\"$")
    public void alertWithIdentifier(String identifier, String sender, String sentTime) {
        this.identifier = identifier;
        this.senderValue = sender;
        this.sentValue = sentTime;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @Given("^an alert with status \"(.*)\"$")
    public void alertWithStatus(String status) {
        this.statusValue = status;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @Given("^an alert with msgType \"(.*)\" and no references element$")
    public void alertWithMsgTypeNoReferences(String msgType) {
        this.msgTypeValue = msgType;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @Given("^an alert with msgType \"(.*)\" and references \"(.*)\"$")
    public void alertWithMsgTypeAndReferences(String msgType, String references) {
        this.msgTypeValue = msgType;
        this.referencesValue = references;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @Given("^an info block with urgency \"(.*)\"$")
    public void infoBlockWithUrgency(String urgency) {
        this.urgencyValue = urgency;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @When("^the alert \"(.*)\" has been published$")
    public void alertPublished(String identifier) {
        this.identifier = identifier;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @When("^the alert is of status \"(.*)\" msgType \"(.*)\" and scope \"(.*)\"$")
    public void alertOfStatusMsgTypeAndScope(String status, String msgType, String scope) {
        this.statusValue = status;
        this.msgTypeValue = msgType;
        this.scopeValue = scope;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @When("^it carries one info block with event \"(.*)\" urgency \"(.*)\" severity \"(.*)\" certainty \"(.*)\"$")
    public void carriesInfoBlock(String event, String urgency, String severity, String certainty) {
        this.eventValue = event;
        this.urgencyValue = urgency;
        this.severityValue = severity;
        this.certaintyValue = certainty;
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @When("^I publish the alert$")
    public void publishAlert() {
        lastXml = buildXml();
        lastResponse = resource.publish(lastXml);
        lastResult = (AlertResource.PublishResult) lastResponse.getEntity();
    }

    @When("^I read it back$")
    public void readAlert() {
        lastResponse = resource.read(identifier);
    }

    @Then("^the alert is accepted$")
    public void alertIsAccepted() {
        Assertions.assertEquals(201, lastResponse.getStatus(), "expected accepted");
        Assertions.assertTrue(lastResult.accepted(), "expected accepted");
        Assertions.assertTrue(lastResult.stored(), "expected stored");
        Assertions.assertFalse(lastResult.routed(), "expected not routed");
    }

    @Then("^the alert is rejected$")
    public void alertIsRejected() {
        Assertions.assertEquals(400, lastResponse.getStatus(), "expected rejected");
        Assertions.assertFalse(lastResult.accepted(), "expected not accepted");
    }

    @Then("^the published message validates against the CAP 1\\.2 schema$")
    public void publishedMessageValidatesSchema() {
        Assertions.assertTrue(validator.validate(lastXml).isEmpty(), "problems=" + validator.validate(lastXml));
    }

    @Then("^the failure names the invalid element \"(.*)\"$")
    public void failureNamesInvalidElement(String element) {
        Assertions.assertTrue(lastResult.problems().stream().anyMatch(p -> p.element().equals(element)), "expected element " + element + " in " + lastResult.problems());
    }

    @Then("^the failure names the missing element \"(.*)\"$")
    public void failureNamesMissingElement(String element) {
        Assertions.assertTrue(lastResult.problems().stream().anyMatch(p -> p.element().equals(element)), "expected element " + element + " in " + lastResult.problems());
    }

    @Then("^the alert is stored$")
    public void alertIsStored() {
        Assertions.assertEquals(201, lastResponse.getStatus(), "expected 201");
        Assertions.assertTrue(lastResult.stored(), "expected stored");
    }

    @Then("^no routing rules are evaluated for it$")
    public void noRoutingRulesEvaluated() {
        Assertions.assertFalse(lastResult.routed(), "expected not routed");
    }

    @Then("^every element the schema declares is present with the same value$")
    public void allElementsPresent() {
        Assertions.assertEquals(200, lastResponse.getStatus(), "expected 200");
        Assertions.assertEquals(lastXml, lastResponse.getEntity());
    }

}
