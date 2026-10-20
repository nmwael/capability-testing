package com.example.publication;

import com.example.alerting.AlertRoutingRulesProducer;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;

import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * JAX-RS resource for routing rule design.
 *
 * Accepts a drawn rule graph as JSON, validates it (no orphan actions, no
 * duplicate ids, no cycles), compiles it to a Drools ruleset, and activates
 * it.
 */
@ApplicationScoped
@Path("/rules")
public class RuleDesignResource {

    @Inject
    AlertRoutingRulesProducer rulesProducer;

    @Inject
    StoredGraphs storedGraphs;

    /**
     * POST /rules
     * Accept a rule graph, validate it, compile to Drools, activate.
     */
    @POST
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response save(RuleGraph graph) {
        if (graph == null || graph.name() == null || graph.name().isBlank()) {
            return Response.status(400)
                    .entity(new SaveResult(0, List.of("name is required")))
                    .build();
        }

        List<String> errors = validate(graph);
        if (!errors.isEmpty()) {
            return Response.status(400)
                    .entity(new SaveResult(0, errors))
                    .build();
        }

        String drl = compileToDrl(graph);
        try {
            rulesProducer.activate(drl);
        } catch (Exception e) {
            return Response.status(500)
                    .entity(new SaveResult(0, List.of("compile failed: " + e.getMessage())))
                    .build();
        }

        storedGraphs.put(graph.name(), graph);

        long ruleCount = graph.edges().size();
        return Response.ok(new SaveResult(ruleCount, List.of()))
                .build();
    }


    private List<String> validate(RuleGraph graph) {
        List<String> errors = new ArrayList<>();

        // Check for duplicate ids
        Set<String> ids = new HashSet<>();
        for (RuleGraph.Node node : graph.nodes()) {
            if (!ids.add(node.id())) {
                errors.add("duplicate node id: " + node.id());
            }
        }

        // Check for orphan actions (action nodes with no incoming edge)
        Set<String> hasIncoming = new HashSet<>();
        for (RuleGraph.Edge edge : graph.edges()) {
            hasIncoming.add(edge.to());
        }
        for (RuleGraph.Node node : graph.nodes()) {
            if ("action".equals(node.kind()) && !hasIncoming.contains(node.id())) {
                errors.add("orphan action node: " + node.id());
            }
        }

        // Check for cycles using DFS
        Map<String, List<String>> adj = new HashMap<>();
        for (RuleGraph.Edge edge : graph.edges()) {
            adj.computeIfAbsent(edge.from(), k -> new ArrayList<>()).add(edge.to());
        }
        if (hasCycle(graph.nodes(), adj)) {
            errors.add("cycle detected");
        }

        return errors;
    }

    private boolean hasCycle(List<RuleGraph.Node> nodes, Map<String, List<String>> adj) {
        Set<String> visited = new HashSet<>();
        Set<String> recStack = new HashSet<>();

        for (RuleGraph.Node node : nodes) {
            if (hasCycleUtil(node.id(), adj, visited, recStack)) {
                return true;
            }
        }
        return false;
    }

    private boolean hasCycleUtil(String v, Map<String, List<String>> adj,
                                  Set<String> visited, Set<String> recStack) {
        if (recStack.contains(v)) return true;
        if (visited.contains(v)) return false;

        visited.add(v);
        recStack.add(v);

        for (String neighbor : adj.getOrDefault(v, List.of())) {
            if (hasCycleUtil(neighbor, adj, visited, recStack)) {
                return true;
            }
        }

        recStack.remove(v);
        return false;
    }

    private String compileToDrl(RuleGraph graph) {
        StringBuilder sb = new StringBuilder();
        sb.append("package com.example.alerting.rules\n\n");
        sb.append("import com.example.alerting.CapAlertFact\n");
        sb.append("import com.example.alerting.ChannelFact\n");
        sb.append("import com.example.alerting.Dispatch\n");
        sb.append("import com.example.alerting.RoutingDecision\n\n");

        // Group edges by condition node
        Map<String, List<String>> conditionToActions = new HashMap<>();
        Map<String, String> conditionField = new HashMap<>();
        Map<String, String> conditionValue = new HashMap<>();
        Map<String, String> actionChannel = new HashMap<>();

        for (RuleGraph.Node node : graph.nodes()) {
            if ("condition".equals(node.kind())) {
                conditionField.put(node.id(), node.field());
                conditionValue.put(node.id(), node.value());
            } else if ("action".equals(node.kind())) {
                actionChannel.put(node.id(), node.channel());
            }
        }

        for (RuleGraph.Edge edge : graph.edges()) {
            conditionToActions.computeIfAbsent(edge.from(), k -> new ArrayList<>()).add(edge.to());
        }

        int ruleIndex = 0;
        for (Map.Entry<String, List<String>> entry : conditionToActions.entrySet()) {
            String conditionId = entry.getKey();
            String field = conditionField.getOrDefault(conditionId, "severity");
            String value = conditionValue.getOrDefault(conditionId, "Extreme");

            for (String actionId : entry.getValue()) {
                String channel = actionChannel.getOrDefault(actionId, actionId);
                sb.append("rule \"").append(graph.name()).append("-").append(ruleIndex++).append("\"\n");
                sb.append("when\n");
                sb.append("    $alert : CapAlertFact( status != \"Test\", ").append(field).append(" == \"").append(value).append("\" )\n");
                sb.append("    $decision : RoutingDecision()\n");
                sb.append("    $channel : ChannelFact( label == \"").append(channel).append("\", eligibleFor($alert) )\n");
                sb.append("then\n");
                sb.append("    $decision.add(new Dispatch($channel, \"").append(graph.name()).append("-").append(ruleIndex).append("\", true));\n");
                sb.append("end\n\n");
            }
        }

        return sb.toString();
    }

    /**
     * Result record for save operations.
     */
    public record SaveResult(
            long ruleCount,
            List<String> problems) {}
}
