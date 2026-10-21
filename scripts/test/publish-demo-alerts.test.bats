#!/usr/bin/env bats
# publish-demo-alerts.test.bats — test the publish-demo-alerts.sh script.
#
# The script is invoked through its own shebang (./publish-demo-alerts.sh) so
# the executable path is exercised, not just `sh script`. The end-to-end cases
# run against a stub backend (scripts/test/fixtures/stub-alerts-server.py), so
# no live backend is required.

setup() {
    SCRIPT="./scripts/publish-demo-alerts.sh"
    STUB="scripts/test/fixtures/stub-alerts-server.py"
    STUB_PID=""
    STUB_PORT=""
}

teardown() {
    if [ -n "$STUB_PID" ]; then
        kill "$STUB_PID" 2>/dev/null || true
        STUB_PID=""
    fi
}

free_port() {
    python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"
}

# Start the stub backend and wait until it answers.
start_stub() {
    STUB_PORT=$(free_port)
    python3 "$STUB" "$STUB_PORT" >/dev/null 2>&1 &
    STUB_PID=$!
    _i=0
    while [ "$_i" -lt 100 ]; do
        if curl -s -o /dev/null "http://127.0.0.1:$STUB_PORT/alerts/ALERT-001/distribution"; then
            return 0
        fi
        sleep 0.1
        _i=$((_i + 1))
    done
    return 1
}

# --- argument handling -----------------------------------------------------

@test "help exits 0 and prints usage" {
    run "$SCRIPT" --help
    [ $status -eq 0 ]
    echo "$output" | grep -q "Usage:"
}

@test "unknown flag exits non-zero" {
    run "$SCRIPT" --unknown
    [ $status -ne 0 ]
    echo "$output" | grep -q "unknown option"
}

@test "--url without a value exits non-zero" {
    run "$SCRIPT" --url
    [ $status -ne 0 ]
    echo "$output" | grep -q "requires a base URL value"
}

@test "--url with a flag instead of a value exits non-zero" {
    run "$SCRIPT" --url --dry-run
    [ $status -ne 0 ]
    echo "$output" | grep -q "requires a base URL value"
}

@test "--url value is used for the backend" {
    run "$SCRIPT" --url http://127.0.0.1:9999 --dry-run
    [ $status -eq 0 ]
    echo "$output" | grep -q "backend at http://127.0.0.1:9999"
}

@test "CAP_ALERTS_URL is used when --url is absent" {
    CAP_ALERTS_URL=http://127.0.0.1:9998 run "$SCRIPT" --dry-run
    [ $status -eq 0 ]
    echo "$output" | grep -q "backend at http://127.0.0.1:9998"
}

# --- dry run ---------------------------------------------------------------

@test "dry-run exits 0" {
    run "$SCRIPT" --dry-run
    [ $status -eq 0 ]
}

@test "dry-run output contains alert namespace" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -q 'xmlns="urn:oasis:names:tc:emergency:cap:1.2"'
}

@test "dry-run output contains required elements" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -q '<identifier>'
    echo "$output" | grep -q '<sender>'
    echo "$output" | grep -q '<sent>'
}

@test "dry-run output contains per-alert severity for ALERT-004" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -q 'Minor'
}

@test "dry-run output contains per-alert severity for ALERT-001" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -q 'Extreme'
}

@test "dry-run output contains per-alert severity for ALERT-005" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -q 'Unknown'
}

@test "dry-run XML for ALERT-001 contains Actual status" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -A5 "<identifier>ALERT-001</identifier>" | grep -q "<status>Actual</status>"
}

@test "dry-run XML for ALERT-005 contains Exercise status" {
    run "$SCRIPT" --dry-run 2>&1
    echo "$output" | grep -A5 "<identifier>ALERT-005</identifier>" | grep -q "<status>Exercise</status>"
}

@test "dry-run does not contact the backend" {
    run "$SCRIPT" --dry-run --url http://127.0.0.1:1
    [ $status -eq 0 ]
    ! echo "$output" | grep -q "accepted and stored"
    ! echo "$output" | grep -q "Distribution:"
}

# --- failure modes ---------------------------------------------------------

@test "unreachable backend fails with a message naming the URL" {
    _port=$(free_port)
    run "$SCRIPT" --url "http://127.0.0.1:$_port" 2>&1
    [ $status -ne 0 ]
    echo "$output" | grep -q "cannot reach the backend at http://127.0.0.1:$_port"
}

@test "unreachable backend does not exit with a bare curl code" {
    _port=$(free_port)
    run "$SCRIPT" --url "http://127.0.0.1:$_port" 2>&1
    [ $status -eq 1 ]
}

# --- end to end against the stub backend ------------------------------------

@test "publishes all five alerts and prints their distributions" {
    start_stub
    [ -n "$STUB_PID" ]
    run "$SCRIPT" --url "http://127.0.0.1:$STUB_PORT"
    [ $status -eq 0 ]
    echo "$output" | grep -q "ALERT-001 accepted and stored"
    echo "$output" | grep -q "ALERT-005 accepted and stored"
    echo "$output" | grep -q "Severity: Extreme"
    echo "$output" | grep -q "Severity: Severe"
    echo "$output" | grep -q "Severity: Moderate"
    echo "$output" | grep -q "Severity: Minor"
    echo "$output" | grep -q "Severity: Unknown"
    echo "$output" | grep -q "Urgency: Immediate"
    echo "$output" | grep -q "email (reached: 3, rule: R-EMAIL)"
}

@test "re-running against the same backend is idempotent" {
    start_stub
    run "$SCRIPT" --url "http://127.0.0.1:$STUB_PORT"
    [ $status -eq 0 ]
    run "$SCRIPT" --url "http://127.0.0.1:$STUB_PORT"
    [ $status -eq 0 ]
    echo "$output" | grep -q "ALERT-001 accepted and stored"
}

@test "the POSTed bytes are identical to the dry-run XML" {
    STUB_RECORD_FILE="${BATS_TEST_TMPDIR:-/tmp}/recorded-alerts.txt"
    rm -f "$STUB_RECORD_FILE"
    export STUB_RECORD_FILE

    start_stub

    run "$SCRIPT" --dry-run --url "http://127.0.0.1:$STUB_PORT"
    [ $status -eq 0 ]
    dry_xml=$(echo "$output" | grep -m1 '^<alert xmlns=')

    run "$SCRIPT" --url "http://127.0.0.1:$STUB_PORT"
    [ $status -eq 0 ]
    posted_xml=$(head -1 "$STUB_RECORD_FILE")

    [ -n "$dry_xml" ]
    [ "$dry_xml" = "$posted_xml" ]
}

# --- static checks ---------------------------------------------------------

@test "script passes POSIX sh syntax check" {
    run sh -n "$SCRIPT"
    [ $status -eq 0 ]
}

@test "script passes shellcheck" {
    run shellcheck -s sh "$SCRIPT"
    [ $status -eq 0 ]
}
