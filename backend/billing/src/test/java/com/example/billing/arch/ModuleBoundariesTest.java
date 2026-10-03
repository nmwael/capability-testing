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

        ArchRule apiOnlyExposesApi = classes()
                .that().resideInAPackage("..api..")
                .should().onlyDependOnClassesThat()
                .resideInAnyPackage("..api..", "..domain..", "java..");

        ArchRule internalDoesNotLeak = classes()
                .that().resideInAPackage("..internal..")
                .should().notBeAccessedFromOutsideOfPackage("..billing..");

        // Demonstrative layered architecture
        layeredArchitecture()
                .layer("api").definedBy("..api..")
                .layer("domain").definedBy("..domain..")
                .layer("internal").definedBy("..internal..")
                .whereLayer("api").mayOnlyBeAccessedByLayers()
                .whereLayer("domain").mayOnlyBeAccessedByLayers("api", "internal")
                .whereLayer("internal").mayOnlyBeAccessedByLayers("domain");
    }
}
