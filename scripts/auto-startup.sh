#!/usr/bin/env bash
# auto-startup.sh — postStartCommand. Launches one llama-server per model in
# stack.json (orchestrator :8089, coder :8090), the bifrost gateway (:8082) and
# opencode serve (:4096). Idempotent: every step checks "already running".
#
# No feature installs this script — the feature collection ships the installers,
# not the orchestration. Consumers own their own copy.
set -euo pipefail

ROOT="${STACK_ROOT:-$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)}"
STACK_JSON="${STACK_JSON:-/usr/local/share/llm-lab/stack.json}"
# Mirror the feature's precedence: explicit env > stack.json models_dir > $ROOT/models,
# so a custom STACK_JSON does not silently point at the wrong models directory.
if [ -z "${MODELS_DIR:-}" ] && [ -f "$STACK_JSON" ]; then
    _md="$(jq -r '.models_dir // empty' "$STACK_JSON" 2>/dev/null || true)"
    [ -n "$_md" ] && MODELS_DIR="$_md"
fi
MODELS_DIR="${MODELS_DIR:-$ROOT/models}"
BIFROST_PORT="${BIFROST_PORT:-8082}"
OPENCODE_PORT="${OPENCODE_PORT:-4096}"

echo "[auto-startup] workspace=$ROOT models=$MODELS_DIR"

if [ -n "${SKIP_LLAMA_START:-}" ]; then
    echo "[auto-startup] SKIP_LLAMA_START set — skipping llama-server"
elif [ ! -f "$STACK_JSON" ]; then
    echo "[auto-startup] WARNING: no manifest at $STACK_JSON — nothing to serve."
    echo "[auto-startup]         Build the container, or run scripts/use-profile.sh."
