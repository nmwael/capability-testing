#!/bin/sh
# publish-demo-alerts.sh — publish demo CAP alerts to the backend and show
# their channel distribution.
#
# POSIX sh, `set -eu`. Requires curl and jq (both present in the devcontainer).

set -eu

DEFAULT_URL="http://localhost:8080"
DRY_RUN=false
URL="${CAP_ALERTS_URL:-$DEFAULT_URL}"

usage() {
    cat <<EOF
Usage: publish-demo-alerts.sh [OPTIONS]

Publish sample CAP v1.2 alerts to a Quarkus backend and display their distribution.

Options:
  --url <base>     Base URL for the backend (default: $DEFAULT_URL, or \$CAP_ALERTS_URL)
  --dry-run        Print the XML payloads without contacting the backend
  --help           Show this help message

Example:
  ./publish-demo-alerts.sh
  ./publish-demo-alerts.sh --url http://localhost:8081
  ./publish-demo-alerts.sh --dry-run
EOF
}

# --- argument parsing ------------------------------------------------------
# A `while` loop, not `for arg in "$@"`: the `for` form made `--url` shift
# past the end of the argument list and then read "$1", which under `set -u`
# aborted the script with "parameter not set".
while [ $# -gt 0 ]; do
    case "$1" in
        --help)
            usage
            exit 0
            ;;
        --url)
            if [ $# -lt 2 ] || [ -z "$2" ] || [ "${2#-}" != "$2" ]; then
                echo "Error: --url requires a base URL value" >&2
                usage >&2
                exit 1
            fi
            URL="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        *)
            echo "Error: unknown option '$1'" >&2
            usage >&2
            exit 1
            ;;
    esac
done

# CAP v1.2 namespace
CAP_NS="urn:oasis:names:tc:emergency:cap:1.2"

# The alert table. Fields are pipe-separated:
#   identifier|severity|urgency|certainty|status|headline|instruction
ALERT_TABLE='ALERT-001|Extreme|Immediate|Observed|Actual|Extreme emergency - all channels|Follow official guidance.
ALERT-002|Severe|Expected|Likely|Actual|Severe weather warning|Take shelter immediately.
ALERT-003|Moderate|Expected|Possible|Actual|Moderate alert notice|Stay informed.
ALERT-004|Minor|Future|Unlikely|Actual|Minor advisory|Monitor for updates.
ALERT-005|Unknown|Past|Unknown|Exercise|Test alert message|This is a test.'

# Build the CAP v1.2 payload. This is the single source of truth for the
# bytes: the dry-run preview and the POST body are the exact same string, so
# the two cannot drift apart.
generate_alert_xml() {
    printf '<alert xmlns="%s"><identifier>%s</identifier><sender>capability-testing</sender><sent>2026-10-21T12:00:00+00:00</sent><status>%s</status><msgType>Alert</msgType><scope>Public</scope><references>urn:uuid:%s</references><info><event>Demo</event><urgency>%s</urgency><severity>%s</severity><certainty>%s</certainty><headline>%s</headline><instruction>%s</instruction></info></alert>' \
        "$CAP_NS" "$1" "$5" "$1" "$3" "$2" "$4" "$6" "$7"
}

# Publish an alert to the backend.
#   $1 identifier  $2 severity  $3 urgency  $4 certainty
#   $5 status      $6 headline  $7 instruction
publish_alert() {
    echo "[publish-demo-alerts] Publishing $1..."

    _xml=$(generate_alert_xml "$1" "$2" "$3" "$4" "$5" "$6" "$7")

    if [ "$DRY_RUN" = "true" ]; then
        echo "[publish-demo-alerts] [DRY-RUN] Would POST to $URL/alerts"
        echo "[publish-demo-alerts] [DRY-RUN] Would receive: {\"identifier\":\"$1\",\"accepted\":true,\"stored\":true,\"routed\":false,\"problems\":[]}"
        echo "[publish-demo-alerts] [DRY-RUN] XML:"
        echo "$_xml"
        return 0
    fi

    # curl's exit status has to be captured explicitly. Under `set -e` a
    # failing command substitution aborts the script before any handler can
    # run, which made an unreachable backend exit silently with curl's raw
    # code and no diagnostic.
    _curl_status=0
    _response=$(curl -s -X POST "$URL/alerts" \
        -H "Content-Type: application/xml" \
        --connect-timeout 5 \
        --max-time 15 \
        -d "$_xml") || _curl_status=$?

    if [ "$_curl_status" -ne 0 ]; then
        echo "[publish-demo-alerts] ERROR: cannot reach the backend at $URL (curl exit code $_curl_status)" >&2
        exit 1
    fi

    if ! printf '%s' "$_response" | jq -e . >/dev/null 2>&1; then
        echo "[publish-demo-alerts] ERROR: invalid JSON response from $URL/alerts" >&2
        echo "[publish-demo-alerts] Response: $_response" >&2
        exit 1
    fi

    _accepted=$(printf '%s' "$_response" | jq -r '.accepted')

    if [ "$_accepted" != "true" ]; then
        echo "[publish-demo-alerts] ERROR: $1 rejected by the backend" >&2
        echo "[publish-demo-alerts] Problems: $(printf '%s' "$_response" | jq -r '.problems[]? | "  - " + (.message // "unknown problem")')" >&2
        exit 1
    fi

    echo "[publish-demo-alerts] $1 accepted and stored"
}

# Get the channel distribution for a published alert.
get_distribution() {
    echo "[publish-demo-alerts] Fetching distribution for $1..."

    _curl_status=0
    _dist=$(curl -s -X GET "$URL/alerts/$1/distribution" \
        --connect-timeout 5 \
        --max-time 15) || _curl_status=$?

    if [ "$_curl_status" -ne 0 ]; then
        echo "[publish-demo-alerts] ERROR: cannot reach the backend at $URL (curl exit code $_curl_status)" >&2
        exit 1
    fi

    if ! printf '%s' "$_dist" | jq -e . >/dev/null 2>&1; then
        echo "[publish-demo-alerts] ERROR: invalid JSON response from $URL/alerts/$1/distribution" >&2
        echo "[publish-demo-alerts] Response: $_dist" >&2
        exit 1
    fi

    _severity=$(printf '%s' "$_dist" | jq -r '.severity // "unknown"')
    _urgency=$(printf '%s' "$_dist" | jq -r '.urgency // "unknown"')

    echo "[publish-demo-alerts] Alert $1:"
    echo "[publish-demo-alerts]   Severity: $_severity"
    echo "[publish-demo-alerts]   Urgency: $_urgency"
    echo "[publish-demo-alerts]   Channels:"
    printf '%s' "$_dist" | jq -r '.channels[]? | "     - " + (.label // "unknown") + " (reached: " + (.reached | tostring) + ", rule: " + (.rule // "none") + ")"'
}

# --- main ------------------------------------------------------------------
echo "[publish-demo-alerts] Publishing sample CAP alerts to backend at $URL"
echo "[publish-demo-alerts]"

# The table is fed through a here-doc rather than a pipe on purpose: a pipe
# would run the loop in a subshell, and the `exit 1` calls in publish_alert
# would then only kill the subshell.
PUBLISHED_IDS=""
while IFS='|' read -r _id _severity _urgency _certainty _status _headline _instruction; do
    publish_alert "$_id" "$_severity" "$_urgency" "$_certainty" "$_status" "$_headline" "$_instruction"
    PUBLISHED_IDS="$PUBLISHED_IDS $_id"
done <<EOF
$ALERT_TABLE
EOF

if [ "$DRY_RUN" = "true" ]; then
    echo "[publish-demo-alerts] done (dry run — nothing was posted)."
    exit 0
fi

echo "[publish-demo-alerts]"
echo "[publish-demo-alerts] Distribution:"

# shellcheck disable=SC2086
for _id in $PUBLISHED_IDS; do
    get_distribution "$_id"
    echo ""
done

echo "[publish-demo-alerts] done."
