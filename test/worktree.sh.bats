#!/usr/bin/env bats

# =============================================================================
# Test 1: create_worktree - create and remove worktree, idempotent
# =============================================================================
@test "create_worktree creates and removes worktree" {
  run sh scripts/worktree.sh create_worktree 001 /tmp/work1
  [ "$status" -eq 0 ]
  [ -d /tmp/work1 ]
  
  run sh scripts/worktree.sh remove_worktree 001 /tmp/work1
  [ "$status" -eq 0 ]
  [ ! -d /tmp/work1 ]
  
  # Teardown: ensure .worktrees/001 is removed
  rm -rf .worktrees/001 2>/dev/null || true
}

# =============================================================================
# Test 2: enter_worktree - create, enter, and remove worktree
# =============================================================================
@test "enter_worktree enters and removes worktree" {
  run sh scripts/worktree.sh create_worktree 002 /tmp/work2
  [ "$status" -eq 0 ]
  
  run sh scripts/worktree.sh enter_worktree 002 /tmp/work2
  [ "$status" -eq 0 ]
  
  run sh scripts/worktree.sh remove_worktree 002 /tmp/work2
  [ "$status" -eq 0 ]
  [ ! -d /tmp/work2 ]
  
  # Teardown
  rm -rf .worktrees/002 2>/dev/null || true
}

# =============================================================================
# Test 3: live guard - second claim by live owner refused
# =============================================================================
@test "live guard refuses second claim by live owner" {
  run sh scripts/worktree.sh create_worktree 003 /tmp/work3
  [ "$status" -eq 0 ]
  
  run sh scripts/worktree.sh create_worktree 003 /tmp/work3
  [ "$status" -eq 1 ]
  
  # Teardown: remove the created worktree
  rm -rf .worktrees/003 /tmp/work3 2>/dev/null || true
}

# =============================================================================
# Test 4: dead reclaim - stale (dead-PID) lock is reclaimable
# =============================================================================
@test "dead reclaim reclaims stale lock" {
  mkdir -p .worktrees/004
  touch .worktrees/004/lock.pid
  echo "9999" > .worktrees/004/lock.pid
  
  run sh scripts/worktree.sh reclaim_worktree 004
  [ "$status" -eq 0 ]
  
  run sh scripts/worktree.sh remove_worktree 004 /tmp/work4
  [ "$status" -eq 0 ]
  [ ! -d .worktrees/004 ]
  
  # Teardown: ensure /tmp/work4 is removed if it exists
  rm -rf /tmp/work4 2>/dev/null || true
}
