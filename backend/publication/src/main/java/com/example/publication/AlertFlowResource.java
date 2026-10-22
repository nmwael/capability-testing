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

        // Parse the alert's danger level from XML header elements
        String severity = "Unknown";
        String urgency = "Unknown";
        String certainty = "Unknown";
        try {
            // Extract severity from <severity value="..."/> (attribute)
            int sevStart = xml.indexOf("<severity value=");
            if (sevStart != -1) {
                int sevEnd = xml.indexOf("\"/>", sevStart);
                if (sevEnd != -1) {
                    severity = xml.substring(sevStart + 17, sevEnd).trim();
                }
            }
            
            // Extract urgency from <urgency value="..."/> (attribute)
            int urgStart = xml.indexOf("<urgency value=");
            if (urgStart != -1) {
                int urgEnd = xml.indexOf("\"/>", urgStart);
                if (urgEnd != -1) {
                    urgency = xml.substring(urgStart + 16, urgEnd).trim();
                }
            }
            
            // Extract certainty from <certainty value="..."/> (attribute)
            int certStart = xml.indexOf("<certainty value=");
            if (certStart != -1) {
                int certEnd = xml.indexOf("\"/>", certStart);
                if (certEnd != -1) {
                    certainty = xml.substring(certStart + 19, certEnd).trim();
                }
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

        return Response.ok(new Distribution(identifier, severity, urgency, certainty, channels))
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
            String certainty,
            List<Channel> channels) {}
}
