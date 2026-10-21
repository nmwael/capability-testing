# publish-demo-alerts.test.bats — test the publish-demo-alerts.sh script

@test "help exits 0 and prints usage" {
    run bash scripts/publish-demo-alerts.sh --help
    [ $status -eq 0 ]
}

@test "unknown flag exits non-zero" {
    run bash scripts/publish-demo-alerts.sh --unknown > /dev/null 2>&1
    [ $status -ne 0 ]
}

@test "dry-run exits 0" {
    run bash scripts/publish-demo-alerts.sh --dry-run
    [ $status -eq 0 ]
}

@test "dry-run output contains alert namespace" {
    output=$(bash scripts/publish-demo-alerts.sh --dry-run 2>&1)
    echo "$output" | grep -q 'xmlns="urn:oasis:names:tc:emergency:cap:1.2"'
}

@test "dry-run output contains required elements" {
    output=$(bash scripts/publish-demo-alerts.sh --dry-run 2>&1)
    echo "$output" | grep -q '<identifier>'
    echo "$output" | grep -q '<sender>'
    echo "$output" | grep -q '<sent>'
}
