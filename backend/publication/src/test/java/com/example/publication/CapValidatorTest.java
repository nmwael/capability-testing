package com.example.publication;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link CapValidator}.
 *
 * These are deliberately plain JUnit: CapValidator is a pure function of its XML
 * string, so it needs no Quarkus runtime. That also lets PIT replay the suite
 * against mutated copies of the class, which the @QuarkusTest integration tests
 * cannot do - their asserted behaviour lives behind a classloader the mutation
 * engine cannot instrument.
 *
 * Each scenario names the mutant it is meant to kill, because "the test passes"
 * and "the mutation is provably gone" are different claims.
 */
class CapValidatorTest {

    private static final String NS = "urn:oasis:names:tc:emergency:cap:1.2";

    private final CapValidator validator = new CapValidator();

    /** A complete, valid CAP 1.2 alert. Every closed vocabulary below picks its
     *  first accepted value; callers override one part at a time. */
    private static String validAlert() {
        return "<alert xmlns=\"" + NS + "\">"
            + "<identifier>ALERT-001</identifier>"
            + "<sender>warning@example.org</sender>"
            + "<sent>2026-10-13T09:00:00+00:00</sent>"
            + "<status>Actual</status>"
            + "<msgType>Alert</msgType>"
            + "<scope>Public</scope>"
            + "<info>"
            + "<event>Tornado Warning</event>"
            + "<urgency>Immediate</urgency>"
            + "<severity>Extreme</severity>"
            + "<certainty>Observed</certainty>"
            + "</info>"
            + "</alert>";
    }

    /** The alert with its single info block replaced. */
    private static String withInfo(String info) {
        return "<alert xmlns=\"" + NS + "\">"
            + "<identifier>ALERT-001</identifier>"
            + "<sender>warning@example.org</sender>"
            + "<sent>2026-10-13T09:00:00+00:00</sent>"
            + "<status>Actual</status>"
            + "<msgType>Alert</msgType>"
            + "<scope>Public</scope>"
            + info
            + "</alert>";
    }

    private static boolean hasProblem(List<CapValidator.Problem> problems, String element) {
        return problems.stream().anyMatch(p -> p.element().equals(element));
    }

    private static String messageFor(List<CapValidator.Problem> problems, String element) {
        return problems.stream()
            .filter(p -> p.element().equals(element))
            .map(CapValidator.Problem::message)
            .findFirst()
            .orElse("<no problem recorded for " + element + ">");
    }

    @Nested
    @DisplayName("a valid document")
    class ValidDocument {

        /** Kills the negated conditionals on every isValid* check, and the
         *  setNamespaceAware removal after which the root can no longer be found. */
        @Test
        void reportsNoProblemsForACompleteAlert() {
            List<CapValidator.Problem> problems = validator.validate(validAlert());
            assertTrue(problems.isEmpty(), "expected no problems, got " + problems);
        }

        /** Kills the "return problems" (non-empty) mutants: the guard must hand
         *  back the same empty list instance it built, never a populated one. */
        @Test
        void blankInputIsSkippedWithoutInventingProblems() {
            assertTrue(validator.validate("").isEmpty());
            assertTrue(validator.validate("   \n\t ").isEmpty());
        }

        /** Kills the `xml == null` conditional by entering the guard rather than
         *  dereferencing null and failing through to the catch block. */
        @Test
        void nullInputIsSkippedRatherThanCrashed() {
            assertNotNull(validator.validate(null));
            assertTrue(validator.validate(null).isEmpty());
        }
    }

    @Nested
    @DisplayName("the root element")
    class Root {

        /** Kills the negated `rootElements.getLength() == 0` conditional. */
        @Test
        void aRootThatIsNotAlertIsReported() {
            List<CapValidator.Problem> problems = validator.validate("<other xmlns=\"" + NS + "\"/>");
            assertTrue(hasProblem(problems, "root"), "errors: " + problems);
            assertEquals("Missing or invalid root alert element", messageFor(problems, "root"));
        }

        /** Kills the catch-block removal and the parse-error problem record. */
        @Test
        void malformedXmlIsReportedAsAParseErrorNotAnException() {
            List<CapValidator.Problem> problems = validator.validate("<alert xmlns=\"" + NS + "\"><identifier>");
            assertTrue(hasProblem(problems, "root"), "errors: " + problems);
            assertTrue(messageFor(problems, "root").startsWith("XML parsing error:"),
                "unexpected message: " + messageFor(problems, "root"));
        }
    }

    @Nested
    @DisplayName("required root elements")
    class RequiredElements {

