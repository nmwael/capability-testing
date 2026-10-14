package com.example.alerting;

import jakarta.annotation.PostConstruct;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Produces;

import org.kie.api.KieServices;
import org.kie.api.builder.KieBuilder;
import org.kie.api.builder.KieFileSystem;
import org.kie.api.builder.Message;
import org.kie.api.io.Resource;
import org.kie.api.runtime.KieContainer;

import java.nio.charset.StandardCharsets;

/**
 * CDI producer that owns the <em>active</em> Drools ruleset for CAP alert routing.
 *
 * <p>On startup it builds the shipped default ruleset from {@code rules/alert-routing.drl} on
 * the classpath. {@link #activate(String)} replaces the live ruleset with one compiled from
 * supplied DRL text — the hook the rule-designer endpoint uses to activate a drawn graph — and
 * {@link #resetToDefault()} puts the shipped ruleset back. There is no Quarkus Drools extension
 * in this stack, so the container is built by hand through the {@code kie-api} / {@code
 * drools-compiler} pair the module already depends on.
 */
@ApplicationScoped
public class AlertRoutingRulesProducer {

    /** Classpath location of the shipped default ruleset. */
    public static final String DRL_PATH = "rules/alert-routing.drl";

    /** KieFileSystem location DRLs must live under for the builder to pick them up. */
    private static final String KFS_DRL_PATH = "src/main/resources/" + DRL_PATH;

    private final KieServices kieServices = KieServices.Factory.get();

    private volatile KieContainer activeContainer;

    @PostConstruct
    void initialize() {
        resetToDefault();
    }

    /** The active ruleset, injectable as a CDI bean. */
    @Produces
    KieContainer produceActiveContainer() {
        return activeContainer;
    }

    /**
     * Compiles {@code drl} and makes it the active ruleset.
     *
     * @param drl the DRL text to compile and activate; must not be {@code null}
     * @throws IllegalStateException if the DRL does not compile
     */
    public void activate(String drl) {
        if (drl == null) {
            throw new IllegalArgumentException("drl text must not be null");
        }
        KieFileSystem kieFileSystem = kieServices.newKieFileSystem();
        kieFileSystem.write(KFS_DRL_PATH,
                kieServices.getResources().newByteArrayResource(drl.getBytes(StandardCharsets.UTF_8)));
        activeContainer = build(kieFileSystem);
    }

    /** Restores the shipped default ruleset as the active one. */
    public void resetToDefault() {
        KieFileSystem kieFileSystem = kieServices.newKieFileSystem();
        kieFileSystem.write(KFS_DRL_PATH, classpathRuleset());
        activeContainer = build(kieFileSystem);
    }

    /** The active ruleset container. */
    public KieContainer container() {
        return activeContainer;
    }

    private Resource classpathRuleset() {
        return kieServices.getResources().newClassPathResource(DRL_PATH);
    }

    private KieContainer build(KieFileSystem kieFileSystem) {
        KieBuilder kieBuilder = kieServices.newKieBuilder(kieFileSystem);
        kieBuilder.buildAll();
        if (kieBuilder.getResults().hasMessages(Message.Level.ERROR)) {
            throw new IllegalStateException("ruleset failed to compile: "
                    + kieBuilder.getResults().getMessages(Message.Level.ERROR));
        }
        return kieServices.newKieContainer(kieBuilder.getKieModule().getReleaseId());
    }
}
