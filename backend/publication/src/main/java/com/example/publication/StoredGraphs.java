package com.example.publication;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.ws.rs.core.Response;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A stored routing graph, keyed by name.
 */
@ApplicationScoped
public class StoredGraphs {

    private final Map<String, RuleGraph> graphs = new ConcurrentHashMap<>();

    public RuleGraph get(String name) {
        return graphs.get(name);
    }

    public void put(String name, RuleGraph graph) {
        graphs.put(name, graph);
    }

    public boolean containsKey(String name) {
        return graphs.containsKey(name);
    }
}
