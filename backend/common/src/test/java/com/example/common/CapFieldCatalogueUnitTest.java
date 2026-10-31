package com.example.common;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Unit tests for {@link CapFieldCatalogue}'s parsing logic.
 *
 * The methods under test are private static pure functions of their inputs. They
 * are reached by reflection rather than through {@link CapFieldCatalogue#getCatalogue()},
 * because that entry point (and both writers) resolve the XSD through a path
 * hardcoded relative to the repository root, while surefire runs each module
 * with the module directory as its working directory - so from the test JVM the
 * XSD is never found and getCatalogue() unconditionally throws. Reflection lets
 * the parsing logic be verified without changing production code, and lets PIT
 * replay the suite, which the public path cannot do.
 */
class CapFieldCatalogueUnitTest {

    private static Method method(String name, Class<?>... parameterTypes) throws Exception {
        Method m = CapFieldCatalogue.class.getDeclaredMethod(name, parameterTypes);
        m.setAccessible(true);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static List<String> extractOrderedElementNames(String content) throws Exception {
        return (List<String>) method("extractOrderedElementNames", String.class).invoke(null, content);
    }

    @SuppressWarnings("unchecked")
    private static Map<String, CapFieldCatalogue.CatalogueEntry> buildCatalogue(String content, List<String> names) throws Exception {
        return (Map<String, CapFieldCatalogue.CatalogueEntry>) method("buildCatalogue", String.class, List.class).invoke(null, content, names);
    }

    private static CapFieldCatalogue.CatalogueEntry fieldFor(String name, String content) throws Exception {
        return (CapFieldCatalogue.CatalogueEntry) method("fieldFor", String.class, String.class).invoke(null, name, content);
    }

    /** Unwraps the reflection exception so a failing assertion is readable. */
    private static <T> T call(ParsingTask<T> task) {
        try {
            return task.run();
        } catch (InvocationTargetException e) {
            throw new RuntimeException(e.getTargetException());
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    private interface ParsingTask<T> {
        T run() throws Exception;
    }

    @Nested
    @DisplayName("extractOrderedElementNames")
    class ExtractOrderedElementNames {

        /** Kills the EmptyObjectReturnValsMutator on line 50: the list must come
         *  back populated, not empty. */
        @Test
        void returnsNamesInDocumentOrder() {
            List<String> names = call(() -> extractOrderedElementNames(
                "<x><element name=\"identifier\"/><element name=\"sender\"/><element name=\"sent\"/></x>"));
            assertEquals(Arrays.asList("identifier", "sender", "sent"), names);
        }

        /** The ref branch now correctly matches ref-based elements.
         * The production regex previously had a closing quote-class bug (`\"'`
         * was a sequence match instead of a character class), so ref-based
         * elements were silently dropped. The CAP v1.2 schema declares
         * cap:valueName and cap:value six times via ref attributes. */
        @Test
        void refBasedElementsAreResolved() {
            List<String> names = call(() -> extractOrderedElementNames(
                "<x><element name=\"identifier\"/><element ref=\"cap:valueName\"/>"
                    + "<element ref=\"cap:value\"/></x>"));
            assertEquals(Arrays.asList("identifier", "valueName", "value"), names);
        }

        /** The reserved ref names now reach the catalogue. */
        @Test
        void theReservedRefNamesAreInTheCatalogue() {
            List<String> names = call(() -> extractOrderedElementNames(
                "<element ref = \"cap:valueName\"/><element ref = \"cap:value\"/>"));
            assertEquals(Arrays.asList("valueName", "value"), names);
        }

        /** The real CAP schema declares valueName and value via ref attributes
         *  in addition to its 50 name-based elements. After fixing the regex,
         *  all 56 elements are discovered. */
        @Test
        void theShippedSchemaIncludesRefElements() throws Exception {
            String xsd = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get(
                "src/main/resources/cap-v1.2.xsd").toAbsolutePath()), java.nio.charset.StandardCharsets.UTF_8);
            List<String> names = call(() -> extractOrderedElementNames(xsd));
            assertTrue(names.size() >= 56, "expected at least 56 elements (50 named + 6 ref), got " + names.size());
            assertTrue(names.contains("identifier") && names.contains("alert")
                && names.contains("valueName") && names.contains("value"));
        }

        /** Kills the negated `seen.contains` conditional: a repeated element must
         *  not appear twice. */
        @Test
        void keepsTheFirstOccrenceOfARepeatedElement() {
            List<String> names = call(() -> extractOrderedElementNames(
                "<x><element name=\"severity\"/><element name=\"urgency\"/><element name=\"severity\"/></x>"));
            assertEquals(Arrays.asList("severity", "urgency"), names);
        }

        /** Kills the negated `name != null` conditional: an element with neither
         *  name nor ref is skipped rather than added as null. */
        @Test
        void skipsElementsWithNeitherNameNorRef() {
            List<String> names = call(() -> extractOrderedElementNames(
                "<x><element name=\"identifier\"/><element type=\"xs:string\"/><element name=\"sender\"/></x>"));
            assertEquals(Arrays.asList("identifier", "sender"), names);
        }

        /** Kills the negated loop guard: no elements means an empty list, not a
         *  crash, and not a null. */
        @Test
        void contentWithNoElementsYieldsAnEmptyList() {
            List<String> names = call(() -> extractOrderedElementNames("<schema/>"));
            assertNotNull(names);
            assertTrue(names.isEmpty());
        }
    }

    @Nested
    @DisplayName("buildCatalogue")
    class BuildCatalogue {

        /** Kills the EmptyObjectReturnValsMutator on line 58. */
        @Test
        void returnsAnEntryForEveryName() {
            Map<String, CapFieldCatalogue.CatalogueEntry> catalogue = call(() -> buildCatalogue(
                "<element name=\"severity\" type=\"xs:string\"/>",
                Collections.singletonList("severity")));
            assertEquals(1, catalogue.size());
            assertNotNull(catalogue.get("severity"));
        }

        /** Kills the negated loop guard: every name in, every entry out. */
        @Test
        void preservesEveryRequestedName() {
            Map<String, CapFieldCatalogue.CatalogueEntry> catalogue = call(() -> buildCatalogue(
                "<element name=\"a\" type=\"xs:string\"/><element name=\"b\" type=\"xs:integer\"/>",
                Arrays.asList("a", "b")));
            assertEquals(2, catalogue.size());
            assertTrue(catalogue.containsKey("a") && catalogue.containsKey("b"));
        }
    }

    @Nested
    @DisplayName("fieldFor")
    class FieldFor {

        /** Kills the negated `mAttrs.find()` conditional: the element exists here,
         *  so the attribute branch must be taken. */
        @Test
        void readsTheTypeAttribute() {
            CapFieldCatalogue.CatalogueEntry entry = call(() ->
                fieldFor("severity", "<element name=\"severity\" type=\"xs:string\"/>"));
            assertEquals("string", entry.type);
        }

        /** One test per mapping kills that branch's negated conditional and the
         *  NullReturnValsMutator on each return. */
        @Test
        void mapsEveryDeclaredXmlType() {
            assertEquals("dateTime", call(() -> fieldFor("f", "<element name=\"f\" type=\"xs:dateTime\"/>")).type);
            assertEquals("anyURI", call(() -> fieldFor("f", "<element name=\"f\" type=\"xs:anyURI\"/>")).type);
            assertEquals("integer", call(() -> fieldFor("f", "<element name=\"f\" type=\"xs:integer\"/>")).type);
            assertEquals("decimal", call(() -> fieldFor("f", "<element name=\"f\" type=\"xs:decimal\"/>")).type);
            assertEquals("language", call(() -> fieldFor("f", "<element name=\"f\" type=\"xs:language\"/>")).type);
        }

        /** Kills the else branch's conditional: an unrecognised type is still a
         *  catalogue entry, and it defaults to string. */
        @Test
        void anUnrecognisedTypeDefaultsToString() {
            CapFieldCatalogue.CatalogueEntry entry = call(() ->
                fieldFor("f", "<element name=\"f\" type=\"xs:hexBinary\"/>"));
            assertEquals("string", entry.type);
        }

        /** Kills the negated `mt.find()` conditional inside the attribute branch:
         *  an element with attrs but no type attribute must fall through to the
         *  block branch rather than returning the default. */
        @Test
        void anElementWithoutATypeAttributeFallsThroughToItsBlock() {
            CapFieldCatalogue.CatalogueEntry entry = call(() -> fieldFor("f",
                "<element name=\"f\" minOccurs=\"0\"><simpleType>"
                    + "<restriction><enumeration value=\"a\"/><enumeration value=\"b\"/></restriction>"
                    + "</simpleType></element>"));
            assertEquals("string", entry.type);
            assertEquals(Arrays.asList("a", "b"), entry.values);
        }

        /** Kills the negated `mBlock.find()` conditional and the negated
         *  `enums.isEmpty()` conditional. */
        @Test
        void collectsEnumerationsFromTheBlock() {
            CapFieldCatalogue.CatalogueEntry entry = call(() -> fieldFor("f",
                "<element name=\"f\"><simpleType><restriction>"
                    + "<enumeration value=\"Extreme\"/><enumeration value=\"Severe\"/>"
                    + "</restriction></simpleType></element>"));
            assertNotNull(entry.values);
            assertEquals(Arrays.asList("Extreme", "Severe"), entry.values);
        }

        /** Kills the negated `block.contains(xs:dateTime)` conditional: a block
         *  that mentions the type without enumerations still maps to it. */
        @Test
        void aBlockWithoutEnumerationsMapsToDateTime() {
            CapFieldCatalogue.CatalogueEntry entry = call(() -> fieldFor("f",
                "<element name=\"f\"><simpleType><restriction base=\"xs:dateTime\"/></restriction>"
                    + "</simpleType></element>"));
            assertEquals("dateTime", entry.type);
        }

        /** Kills both the negated conditionals guarding values: no enumeration and
         *  no dateTime leaves a null values list, which is how "closed vocabulary"
         *  is distinguished from "free text" downstream. */
        @Test
        void aBlockWithNothingDistinctiveHasNoValues() {
            CapFieldCatalogue.CatalogueEntry entry = call(() -> fieldFor("f",
                "<element name=\"f\"><annotation/></element>"));
            assertEquals("string", entry.type);
            assertNull(entry.values);
        }

        /** Kills the final default return: a field not present at all is still an
         *  entry rather than a null that would break the writers. */
        @Test
        void anUnknownFieldIsAPlainString() {
            CapFieldCatalogue.CatalogueEntry entry = call(() -> fieldFor("nope", "<element name=\"other\" type=\"xs:string\"/>"));
            assertEquals("string", entry.type);
            assertNull(entry.values);
        }

        /** The catalogue entry is a value object; its list must not be aliased
         *  into a shared collection across entries. */
        @Test
        void entriesCarryTheirOwnValueLists() {
            List<String> names = new ArrayList<>(Arrays.asList("a", "b"));
            Map<String, CapFieldCatalogue.CatalogueEntry> catalogue = call(() -> buildCatalogue(
                "<element name=\"a\"><restriction><enumeration value=\"x\"/></restriction></element>"
                    + "<element name=\"b\" type=\"xs:string\"/>", names));
            assertEquals(Collections.singletonList("x"), catalogue.get("a").values);
            assertNull(catalogue.get("b").values);
        }
    }

    @Nested
    @DisplayName("the public entry point, and why it is not used above")
    class PublicEntryPoint {

        /** Documents why these tests access the parsing logic through
         *  reflection rather than through the public getCatalogue()
         *  method. The public entry point resolves the XSD via the
         *  classpath (getResource), so it works from any working
         *  directory, including when Maven runs tests with the module
         *  directory as cwd. */
        @Test
        void getCatalogueWorksFromModuleDirectory() {
            CapValidatorIndependentProbe probe = new CapValidatorIndependentProbe();
            Map<String, CapFieldCatalogue.CatalogueEntry> catalogue = probe.read();
            assertNotNull(catalogue);
            assertTrue(catalogue.size() > 0, "expected catalogue to be populated");
            assertTrue(catalogue.containsKey("identifier"), "expected identifier entry");
        }

        static class CapValidatorIndependentProbe {
            Map<String, CapFieldCatalogue.CatalogueEntry> read() {
                return new CapFieldCatalogue().getCatalogue();
            }
        }
    }

}
