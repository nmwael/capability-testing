package com.example.publication;

import java.util.List;

/**
 * A routing rule graph as drawn in the designer and posted as JSON.
 *
 * The wire format: a name, a list of nodes and a list of edges. A condition
 * node has kind "condition", a CAP field and a value; an action node has
 * kind "action" and a channel. An edge has from/to ids.
 */
public record RuleGraph(
        String name,
        List<Node> nodes,
        List<Edge> edges) {

    public record Node(
            String id,
            String kind,
            String field,
            String value,
            String channel) {}

    public record Edge(
            String from,
            String to) {}
}
