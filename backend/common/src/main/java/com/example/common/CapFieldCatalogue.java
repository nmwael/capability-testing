package com.example.common;

import java.io.FileWriter;
import java.io.IOException;
import java.net.URI;
import java.net.URL;
import java.net.URISyntaxException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class CapFieldCatalogue {
  public static void main(String[] args) throws IOException {
    Path xsd = Paths.get("backend/common/src/main/resources/cap-v1.2.xsd");
    String content = Files.readString(xsd);
    List<String> ordered = extractOrderedElementNames(content);
    Map<String, CatalogueEntry> catalogue = buildCatalogue(content, ordered);
    
    // Write JSON
    Path jsonOut = Paths.get("backend/common/src/main/resources/cap-fields.json");
    writeJson(catalogue, jsonOut);
    
    // Write YAML
    Path yamlOut = Paths.get("backend/common/src/main/resources/cap-fields.yml");
    writeYaml(catalogue, yamlOut);
  }

  private static List<String> extractOrderedElementNames(String content) {
    Pattern p = Pattern.compile("<element(?:\\s+name\\s*=\\s*[\"']([^\"]+)[\"']?|\\s*ref\\s*=\\s*[\"']cap:([^\"]+)[\"'])");
    Matcher m = p.matcher(content);
    List<String> names = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    while (m.find()) {
      String name = m.group(1);
      String ref = m.group(2);
      if (name != null) {
        // Deduplicate named elements by name value (repeated names count once)
        if (!seen.contains(name)) { seen.add(name); names.add(name); }
      } else if (ref != null) {
        // Ref elements always count individually (a cap:valueName ref may appear
        // multiple times in the schema and each occurrence is significant)
        names.add(ref);
      }
    }
    return names;
  }

  private static Map<String, CatalogueEntry> buildCatalogue(String content, List<String> names) {
    Map<String, CatalogueEntry> catalogue = new HashMap<>();
    for (String name : names) {
      catalogue.put(name, fieldFor(name, content));
    }
    return catalogue;
  }

  private static CatalogueEntry fieldFor(String name, String content) {
    String elementRe = "<element name\\s*=\\s*\"" + Pattern.quote(name) + "\"[^>]*>";
    Pattern pElemAttrs = Pattern.compile(elementRe, Pattern.DOTALL);
    Matcher mAttrs = pElemAttrs.matcher(content);
    if (mAttrs.find()) {
      String attrs = mAttrs.group(0);
      Matcher mt = Pattern.compile("type\\s*=\\s*\"([^\"]+)\"").matcher(attrs);
      if (mt.find()) {
        String t = mt.group(1);
        if ("xs:dateTime".equals(t)) {
          return new CatalogueEntry("dateTime", null);
        } else if ("xs:anyURI".equals(t)) {
          return new CatalogueEntry("anyURI", null);
        } else if ("xs:integer".equals(t)) {
          return new CatalogueEntry("integer", null);
        } else if ("xs:decimal".equals(t)) {
          return new CatalogueEntry("decimal", null);
        } else if ("xs:language".equals(t)) {
          return new CatalogueEntry("language", null);
        } else {
          return new CatalogueEntry("string", null);
        }
      }
    }
    String blockRe = "<element name\\s*=\\s*\"" + Pattern.quote(name) + "\"[^>]*>[\\s\\S]*?</element>";
    Pattern pBlock = Pattern.compile(blockRe, Pattern.DOTALL);
    Matcher mBlock = pBlock.matcher(content);
    if (mBlock.find()) {
      String block = mBlock.group(0);
      Matcher me = Pattern.compile("<enumeration value\\s*=\\s*\"([^\"]+)\"").matcher(block);
      List<String> enums = new ArrayList<>();
      while (me.find()) {
        enums.add(me.group(1));
      }
      if (!enums.isEmpty()) {
        return new CatalogueEntry("string", enums);
      }
      if (block.contains("xs:dateTime")) {
        return new CatalogueEntry("dateTime", null);
      }
    }
    return new CatalogueEntry("string", null);
  }

  private static String readXsdContent() throws IOException {
    URL xsdUrl = CapFieldCatalogue.class.getClassLoader()
        .getResource("cap-v1.2.xsd");
    if (xsdUrl == null) {
      throw new IOException("CAP XSD resource not found on classpath");
    }
    try {
      return Files.readString(Path.of(xsdUrl.toURI()));
    } catch (URISyntaxException e) {
      throw new IOException("Failed to resolve CAP XSD resource URI: " + e.getMessage(), e);
    }
  }

  private static void writeJson(Map<String, CatalogueEntry> catalogue, Path out) throws IOException {
    FileWriter fw = new FileWriter(out.toFile());
    fw.write("{\n");
    List<String> names = extractOrderedElementNames(readXsdContent());
    fw.write("  \"names\": [");
    for (int i = 0; i < names.size(); i++) {
      if (i > 0) fw.write(", ");
      fw.write("\"" + names.get(i) + "\"");
    }
    fw.write("],\n");
    fw.write("  \"catalogue\": {\n");
    for (int i = 0; i < names.size(); i++) {
      String name = names.get(i);
      CatalogueEntry entry = catalogue.get(name);
      fw.write("    \"" + name + "\": {\n");
      fw.write("      \"type\": \"" + entry.type + "\"");
      if (entry.values != null && !entry.values.isEmpty()) {
        fw.write(",\n      \"values\": [");
        for (int j = 0; j < entry.values.size(); j++) {
          if (j > 0) fw.write(", ");
          fw.write("\"" + entry.values.get(j) + "\"");
        }
        fw.write("]\n");
      }
      fw.write("    }");
      if (i < names.size() - 1) fw.write(",");
      fw.write("\n");
    }
    fw.write("  }\n");
    fw.write("}\n");
    fw.close();
  }

  private static void writeYaml(Map<String, CatalogueEntry> catalogue, Path out) throws IOException {
    FileWriter fw = new FileWriter(out.toFile());
    fw.write("# CAP Field Catalogue - YAML format\n");
    fw.write("\n");
    List<String> names = extractOrderedElementNames(readXsdContent());
    for (String name : names) {
      CatalogueEntry entry = catalogue.get(name);
      fw.write(name + ": " + entry.type);
      if (entry.values != null && !entry.values.isEmpty()) {
        fw.write(", [");
        for (int i = 0; i < entry.values.size(); i++) {
          if (i > 0) fw.write(", ");
          fw.write(entry.values.get(i));
        }
        fw.write("]");
      }
      fw.write("\n");
    }
    fw.close();
  }

  /**
   * Returns the catalogue map containing all field entries.
   */
  public Map<String, CatalogueEntry> getCatalogue() {
    // Build catalogue on demand
    try {
      // Use classpath resource so it resolves from any working directory
      // (Maven surefire runs with module dir as cwd, not repo root)
      URL xsdUrl = CapFieldCatalogue.class.getClassLoader()
          .getResource("cap-v1.2.xsd");
      if (xsdUrl == null) {
        throw new RuntimeException("Failed to read CAP XSD: resource not found on classpath");
      }
      String content = Files.readString(Path.of(xsdUrl.toURI()));
      List<String> ordered = extractOrderedElementNames(content);
      return buildCatalogue(content, ordered);
    } catch (IOException | URISyntaxException e) {
      throw new RuntimeException("Failed to read CAP XSD: " + e.getMessage(), e);
    }
  }

  public static class CatalogueEntry {
    public String type;
    public List<String> values;

    CatalogueEntry(String type, List<String> values) {
      this.type = type;
      this.values = values;
    }
  }
}
