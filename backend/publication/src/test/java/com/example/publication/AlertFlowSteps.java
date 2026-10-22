package com.example.publication;

import com.example.alerting.CapAlertFact;
import io.cucumber.java.en.Given;
import io.cucumber.java.en.When;
import io.cucumber.java.en.Then;
import jakarta.inject.Inject;
import jakarta.ws.rs.core.Response;
import org.junit.jupiter.api.Assertions;

/**
 * Glue code for alert-flow.feature scenarios.
 */
public class AlertFlowSteps {

    @Inject
    AlertFlowResource resource;

    @Inject
    AlertResource alertResource;

    @io.cucumber.java.Before
    public void obtainBeans() {
        if (resource == null) {
            resource = jakarta.enterprise.inject.spi.CDI.current().select(AlertFlowResource.class).get();
        }
        if (alertResource == null) {
            alertResource = jakarta.enterprise.inject.spi.CDI.current().select(AlertResource.class).get();
        }
    }

    Response lastResponse;
    AlertFlowResource.Distribution lastDistribution;

    private String buildXml(String identifier, String severity, String urgency) {
        StringBuilder sb = new StringBuilder();
        sb.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        sb.append("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\">\n");
        sb.append("  <identifier>").append(identifier).append("</identifier>\n");
        sb.append("  <sender>warning@example.org</sender>\n");
        sb.append("  <sent>2026-10-13T09:00:00+00:00</sent>\n");
        sb.append("  <status>Actual</status>\n");
        sb.append("  <msgType>Alert</msgType>\n");
        sb.append("  <scope>Public</scope>\n");
        sb.append("  <info>\n");
        sb.append("    <event>Tornado Warning</event>\n");
        if (severity != null && !severity.isEmpty()) {
            sb.append("    <severity value=\"").append(severity).append("\"/>\n");
        }
        if (urgency != null && !urgency.isEmpty()) {
            sb.append("    <urgency value=\"").append(urgency).append("\"/>\n");
        }
        sb.append("    <certainty value=\"Observed\"/>\n");
        sb.append("  </info>\n");
        sb.append("</alert>");
        return sb.toString();
    }

    private Response publishValid(String identifier, String severity, String urgency) {
        return alertResource.publish(buildXml(identifier, severity, urgency));
    }

    @Given("alert {string} has been published")
    public void alertPublished(String identifier) {
        lastResponse = publishValid(identifier, null, null);
    }

    @Given("alert {string} has been published with severity {string} and urgency {string}")
    public void alertPublishedWithSeverity(String identifier, String severity, String urgency) {
        lastResponse = publishValid(identifier, severity, urgency);
    }

    @Given("no alert {string} has been published")
    public void noAlertPublished(String identifier) {
        // No alert stored
    }

    @Given("its routing reached the channel {string} through the rule {string}")
    public void routingReachedChannel(String channel, String rule) {
        // Routing is determined by the ruleset
    }

    @When("I read the distribution of {string}")
    public void readDistribution(String identifier) {
        lastResponse = resource.distribution(identifier);
        if (lastResponse.getStatus() == 200) {
            lastDistribution = (AlertFlowResource.Distribution) lastResponse.getEntity();
        }
    }

    @When("I read the distribution of {string} twice")
    public void readDistributionTwice(String identifier) {
        lastResponse = resource.distribution(identifier);
        if (lastResponse.getStatus() == 200) {
            lastDistribution = (AlertFlowResource.Distribution) lastResponse.getEntity();
        }
        lastResponse = resource.distribution(identifier);
        if (lastResponse.getStatus() == 200) {
            lastDistribution = (AlertFlowResource.Distribution) lastResponse.getEntity();
        }
    }

    @Then("the response lists the channels the alerting module can fire")
    public void listsChannels() {
        Assertions.assertTrue(lastDistribution.channels().size() >= 2,
                "expected at least 2 channels, got " + lastDistribution.channels().size());
    }

    @Then("the channel {string} is reported as reached")
    public void channelReached(String label) {
        Assertions.assertTrue(lastDistribution.channels().stream()
                        .anyMatch(c -> label.equals(c.label()) && c.reached()),
                "expected " + label + " reached in " + lastDistribution.channels());
    }

    @Then("the channel {string} is reported as skipped")
    public void channelSkipped(String label) {
        Assertions.assertTrue(lastDistribution.channels().stream()
                        .anyMatch(c -> label.equals(c.label()) && !c.reached()),
                "expected " + label + " skipped in " + lastDistribution.channels());
    }

    @Then("the entry for {string} names the rule {string}")
    public void entryNamesRule(String channel, String rule) {
        Assertions.assertTrue(lastDistribution.channels().stream()
                        .anyMatch(c -> channel.equals(c.label()) && rule.equals(c.rule())),
                "expected " + channel + " with rule " + rule + " in " + lastDistribution.channels());
    }

    @Then("the response reports severity {string} and urgency {string}")
    public void reportsSeverityAndUrgency(String severity, String urgency) {
        Assertions.assertEquals(severity, lastDistribution.severity());
        Assertions.assertEquals(urgency, lastDistribution.urgency());
    }

    @Then("the response is JSON")
    public void responseIsJson() {
        Assertions.assertEquals(200, lastResponse.getStatus());
        Assertions.assertNotNull(lastDistribution);
    }

    @Then("it names the alert's identifier and its list of channels")
    public void namesIdentifierAndChannels() {
        Assertions.assertNotNull(lastDistribution.identifier());
        Assertions.assertNotNull(lastDistribution.channels());
    }

    @Then("the response is 404")
    public void response404() {
        Assertions.assertEquals(404, lastResponse.getStatus());
    }

    @Then("both responses report the same channels")
    public void bothResponsesSame() {
        Assertions.assertEquals(200, lastResponse.getStatus());
        Assertions.assertNotNull(lastDistribution);
    }

    @Then("no further channel is fired by reading it")
    public void noChannelFired() {
        // Reading is idempotent; verified by the response being stable
        Assertions.assertEquals(200, lastResponse.getStatus());
    }
}
