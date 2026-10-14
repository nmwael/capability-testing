package com.example.alerting;

/**
 * A configured delivery channel the rules may dispatch a CAP alert to.
 *
 * <p>{@code area} scopes the channel to a CAP {@code areaDesc}; {@code null} means the channel
 * is region-wide. {@code minSeverity} is the least severe alert the channel accepts; {@code null}
 * means it accepts anything. {@code testOnly} channels are the only ones a CAP "Test" alert may
 * reach.
 */
public class ChannelFact {

    private final String id;
    private final String label;
    private final String area;
    private final String minSeverity;
    private final boolean testOnly;

    public ChannelFact(String id, String label, String area, String minSeverity, boolean testOnly) {
        this.id = id;
        this.label = label;
        this.area = area;
        this.minSeverity = minSeverity;
        this.testOnly = testOnly;
    }

    public String getId() {
        return id;
    }

    public String getLabel() {
        return label;
    }

    public String getArea() {
        return area;
    }

    public String getMinSeverity() {
        return minSeverity;
    }

    public boolean isTestOnly() {
        return testOnly;
    }

    /**
     * True when this channel is in scope for {@code alert}: its area is the alert's area (or
     * region-wide) and the alert is at least as severe as the channel's floor.
     */
    public boolean eligibleFor(CapAlertFact alert) {
        if (alert == null) {
            return false;
        }
        if (area != null && !area.equals(alert.getAreaDesc())) {
            return false;
        }
        return minSeverity == null
                || CapAlertFact.rankOf(minSeverity) <= CapAlertFact.rankOf(alert.getSeverity());
    }
}
