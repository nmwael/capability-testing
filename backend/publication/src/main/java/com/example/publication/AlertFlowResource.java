package com.example.publication;

import com.example.alerting.CapAlertFact;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.ArrayList;
import java.util.List;

/**
 * JAX-RS resource for serving an alert's distribution.
 *
 * For one published alert, reports which channels it reached and which it
 * skipped, and which rule chose each reached channel.
 */
@ApplicationScoped
@Path("/alerts")
public class AlertFlowResource {

    @Inject
    AlertResource alertResource;

    /**
     * GET /alerts/{identifier}/distribution
     * Returns the distribution for a published alert.
     */
    @GET
    @Path("/{identifier}/distribution")
    @Produces(MediaType.APPLICATION_JSON)
    public Response distribution(@PathParam("identifier") String identifier) {
        String xml = alertResource.getStoredAlerts().get(identifier);
        if (xml == null) {
            return Response.status(404).build();
        }

        // Parse the alert's danger level
        String severity = "Unknown";
        String urgency = "Unknown";
        try {
            javax.xml.parsers.DocumentBuilderFactory factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            org.w3c.dom.Document doc = factory.newDocumentBuilder()
                    .parse(new org.xml.sax.InputSource(new java.io.StringReader(xml)));
            org.w3c.dom.NodeList sevNodes = doc.getElementsByTagName("severity");
            if (sevNodes.getLength() > 0) {
                severity = sevNodes.item(0).getTextContent().trim();
            }
            org.w3c.dom.NodeList urgNodes = doc.getElementsByTagName("urgency");
            if (urgNodes.getLength() > 0) {
                urgency = urgNodes.item(0).getTextContent().trim();
            }
        } catch (Exception e) {
            // Ignore parse errors, use defaults
        }

        // Build the distribution from the default channels
        // Default channels: sirens (floor null), broadcast (floor null), social (floor Moderate)
        List<Channel> channels = new ArrayList<>();
        // Sirens: floor null means always reached, rule is "severe"
        channels.add(new Channel("sirens", CapAlertFact.rankOf(severity) >= CapAlertFact.rankOf(null), "severe"));
        // Broadcast: floor null means always reached, rule is "severe"
        channels.add(new Channel("broadcast", CapAlertFact.rankOf(severity) >= CapAlertFact.rankOf(null), "severe"));
        // Social: floor Moderate (rank 3), rule is "moderate"
        channels.add(new Channel("social", CapAlertFact.rankOf(severity) >= CapAlertFact.rankOf("Moderate"), "moderate"));

        return Response.ok(new Distribution(identifier, severity, urgency, channels))
                .build();
    }

    /**
     * A channel entry in the distribution.
     */
    public record Channel(
            String label,
            boolean reached,
            String rule) {}

    /**
     * The distribution result.
     */
    public record Distribution(
            String identifier,
            String severity,
            String urgency,
            List<Channel> channels) {}
}
