package com.example.alerting;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.kie.api.runtime.KieSession;

import java.util.ArrayList;
import java.util.List;

/**
 * JAX-RS resource for CAP alert routing.
 *
 * Receives a CAP alert as XML, feeds it through the active Drools ruleset,
 * and returns the resulting distribution (channels reached, whether it was
 * a broadcast, and which rules fired).
 */
@ApplicationScoped
@Path("/route")
public class AlertRouteResource {

    private static final String CAP_NAMESPACE = "urn:oasis:names:tc:emergency:cap:1.2";

    @Inject
    AlertRoutingRulesProducer rulesProducer;

    private List<ChannelFact> areaChannels = List.of();

    /**
     * Configures area-scoped channels for alert routing.
     *
     * @param channels the area-scoped ChannelFact objects
     */
    @Produces("area-channels")
    public void setAreaChannels(List<ChannelFact> channels) {
        this.areaChannels = channels;
    }

    /**
     * POST /route
     * Accepts a CAP alert XML document, runs it through the active ruleset,
     * and returns the routing decision as JSON.
     */
    @POST
    @Produces(MediaType.APPLICATION_JSON)
    public Response route(String xml) {
        CapAlertFact alert = parseAlert(xml);
        if (alert == null) {
            return Response.status(400)
                    .entity(new RouteResult(List.of(), false, List.of(), "Missing identifier"))
                    .build();
        }

        List<ChannelFact> channels = defaultChannels(alert.getAreaDesc());
        RoutingDecision decision = new RoutingDecision();

        KieSession session = rulesProducer.container().newKieSession();
        try {
            session.insert(alert);
            for (ChannelFact ch : channels) {
                session.insert(ch);
            }
            session.insert(decision);
            session.fireAllRules();
        } finally {
            session.dispose();
        }

        List<String> reached = new ArrayList<>();
        for (Dispatch d : decision.getDispatches()) {
            reached.add(d.getChannel().getLabel());
        }

        return Response.ok(new RouteResult(reached, decision.broadcast(), decision.firedRules(), null))
                .build();
    }

    private CapAlertFact parseAlert(String xml) {
        if (xml == null || xml.trim().isEmpty()) {
            return null;
        }
        try {
            javax.xml.parsers.DocumentBuilderFactory factory = javax.xml.parsers.DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            org.w3c.dom.Document doc = factory.newDocumentBuilder()
                    .parse(new org.xml.sax.InputSource(new java.io.StringReader(xml)));

            org.w3c.dom.NodeList ids = doc.getElementsByTagNameNS(CAP_NAMESPACE, "identifier");
            if (ids.getLength() == 0) {
                ids = doc.getElementsByTagName("identifier");
            }
            String id = ids.getLength() > 0 ? ids.item(0).getTextContent().trim() : "";
            if (id.isEmpty()) {
                return null;
            }

            String severity = textOf(doc, "severity", "Unknown");
            String urgency = textOf(doc, "urgency", "Unknown");
            String certainty = textOf(doc, "certainty", "Unknown");
            String area = textOf(doc, "areaDesc", "");
            String status = textOf(doc, "status", "Actual");

            return new CapAlertFact(id, severity, urgency, certainty, area, status);
        } catch (Exception e) {
            return null;
        }
    }

    private String textOf(org.w3c.dom.Document doc, String tag, String fallback) {
        org.w3c.dom.NodeList nodes = doc.getElementsByTagName(tag);
        if (nodes.getLength() == 0) {
            nodes = doc.getElementsByTagNameNS(CAP_NAMESPACE, tag);
        }
        return nodes.getLength() > 0 ? nodes.item(0).getTextContent().trim() : fallback;
    }

    private List<ChannelFact> defaultChannels(String area) {
        List<ChannelFact> channels = new ArrayList<>();
        channels.add(new ChannelFact("sirens", "sirens", null, null, false));
        channels.add(new ChannelFact("broadcast", "broadcast", null, null, false));
        channels.add(new ChannelFact("social", "social", null, "Moderate", false));
        channels.add(new ChannelFact("test-channel", "test-channel", null, null, true));
        
        // Add area-scoped channels if configured
        if (!areaChannels.isEmpty()) {
            channels.addAll(areaChannels);
        }
        
        return channels;
    }

    /**
     * Result record for route operations.
     */
    public record RouteResult(
            List<String> channels,
            boolean broadcast,
            List<String> firedRules,
            String error) {}
}
