package com.example.alerting;

public class CapAlertFact {

    private final String id;
    private final String severity;
    private final String urgency;
    private final String certainty;
    private final String areaDesc;
    private final String status;

    public CapAlertFact(String id, String severity, String urgency, String certainty, String areaDesc, String status) {
        this.id = id;
        this.severity = severity;
        this.urgency = urgency;
        this.certainty = certainty;
        this.areaDesc = areaDesc;
        this.status = status;
    }

    public String getId() {
        return id;
    }

    public String getSeverity() {
        return severity;
    }

    public String getUrgency() {
        return urgency;
    }

    public String getCertainty() {
        return certainty;
    }

    public String getAreaDesc() {
        return areaDesc;
    }

    public String getStatus() {
        return status;
    }

    public static int rankOf(String severity) {
        if (severity == null) {
            return 1;
        }
        switch (severity.toUpperCase()) {
            case "EXTREME":
                return 5;
            case "SEVERE":
                return 4;
            case "MODERATE":
                return 3;
            case "MINOR":
                return 2;
            default:
                return 1;
        }
    }
}
