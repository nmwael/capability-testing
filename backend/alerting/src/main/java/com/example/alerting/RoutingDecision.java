package com.example.alerting;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * The working-memory fact the ruleset accumulates into: each firing rule appends one
 * {@link Dispatch} per eligible channel. A single decision is inserted before the rules fire and
 * inspected afterwards.
 */
public class RoutingDecision {

    private final List<Dispatch> dispatches = new ArrayList<>();

    /** Adds a dispatch (called from the DRL RHS). */
    public void add(Dispatch dispatch) {
        dispatches.add(dispatch);
    }

    /** Number of channels the alert was dispatched to. */
    public int channelCount() {
        return dispatches.size();
    }

    /** True when at least one dispatch was a broadcast (used for extreme alerts). */
    public boolean broadcast() {
        for (Dispatch dispatch : dispatches) {
            if (dispatch.isBroadcast()) {
                return true;
            }
        }
        return false;
    }

    /** The distinct rule names that fired, in the order they first fired. */
    public List<String> firedRules() {
        Set<String> rules = new LinkedHashSet<>();
        for (Dispatch dispatch : dispatches) {
            rules.add(dispatch.getRuleName());
        }
        return new ArrayList<>(rules);
    }

    public List<Dispatch> getDispatches() {
        return new ArrayList<>(dispatches);
    }
}
