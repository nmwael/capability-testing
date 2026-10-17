> ## ⛔ FROZEN — moved to GitHub Issues (2026-10-17)
>
> **All work tracking for this repository now lives in
> [GitHub Issues](https://github.com/nmwael/capability-testing/issues).** This document is kept as a
> **historical record only**. It is **frozen** — do not add to it, and do not treat it as the source of
> truth for what is planned, claimed or done; **issues are**.
>
> - Work tracker: <https://github.com/nmwael/capability-testing/issues>
> - Milestones — one per capability: <https://github.com/nmwael/capability-testing/milestones>
> - Labels: `kind:*`, `role:*`, `capability:*`, `hitl:awaiting-approval` / `hitl:approved`
>
> **This is a draft report for an upstream feature repo, not this repo's work.** The text is kept
> verbatim as the draft; if it is filed, it belongs upstream (the `bifrost-gateway` feature), and any
> action on it for *this* repo is tracked as an issue rather than by editing this file.

# Draft upstream issue: `bifrost-gateway` — model swaps leave stale providers and silently serve the wrong model

**Intended target:** the `bifrost-gateway` devcontainer feature
(`ghcr.io/nmwael/agentic-devcontainer-feature/bifrost-gateway:1.1.4`), i.e. the owner of
`write-bifrost-config.sh` and `start-bifrost`. **Not** this repo — no source for those scripts exists
here. This file is a draft issue + proposed patch; it is not a change to this repo.

Status: **observed and reproduced 2026-10-15; local workaround applied; durable fix proposed (untested).**

## Summary

`write-bifrost-config.sh` regenerates bifrost's `config.json` on every boot, but bifrost's **SQLite
config store** (bind-mounted, survives rebuilds) keeps its own copy of providers and keys and is never
reconciled. When the model set changes, providers from the previous set remain in the store. If one of
those stale providers owns the only `enabled` key whose `models` allowlist overlaps a live model id,
requests for the **new** stack are routed to the **old server** — including silently answering with a
*different model* than the one requested.

## Environment

- Feature: `ghcr.io/nmwael/agentic-devcontainer-feature/bifrost-gateway:1.1.4`
- Bifrost: dashboard bundle `index-*.js`, node shim `@maximhq/bifrost/bin.js` → `bifrost-http-0` v2.3.0
- Config store: `config_store` sqlite, `path=/workspaces/capability-testing/config.db`
- Launcher: `start-bifrost` copies the generated config to `~/.config/bifrost/config.json`, then
  `bifrost … -port 8082 -host 0.0.0.0`
- `write-bifrost-config.sh` emits one provider per `stack.json` model, each with a single key
  `{name:"local", value:"no-key", models:["<name>","<name>-s0"], weight:1.0}`.

## Reproduction

Stack had been swapped from `granite-4.2-3b`/`granite-4.2-8b` to `qwen3.5-4b`/`qwen3.5-9b-mtp`; the
generated `config.json` listed **only** the two qwen providers, and the stack was restarted.

```
$ curl -s -H "X-Bifrost-Setup-Token: $TOK" :8082/api/providers | jq -r '.providers[].name'
granite-4.2-3b        # base_url http://127.0.0.1:8089   <- stale
granite-4.2-8b        # base_url http://127.0.0.1:8091   <- stale, no key at all
qwen3.5-4b            # base_url http://127.0.0.1:8089
qwen3.5-9b-mtp        # base_url http://127.0.0.1:8090

$ curl -s -H "X-Bifrost-Setup-Token: $TOK" :8082/api/keys | jq -r '.[] | "\(.provider) \(.models) enabled=\(.enabled)"'
granite-4.2-3b ["qwen3.5-9b-mtp","qwen3.5-9b-mtp-s0"] enabled=true    <- stale key, hijacks live ids
qwen3.5-9b-mtp ["qwen3.5-9b-mtp","qwen3.5-9b-mtp-s0"] enabled=null
qwen3.5-4b     ["qwen3.5-4b","qwen3.5-4b-s0"]         enabled=null
```

Requesting the **coder** model on the new stack:

```
$ curl -s :8082/v1/chat/completions -d '{"model":"qwen3.5-9b-mtp-s0", …}' \
  | jq '{model, routing: .extra_fields.routing_info}'
{ "model": "qwen3.5-4b",                                    # ← wrong model served
  "routing": { "provider": "granite-4.2-3b", "model": "qwen3.5-9b-mtp-s0", "key": "local",
               "requested_model": "qwen3.5-9b-mtp-s0" } }   # → http://127.0.0.1:8089
```

Requesting the **new architect** model:

```
$ curl -s :8082/v1/chat/completions -d '{"model":"qwen3.5-4b-s0", …}'
{"error":{"message":"no keys found for provider: granite-4.2-8b and model: qwen3.5-4b-s0", …}}
```

So `qwen3.5-9b-mtp-s0` was silently answered by the **4B** model (the stale key pointed at `:8089`),
and `qwen3.5-4b-s0` resolved to nothing. Both failures are invisible to the client: no error in the
first case, a misleading provider name in the second.

## Root cause (as observed)

1. The config **file** is not authoritative after first import — the sqlite store accumulates. Removing
   a model from `stack.json` does not remove its provider/key from `config.db`.
2. Every generated key is named `local`; keys imported from the file come back with `enabled` **unset**,
   while a key that was once saved through the dashboard is `enabled:true`. Unqualified model
   resolution then depends on whichever enabled key overlaps, i.e. it is order/state dependent, not
   config-derived.
3. `write-bifrost-config.sh` has no reconcile/prune step and no API call, so nothing removes (1).

## Impact

Silent **wrong-model substitution** at the gateway — the worst failure mode for an agent stack, because
every downstream verdict (model trials, capability tests, code reviews run by these agents) is
attributed to the wrong model. It also makes otherwise-fine models look broken (the architect's
`qwen3.5-4b` "failure" was purely this bug).

## Verified workaround (applied here)

Delete providers not present in the current `stack.json`, using the dashboard API + setup token:

```sh
TOK=$(jq -r .setup_token /usr/local/share/llm-lab/bifrost/config/bifrost.json)
curl -s -X DELETE -H "X-Bifrost-Setup-Token: $TOK" http://127.0.0.1:8082/api/providers/granite-4.2-3b
curl -s -X DELETE -H "X-Bifrost-Setup-Token: $TOK" http://127.0.0.1:8082/api/providers/granite-4.2-8b
```

After this, `qwen3.5-4b-s0 → provider qwen3.5-4b` and `qwen3.5-9b-mtp-s0 → provider qwen3.5-9b-mtp`.
Other endpoints seen in the dashboard bundle: `GET/POST /api/providers`, `PUT/DELETE
/api/providers/{name}`, `GET/POST /api/providers/{name}/keys`, and `DELETE
/api/providers/{name}/keys/{keyId}`.

## Proposed durable fix (options; not yet tested)

**A. Reconcile in `write-bifrost-config.sh` (preferred).** After writing `config.json`, diff the store
against `stack.json` and delete stale providers via the API (`X-Bifrost-Setup-Token`), retrying until
bifrost is up. Skeleton:

```sh
# after materializing $OUT_FILE, once bifrost answers on :8082
TOKEN="$(jq -r .setup_token "$OUT_FILE")"
have="$(curl -sf -H "X-Bifrost-Setup-Token: $TOKEN" "$BIFROST_URL/api/providers" \
        | jq -r '.providers[].name')"
want="$(jq -r '.models[].name' "$STACK_FILE")"
for p in $have; do
    grep -qx "$p" <<EOF || curl -sf -X DELETE -H "X-Bifrost-Setup-Token: $TOKEN" \
        "$BIFROST_URL/api/providers/$p" && echo "[bifrost] pruned stale provider $p"
$want
EOF
done
```

**B. Make keys unambiguous.** Emit `name: "local-<model>"` (unique per provider) and `"enabled": true`
so unqualified resolution is fully determined by the file rather than by store history.

**C. Last resort — reset the store on model-set change.** Detect a `stack.json` hash change and move
`config.db*` aside before starting bifrost, so it re-imports cleanly. Cheap and total, but discards
dashboard/governance state.

## Detection tip (worth documenting regardless)

After any model swap, assert the route before trusting results:

```sh
curl -s :8082/v1/chat/completions -d '{"model":"<id>-s0","max_tokens":8,
  "messages":[{"role":"user","content":"hi"}]}' | jq -r .extra_fields.routing_info.provider
```

A mismatch between `routing_info.provider` and the expected provider must be treated as a **hard error**,
not a warning.
