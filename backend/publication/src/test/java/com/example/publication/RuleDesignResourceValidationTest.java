package com.example.publication;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for the validation and compilation half of {@link RuleDesignResource}.
 *
 * The resource needs an injected rules producer to activate a ruleset, so the
 * whole endpoint can only be driven from a Quarkus test. These four methods are
 * pure functions of the drawn graph and need no container, which makes them the
 * part PIT can prove assertions exist for. They are reached by reflection rather
 * than by widening the production API for the tests.
 */
class RuleDesignResourceValidationTest {

    private static Object invoke(String name, Object... args) {
        try {
            Class<?>[] types = new Class<?>[args.length];
            for (int i = 0; i < args.length; i++) {
                types[i] = args[i] instanceof java.util.List ? List.class
                    : args[i] instanceof Map ? Map.class
                    : args[i] instanceof Set ? Set.class
                    : args[i].getClass();
            }
            java.lang.reflect.Method m = RuleDesignResource.class.getDeclaredMethod(name, types);
            m.setAccessible(true);
            return m.invoke(new RuleDesignResource(), args);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> validate(RuleGraph graph) {
        return (List<String>) invoke("validate", graph);
    }

    private static boolean hasCycle(List<RuleGraph.Node> nodes, Map<String, List<String>> adj) {
        return (Boolean) invoke("hasCycle", nodes, adj);
    }

    @SuppressWarnings("unchecked")
    private static String compileToDrl(RuleGraph graph) {
        return (String) invoke("compileToDrl", graph);
    }

    private static RuleGraph.Node condition(String id, String field, String value) {
        return new RuleGraph.Node(id, "condition", field, value, null);
    }

    private static RuleGraph.Node action(String id, String channel) {
        return new RuleGraph.Node(id, "action", null, null, channel);
    }

    private static RuleGraph graph(String name, List<RuleGraph.Node> nodes, List<RuleGraph.Edge> edges) {
        return new RuleGraph(name, nodes, edges);
    }

    // --- validate -----------------------------------------------------------

    /** Kills the EmptyObjectReturnVals and loop-guard mutants on validate: a
     *  well-formed graph produces no errors. */
    @Test
    @DisplayName("a well-formed graph validates clean")
    void wellFormedGraphValidatesClean() {
        List<String> errors = validate(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), action("a1", "sirens")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertTrue(errors.isEmpty(), "errors: " + errors);
    }

    /** Kills the negated `ids.add(...)` conditional and the boundary mutant: a
     *  repeated id is reported once per extra copy, not once per pair. */
    @Test
    @DisplayName("a duplicate node id is reported once per extra copy")
    void duplicateIdIsReportedOnce() {
        List<String> errors = validate(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), condition("c1", "urgency", "Immediate"),
            action("a1", "sirens")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertEquals(List.of("duplicate node id: c1"), errors);
    }

    /** Kills the negated `"action".equals(kind) && !hasIncoming.contains(id)`
     *  conditional: an action with no incoming edge is an orphan, which is what
     *  disables Generate Rules in the designer. */
    @Test
    @DisplayName("an action node with no incoming edge is an orphan")
    void orphanActionIsReported() {
        List<String> errors = validate(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), action("a1", "sirens"), action("a2", "sirens")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertTrue(errors.contains("orphan action node: a2"), "errors: " + errors);
        assertFalse(errors.contains("orphan action node: a1"), "errors: " + errors);
    }

    /** A condition node with no incoming edge is not an orphan - conditions are
     *  graph roots - which kills the mutant that drops the kind check. */
    @Test
    @DisplayName("a condition node needs no incoming edge")
    void conditionNeedsNoIncomingEdge() {
        List<String> errors = validate(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), action("a1", "sirens")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertTrue(errors.isEmpty(), "errors: " + errors);
    }

    // --- hasCycle -----------------------------------------------------------

    /** Kills the BooleanTrueReturnVals and loop-guard mutants on hasCycle. */
    @Test
    @DisplayName("an acyclic graph has no cycle")
    void acyclicGraphHasNoCycle() {
        Map<String, List<String>> adj = Map.of("c1", List.of("a1", "a2"), "a1", List.of("a2"));
        assertFalse(hasCycle(List.of(condition("c1", "severity", "Extreme"), action("a1", "s"), action("a2", "t")), adj));
    }

    /** Kills the negated `recStack.contains(v)` conditional - the direct loop. */
    @Test
    @DisplayName("a node that points at itself is a cycle")
    void selfLoopIsACycle() {
        Map<String, List<String>> adj = new HashMap<>();
        adj.put("c1", new ArrayList<>(List.of("c1")));
        assertTrue(hasCycle(List.of(condition("c1", "severity", "Extreme")), adj));
    }

    /** Kills the negated `visited.contains(v)` conditional: a node reached twice
     *  by two different paths is not a cycle, and the memo stops the second walk. */
    @Test
    @DisplayName("a diamond is acyclic even though one node is reached twice")
    void diamondIsAcyclic() {
        Map<String, List<String>> adj = new HashMap<>();
        adj.put("c1", new ArrayList<>(List.of("c2", "c3")));
        adj.put("c2", new ArrayList<>(List.of("a1")));
        adj.put("c3", new ArrayList<>(List.of("a1")));
        List<RuleGraph.Node> nodes = List.of(
            condition("c1", "severity", "Extreme"), condition("c2", "urgency", "Immediate"), condition("c3", "certainty", "Observed"),
            action("a1", "sirens"));
        assertFalse(hasCycle(nodes, adj));
    }

    /** Kills the recStack.remove mutant and the DFS's depth handling: a longer
     *  loop, found through a node that is also part of a valid path. */
    @Test
    @DisplayName("a cycle through several nodes is found")
    void longerCycleIsFound() {
        Map<String, List<String>> adj = new HashMap<>();
        adj.put("c1", new ArrayList<>(List.of("c2")));
        adj.put("c2", new ArrayList<>(List.of("a1")));
        adj.put("a1", new ArrayList<>(List.of("c1")));
        List<RuleGraph.Node> nodes = List.of(
            condition("c1", "severity", "Extreme"), condition("c2", "urgency", "Immediate"), action("a1", "sirens"));
        assertTrue(hasCycle(nodes, adj));
    }

    /** Kills the `nodes` loop-guard mutant: a cycle reachable only from a later
     *  node in the list is still found, because the walk starts from every node. */
    @Test
    @DisplayName("a cycle is found regardless of which node is listed first")
    void cycleIsFoundFromAnyEntryNode() {
        Map<String, List<String>> adj = new HashMap<>();
        adj.put("a1", new ArrayList<>(List.of("c1")));
        adj.put("c1", new ArrayList<>(List.of("a1")));
        List<RuleGraph.Node> nodes = List.of(action("a1", "sirens"), condition("c1", "severity", "Extreme"));
        assertTrue(hasCycle(nodes, adj));
    }

    // --- compileToDrl -------------------------------------------------------

    /** Kills the EmptyObjectReturnVals and string-append mutants on compileToDrl:
     *  the emitted ruleset carries the package and the four imports the rules
     *  reference. */
    @Test
    @DisplayName("the compiled ruleset declares its package and imports")
    void compiledRulesetDeclaresPackageAndImports() {
        String drl = compileToDrl(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), action("a1", "sirens")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertNotNull(drl);
        assertTrue(drl.startsWith("package com.example.alerting.rules\n\n"), drl);
        assertTrue(drl.contains("import com.example.alerting.CapAlertFact"), drl);
        assertTrue(drl.contains("import com.example.alerting.ChannelFact"), drl);
        assertTrue(drl.contains("import com.example.alerting.Dispatch"), drl);
        assertTrue(drl.contains("import com.example.alerting.RoutingDecision"), drl);
    }

    /** One rule per edge, with the condition's field and value and the action's
     *  channel - kills the negated "condition".equals(kind) and
     *  "action".equals(kind) conditionals and the getOrDefault fallbacks. */
    @Test
    @DisplayName("each edge becomes a rule naming its condition and channel")
    void eachEdgeBecomesARule() {
        String drl = compileToDrl(graph("tornado", List.of(
            condition("c1", "urgency", "Immediate"), action("a1", "broadcast")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertTrue(drl.contains("rule \"tornado-0\""), drl);
        assertTrue(drl.contains("urgency == \"Immediate\""), drl);
        assertTrue(drl.contains("label == \"broadcast\""), drl);
        assertTrue(drl.contains("$decision.add(new Dispatch($channel,"), drl);
        assertTrue(drl.endsWith("end\n\n"), drl);
    }

    /** Characterisation of a real latent bug, not a claim that this is right.
     *
     * compileToDrl seeds its lookup maps with put(id, value), so a node whose
     * attribute is null stores the KEY with a null VALUE. getOrDefault only falls
     * back when the key is absent, so it returns null and StringBuilder renders
     * it as the text "null". The result is the DRL below, where the guard never
     * matches a real alert and the channel it looks up does not exist either:
     *
     *   $alert : CapAlertFact( status != "Test", null == "null" )
     *   $channel : ChannelFact( label == "null", ... )
     *
     * The fallbacks ("severity"/"Extreme" and the node's own id) are dead for
     * exactly the case they were written for. Fixing it means skipping null
     * entries when seeding the maps. This test fails the moment that is done, so
     * it must then be replaced with the fallback assertions. */
    @Test
    @DisplayName("a null attribute renders as the text \"null\" rather than the documented fallback")
    void nullAttributeRendersAsTheTextNull() {
        String drl = compileToDrl(graph("tornado", List.of(
            condition("c1", null, null), action("a1", null)),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertTrue(drl.contains("null == \"null\""), drl);
        assertTrue(drl.contains("label == \"null\""), drl);
        assertFalse(drl.contains("severity == \"Extreme\""), drl);
    }

    /** The pair of the test above: the field fallback DOES apply when the
     *  condition node is absent from the map entirely, while the channel fallback
     *  still does not for a node that exists with a null channel. Together the
     *  two tests pin the exact shape of the defect - the fallback is keyed on
     *  key presence, not on whether the value is usable. */
    @Test
    @DisplayName("field fallback applies for an absent condition, channel fallback does not for a null one")
    void fallbacksApplyPerMapNotPerValue() {
        String drl = compileToDrl(graph("tornado", List.of(action("a1", null)),
            List.of(new RuleGraph.Edge("c-missing", "a1"))));
        assertTrue(drl.contains("severity == \"Extreme\""), drl);
        assertFalse(drl.contains("label == \"a1\""), drl);
        assertTrue(drl.contains("label == \"null\""), drl);
    }

    /** Characterisation of a quirk worth pinning rather than preserving silently:
     *  the "then" clause re-uses ruleIndex after it was already incremented, so
     *  the dispatch's rule name is the index of the NEXT rule, not its own. */
    @Test
    @DisplayName("the dispatch rule name is the next index, not its own")
    void dispatchRuleNameIsTheNextIndex() {
        String drl = compileToDrl(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), action("a1", "sirens")),
            List.of(new RuleGraph.Edge("c1", "a1"))));
        assertTrue(drl.contains("rule \"tornado-0\""), drl);
        assertTrue(drl.contains("new Dispatch($channel, \"tornado-1\", true)"), drl);
    }

    /** The index runs across conditions rather than resetting, so a second
     *  condition's first rule is numbered after the first condition's. */
    @Test
    @DisplayName("the rule index does not reset between conditions")
    void ruleIndexDoesNotReset() {
        String drl = compileToDrl(graph("tornado", List.of(
            condition("c1", "severity", "Extreme"), condition("c2", "urgency", "Immediate"),
            action("a1", "sirens"), action("a2", "broadcast")),
            List.of(new RuleGraph.Edge("c1", "a1"), new RuleGraph.Edge("c2", "a2"))));
        assertTrue(drl.contains("rule \"tornado-0\""), drl);
        assertTrue(drl.contains("rule \"tornado-1\""), drl);
        assertEquals(2, count(drl, "\nthen"), "one then-clause per edge");
    }

    private static int count(String haystack, String needle) {
        int n = 0, i = 0;
        while ((i = haystack.indexOf(needle, i)) != -1) { n++; i += needle.length(); }
        return n;
    }
}
