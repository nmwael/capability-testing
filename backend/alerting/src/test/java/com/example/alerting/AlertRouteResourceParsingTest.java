package com.example.alerting;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for the parsing half of {@link AlertRouteResource}.
 *
 * The resource is a JAX-RS endpoint whose route() method needs an injected KieSession,
 * so it can only be driven from a Quarkus test. The three methods below are pure
 * functions of their inputs and need no container at all, which means they are the
 * part of this class a mutation run *can* prove assertions exist for - the rest of
 * its mutants report NO_COVERAGE purely because the container hides them.
 *
 * They are private, so they are reached by reflection rather than by widening the
 * production API for the sake of tests.
 */
class AlertRouteResourceParsingTest {

    private static final String NS = "urn:oasis:names:tc:emergency:cap:1.2";

    private static Object invoke(String name, Object instance, Object... args) {
        try {
            // Parameter types must match the DECLARED types, not the runtime
            // classes: textOf takes the org.w3c.dom.Document interface while the
            // parser hands back its own implementation class.
            Class<?>[] types = new Class<?>[args.length];
            for (int i = 0; i < args.length; i++) {
                Object arg = args[i];
                if (arg == null) types[i] = String.class;
                else if (arg instanceof org.w3c.dom.Document) types[i] = org.w3c.dom.Document.class;
                else types[i] = arg.getClass();
            }
            Method m = AlertRouteResource.class.getDeclaredMethod(name, types);
            m.setAccessible(true);
            return m.invoke(instance, args);
        } catch (InvocationTargetException e) {
            throw new RuntimeException(e.getTargetException());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private static CapAlertFact parseAlert(AlertRouteResource resource, String xml) {
        return (CapAlertFact) invoke("parseAlert", resource, xml);
    }

    private static String textOf(AlertRouteResource resource, org.w3c.dom.Document doc, String tag, String fallback) {
        return (String) invoke("textOf", resource, doc, tag, fallback);
    }

    @SuppressWarnings("unchecked")
    private static List<ChannelFact> defaultChannels(AlertRouteResource resource, String area) {
        return (List<ChannelFact>) invoke("defaultChannels", resource, area);
    }

    private static String capAlert(String identifier, String severity, String areaDesc, String status) {
        return "<alert xmlns=\"" + NS + "\">"
            + "<identifier>" + identifier + "</identifier>"
            + "<severity>" + severity + "</severity>"
            + "<urgency>Immediate</urgency>"
            + "<certainty>Observed</certainty>"
            + "<areaDesc>" + areaDesc + "</areaDesc>"
            + "<status>" + status + "</status>"
            + "</alert>";
    }

    @Test
    @DisplayName("parseAlert reads every field of a CAP document")
    void parseAlertReadsEveryField() {
        CapAlertFact alert = parseAlert(new AlertRouteResource(),
            capAlert("ALERT-001", "Extreme", "north", "Actual"));
        assertNotNull(alert);
        assertEquals("ALERT-001", alert.getId());
        assertEquals("Extreme", alert.getSeverity());
        assertEquals("Immediate", alert.getUrgency());
        assertEquals("Observed", alert.getCertainty());
        assertEquals("north", alert.getAreaDesc());
        assertEquals("Actual", alert.getStatus());
    }

    /** Kills the null-return mutant on parseAlert and the whole catch block: a
     *  malformed document is a parse failure, not an exception. */
    @Test
    @DisplayName("a malformed CAP document parses to null, not an exception")
    void malformedDocumentParsesToNull() {
        assertNull(parseAlert(new AlertRouteResource(), "<alert xmlns=\"" + NS + "\"><identifier>"));
        assertNull(parseAlert(new AlertRouteResource(), null));
        assertNull(parseAlert(new AlertRouteResource(), ""));
    }

    /** Kills the boundary mutants inside parseAlert's text calls: the fields are
     *  read in order, so a document missing one must still parse and default it. */
    @Test
    @DisplayName("a document with only an identifier still parses")
    void documentWithOnlyAnIdentifierParses() {
        CapAlertFact alert = parseAlert(new AlertRouteResource(),
            "<alert xmlns=\"" + NS + "\"><identifier>ALERT-002</identifier></alert>");
        assertNotNull(alert);
        assertEquals("ALERT-002", alert.getId());
        assertEquals("Unknown", alert.getSeverity());
        assertEquals("Unknown", alert.getCertainty());
        assertEquals("", alert.getAreaDesc());
        assertEquals("Actual", alert.getStatus());
    }

    /** Kills the negated conditional in textOf's namespace fallback and the
     *  EmptyObjectReturnVals mutant on it: an unqualified tag resolves locally,
     *  and a qualified one resolves through the CAP namespace. The namespace
     *  case needs a namespace-aware DOM, because getElementsByTagNameNS returns
     *  nothing when the parser never resolved the prefixes - the same reason
     *  parseAlert sets the flag on its own builder. */
    @Test
    @DisplayName("textOf finds unqualified and namespaced tags, and falls back when absent")
    void textOfFindsTagsAndFallsBack() throws Exception {
        AlertRouteResource resource = new AlertRouteResource();
        javax.xml.parsers.DocumentBuilder plain =
            javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder();

        org.w3c.dom.Document local = plain.parse(
            new org.xml.sax.InputSource(new java.io.StringReader(
                "<alert><severity>Extreme</severity></alert>")));
        assertEquals("Extreme", textOf(resource, local, "severity", "Unknown"));

        javax.xml.parsers.DocumentBuilderFactory nsFactory =
            javax.xml.parsers.DocumentBuilderFactory.newInstance();
        nsFactory.setNamespaceAware(true);
        org.w3c.dom.Document qualified = nsFactory.newDocumentBuilder().parse(
            new org.xml.sax.InputSource(new java.io.StringReader(
                "<a:alert xmlns:a=\"" + NS + "\"><a:severity>Severe</a:severity></a:alert>")));
        assertEquals("Severe", textOf(resource, qualified, "severity", "Unknown"));

        assertFalse(textOf(resource, local, "areaDesc", "none").isEmpty(), "absent tag must use the fallback, not return empty");
        assertEquals("none", textOf(resource, local, "areaDesc", "none"));
    }

    /** Kills the EmptyObjectReturnVals mutant on textOf's fallback branch: the
     *  fallback is returned only when no element matched, and it is returned whole. */
    @Test
    @DisplayName("an absent tag returns the fallback verbatim")
    void absentTagReturnsTheFallbackVerbatim() throws Exception {
        AlertRouteResource resource = new AlertRouteResource();
        javax.xml.parsers.DocumentBuilder builder =
            javax.xml.parsers.DocumentBuilderFactory.newInstance().newDocumentBuilder();
        org.w3c.dom.Document doc = builder.parse(
            new org.xml.sax.InputSource(new java.io.StringReader("<alert/>")));
        assertEquals("Unknown", textOf(resource, doc, "severity", "Unknown"));
        assertEquals("Actual", textOf(resource, doc, "status", "Actual"));
    }

    /** Kills the negated `areaChannels.isEmpty()` conditional and the boundary
     *  mutant: with no configured area channels the four built-in ones stand, and
     *  with one configured it is appended rather than replacing them. */
    @Test
    @DisplayName("defaultChannels is the built-in four, plus any configured area channels")
    void defaultChannelsPlusConfigured() {
        AlertRouteResource resource = new AlertRouteResource();
        List<ChannelFact> builtIn = defaultChannels(resource, "north");
        assertEquals(4, builtIn.size());
        assertEquals("sirens", builtIn.get(0).getId());
        assertEquals("broadcast", builtIn.get(1).getId());
        assertEquals("social", builtIn.get(2).getId());
        assertEquals("test-channel", builtIn.get(3).getId());

        ChannelFact extra = new ChannelFact("local", "Local", "north", "Extreme", false);
        resource.setAreaChannels(List.of(extra));
        List<ChannelFact> withArea = defaultChannels(resource, "north");
        assertEquals(5, withArea.size());
        assertEquals(extra, withArea.get(4));
    }

    /** The testOnly floor is what a CAP "Test" alert is restricted to, so the
     *  three factory defaults are each pinned rather than assumed. */
    @Test
    @DisplayName("the social channel is the only one with a severity floor")
    void socialChannelIsTheOnlyOneWithAFloor() {
        List<ChannelFact> channels = defaultChannels(new AlertRouteResource(), "north");
        assertNull(channels.get(0).getMinSeverity());
        assertNull(channels.get(1).getMinSeverity());
        assertEquals("Moderate", channels.get(2).getMinSeverity());
        assertTrue(channels.get(3).isTestOnly());
    }
}
