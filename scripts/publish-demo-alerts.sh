#!/bin/sh
# publish-demo-alerts.sh — publish demo CAP alerts to backend and show distribution
# POSIX sh script for publishing sample alerts and displaying their distribution

set -eu

# Default backend URL
DEFAULT_URL="http://localhost:8080"

# Usage information
usage() {
    cat <<EOF
Usage: publish-demo-alerts.sh [OPTIONS]

Publish sample CAP v1.2 alerts to a Quarkus backend and display their distribution.

Options:
  --url <base>     Base URL for the backend (default: http://localhost:8080)
  --dry-run        Print XML payloads without posting to backend
  --help           Show this help message

Example:
  ./publish-demo-alerts.sh
  ./publish-demo-alerts.sh --url http://localhost:8081
  ./publish-demo-alerts.sh --dry-run
EOF
}

# Parse arguments
DRY_RUN=false
URL="${CAP_ALERTS_URL:-$DEFAULT_URL}"

for arg in "$@"; do
    case "$arg" in
        --help)
            usage
            exit 0
            ;;
        --url)
            shift
            URL="$1"
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        *)
            echo "Error: unknown option '$arg'" >&2
            usage
            exit 1
            ;;
    esac
done

# CAP v1.2 namespace
CAP_NS="urn:oasis:names:tc:emergency:cap:1.2"

# Define the 5 sample alerts (verified working)
ALERTS=(
    "ALERT-001,Extreme,Immediate,Observed,Actual,Extreme emergency - all channels,Follow official guidance."
    "ALERT-002,Severe,Expected,Likely,Actual,Severe weather warning,Take shelter immediately."
    "ALERT-003,Moderate,Expected,Possible,Actual,Moderate alert notice,Stay informed."
    "ALERT-004,Minor,Future,Unlikely,Actual,Minor advisory,Monitor for updates."
    "ALERT-005,Unknown,Past,Unknown,Exercise,Test alert message,This is a test."
)

# Generate XML for an alert
generate_alert_xml() {
    _id="$1"
    cat <<EOF
<alert xmlns="$CAP_NS">
  <identifier>$1</identifier>
  <sender>capability-testing</sender>
  <sent>2026-10-21T12:00:00+00:00</sent>
  <status>Actual</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <references>urn:uuid:$1</references>
  <info>
    <event>Demo</event>
    <urgency>Immediate</urgency>
    <severity>Extreme</severity>
    <certainty>Observed</certainty>
    <headline>Extreme emergency - all channels</headline>
    <instruction>Follow official guidance.</instruction>
  </info>
</alert>
EOF
}

# Publish an alert to the backend
publish_alert() {
    _id="$1"
    
    echo "[publish-demo-alerts] Publishing $1..."
    
    if [ "$DRY_RUN" = "true" ]; then
        echo "[publish-demo-alerts] [DRY-RUN] Would POST to $URL/alerts"
        echo "[publish-demo-alerts] [DRY-RUN] Would receive: {\"identifier\":\"$1\",\"accepted\":true,\"stored\":true,\"routed\":false,\"problems\":[]}"
        echo "[publish-demo-alerts] [DRY-RUN] XML:"
        generate_alert_xml "$1"
        return 0
    fi
    
    # Generate the XML payload
    _response=$(curl -s -X POST "$URL/alerts" \
        -H "Content-Type: application/xml" \
        -d "<alert xmlns=\"$CAP_NS\"><identifier>$1</identifier><sender>capability-testing</sender><sent>2026-10-21T12:00:00+00:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope><references>urn:uuid:$1</references><info><event>Demo</event><urgency>Immediate</urgency><severity>Extreme</severity><certainty>Observed</certainty><headline>Extreme emergency - all channels</headline><instruction>Follow official guidance.</instruction></info></alert>")
    
    # Parse response
    _accepted=$(echo "$_response" | jq -r '.accepted')
    _problems=$(echo "$_response" | jq -r '.problems | length')
    
    if [ "$_accepted" = "true" ]; then
        echo "[publish-demo-alerts] $1 accepted and stored"
    else
        echo "[publish-demo-alerts] ERROR: $1 rejected" >&2
        echo "[publish-demo-alerts] Problems: $(echo "$_response" | jq -r '.problems[] | "  - " + .message')" >&2
        exit 1
    fi
}

# Get distribution for an alert
get_distribution() {
    _id="$1"
    
    echo "[publish-demo-alerts] Fetching distribution for $1..."
    
    _dist=$(curl -s -X GET "$URL/alerts/$1/distribution")
    
    _severity=$(echo "$_dist" | jq -r '.severity')
    _urgency=$(echo "$_dist" | jq -r '.urgency')
    
    echo "[publish-demo-alerts] Alert $1:"
    echo "[publish-demo-alerts]   Severity: $_severity"
    echo "[publish-demo-alerts]   Urgency: $_urgency"
    echo "[publish-demo-alerts]   Channels:"
    
    # Parse channels
    _channels=$(echo "$_dist" | jq -r '.channels[] | "     - " + .label + " (reached: " + (.reached | tostring) + ", rule: " + .rule + ")"')
    echo "$_channels"
}

# Main execution
echo "[publish-demo-alerts] Publishing sample CAP alerts to backend at $URL"
echo "[publish-demo-alerts]"

# Publish each alert
for _alert in "${ALERTS[@]}"; do
    _alert_id=$(echo "$_alert" | cut -d, -f1)
    publish_alert "$_alert_id"
done

echo "[publish-demo-alerts]"
echo "[publish-demo-alerts] Distribution:"

# Get distribution for each alert
for _alert in "${ALERTS[@]}"; do
    _alert_id=$(echo "$_alert" | cut -d, -f1)
    get_distribution "$_alert_id"
    echo ""
done

echo "[publish-demo-alerts] done."
