package com.example.publication;

import jakarta.enterprise.context.ApplicationScoped;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import javax.xml.parsers.ParserConfigurationException;
import org.w3c.dom.*;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;

/**
 * CAP v1.2 schema validator.
 * Validates the XML structure and closed vocabularies.
 */
@jakarta.enterprise.context.ApplicationScoped
public class CapValidator {

    public static final String CAP_NAMESPACE = "urn:oasis:names:tc:emergency:cap:1.2";

    /**
     * Problem record for validation errors.
     */
    public record Problem(String element, String message) {}

    private List<Problem> problems;

    /**
     * Validates a CAP alert XML against the CAP v1.2 schema requirements.
     * Returns an empty list if valid, or a list of Problem records if invalid.
     * Never returns null; throws never.
     */
    public List<Problem> validate(String xml) {
        problems = new ArrayList<>();

        if (xml == null || xml.trim().isEmpty()) {
            return problems;
        }

        try {
            // Parse the XML
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            DocumentBuilder documentBuilder = factory.newDocumentBuilder();
            Document doc = documentBuilder.parse(new org.xml.sax.InputSource(new StringReader(xml)));

            // Get the root alert element
            NodeList rootElements = doc.getElementsByTagNameNS(CapValidator.CAP_NAMESPACE, "alert");
            if (rootElements.getLength() == 0) {
                problems.add(new Problem("root", "Missing or invalid root alert element"));
                return problems;
            }
            Element alertElement = (Element) rootElements.item(0);

            // Validate required root elements
            validateAlertRootElements(alertElement);

            // Validate info block children (unqualified within namespaced root)
            NodeList infoElements = alertElement.getElementsByTagName("info");
            if (infoElements.getLength() > 0) {
                validateInfoBlockChildren((Element) infoElements.item(0));
            }

        } catch (ParserConfigurationException | org.xml.sax.SAXException | java.io.IOException ex) {
            problems.add(new Problem("root", "XML parsing error: " + ex.getMessage()));
        }

        return problems;
    }

    /**
     * Validate required alert root elements.
     */
    private void validateAlertRootElements(Element element) {
        // Validate identifier (unqualified within namespaced root)
        NodeList identifierElements = element.getElementsByTagName("identifier");
        if (identifierElements.getLength() == 0) {
            problems.add(new Problem("identifier", "Required identifier element is missing"));
        } else {
            String identifierValue = identifierElements.item(0).getTextContent().trim();
            if (identifierValue.isEmpty()) {
                problems.add(new Problem("identifier", "Identifier element must not be empty"));
            }
        }

        // Validate sender (unqualified within namespaced root)
        NodeList senderElements = element.getElementsByTagName("sender");
        if (senderElements.getLength() == 0) {
            problems.add(new Problem("sender", "Required sender element is missing"));
        } else {
            String senderValue = senderElements.item(0).getTextContent().trim();
            if (senderValue.isEmpty()) {
                problems.add(new Problem("sender", "Sender element must not be empty"));
            }
        }

        // Validate sent (unqualified within namespaced root)
        NodeList sentElements = element.getElementsByTagName("sent");
        if (sentElements.getLength() == 0) {
            problems.add(new Problem("sent", "Required sent element is missing"));
        } else {
            String sentValue = sentElements.item(0).getTextContent().trim();
            if (sentValue.isEmpty()) {
                problems.add(new Problem("sent", "Sent element must not be empty"));
            }
        }

        // Validate status (closed vocabulary)
        NodeList statusElements = element.getElementsByTagName("status");
        if (statusElements.getLength() > 0) {
            String statusValue = statusElements.item(0).getTextContent().trim();
            if (!isValidStatus(statusValue)) {
                problems.add(new Problem("status", "Invalid status value: " + statusValue));
            }
        }

        // Validate msgType (closed vocabulary)
        NodeList msgTypeElements = element.getElementsByTagName("msgType");
        if (msgTypeElements.getLength() > 0) {
            String msgTypeValue = msgTypeElements.item(0).getTextContent().trim();
            if (!isValidMsgType(msgTypeValue)) {
                problems.add(new Problem("msgType", "Invalid msgType value: " + msgTypeValue));
            }
        }

        // Validate scope (closed vocabulary)
        NodeList scopeElements = element.getElementsByTagName("scope");
        if (scopeElements.getLength() > 0) {
            String scopeValue = scopeElements.item(0).getTextContent().trim();
            if (!isValidScope(scopeValue)) {
                problems.add(new Problem("scope", "Invalid scope value: " + scopeValue));
            }
        }

        // Validate references for Cancel and Update msgTypes
        if (msgTypeElements.getLength() > 0) {
            String msgTypeValue = msgTypeElements.item(0).getTextContent().trim();
            if ("Cancel".equals(msgTypeValue) || "Update".equals(msgTypeValue)) {
                NodeList referencesElements = element.getElementsByTagName("references");
                if (referencesElements.getLength() == 0) {
                    problems.add(new Problem("references", "Required references element is missing for " + msgTypeValue + " msgType"));
                } else {
                    String referencesValue = referencesElements.item(0).getTextContent().trim();
                    if (referencesValue.isEmpty()) {
                        problems.add(new Problem("references", "References element must not be empty"));
                    }
                }
            }
        }
    }