else
    count="$(jq '.models | length' "$STACK_JSON")"
    echo "[auto-startup] starting $count llama-server(s)"

    i=0
    while [ "$i" -lt "$count" ]; do
        name="$(jq -r ".models[$i].name" "$STACK_JSON")"
        hf="$(jq -r ".models[$i].hf" "$STACK_JSON")"
        quant="$(jq -r ".models[$i].quant" "$STACK_JSON")"
        port="$(jq -r ".models[$i].port" "$STACK_JSON")"
        ctx="$(jq -r ".models[$i].context" "$STACK_JSON")"
        par="$(jq -r ".models[$i].parallel // 3" "$STACK_JSON")"
        kv_k="$(jq -r ".models[$i].kv_cache_type_k // empty" "$STACK_JSON")"
        kv_v="$(jq -r ".models[$i].kv_cache_type_v // empty" "$STACK_JSON")"
        st="$(jq -r ".models[$i].spec_type // empty" "$STACK_JSON")"
        sn="$(jq -r ".models[$i].spec_draft_n_max // empty" "$STACK_JSON")"
        ct="$(jq -r ".models[$i].chat_template // empty" "$STACK_JSON")"

        # KV cache dominates VRAM at long context (measured ~0.5 MiB/token at f16),
        # so it is opt-in per model rather than hardcoded.
        kv_args=()
        [ -n "$kv_k" ] && kv_args+=(--cache-type-k "$kv_k")
        [ -n "$kv_v" ] && kv_args+=(--cache-type-v "$kv_v")

        # Speculative decoding is opt-in too; absent spec_type keeps argv unchanged.
        spec_args=()
        case "$st" in
        "") ;;
        draft-mtp)
            spec_args+=(--spec-type draft-mtp)
            [ -n "$sn" ] && spec_args+=(--spec-draft-n-max "$sn")
            ;;
        *)
            echo "WARNING: unsupported spec_type '$st' on '$name' — ignoring" >&2
            ;;
        esac

        ct_args=()
        [ -n "$ct" ] && ct_args+=(--chat-template "$ct")

        # Same glob the feature's fetcher names files for: *<hf / -> _>*<quant>*.gguf
        slug="$(printf '%s' "$hf" | tr '/' '_')"
        model_file=""
        if ls "$MODELS_DIR"/*"$slug"*"$quant"*.gguf >/dev/null 2>&1; then
            model_file="$(ls "$MODELS_DIR"/*"$slug"*"$quant"*.gguf | head -1)"
        elif ls "$MODELS_DIR"/*"$name"*.gguf >/dev/null 2>&1; then
            model_file="$(ls "$MODELS_DIR"/*"$name"*.gguf | head -1)"
        fi

        if [ -z "$model_file" ]; then
            echo "[auto-startup] WARNING: no .gguf for '$name' in $MODELS_DIR — skipping"
            echo "[auto-startup]          run: bash scripts/fetch-models.sh"
        elif curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$port/health"; then
            echo "[auto-startup] llama-server already up on :$port ($name)"
        elif ! command -v llama-server >/dev/null 2>&1; then
            echo "[auto-startup] WARNING: llama-server binary missing — is the feature installed?"
        else
            # --alias must equal models[].name: it is the model id opencode pins
            # and the prefix bifrost routes on ("{name}*"). A mismatch 404s.
            echo "[auto-startup] starting $name on :$port (ctx=$ctx slots=$par kv=${kv_k:-f16}/${kv_v:-f16} spec=${st:-none})"
            nohup llama-server -m "$model_file" --host 0.0.0.0 --port "$port" \
                --jinja \
                --ctx-size "$ctx" --alias "$name" --parallel "$par" \
                ${kv_args[@]+"${kv_args[@]}"} \
                ${spec_args[@]+"${spec_args[@]}"} \
                ${ct_args[@]+"${ct_args[@]}"} \
                >"/tmp/llama-server-$name.log" 2>&1 &

            ready=false
            n=0
            # Cold loads of multi-GB weights from disk routinely take 30-60s.
            while [ "$n" -lt 45 ]; do
                if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$port/health"; then
                    ready=true
                    break
                fi
                n=$((n + 1))
                sleep 2
            done
            if [ "$ready" = true ]; then
                echo "[auto-startup] $name ready on :$port"
            else
                echo "[auto-startup] WARNING: $name not ready after 90s — see /tmp/llama-server-$name.log"
            fi
        fi
        i=$((i + 1))
    done
fi

# --- Self-heal bifrost routing from the manifest ------------------------------
# bifrost bakes routing at build time; if it was materialized against a
# cloud/empty stack.json it keeps the legacy single-upstream catch-all and every
# model id (e.g. the coder's "<name>-s0") is served by the orchestrator's
# upstream. Re-resolve the manifest and re-materialize config/bifrost.json on
# every start so model-id routing cannot drift from the manifest.
if [ -f "$STACK_JSON" ]; then
    _cloud="$(jq -r '.cloud // false' "$STACK_JSON" 2>/dev/null || echo false)"
    _nmodels="$(jq -r '.models | length' "$STACK_JSON" 2>/dev/null || echo 0)"
    if [ "$_cloud" = "true" ] || [ "${_nmodels:-0}" = "0" ]; then
        if [ -f "$ROOT/.devcontainer/llm-lab-models.json" ] && [ -x /usr/local/share/llm-lab/models/resolve-stack.sh ]; then
            echo "[auto-startup] stack.json has no local models — re-resolving from workspace profile"
            sh /usr/local/share/llm-lab/models/resolve-stack.sh "$ROOT" || \
                echo "[auto-startup] WARNING: resolve-stack.sh failed — routing may be stale"
        else
            echo "[auto-startup] WARNING: stack.json is cloud/empty and no workspace profile to resolve — routing may be stale"
        fi
    fi
fi

BIFROST_CFG_SCRIPT=/usr/local/share/llm-lab/bifrost/write-bifrost-config.sh
BIFROST_CFG=/usr/local/share/llm-lab/bifrost/config/bifrost.json
if [ -x "$BIFROST_CFG_SCRIPT" ] && [ -f "$STACK_JSON" ] && [ "$(jq -r '.cloud // false' "$STACK_JSON" 2>/dev/null || echo false)" != "true" ]; then
    _bf_before="$(sha256sum "$BIFROST_CFG" 2>/dev/null | cut -d' ' -f1 || true)"
    "$BIFROST_CFG_SCRIPT" "$STACK_JSON" "$BIFROST_CFG" 8089 >/dev/null || \
        echo "[auto-startup] WARNING: bifrost config refresh failed — routing may be stale"
    _bf_after="$(sha256sum "$BIFROST_CFG" 2>/dev/null | cut -d' ' -f1 || true)"
    if [ -n "$_bf_before" ] && [ "$_bf_before" != "$_bf_after" ] && command -v pgrep >/dev/null 2>&1; then
        _bf_pids="$(pgrep -f 'bifrost/bin.js' || true)"
        if [ -n "$_bf_pids" ]; then
            echo "[auto-startup] bifrost routing changed — restarting gateway"
            for _p in $_bf_pids; do kill "$_p" 2>/dev/null || true; done
            sleep 2
        fi
    fi
fi

# --- bifrost gateway: routes each model id to its upstream by name prefix -----
if [ -f "$STACK_JSON" ]; then
    BIFROST_PORT="$(jq -r '.bifrost_port // 8082' "$STACK_JSON")"
    OPENCODE_PORT="$(jq -r '.opencode_port // 4096' "$STACK_JSON")"
fi
if command -v start-bifrost >/dev/null 2>&1; then
    if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$BIFROST_PORT/"; then
        echo "[auto-startup] bifrost already up on :$BIFROST_PORT"
    else
        echo "[auto-startup] starting bifrost on :$BIFROST_PORT (background)"
        nohup start-bifrost >/tmp/bifrost.log 2>&1 &
        n=0
        while [ "$n" -lt 30 ]; do
            curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$BIFROST_PORT/" && break
            n=$((n + 1))
            sleep 2
        done
    fi
else
    echo "[auto-startup] bifrost launcher not installed — skipping"
fi

# --- opencode serve (mobile / remote control) ---------------------------------
if command -v opencode >/dev/null 2>&1; then
    if curl -sf -o /dev/null --max-time 2 "http://127.0.0.1:$OPENCODE_PORT/"; then
        echo "[auto-startup] opencode serve already up on :$OPENCODE_PORT"
    else
        echo "[auto-startup] starting opencode serve on :$OPENCODE_PORT"
        nohup opencode serve --port "$OPENCODE_PORT" --hostname 0.0.0.0 >/tmp/opencode-serve.log 2>&1 &
        sleep 2
    fi
else
    echo "[auto-startup] opencode CLI not installed — skipping"
fi

# --- llama watchdog (/health stays green while generation collapses) ----------
# A server decoding at ~0.1 tok/s still answers /health in milliseconds, so
# every agent turn would burn opencode's provider timeout instead of failing
# fast. Two over-budget probes while idle recycle the server through this same
# idempotent starter (WATCHDOG_RESTART points back at it); see
# scripts/llama-watchdog.sh for the probe/confirm/ledger rules. The
# pgrep pattern is anchored to the bare (argless) invocation so a
# concurrent --probe/--once run is not mistaken for the daemon.
SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" 2>/dev/null && pwd) || SCRIPT_DIR="$PWD"
SCRIPT_PATH="$SCRIPT_DIR/auto-startup.sh"
WATCHDOG_BIN=""
if command -v llama-watchdog >/dev/null 2>&1; then
    WATCHDOG_BIN="$(command -v llama-watchdog)"
elif [ -f "$SCRIPT_DIR/llama-watchdog.sh" ]; then
    WATCHDOG_BIN="$SCRIPT_DIR/llama-watchdog.sh"
fi
if [ -z "$WATCHDOG_BIN" ]; then
    echo "[auto-startup] llama-watchdog not installed — skipping (needs llama-server >= 1.0.5)"
elif command -v pgrep >/dev/null 2>&1 && pgrep -f 'llama-watchdog(\.sh)?$' >/dev/null 2>&1; then
    echo "[auto-startup] llama watchdog already running"
else
    echo "[auto-startup] starting llama watchdog (interval=${WATCHDOG_INTERVAL:-120}s budget=${WATCHDOG_BUDGET:-30}s)"
    WATCHDOG_RESTART="bash $SCRIPT_PATH" nohup sh "$WATCHDOG_BIN" >>/tmp/llama-watchdog.log 2>&1 &
fi

echo "[auto-startup] done."
