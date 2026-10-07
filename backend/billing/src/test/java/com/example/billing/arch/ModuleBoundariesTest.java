package com.example.billing.arch;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.classes;
import static com.tngtech.archunit.library.Architectures.layeredArchitecture;

public class ModuleBoundariesTest {

    @Test
    void layers_should_be_respected() {
        JavaClasses classes = new ClassFileImporter()
                .importPackages("com.example.billing");

        // The scaffold ships no main sources yet, so every rule below is
        // vacuously true today and becomes meaningful as soon as classes land
        // in those packages. ArchUnit 1.2 fails rules whose that-clause matches
        // zero classes, so allowEmptyShould(true) keeps the two package rules
        // green until real classes exist, and withOptionalLayers(true) does the
        // same for the layered architecture (otherwise every layer must be
        // non-empty).
        ArchRule apiOnlyExposesApi = classes()
                .that().resideInAPackage("..api..")
                .should().onlyDependOnClassesThat()
                .resideInAnyPackage("..api..", "..domain..", "java..")
                .allowEmptyShould(true);

        ArchRule internalDoesNotLeak = classes()
                .that().resideInAPackage("..internal..")
                .should().onlyBeAccessed()
                .byAnyPackage("..api..", "..domain..", "..internal..")
                .allowEmptyShould(true);

        ArchRule layers = layeredArchitecture()
                .consideringOnlyDependenciesInLayers()
                .withOptionalLayers(true)
                .layer("api").definedBy("..api..")
                .layer("domain").definedBy("..domain..")
                .layer("internal").definedBy("..internal..")
                .whereLayer("api").mayNotBeAccessedByAnyLayer()
                .whereLayer("domain").mayOnlyBeAccessedByLayers("api", "internal")
                .whereLayer("internal").mayOnlyBeAccessedByLayers("domain");

        apiOnlyExposesApi.check(classes);
        internalDoesNotLeak.check(classes);
        layers.check(classes);
    }
}