        @Test
        void aMissingIdentifierIsReported() {
            List<CapValidator.Problem> problems = validator.validate(
                withInfo("").replace("<identifier>ALERT-001</identifier>", ""));
            assertTrue(hasProblem(problems, "identifier"), "errors: " + problems);
            assertEquals("Required identifier element is missing", messageFor(problems, "identifier"));
        }

        /** Kills the negated `identifierValue.isEmpty()` conditional: an empty
         *  element must still be an error. */
        @Test
        void anEmptyIdentifierIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<identifier>ALERT-001</identifier>", "<identifier>   </identifier>"));
            assertTrue(hasProblem(problems, "identifier"), "errors: " + problems);
            assertEquals("Identifier element must not be empty", messageFor(problems, "identifier"));
        }

        /** Kills the negated `senderElements.getLength() == 0` conditional, and
         *  proves an identifier-only problem does not mask a sender one. */
        @Test
        void aMissingSenderIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<sender>warning@example.org</sender>", "<bogus>warning@example.org</bogus>"));
            assertTrue(hasProblem(problems, "sender"), "errors: " + problems);
            assertEquals("Required sender element is missing", messageFor(problems, "sender"));
        }

        /** Kills the negated `senderValue.isEmpty()` conditional. */
        @Test
        void anEmptySenderIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<sender>warning@example.org</sender>", "<sender></sender>"));
            assertTrue(hasProblem(problems, "sender"), "errors: " + problems);
            assertEquals("Sender element must not be empty", messageFor(problems, "sender"));
        }

        /** Kills the negated `sentElements.getLength() == 0` conditional. */
        @Test
        void aMissingSentIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<sent>2026-10-13T09:00:00+00:00</sent>", "<symmetric-key>2026-10-13T09:00:00+00:00</symmetric-key>"));
            assertTrue(hasProblem(problems, "sent"), "errors: " + problems);
            assertEquals("Required sent element is missing", messageFor(problems, "sent"));
        }

        /** Kills the negated `sentValue.isEmpty()` conditional. */
        @Test
        void anEmptySentIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<sent>2026-10-13T09:00:00+00:00</sent>", "<sent> </sent>"));
            assertTrue(hasProblem(problems, "sent"), "errors: " + problems);
            assertEquals("Sent element must not be empty", messageFor(problems, "sent"));
        }

        /** Kills every mutant that drops an accumulated problem: three missing
         *  required elements must yield three records, not the first one. */
        @Test
        void everyMissingRequiredElementIsReportedSeparately() {
            List<CapValidator.Problem> problems = validator.validate("<alert xmlns=\"" + NS + "\"/>");
            assertTrue(hasProblem(problems, "identifier"), "errors: " + problems);
            assertTrue(hasProblem(problems, "sender"), "errors: " + problems);
            assertTrue(hasProblem(problems, "sent"), "errors: " + problems);
            assertEquals(3, problems.size(), "errors: " + problems);
        }
    }

    @Nested
    @DisplayName("closed vocabularies")
    class ClosedVocabularies {

        @Test
        void everyAcceptedStatusIsAccepted() {
            for (String value : new String[]{"Actual", "Exercise", "System", "Test", "Draft"}) {
                List<CapValidator.Problem> problems = validator.validate(validAlert()
                    .replace("<status>Actual</status>", "<status>" + value + "</status>"));
                assertFalse(hasProblem(problems, "status"), value + " was rejected: " + problems);
            }
        }

        /** Kills the negated `isValidStatus` check: one wrong value must surface,
         *  and the reported message must name it. */
        @Test
        void anUnacceptedStatusIsReportedWithItsValue() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<status>Actual</status>", "<status>AlmostActual</status>"));
            assertTrue(hasProblem(problems, "status"), "errors: " + problems);
            assertEquals("Invalid status value: AlmostActual", messageFor(problems, "status"));
        }

        @Test
        void everyAcceptedMsgTypeIsAccepted() {
            for (String value : new String[]{"Alert", "Update", "Cancel", "Ack", "Error"}) {
                List<CapValidator.Problem> problems = validator.validate(withInfo("")
                    .replace("<msgType>Alert</msgType>", "<msgType>" + value + "</msgType>")
                    + "<references>ALERT-000</references></alert>");
                assertFalse(hasProblem(problems, "msgType"), value + " was rejected: " + problems);
            }
        }

        /** Kills the negated `isValidMsgType` check. */
        @Test
        void anUnacceptedMsgTypeIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<msgType>Alert</msgType>", "<msgType>Alarm</msgType>"));
            assertTrue(hasProblem(problems, "msgType"), "errors: " + problems);
            assertEquals("Invalid msgType value: Alarm", messageFor(problems, "msgType"));
        }

        @Test
        void everyAcceptedScopeIsAccepted() {
            for (String value : new String[]{"Public", "Restricted", "Private"}) {
                List<CapValidator.Problem> problems = validator.validate(validAlert()
                    .replace("<scope>Public</scope>", "<scope>" + value + "</scope>"));
                assertFalse(hasProblem(problems, "scope"), value + " was rejected: " + problems);
            }
        }

        /** Kills the negated `isValidScope` check. */
        @Test
        void anUnacceptedScopeIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<scope>Public</scope>", "<scope>Worldwide</scope>"));
            assertTrue(hasProblem(problems, "scope"), "errors: " + problems);
            assertEquals("Invalid scope value: Worldwide", messageFor(problems, "scope"));
        }

        @Test
        void everyAcceptedUrgencyIsAccepted() {
            for (String value : new String[]{"Immediate", "Expected", "Future", "Past", "Unknown"}) {
                List<CapValidator.Problem> problems = validator.validate(validAlert()
                    .replace("<urgency>Immediate</urgency>", "<urgency>" + value + "</urgency>"));
                assertFalse(hasProblem(problems, "urgency"), value + " was rejected: " + problems);
            }
        }

        /** Kills the negated `isValidUrgency` check. */
        @Test
        void anUnacceptedUrgencyIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<urgency>Immediate</urgency>", "<urgency>Soon</urgency>"));
            assertTrue(hasProblem(problems, "urgency"), "errors: " + problems);
            assertEquals("Invalid urgency value: Soon", messageFor(problems, "urgency"));
        }

        @Test
        void everyAcceptedSeverityIsAccepted() {
            for (String value : new String[]{"Extreme", "Severe", "Moderate", "Minor", "Unknown"}) {
                List<CapValidator.Problem> problems = validator.validate(validAlert()
                    .replace("<severity>Extreme</severity>", "<severity>" + value + "</severity>"));
                assertFalse(hasProblem(problems, "severity"), value + " was rejected: " + problems);
            }
        }

        /** Kills the negated `isValidSeverity` check. */
        @Test
        void anUnacceptedSeverityIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<severity>Extreme</severity>", "<severity>Mild</severity>"));
            assertTrue(hasProblem(problems, "severity"), "errors: " + problems);
            assertEquals("Invalid severity value: Mild", messageFor(problems, "severity"));
        }

        @Test
        void everyAcceptedCertaintyIsAccepted() {
            for (String value : new String[]{"Observed", "Likely", "Possible", "Unlikely", "Unknown"}) {
                List<CapValidator.Problem> problems = validator.validate(validAlert()
                    .replace("<certainty>Observed</certainty>", "<certainty>" + value + "</certainty>"));
                assertFalse(hasProblem(problems, "certainty"), value + " was rejected: " + problems);
            }
        }

        /** Kills the negated `isValidCertainty` check. */
        @Test
        void anUnacceptedCertaintyIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<certainty>Observed</certainty>", "<certainty>Guessed</certainty>"));
            assertTrue(hasProblem(problems, "certainty"), "errors: " + problems);
            assertEquals("Invalid certainty value: Guessed", messageFor(problems, "certainty"));
        }

        /** The vocabularies are closed, so a value that matches none of them must
         *  be rejected in every element it can appear in - one test per check
         *  kills that check's negated conditional, this one proves none of them
         *  accepts a value belonging to a different vocabulary. */
        @Test
        void anElementNeverAcceptsAnotherVocabularysValue() {
            assertTrue(hasProblem(validator.validate(validAlert()
                .replace("<status>Actual</status>", "<status>Public</status>")), "status"));
            assertTrue(hasProblem(validator.validate(validAlert()
                .replace("<scope>Public</scope>", "<scope>Actual</scope>")), "scope"));
            assertTrue(hasProblem(validator.validate(validAlert()
                .replace("<urgency>Immediate</urgency>", "<urgency>Extreme</urgency>")), "urgency"));
            assertTrue(hasProblem(validator.validate(validAlert()
                .replace("<severity>Extreme</severity>", "<severity>Immediate</severity>")), "severity"));
            assertTrue(hasProblem(validator.validate(validAlert()
                .replace("<certainty>Observed</certainty>", "<certainty>Severe</certainty>")), "certainty"));
        }
    }

    @Nested
    @DisplayName("the info block")
    class InfoBlock {

        /** Kills the negated `infoElements.getLength() > 0` conditional: a
         *  document with no info block must not be forced through the child
         *  validation, and must not itself be an error. */
        @Test
        void aDocumentWithNoInfoBlockIsStillValid() {
            List<CapValidator.Problem> problems = validator.validate(withInfo(""));
            assertTrue(problems.isEmpty(), "errors: " + problems);
        }

        /** Kills the negated `eventValue.isEmpty()` conditional. */
        @Test
        void anEmptyEventIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<event>Tornado Warning</event>", "<event>  </event>"));
            assertTrue(hasProblem(problems, "event"), "errors: " + problems);
            assertEquals("Event element must not be empty", messageFor(problems, "event"));
        }

        /** Kills the negated `child.getNodeType() != Node.ELEMENT_NODE`
         *  conditional: the check exists so whitespace between elements is
         *  skipped, and with the condition inverted every real element is
         *  skipped too, so this would report nothing. */
        @Test
        void whitespaceBetweenInfoChildrenDoesNotMatter() {
            List<CapValidator.Problem> problems = validator.validate(
                withInfo("<info>\n  <event>Tornado</event>\n  <severity>Bogus</severity>\n</info>"));
            assertTrue(hasProblem(problems, "severity"), "errors: " + problems);
        }

        /** Kills the loop bound mutants: the first child must be examined as well
         *  as the last, so several children with exactly one bad value report it. */
        @Test
        void everyInfoChildIsExaminedNotJustOne() {
            List<CapValidator.Problem> problems = validator.validate(
                withInfo("<info><event>E</event><urgency>Bogus</urgency><severity>Bogus</severity></info>"));
            assertTrue(hasProblem(problems, "urgency"), "errors: " + problems);
            assertTrue(hasProblem(problems, "severity"), "errors: " + problems);
        }

        /** Kills the empty-list return mutants of validate: an unparseable info
         *  child still has to reach the problem list rather than being dropped. */
        @Test
        void problemsFromTheInfoBlockAreReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<urgency>Immediate</urgency>", "<urgency>Now</urgency>"));
            assertEquals(1, problems.size(), "errors: " + problems);
            assertEquals("Invalid urgency value: Now", messageFor(problems, "urgency"));
        }
    }

    @Nested
    @DisplayName("references on Cancel and Update")
    class References {

        /** Kills the negated `"Cancel".equals(msgTypeValue)` conditional. */
        @Test
        void aCancelWithoutReferencesIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<msgType>Alert</msgType>", "<msgType>Cancel</msgType>"));
            assertTrue(hasProblem(problems, "references"), "errors: " + problems);
            assertEquals("Required references element is missing for Cancel msgType", messageFor(problems, "references"));
        }

        /** Kills the negated `"Update".equals(msgTypeValue)` conditional, and
         *  shows the message names the msgType rather than hardcoding it. */
        @Test
        void anUpdateWithoutReferencesIsReported() {
            List<CapValidator.Problem> problems = validator.validate(validAlert()
                .replace("<msgType>Alert</msgType>", "<msgType>Update</msgType>"));
            assertTrue(hasProblem(problems, "references"), "errors: " + problems);
            assertEquals("Required references element is missing for Update msgType", messageFor(problems, "references"));
        }

        /** Kills the negated conditional on the `||`: an Alert (neither Cancel
         *  nor Update) must not demand references. */
        @Test
        void anAlertDoesNotRequireReferences() {
            assertFalse(hasProblem(validator.validate(validAlert()), "references"));
        }

        /** Kills the negated `referencesElements.getLength() == 0` conditional -
         *  the element is present here, so the missing-reference problem must go away. */
        @Test
        void aCancelWithReferencesSatisfiesTheRequirement() {
            List<CapValidator.Problem> problems = validator.validate(
                validAlert().replace("<msgType>Alert</msgType>", "<msgType>Cancel</msgType>")
                    .replace("<info>", "<references>ALERT-001</references><info>"));
            assertFalse(hasProblem(problems, "references"), "errors: " + problems);
        }

        /** Kills the negated `referencesValue.isEmpty()` conditional. */
        @Test
        void emptyReferencesAreReportedForACancel() {
            List<CapValidator.Problem> problems = validator.validate(
                validAlert().replace("<msgType>Alert</msgType>", "<msgType>Cancel</msgType>")
                    .replace("<info>", "<references>   </references><info>"));
            assertTrue(hasProblem(problems, "references"), "errors: " + problems);
            assertEquals("References element must not be empty", messageFor(problems, "references"));
        }
    }
}
