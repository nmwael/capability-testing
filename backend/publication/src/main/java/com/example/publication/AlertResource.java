package com.example.publication;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import jakarta.annotation.PostConstruct;

/**
 * JAX-RS resource for CAP alert publishing and retrieval.
 */
@ApplicationScoped
@Path("/alerts")
public class AlertResource {

    private final Map<String, String> storedAlerts = new ConcurrentHashMap<>();

    @Inject
    CapValidator validator;

    /**
     * POST /alerts
     * Publish a CAP alert via XML, returns JSON result.
     * Extracts identifier from <identifier> element and keys storage by it.
     */
    @POST
    @Consumes(MediaType.APPLICATION_XML)
    @Produces(MediaType.APPLICATION_JSON)
    public Response publish(String xml) {
        List<CapValidator.Problem> problems = validator.validate(xml);

        if (!problems.isEmpty()) {
            return Response.status(400)
                    .entity(new PublishResult(null, false, false, false, problems))
                    .build();
        }

        // Extract identifier from XML
        String identifier = extractIdentifier(xml);
        if (identifier == null || identifier.trim().isEmpty()) {
            return Response.status(400)
                    .entity(new PublishResult(null, false, false, false, 
                        List.of(new CapValidator.Problem("identifier", "Missing or empty identifier"))))
                    .build();
        }

        // Store the alert by identifier
        storedAlerts.put(identifier, xml);

        return Response.status(201)
                .entity(new PublishResult(identifier, true, true, false, problems))
                .build();
    }

    /**
     * GET /alerts/{identifier}
     * Retrieve a previously published alert by identifier.
     */
    @GET
    @Path("/{identifier}")
    @Produces(MediaType.APPLICATION_XML)
    public Response read(@PathParam("identifier") String identifier) {
        String stored = storedAlerts.get(identifier);
        if (stored == null) {
            return Response.status(404)
                    .build();
        }

        return Response.ok(stored)
                .build();
    }

    /**
     * Extracts the identifier from a CAP alert XML document.
     * Handles both namespace-qualified and unqualified element names.
     */
    private String extractIdentifier(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setNamespaceAware(true);
            DocumentBuilder builder = factory.newDocumentBuilder();
            Document doc = builder.parse(new InputSource(new java.io.StringReader(xml)));

            // Try qualified name first
            NodeList identifiers = doc.getElementsByTagNameNS(CapValidator.CAP_NAMESPACE, "identifier");
            if (identifiers.getLength() > 0) {
                return identifiers.item(0).getTextContent().trim();
            }
            
            // Try unqualified name
            NodeList unqualified = doc.getElementsByTagName("identifier");
            if (unqualified.getLength() > 0) {
                return unqualified.item(0).getTextContent().trim();
            }
        } catch (Exception e) {
            // Ignore parse errors, return null
        }
        return null;
    }

    /**
     * @PostConstruct: Pre-populate storedAlerts with demo CAP alert for ALERT-001.
     */
    @PostConstruct
    public void initDemoAlert() {
        String demoAlert = """
            <CAP version="1.2">
              <header>
                <identifier value="ALERT-001"/>
                <eventDescription value="Demonstration CAP Alert"/>
                <source value="Demo Source"/>
                <sender value="Demo Sender"/>
                <received>2026-10-21T12:00:00Z</received>
                <eventType value="Test"/>
                <severity value="Extreme"/>
                <urgency value="Immediate"/>
                <certainty value="High"/>
              </header>
              <instruction>
                <areaDesc value="Demonstration Area"/>
              </instruction>
            </CAP>
            """;
        storedAlerts.put("ALERT-001", demoAlert);
    }

    /**
     * Getter for stored alerts map (for testing).
     */
    public Map<String, String> getStoredAlerts() {
        return storedAlerts;
    }

    /**
     * Result record for publish operations.
     */
    public record PublishResult(
            String identifier,
            boolean accepted,
            boolean stored,
            boolean routed,
            List<CapValidator.Problem> problems) {}

}
