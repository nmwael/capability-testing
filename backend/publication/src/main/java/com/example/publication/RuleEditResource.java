package com.example.publication;

import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.PUT;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

/**
 * JAX-RS resource for exchanging a routing rule graph as JSON.
 *
 * The publication module accepts the rule graph JSON the designer posts,
 * replaces the stored graph with it, and hands the same JSON shape back.
 */
@ApplicationScoped
@Path("/rules")
public class RuleEditResource {

    @Inject
    StoredGraphs storedGraphs;

    /**
     * POST /rules/{name}
     * Accept or replace a stored graph.
     */
    @POST
    @Path("/{name}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response save(@PathParam("name") String name, RuleGraph graph) {
        if (graph == null || graph.name() == null || graph.name().isBlank()) {
            return Response.status(400)
                    .entity("{\"error\":\"graph name is required\"}")
                    .build();
        }

        boolean isCreate = !storedGraphs.containsKey(name);

        // Validate the graph shape
        if (graph.nodes() == null || graph.edges() == null) {
            return Response.status(400)
                    .entity("{\"error\":\"graph must have nodes and edges\"}")
                    .build();
        }

        storedGraphs.put(name, graph);
        return Response.ok(graph).build();
    }

    /**
     * GET /rules/{name}
     * Fetch a stored graph.
     */
    @GET
    @Path("/{name}")
    @Produces(MediaType.APPLICATION_JSON)
    public Response get(@PathParam("name") String name) {
        RuleGraph graph = storedGraphs.get(name);
        if (graph == null) {
            return Response.status(404).build();
        }
        return Response.ok(graph).build();
    }

    /**
     * PUT /rules/{name}
     * Replace an existing stored graph; a graph that was never stored cannot be edited.
     */
    @PUT
    @Path("/{name}")
    @Consumes(MediaType.APPLICATION_JSON)
    @Produces(MediaType.APPLICATION_JSON)
    public Response edit(@PathParam("name") String name, RuleGraph graph) {
        if (!storedGraphs.containsKey(name)) {
            return Response.status(404)
                    .entity("{\"error\":\"graph not found: " + name + "\"}")
                    .build();
        }
        return save(name, graph);
    }
}
