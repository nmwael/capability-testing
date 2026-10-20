package com.example.common;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.Test;

import jakarta.json.Json;
import jakarta.json.JsonArray;
import jakarta.json.JsonObject;
import jakarta.json.JsonReader;

public class CapFieldCatalogueTest {
  @Test
  public void catalogueMatchesSchema() throws IOException {
    Path committed = Path.of("src/main/resources/cap-fields.json");
    try (JsonReader r = Json.createReader(Files.newInputStream(committed))) {
      JsonObject committedObj = r.readObject();
      JsonObject derived = derive();
      assertEquals(committedObj.keySet().size(), derived.keySet().size());
      assertEquals(committedObj.keySet(), derived.keySet());
      for (String key : committedObj.keySet()) {
        JsonObject c = committedObj.getJsonObject(key);
        JsonObject d = derived.getJsonObject(key);
        assertEquals(c.getString("type"), d.getString("type"), "type mismatch for " + key);
        if (c.containsKey("values")) {
          JsonArray cv = c.getJsonArray("values");
          JsonArray dv = d.getJsonArray("values");
          assertEquals(cv.size(), dv.size(), "values size mismatch for " + key);
          for (int i = 0; i < cv.size(); i++) {
            assertEquals(cv.getString(i), dv.getString(i), "value mismatch for " + key + " at " + i);
          }
        } else {
          assertEquals(c.containsKey("values"), d.containsKey("values"), "values presence mismatch for " + key);
        }
      }
    }
  }

  private static JsonObject derive() throws IOException {
    String content = Files.readString(Path.of("src/main/resources/cap-v1.2.xsd"));
    List<String> ordered = extractOrdered(content);
    var root = Json.createObjectBuilder();
    for (String name : ordered) {
      root.add(name, fieldFor(name, content));
    }
    return root.build();
  }

  private static List<String> extractOrdered(String content) {
    Pattern p = Pattern.compile("<element name\\s*=\\s*\"([^\"]+)\"");
    Matcher m = p.matcher(content);
    List<String> names = new java.util.ArrayList<>();
    java.util.Set<String> seen = new java.util.HashSet<>();
    while (m.find()) {
      String name = m.group(1);
      if (!seen.contains(name)) { seen.add(name); names.add(name); }
    }
    return names;
  }

  private static JsonObject fieldFor(String name, String content) {
    String elementRe = "<element name\\s*=\\s*\"" + Pattern.quote(name) + "\"[^>]*>";
    Matcher mAttrs = Pattern.compile(elementRe, Pattern.DOTALL).matcher(content);
    if (mAttrs.find()) {
      Matcher mt = Pattern.compile("type\\s*=\\s*\"([^\\\"]+)\"").matcher(mAttrs.group(0));
      if (mt.find()) {
        String t = mt.group(1);
        if ("xs:dateTime".equals(t)) return Json.createObjectBuilder().add("type", "dateTime").build();
        if ("xs:anyURI".equals(t)) return Json.createObjectBuilder().add("type", "anyURI").build();
        if ("xs:integer".equals(t)) return Json.createObjectBuilder().add("type", "integer").build();
        if ("xs:decimal".equals(t)) return Json.createObjectBuilder().add("type", "decimal").build();
        if ("xs:language".equals(t)) return Json.createObjectBuilder().add("type", "language").build();
        return Json.createObjectBuilder().add("type", "string").build();
      }
    }
    String blockRe = "<element name\\s*=\\s*\"" + Pattern.quote(name) + "\"[^>]*>[\\s\\S]*?</element>";
    Matcher mBlock = Pattern.compile(blockRe, Pattern.DOTALL).matcher(content);
    if (mBlock.find()) {
      String block = mBlock.group(0);
      Matcher me = Pattern.compile("<enumeration value\\s*=\\s*\"([^\"]+)\"").matcher(block);
      java.util.List<String> enums = new java.util.ArrayList<>();
      while (me.find()) enums.add(me.group(1));
      if (!enums.isEmpty()) {
        var vab = Json.createArrayBuilder();
        for (String e : enums) vab.add(e);
        return Json.createObjectBuilder().add("type", "string").add("values", vab.build()).build();
      }
      if (block.contains("xs:dateTime")) return Json.createObjectBuilder().add("type", "dateTime").build();
    }
    return Json.createObjectBuilder().add("type", "string").build();
  }
}
