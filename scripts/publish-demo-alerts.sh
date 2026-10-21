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

# Store alert data as indexed variables (POSIX sh compliant)
ALERT_001_ID="ALERT-001"
ALERT_001_SEVERITY="Extreme"
ALERT_001_URGENCY="Immediate"
ALERT_001_CERTAINTY="Observed"
ALERT_001_STATUS="Actual"
ALERT_001_HEADLINE="Extreme emergency - all channels"
ALERT_001_INSTRUCTION="Follow official guidance."

ALERT_002_ID="ALERT-002"
ALERT_002_SEVERITY="Severe"
ALERT_002_URGENCY="Expected"
ALERT_002_CERTAINTY="Likely"
ALERT_002_STATUS="Actual"
ALERT_002_HEADLINE="Severe weather warning"
ALERT_002_INSTRUCTION="Take shelter immediately."

ALERT_003_ID="ALERT-003"
ALERT_003_SEVERITY="Moderate"
ALERT_003_URGENCY="Expected"
ALERT_003_CERTAINTY="Possible"
ALERT_003_STATUS="Actual"
ALERT_003_HEADLINE="Moderate alert notice"
ALERT_003_INSTRUCTION="Stay informed."

ALERT_004_ID="ALERT-004"
ALERT_004_SEVERITY="Minor"
ALERT_004_URGENCY="Future"
ALERT_004_CERTAINTY="Unlikely"
ALERT_004_STATUS="Actual"
ALERT_004_HEADLINE="Minor advisory"
ALERT_004_INSTRUCTION="Monitor for updates."

ALERT_005_ID="ALERT-005"
ALERT_005_SEVERITY="Unknown"
ALERT_005_URGENCY="Past"
ALERT_005_CERTAINTY="Unknown"
ALERT_005_STATUS="Exercise"
ALERT_005_HEADLINE="Test alert message"
ALERT_005_INSTRUCTION="This is a test."

for arg in "$@"; do
    case "$arg" in
        --help)
            usage
            exit 0
            ;;
        --url)
            shift 2
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

# Generate XML for an alert using actual fields
generate_alert_xml() {
    _id="$1"
    _severity="$2"
    _urgency="$3"
    _certainty="$4"
    _status="$5"
    _headline="$6"
    _instruction="$7"
    
    cat <<EOF
<alert xmlns="$CAP_NS">
  <identifier>$1</identifier>
  <sender>capability-testing</sender>
  <sent>2026-10-21T12:00:00+00:00</sent>
  <status>$5</status>
  <msgType>Alert</msgType>
  <scope>Public</scope>
  <references>urn:uuid:$1</references>
  <info>
    <event>Demo</event>
    <urgency>$3</urgency>
    <severity>$2</severity>
    <certainty>$4</certainty>
    <headline>$6</headline>
    <instruction>$7</instruction>
  </info>
</alert>
EOF
}

# Publish an alert to the backend
publish_alert() {
    _id="$1"
    _severity="$2"
    _urgency="$3"
    _certainty="$4"
    _status="$5"
    _headline="$6"
    _instruction="$7"
    
    echo "[publish-demo-alerts] Publishing $1..."
    
    if [ "$DRY_RUN" = "true" ]; then
        echo "[publish-demo-alerts] [DRY-RUN] Would POST to $URL/alerts"
        echo "[publish-demo-alerts] [DRY-RUN] Would receive: {\"identifier\":\"$1\",\"accepted\":true,\"stored\":true,\"routed\":false,\"problems\":[]}"
        echo "[publish-demo-alerts] [DRY-RUN] XML:"
        generate_alert_xml "$1" "$_severity" "$_urgency" "$_certainty" "$_status" "$_headline" "$_instruction"
        return 0
    fi
    
    # Generate the XML payload
    _response=$(curl -s -X POST "$URL/alerts" \
        -H "Content-Type: application/xml" \
        --connect-timeout 5 \
        --max-time 15 \
        -d "<alert xmlns=\"$CAP_NS\"><identifier>$1</identifier><sender>capability-testing</sender><sent>2026-10-21T12:00:00+00:00</sent><status>$5</status><msgType>Alert</msgType><scope>Public</scope><references>urn:uuid:$1</references><info><event>Demo</event><urgency>$3</urgency><severity>$2</severity><certainty>$4</certainty><headline>$6</headline><instruction>$7</instruction></info></alert>")
    
    # Check if response is valid JSON
    _json_ok=false
    if echo "$_response" | grep -q "^{"; then
        _json_ok=true
    fi
    
    if [ "$_json_ok" = "false" ]; then
        echo "[publish-demo-alerts] ERROR: Invalid JSON response" >&2
        echo "[publish-demo-alerts] Response: $_response" >&2
        exit 1
    fi
    
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
publish_alert "$ALERT_001_ID" "$ALERT_001_SEVERITY" "$ALERT_001_URGENCY" "$ALERT_001_CERTAINTY" "$ALERT_001_STATUS" "$ALERT_001_HEADLINE" "$ALERT_001_INSTRUCTION"
publish_alert "$ALERT_002_ID" "$ALERT_002_SEVERITY" "$ALERT_002_URGENCY" "$ALERT_002_CERTAINTY" "$ALERT_002_STATUS" "$ALERT_002_HEADLINE" "$ALERT_002_INSTRUCTION"
publish_alert "$ALERT_003_ID" "$ALERT_003_SEVERITY" "$ALERT_003_URGENCY" "$ALERT_003_CERTAINTY" "$ALERT_003_STATUS" "$ALERT_003_HEADLINE" "$ALERT_003_INSTRUCTION"
publish_alert "$ALERT_004_ID" "$ALERT_004_SEVERITY" "$ALERT_004_URGENCY" "$ALERT_004_CERTAINTY" "$ALERT_004_STATUS" "$ALERT_004_HEADLINE" "$ALERT_004_INSTRUCTION"
publish_alert "$ALERT_005_ID" "$ALERT_005_SEVERITY" "$ALERT_005_URGENCY" "$ALERT_005_CERTAINTY" "$ALERT_005_STATUS" "$ALERT_005_HEADLINE" "$ALERT_005_INSTRUCTION"

echo "[publish-demo-alerts]"
echo "[publish-demo-alerts] Distribution:"

# Get distribution for each alert
get_distribution "$ALERT_001_ID"
echo ""
get_distribution "$ALERT_002_ID"
echo ""
get_distribution "$ALERT_003_ID"
echo ""
get_distribution "$ALERT_004_ID"
echo ""
get_distribution "$ALERT_005_ID"

echo "[publish-demo-alerts] done."
