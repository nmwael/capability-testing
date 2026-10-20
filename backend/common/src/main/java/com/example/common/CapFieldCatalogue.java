package com.example.common;

import java.io.FileWriter;
import java.io.IOException;
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

import jakarta.json.Json;
import jakarta.json.JsonArrayBuilder;
import jakarta.json.JsonObject;
import jakarta.json.JsonObjectBuilder;
import jakarta.json.JsonWriter;
import jakarta.json.JsonWriterFactory;
import jakarta.json.stream.JsonGenerator;

public class CapFieldCatalogue {
  public static void main(String[] args) throws IOException {
    Path xsd = Paths.get("backend/common/src/main/resources/cap-v1.2.xsd");
    String content = Files.readString(xsd);
    List<String> ordered = extractOrderedElementNames(content);
    JsonObject catalogue = buildCatalogue(content, ordered);
    Path out = Paths.get("backend/common/src/main/resources/cap-fields.json");
    writeJson(catalogue, out);
  }

  private static List<String> extractOrderedElementNames(String content) {
    Pattern p = Pattern.compile("<element name\\s*=\\s*\"([^\"]+)\"");
    Matcher m = p.matcher(content);
    List<String> names = new ArrayList<>();
    Set<String> seen = new HashSet<>();
    while (m.find()) {
      String name = m.group(1);
      if (!seen.contains(name)) {
        seen.add(name);
        names.add(name);
      }
    }
    return names;
  }

  private static JsonObject buildCatalogue(String content, List<String> names) {
    JsonObjectBuilder root = Json.createObjectBuilder();
    for (String name : names) {
      root.add(name, fieldFor(name, content));
    }
    return root.build();
  }

  private static JsonObject fieldFor(String name, String content) {
    String elementRe = "<element name\\s*=\\s*\"" + Pattern.quote(name) + "\"[^>]*>";
    Pattern pElemAttrs = Pattern.compile(elementRe, Pattern.DOTALL);
    Matcher mAttrs = pElemAttrs.matcher(content);
    if (mAttrs.find()) {
      String attrs = mAttrs.group(0);
      Matcher mt = Pattern.compile("type\\s*=\\s*\"([^\\\"]+)\"").matcher(attrs);
      if (mt.find()) {
        String t = mt.group(1);
        if ("xs:dateTime".equals(t)) {
          return Json.createObjectBuilder().add("type", "dateTime").build();
        } else if ("xs:anyURI".equals(t)) {
          return Json.createObjectBuilder().add("type", "anyURI").build();
        } else if ("xs:integer".equals(t)) {
          return Json.createObjectBuilder().add("type", "integer").build();
        } else if ("xs:decimal".equals(t)) {
          return Json.createObjectBuilder().add("type", "decimal").build();
        } else if ("xs:language".equals(t)) {
          return Json.createObjectBuilder().add("type", "language").build();
        } else {
          return Json.createObjectBuilder().add("type", "string").build();
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
        JsonArrayBuilder vab = Json.createArrayBuilder();
        for (String e : enums) {
          vab.add(e);
        }
        return Json.createObjectBuilder().add("type", "string").add("values", vab.build()).build();
      }
      if (block.contains("xs:dateTime")) {
        return Json.createObjectBuilder().add("type", "dateTime").build();
      }
    }
    return Json.createObjectBuilder().add("type", "string").build();
  }

  private static void writeJson(JsonObject obj, Path out) throws IOException {
    Map<String, Object> cfg = new HashMap<>();
    cfg.put(JsonGenerator.PRETTY_PRINTING, true);
    JsonWriterFactory factory = Json.createWriterFactory(cfg);
    try (FileWriter fw = new FileWriter(out.toFile());
         JsonWriter jw = factory.createWriter(fw)) {
      jw.writeObject(obj);
    }
  }
}
