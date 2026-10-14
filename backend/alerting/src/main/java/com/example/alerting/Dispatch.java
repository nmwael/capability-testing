package com.example.alerting;

public class Dispatch {

    private final ChannelFact channel;
    private final String ruleName;
    private final boolean broadcast;

    public Dispatch(ChannelFact channel, String ruleName, boolean broadcast) {
        this.channel = channel;
        this.ruleName = ruleName;
        this.broadcast = broadcast;
    }

    public ChannelFact getChannel() {
        return channel;
    }

    public String getRuleName() {
        return ruleName;
    }

    public boolean isBroadcast() {
        return broadcast;
    }
}
