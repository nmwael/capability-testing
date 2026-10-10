#!/usr/bin/env bash
# use-profile.sh <cap|q> — switch the active local LLM profile.
#
# Rewrites the models feature's input files, re-materializes the derived configs
# (bifrost upstreams, opencode providers) from the shared manifest, and stops the
# currently running servers so the new profile can take over. Only one profile
# runs at a time. The manifest is the single source of truth: everything else is
# regenerated from it so the model-id <-> --alias <-> bifrost routing prefix
# cannot drift apart.
set -euo pipefail

PROFILE="${1:-}"
case "$PROFILE" in
cap | q | gemma) ;;
*)
    echo "usage: bash scripts/use-profile.sh <cap|q|gemma>" >&2
    exit 1
    ;;
esac

ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"
MODELS_FILE="$ROOT/.devcontainer/llm-lab-models.json"
ROLES_FILE="$ROOT/.devcontainer/llm-lab-roles.json"
ACTIVE="$ROOT/.devcontainer/active-profile"
STACK=/usr/local/share/llm-lab/stack.json

command -v jq >/dev/null 2>&1 || {
    echo "ERROR: jq is required (apt-get-packages feature)" >&2
    exit 1
}

MODELS_SRC="$ROOT/profiles/combo-$PROFILE.json"
ROLES_SRC="$ROOT/profiles/roles-$PROFILE.json"
[ -f "$MODELS_SRC" ] || {
    echo "ERROR: missing $MODELS_SRC" >&2
    exit 1
}
[ -f "$ROLES_SRC" ] || {
    echo "ERROR: missing $ROLES_SRC" >&2
    exit 1
}

# --- Stop the currently running servers ---------------------------------------
# They hold VRAM, and a stale server on :8089 would collide with the new profile.
# bifrost only reads its config at start (and opencode caches providers), so both
# must be restarted for a profile switch to take effect.
PORTS="$(jq -r '.models[].port' "$STACK" 2>/dev/null || true)"
[ -n "$PORTS" ] || PORTS="8089 8090"
for port in $PORTS; do
    if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$port/health" 2>/dev/null; then
        pid="$(pgrep -f "llama-server.*--port $port" | head -1 || true)"
        echo "[use-profile] stopping llama-server on :$port${pid:+ (pid $pid)}"
        [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
    fi
done

for pat in 'bifrost/bin.js' 'opencode serve'; do
    pids="$(pgrep -f "$pat" || true)"
    if [ -n "$pids" ]; then
        echo "[use-profile] stopping '$pat'"
        for p in $pids; do kill "$p" 2>/dev/null || true; done
    fi
done
sleep 2

# --- Rewrite the feature input files ------------------------------------------
mkdir -p "$ROOT/.devcontainer"
cp -f "$MODELS_SRC" "$MODELS_FILE"
cp -f "$ROLES_SRC" "$ROLES_FILE"
printf '%s\n' "$PROFILE" >"$ACTIVE"
echo "[use-profile] profile '$PROFILE' written to .devcontainer/llm-lab-{models,roles}.json"

# --- Rebuild stack.json from the profile --------------------------------------
if [ -f /usr/local/share/llm-lab/models/resolve-stack.sh ]; then
    sh /usr/local/share/llm-lab/models/resolve-stack.sh "$ROOT"
    echo "[use-profile] rewrote $STACK via resolve-stack.sh"
else
    # Fallback: write the same shape install.sh writes, then derive the configs.
    jq -n \
        --argjson m "$(jq -c . "$MODELS_FILE")" \
        --argjson r "$(jq -c . "$ROLES_FILE")" \
        --arg md "${MODELS_DIR:-$ROOT/models}" \
        '{
            schema: 1,
            notation: "roles -> (model, slot); model id = provider/name[-s{slot}]",
            models_dir: $md,
            bifrost_port: 8082,
            opencode_port: 4096,
            subagent_depth: 2,
            cloud: false,
            cloud_provider: "opencode",
            models: $m,
            roles: $r
        }' >"$STACK"
    echo "[use-profile] rewrote $STACK"
fi

# --- Regenerate the derived configs -------------------------------------------
BF="/usr/local/share/llm-lab/bifrost"
if [ -x "$BF/write-bifrost-config.sh" ]; then
    "$BF/write-bifrost-config.sh" "$STACK" "$BF/config/bifrost.json" 8089
else
    echo "[use-profile] WARNING: write-bifrost-config.sh not found — bifrost routing stale"
fi

OA="/usr/local/share/opencode-agents"
if [ -x "$OA/generate-opencode.sh" ]; then
    sh "$OA/generate-opencode.sh" "$STACK" "$ROOT/opencode.json"
else
    echo "[use-profile] WARNING: generate-opencode.sh not found — opencode.json stale"
fi

# --- Fetch any newly-referenced weights ----------------------------------------
if [ -x "$ROOT/scripts/fetch-models.sh" ]; then
    echo "[use-profile] fetching model weights (idempotent, skips existing files)..."
    bash "$ROOT/scripts/fetch-models.sh"
else
    echo "[use-profile] WARNING: scripts/fetch-models.sh not found — install models manually"
fi

echo "[use-profile] done."
echo "Next: bash scripts/auto-startup.sh"
