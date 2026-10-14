package com.example.alerting;

import org.junit.jupiter.api.Test;
import org.kie.api.KieServices;
import org.kie.api.builder.KieBuilder;
import org.kie.api.builder.KieFileSystem;
import org.kie.api.builder.Message;
import org.kie.api.builder.Results;

import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * Proves the shipped default ruleset (rules/alert-routing.drl) is a valid Drools DRL artefact:
 * the KieBuilder compiles it against the module's fact model with zero errors. This is the
 * compile-time half of the alert.route contract; the behavioural half lives in
 * features/alerting/alert-route.feature.
 *
 * <p>No kmodule.xml is written, so the builder generates the default kmodule — which keeps the
 * test off the optional org.drools:drools-xml-support module.
 */
class RulesetCompilesTest {

    private static final String DRL_PATH = "rules/alert-routing.drl";

    @Test
    void rulesetCompiles() {
        KieServices kieServices = KieServices.Factory.get();

        KieFileSystem kieFileSystem = kieServices.newKieFileSystem();
        kieFileSystem.write("src/main/resources/" + DRL_PATH,
                kieServices.getResources().newClassPathResource(DRL_PATH));

        KieBuilder kieBuilder = kieServices.newKieBuilder(kieFileSystem);
        kieBuilder.buildAll();

        Results results = kieBuilder.getResults();
        assertFalse(results.hasMessages(Message.Level.ERROR),
                () -> "ruleset did not compile: " + results.getMessages(Message.Level.ERROR));
    }
}
