package com.example.alerting;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link RoutingDecision}, the fact the ruleset accumulates into.
 *
 * Every assertion the integration tests make about routing is read through this
 * object after the rules have fired, so a mutation here changes what the ITs
 * believe they verified. Like the other fact classes it is only reached by
 * tests that start a Quarkus container, which PIT cannot instrument.
 */
class RoutingDecisionTest {

    private static Dispatch dispatch(String ruleName, boolean broadcast) {
        return new Dispatch(new ChannelFact("sirens", "Sirens", null, null, false), ruleName, broadcast);
    }

    /** Kills the negated loop guard and the PrimitiveReturnsMutator on
     *  channelCount: nothing fired means nothing was dispatched. */
    @Test
    @DisplayName("an empty decision dispatched nowhere")
    void emptyDecisionHasNoChannels() {
        RoutingDecision decision = new RoutingDecision();
        assertEquals(0, decision.channelCount());
        assertFalse(decision.broadcast());
        assertTrue(decision.firedRules().isEmpty());
    }

    /** Kills the PrimitiveReturnsMutator on channelCount: the count tracks the
     *  dispatches added, not a constant. */
    @Test
    @DisplayName("the channel count tracks every dispatch")
    void countTracksEveryDispatch() {
        RoutingDecision decision = new RoutingDecision();
        decision.add(dispatch("severe", false));
        assertEquals(1, decision.channelCount());
        decision.add(dispatch("moderate", false));
        assertEquals(2, decision.channelCount());
    }

    /** Kills the negated `isBroadcast` conditional and the BooleanFalseReturnVals
     *  and BooleanTrueReturnVals mutants on broadcast(): an extreme alert
     *  broadcasts, an ordinary one does not. */
    @Test
    @DisplayName("broadcast is true only when a dispatch broadcast")
    void broadcastOnlyWhenADispatchBroadcasts() {
        RoutingDecision none = new RoutingDecision();
        none.add(dispatch("severe", false));
        none.add(dispatch("moderate", false));
        assertFalse(none.broadcast());

        RoutingDecision one = new RoutingDecision();
        one.add(dispatch("severe", false));
        one.add(dispatch("extreme", true));
        one.add(dispatch("moderate", false));
        assertTrue(one.broadcast());
    }

    /** Kills the loop-guard mutant that returns on the first dispatch: a broadcast
     *  that is not first must still be seen. */
    @Test
    @DisplayName("a broadcast later in the list is still found")
    void laterBroadcastIsFound() {
        RoutingDecision decision = new RoutingDecision();
        decision.add(dispatch("first", false));
        decision.add(dispatch("second", false));
        decision.add(dispatch("third", false));
        decision.add(dispatch("fourth", true));
        assertTrue(decision.broadcast());
    }

    /** Kills the negated `add` conditional and the EmptyObjectReturnVals mutant on
     *  firedRules: the list is the rules that fired, de-duplicated. */
    @Test
    @DisplayName("fired rules are de-duplicated")
    void firedRulesAreDeDuplicated() {
        RoutingDecision decision = new RoutingDecision();
        decision.add(dispatch("severe", false));
        decision.add(dispatch("severe", true));
        decision.add(dispatch("moderate", false));
        assertEquals(Arrays.asList("severe", "moderate"), decision.firedRules());
    }

    /** Kills the ordering mutants: the type is a LinkedHashSet, so first-fired
     *  order is preserved - the audit log depends on that. */
    @Test
    @DisplayName("fired rules keep first-fired order")
    void firedRulesKeepFirstFiredOrder() {
        RoutingDecision decision = new RoutingDecision();
        decision.add(dispatch("moderate", false));
        decision.add(dispatch("severe", false));
        decision.add(dispatch("moderate", true));
        assertEquals(Arrays.asList("moderate", "severe"), decision.firedRules());
    }

    /** getDispatches hands back a copy, so a caller mutating it cannot corrupt the
     *  fact the rules are still writing into. The contents are asserted as well as
     *  the isolation, because "an empty list" is otherwise indistinguishable from
     *  "a list whose contents were mutated away". */
    @Test
    @DisplayName("getDispatches returns a copy with the real contents")
    void getDispatchesReturnsACopy() {
        RoutingDecision decision = new RoutingDecision();
        List<Dispatch> empty = decision.getDispatches();
        assertEquals(0, empty.size());

        decision.add(dispatch("severe", false));
        decision.add(dispatch("moderate", true));

        List<Dispatch> snapshot = decision.getDispatches();
        assertEquals(2, snapshot.size());
        assertEquals("severe", snapshot.get(0).getRuleName());
        assertEquals("moderate", snapshot.get(1).getRuleName());
        assertTrue(snapshot.get(1).isBroadcast());

        // Mutating what was handed back must not change the decision.
        snapshot.clear();
        assertEquals(2, decision.channelCount(), "clearing a returned list must not clear the decision");
        assertEquals(2, decision.getDispatches().size());
    }

    /** Dispatch itself carries the channel and the flag the decision reads. */
    @Test
    @DisplayName("a dispatch carries its channel, rule and broadcast flag")
    void dispatchCarriesItsFields() {
        ChannelFact channel = new ChannelFact("sirens", "Sirens", null, null, false);
        Dispatch dispatch = new Dispatch(channel, "severe", true);
        assertEquals(channel, dispatch.getChannel());
        assertEquals("severe", dispatch.getRuleName());
        assertTrue(dispatch.isBroadcast());
    }
}
