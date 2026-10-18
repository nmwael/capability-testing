#!/usr/bin/env bats

@test "create worktree" {
  run sh scripts/worktree.sh create_worktree test1 /tmp/work1
  [ "$status" -eq 0 ]
}

@test "enter worktree" {
  run sh scripts/worktree.sh enter_worktree test1 /tmp/work1
  [ "$status" -eq 0 ]
}

@test "remove worktree" {
  run sh scripts/worktree.sh remove_worktree test1 /tmp/work1
  [ "$status" -eq 0 ]
}

@test "reclaim stale lock" {
  mkdir -p .worktrees/test1
  echo "9999" > .worktrees/test1/lock.pid
  run sh scripts/worktree.sh reclaim_worktree test1
  [ "$status" -eq 0 ]
}
