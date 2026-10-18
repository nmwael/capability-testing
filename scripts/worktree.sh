#!/bin/sh

# Worktree management script for POSIX sh
# Manages git worktrees with PID-based locking per task_id

WORKTREE_BASE="${WORKTREE_BASE:-$(pwd)/.worktrees}"
LOCK_DIR="${LOCK_DIR:-$(pwd)/.worktrees}"

# =============================================================================
# create: create .worktrees/<task_id> directory and lock.pid with $$
# =============================================================================
create_worktree() {
    _task_id="$1"
    _path="$2"

    if [ -z "$_task_id" ] || [ -z "$_path" ]; then
        echo "Usage: create_worktree <task_id> <path>" >&2
        return 1
    fi

    _lock_dir="${LOCK_DIR}/${_task_id}"

    if [ -d "$_lock_dir" ]; then
        echo "Error: task_id $_task_id already exists" >&2
        return 1
    fi

    mkdir -p "$_lock_dir"

    _lock_file="${_lock_dir}/lock.pid"
    echo "$$" > "$_lock_file"

    echo "Created worktree $_task_id at $_path"
    return 0
}

# =============================================================================
# enter: git worktree add .worktrees/<task_id> <path>; verify lock; check lock
# =============================================================================
enter_worktree() {
    _task_id="$1"
    _path="$2"

    if [ -z "$_task_id" ] || [ -z "$_path" ]; then
        echo "Usage: enter_worktree <task_id> <path>" >&2
        return 1
    fi

    _lock_dir="${LOCK_DIR}/${_task_id}"

    if [ ! -d "$_lock_dir" ]; then
        echo "Error: worktree $_task_id does not exist" >&2
        return 1
    fi

    _lock_file="${_lock_dir}/lock.pid"

    if [ ! -f "$_lock_file" ]; then
        echo "Error: lock.pid missing for $_task_id" >&2
        return 1
    fi

    _current_pid="$$(cat "$_lock_file")"

    if kill -0 "$_current_pid" 2>/dev/null; then
        echo "Error: worktree $_task_id is locked by PID $_current_pid" >&2
        return 1
    fi

    # Clean up stale lock if needed
    rm -f "$_lock_file"
    echo "$$" > "$_lock_file"

    # Create worktree - path basename becomes branch name if no commit-ish specified
    git worktree add "$_path" >/dev/null 2>&1

    echo "Entered worktree $_task_id at $_path"
    return 0
}

# =============================================================================
# remove: git worktree remove .worktrees/<task_id>; remove lock.pid if stale
# =============================================================================
remove_worktree() {
    _task_id="$1"
    _path="$2"

    if [ -z "$_task_id" ]; then
        echo "Usage: remove_worktree <task_id> <path>" >&2
        return 1
    fi

    _lock_dir="${LOCK_DIR}/${_task_id}"

    if [ ! -d "$_lock_dir" ]; then
        echo "Error: worktree $_task_id does not exist" >&2
        return 1
    fi

    _lock_file="${_lock_dir}/lock.pid"

    if [ -f "$_lock_file" ]; then
        _old_pid="$$(cat "$_lock_file")"
        if ! kill -0 "$_old_pid" 2>/dev/null; then
            rm -f "$_lock_file"
        fi
    fi

    git worktree remove "$_path" 2>/dev/null || true

    rmdir "$_lock_dir" 2>/dev/null || true

    echo "Removed worktree $_task_id"
    return 0
}

# =============================================================================
# reclaim: check lock.pid PID; if dead, remove lock; if alive, error
# =============================================================================
reclaim_worktree() {
    _task_id="$1"

    if [ -z "$_task_id" ]; then
        echo "Usage: reclaim_worktree <task_id>" >&2
        return 1
    fi

    _lock_dir="${LOCK_DIR}/${_task_id}"

    if [ ! -d "$_lock_dir" ]; then
        echo "Error: worktree $_task_id does not exist" >&2
        return 1
    fi

    _lock_file="${_lock_dir}/lock.pid"

    if [ ! -f "$_lock_file" ]; then
        echo "No lock file found for $_task_id" >&2
        return 0
    fi

    _held_pid="$$(cat "$_lock_file")"

    if kill -0 "$_held_pid" 2>/dev/null; then
        echo "Worktree $_task_id is actively locked by PID $_held_pid" >&2
        return 1
    else
        rm -f "$_lock_file"
        echo "Reclaimed lock for $_task_id (old PID $_held_pid was dead)" >&2
        return 0
    fi
}

# =============================================================================
# Usage
# =============================================================================
usage() {
    cat <<EOF
Usage:
  create_worktree <task_id> <path>   - Create new worktree with lock
  enter_worktree <task_id> <path>    - Enter existing worktree
  remove_worktree <task_id> <path>   - Remove worktree and clean lock
  reclaim_worktree <task_id>         - Check and reclaim stale lock

Lock file: .worktrees/<task_id>/lock.pid
EOF
}

# If script is run directly with no arguments, show usage
if [ $# -eq 0 ]; then
    usage
    exit 1
fi

# Dispatch based on first argument
case "$1" in
    create_worktree)
        shift
        create_worktree "$@"
        ;;
    enter_worktree)
        shift
        enter_worktree "$@"
        ;;
    remove_worktree)
        shift
        remove_worktree "$@"
        ;;
    reclaim_worktree)
        shift
        reclaim_worktree "$@"
        ;;
    *)
        echo "Error: unknown command '$1'" >&2
        usage
        exit 1
        ;;
esac