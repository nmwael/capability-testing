package com.example.publication;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

/**
 * Unit tests for {@link AlertResource#extractIdentifier}.
 *
 * The resource is a JAX-RS endpoint whose publish/read methods need an injected
 * store, so only parseable documents can be exercised from a Quarkus test.
 * extractIdentifier is a pure function of its XML string and needs no container,
 * which is what lets PIT kill its mutants.
 */
class AlertResourceExtractIdentifierTest {

    private static String extractIdentifier(String xml) {
        try {
            Method m = AlertResource.class.getDeclaredMethod("extractIdentifier", String.class);
            m.setAccessible(true);
            return (String) m.invoke(new AlertResource(), xml);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /** Kills the negated `identifiers.getLength() > 0` conditional and the
     *  EmptyObjectReturnVals mutant on the fallback: a qualified identifier is
     *  found through the CAP namespace. */
    @Test
    @DisplayName("a namespaced identifier is read through the CAP namespace")
    void namespacedIdentifierIsFound() {
        assertEquals("ALERT-001",
            extractIdentifier("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\">"
                + "<identifier>ALERT-001</identifier></alert>"));
    }

    /** Kills the unqualified fallback conditional: without a namespace the local
     *  name lookup still finds it. */
    @Test
    @DisplayName("an unqualified identifier is read through the local name")
    void unqualifiedIdentifierIsFound() {
        assertEquals("ALERT-002",
            extractIdentifier("<alert><identifier>ALERT-002</identifier></alert>"));
    }

    /** Kills the null-return path: nothing to find means null, not an exception. */
    @Test
    @DisplayName("a document with no identifier returns null")
    void missingIdentifierReturnsNull() {
        assertNull(extractIdentifier("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\"/>"));
        assertNull(extractIdentifier("<nothing/>"));
    }

    /** Kills the try/catch path: malformed XML returns null instead of throwing. */
    @Test
    @DisplayName("malformed XML returns null")
    void malformedXmlReturnsNull() {
        assertNull(extractIdentifier("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\"><identifier>"));
        assertNull(extractIdentifier(null));
    }

    /** Kills the `.trim()` conditional: whitespace around the identifier is
     *  dropped, which matters when the downstream comparison is exact. */
    @Test
    @DisplayName("identifier whitespace is trimmed")
    void identifierIsTrimmed() {
        assertEquals("ALERT-003",
            extractIdentifier("<alert xmlns=\"urn:oasis:names:tc:emergency:cap:1.2\">"
                + "<identifier>  ALERT-003  </identifier></alert>"));
    }
}
