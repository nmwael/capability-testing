package com.example.alerting;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link ChannelFact}'s eligibility rule.
 *
 * This one method decides whether an alert reaches a channel, so every mutant
 * that flips it mis-routes a live alert. Like the other fact classes it is only
 * exercised today by tests that start a Quarkus container, which PIT cannot
 * instrument, so the mutants reported NO_COVERAGE.
 */
class ChannelFactTest {

    private static ChannelFact channel(String area, String minSeverity, boolean testOnly) {
        return new ChannelFact("sirens", "Sirens", area, minSeverity, testOnly);
    }

    private static CapAlertFact alert(String severity, String areaDesc) {
        return new CapAlertFact("ALERT-001", severity, "Immediate", "Observed", areaDesc, "Actual");
    }

    /** Kills the negated `alert == null` conditional: a null alert is not an
     *  error path, it is simply not eligible. */
    @Test
    @DisplayName("a null alert is never eligible")
    void nullAlertIsNeverEligible() {
        assertFalse(channel(null, null, false).eligibleFor(null));
    }

    /** Kills the negated `area != null && !area.equals(...)` conditional. A
     *  channel scoped to north cannot receive an alert scoped to south. */
    @Test
    @DisplayName("a scoped channel rejects an alert from another area")
    void scopedChannelRejectsOtherArea() {
        ChannelFact scoped = channel("north", "Extreme", false);
        assertFalse(scoped.eligibleFor(alert("Extreme", "south")));
        assertTrue(scoped.eligibleFor(alert("Extreme", "north")));
    }

    /** Kills the negated `area != null` half: a region-wide channel (null area)
     *  accepts every area, which is how broadcast channels are configured. */
    @Test
    @DisplayName("a region-wide channel accepts every area")
    void regionWideChannelAcceptsEveryArea() {
        ChannelFact regionWide = channel(null, null, false);
        assertTrue(regionWide.eligibleFor(alert("Extreme", "north")));
        assertTrue(regionWide.eligibleFor(alert("Extreme", "south")));
        assertTrue(regionWide.eligibleFor(alert("Extreme", null)));
    }

    /** Kills the negated `minSeverity == null` conditional, and the null argument
     *  to rankOf: a channel with no floor accepts anything, which is the
     *  configuration most channels use. */
    @Test
    @DisplayName("a channel with no severity floor accepts every severity")
    void noFloorAcceptsEverySeverity() {
        ChannelFact open = channel(null, null, false);
        assertTrue(open.eligibleFor(alert("Extreme", "north")));
        assertTrue(open.eligibleFor(alert("Unknown", "north")));
    }

    /** Kills the boundary mutation on `rankOf(min) <= rankOf(alert)`: the
     *  comparison is <=, not <, so an alert exactly at the floor is eligible. */
    @Test
    @DisplayName("an alert exactly at the channel's floor is eligible")
    void alertExactlyAtFloorIsEligible() {
        ChannelFact severeFloor = channel(null, "Severe", false);
        assertTrue(severeFloor.eligibleFor(alert("Severe", "north")));
        assertFalse(severeFloor.eligibleFor(alert("Minor", "north")));
        assertTrue(severeFloor.eligibleFor(alert("Extreme", "north")));
    }

    /** Pins the ordering across the whole scale, so a mutant that swaps the rank
     *  operands cannot survive by coincidence on one row. */
    @Test
    @DisplayName("a channel below the alert's severity is eligible across the whole scale")
    void floorComparisonAcrossTheScale() {
        ChannelFact moderateFloor = channel(null, "Moderate", false);
        assertFalse(moderateFloor.eligibleFor(alert("Minor", "north")));
        assertTrue(moderateFloor.eligibleFor(alert("Moderate", "north")));
        assertTrue(moderateFloor.eligibleFor(alert("Severe", "north")));
    }

    /** A channel may be both area-scoped and severity-floored, so the two
     *  conditions must both hold - a mutant that drops one short-circuits. */
    @Test
    @DisplayName("area scope and severity floor must both hold")
    void bothConditionsMustHold() {
        ChannelFact both = channel("north", "Severe", false);
        assertTrue(both.eligibleFor(alert("Severe", "north")));
        assertFalse(both.eligibleFor(alert("Severe", "south")));   // area fails
        assertFalse(both.eligibleFor(alert("Minor", "north")));    // severity fails
    }

    /** The accessors are read by the rules when it builds the dispatch. */
    @Test
    @DisplayName("carries every field the ruleset reads")
    void carriesEveryField() {
        ChannelFact channel = channel("north", "Severe", true);
        assertEquals("sirens", channel.getId());
        assertEquals("Sirens", channel.getLabel());
        assertEquals("north", channel.getArea());
        assertEquals("Severe", channel.getMinSeverity());
        assertTrue(channel.isTestOnly());

        ChannelFact defaults = channel(null, null, false);
        assertFalse(defaults.isTestOnly());
    }
}
