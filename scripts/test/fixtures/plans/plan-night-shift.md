# Night Shift Plan — missing wait line should be WARN, not blocking

---

## PROPOSED CHANGE

Add a `--dry-run` flag to `scripts/fetch.sh` so that dry actions (e.g. `print-action`) output without writing to disk.

---

## TESTS

- `dash -n scripts/fetch.sh` exits 0
- `bats test/fetch.bats` passes
- `git status` shows no stray files

---

## SUBTASKS

1. Add `--dry-run` case to scripts/fetch.sh
2. Update test/fetch.bats with three cases

---

## COORDINATES

- `scripts/fetch.sh`
- `test/fetch.bats`

---

## CONSTRAINTS

- POSIX sh only
- No new tools or packages

---

## VERDICT

This plan is auditable and does not require human approval during Night Shift.