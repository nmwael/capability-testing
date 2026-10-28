package com.example.alerting;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * Unit tests for {@link CapAlertFact} and its severity ranking.
 *
 * The Drools rules compare a channel's floor against an alert's severity through
 * {@link CapAlertFact#rankOf}, so a wrong rank silently mis-routes every alert
 * in a Django-Drools deployment. PIT cannot reach this code: the only tests
 * that exercise it start a Quarkus container, and a mutated class inside that
 * container is invisible to the coverage recorder, so every mutant reported
 * NO_COVERAGE. These tests run without Quarkus, which lets PIT kill them.
 */
class CapAlertFactTest {

    private static CapAlertFact alert(String severity) {
        return new CapAlertFact("ALERT-001", severity, "Immediate", "Observed", "north", "Actual");
    }

    /** Kills every PrimitiveReturnsMutator on rankOf's switch: each branch returns
     *  a distinct number, so only the correct one satisfies all five rows. */
    @Test
    @DisplayName("ranks every CAP severity on its own rung")
    void ranksEverySeverity() {
        assertEquals(5, CapAlertFact.rankOf("Extreme"));
        assertEquals(4, CapAlertFact.rankOf("Severe"));
        assertEquals(3, CapAlertFact.rankOf("Moderate"));
        assertEquals(2, CapAlertFact.rankOf("Minor"));
    }

    /** Kills the default branch: an unlisted or absent severity falls to the
     *  lowest rung, which is what keeps an unknown value from outranking a real
     *  one. */
    @Test
    @DisplayName("an unknown severity ranks below every listed one")
    void unknownSeverityRanksLowest() {
        assertEquals(1, CapAlertFact.rankOf("Unknown"));
        assertEquals(1, CapAlertFact.rankOf("nonsense"));
        assertEquals(1, CapAlertFact.rankOf(""));
    }

    /** Kills the negated `severity == null` conditional: a null severity must not
     *  throw, and must rank as the lowest rather than being treated as Extreme. */
    @Test
    @DisplayName("a null severity ranks lowest instead of throwing")
    void nullSeverityRanksLowest() {
        assertEquals(1, CapAlertFact.rankOf(null));
    }

    /** The switch upper-cases, so casing must not change the rank. Drools passes
     *  the value verbatim from the CAP document. */
    @Test
    @DisplayName("ranking is case-insensitive")
    void rankingIsCaseInsensitive() {
        assertEquals(5, CapAlertFact.rankOf("EXTREME"));
        assertEquals(5, CapAlertFact.rankOf("extreme"));
        assertEquals(3, CapAlertFact.rankOf("MoDeRaTe"));
    }

    /** Kills the boundary mutants: the rungs are ordered, so a channel at Extreme
     *  must be eligible for an Extreme alert and a channel at Minor for a Severe one. */
    @Test
    @DisplayName("the rungs are strictly ordered")
    void rungsAreOrdered() {
        assertEquals(5, CapAlertFact.rankOf("Extreme"));
        assertEquals(CapAlertFact.rankOf("Extreme") > CapAlertFact.rankOf("Severe"), true);
        assertEquals(CapAlertFact.rankOf("Severe") > CapAlertFact.rankOf("Moderate"), true);
        assertEquals(CapAlertFact.rankOf("Moderate") > CapAlertFact.rankOf("Minor"), true);
        assertEquals(CapAlertFact.rankOf("Minor") > CapAlertFact.rankOf("Unknown"), true);
    }

    /** The field accessors back every fact the DRL reads, so each is pinned. */
    @Test
    @DisplayName("carries every field the ruleset reads")
    void carriesEveryField() {
        CapAlertFact alert = alert("Extreme");
        assertEquals("ALERT-001", alert.getId());
        assertEquals("Extreme", alert.getSeverity());
        assertEquals("Immediate", alert.getUrgency());
        assertEquals("Observed", alert.getCertainty());
        assertEquals("north", alert.getAreaDesc());
        assertEquals("Actual", alert.getStatus());
    }
}