    /**
     * Validate info block children elements.
     */
    private void validateInfoBlockChildren(Element element) {
        NodeList children = element.getChildNodes();
        for (int i = 0; i < children.getLength(); i++) {
            Node child = children.item(i);
            if (child.getNodeType() != Node.ELEMENT_NODE) {
                continue;
            }
            Element childElement = (Element) child;
            
            // Use localName for unqualified elements
            String localName = childElement.getLocalName();

            // Validate urgency
            if ("urgency".equals(localName)) {
                String urgencyValue = childElement.getTextContent().trim();
                if (!isValidUrgency(urgencyValue)) {
                    problems.add(new Problem("urgency", "Invalid urgency value: " + urgencyValue));
                }
            }

            // Validate severity
            if ("severity".equals(localName)) {
                String severityValue = childElement.getTextContent().trim();
                if (!isValidSeverity(severityValue)) {
                    problems.add(new Problem("severity", "Invalid severity value: " + severityValue));
                }
            }

            // Validate certainty
            if ("certainty".equals(localName)) {
                String certaintyValue = childElement.getTextContent().trim();
                if (!isValidCertainty(certaintyValue)) {
                    problems.add(new Problem("certainty", "Invalid certainty value: " + certaintyValue));
                }
            }

            // Validate event (must not be empty)
            if ("event".equals(localName)) {
                String eventValue = childElement.getTextContent().trim();
                if (eventValue.isEmpty()) {
                    problems.add(new Problem("event", "Event element must not be empty"));
                }
            }
        }
    }

    /**
     * Check if status value is valid.
     */
    private boolean isValidStatus(String value) {
        return "Actual".equals(value) || "Exercise".equals(value) || 
               "System".equals(value) || "Test".equals(value) || "Draft".equals(value);
    }

    /**
     * Check if msgType value is valid.
     */
    private boolean isValidMsgType(String value) {
        return "Alert".equals(value) || "Update".equals(value) || 
               "Cancel".equals(value) || "Ack".equals(value) || "Error".equals(value);
    }

    /**
     * Check if scope value is valid.
     */
    private boolean isValidScope(String value) {
        return "Public".equals(value) || "Restricted".equals(value) || "Private".equals(value);
    }

    /**
     * Check if urgency value is valid.
     */
    private boolean isValidUrgency(String value) {
        return "Immediate".equals(value) || "Expected".equals(value) || 
               "Future".equals(value) || "Past".equals(value) || "Unknown".equals(value);
    }

    /**
     * Check if severity value is valid.
     */
    private boolean isValidSeverity(String value) {
        return "Extreme".equals(value) || "Severe".equals(value) || 
               "Moderate".equals(value) || "Minor".equals(value) || "Unknown".equals(value);
    }

    /**
     * Check if certainty value is valid.
     */
    private boolean isValidCertainty(String value) {
        return "Observed".equals(value) || "Likely".equals(value) || 
               "Possible".equals(value) || "Unlikely".equals(value) || "Unknown".equals(value);
    }

}
