#!/usr/bin/env bats
# publish-demo-alerts.test.bats — test the publish-demo-alerts.sh script

@test "help exits 0 and prints usage" {
    run sh scripts/publish-demo-alerts.sh --help
    [ $status -eq 0 ]
    echo "$output" | grep -q "Usage:"
}

@test "unknown flag exits non-zero" {
    run sh scripts/publish-demo-alerts.sh --unknown
    [ $status -ne 0 ]
}

@test "dry-run exits 0" {
    run sh scripts/publish-demo-alerts.sh --dry-run
    [ $status -eq 0 ]
}

@test "dry-run output contains alert namespace" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -q 'xmlns="urn:oasis:names:tc:emergency:cap:1.2"'
}

@test "dry-run output contains required elements" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -q '<identifier>'
    echo "$output" | grep -q '<sender>'
    echo "$output" | grep -q '<sent>'
}

@test "dry-run output contains per-alert severity for ALERT-004" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -q 'Minor'
}

@test "dry-run output contains per-alert severity for ALERT-001" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -q 'Extreme'
}

@test "dry-run output contains per-alert severity for ALERT-005" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -q 'Unknown'
}

@test "script passes POSIX sh syntax check" {
    run sh -n scripts/publish-demo-alerts.sh
    [ $status -eq 0 ]
}

@test "dry-run XML for ALERT-001 contains Actual status" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -A5 "<identifier>ALERT-001</identifier>" | grep -q "<status>Actual</status>"
}

@test "dry-run XML for ALERT-005 contains Exercise status" {
    run sh scripts/publish-demo-alerts.sh --dry-run 2>&1
    echo "$output" | grep -A5 "<identifier>ALERT-005</identifier>" | grep -q "<status>Exercise</status>"
}
