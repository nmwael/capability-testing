package com.example.rules;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Basic integration tests for the rule engine core.
 * These tests ensure the environment is correctly configured to run rules.
 */
public class InitialRulesetTest {

    @Test
    void rulesetIsNotNull() {
        // GIVEN a clean Quarkus/Drools environment
        InitialRuleset ruleset = new InitialRuleset();
        
        // THEN the ruleset instance should be valid and ready for rules to be loaded
        assertNotNull(ruleset, "The InitialRuleset object should not be null.");
    }
}