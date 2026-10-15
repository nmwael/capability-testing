# MODEL-CANDIDATES.md — architect-seat candidate survey

**Purpose.** A one-shot, evidence-backed survey of small GGUF models that could sit in the
`architect` seat, so each can be tried end to end through the pipeline. Companion to
`MODEL-JOURNAL.md` (which records verdicts); this file records the *field* and how to test it.
Compiled **2026-10-15** during the `qwen3.5-4b` (trial 8) session.

**Method / sources (all data fetched, not recalled):**

- Hugging Face API — `https://huggingface.co/api/models?search=<q>&sort=downloads` for real repo ids
  and popularity, and `…/api/models/<repo>?blobs=true` for exact quant filenames and byte sizes.
- Base-model `…/raw/main/config.json` for context length, layer count, hidden size.
- Model cards (`README.md`) for explicit **tool-calling / function-calling** claims.
- `strings /opt/llama-server/libllama.so` for the architectures this box's `llama-server` can load.
- Download/like counts are as of 2026-10-15 and included only as a popularity/health signal.

## The constraint box

| Constraint | Value |
|---|---|
| GPU | `CUDA0: NVIDIA GeForce RTX 5070 (12226 MiB)` via WSL CUDA (`/usr/lib/wsl/lib`; no `/dev/nvidia*`) |
| Free VRAM while the coder runs | **≈ 6.8 GiB** (coder `Qwen3.5-9B` Q3_K_M ≈ 4.5 GiB resident) |
| Safe target for a co-resident architect | **≤ ~6.4 GiB** weights, leaving room for KV (`q8_0/q8_0`) + compute buffers |
| `llama-server` | `0.5.0-dev (build 11223, commit 4da633776)` |
| Architect needs | instruction-following, plan-shaped prose, strict JSON, **tool-calling** (the agent uses tools) |

**Supported architectures on this build** (found in `libllama.so`; anything outside this list should be
assumed to refuse to load until proven otherwise):

```
exaone  exaone4  gemma3  gemma4  granite  lfm2  lfm2moe  mistral3
nemotron_h  olmo2  phi4  qwen3  qwen3moe  qwen3next  qwen3vl  smollm3
```

## Ranked candidates

`Size` is the recommended quant's file size. `Ctx` is from `config.json` (text tower). For a
co-resident run, pick the quant whose size keeps total VRAM under ~11.5 GiB.

| # | HF repo — quant to try | Size | Ctx | Tools | Popularity | Why / risk |
|---|---|---|---|---|---|---|
| — | `unsloth/Qwen3.5-4B-GGUF` — Q4_K_M | 2614 MiB | 262144 | ✅ works (trial 8) | 1.23M dl / 488 | **Incumbent baseline.** Verified end to end. Alternatives must beat it. |
| 1 | `MaziyarPanahi/Nemotron-Orchestrator-8B-GGUF` — Q4_K_M | 4795 MiB | 40960 | ⚠️ orchestration model; verify | 56k dl / 6 | NVIDIA **ToolOrchestra** — built specifically for *model + tool orchestration*. Arch is `Qwen3ForCausalLM` (`qwen3` ✅). The most on-the-nose fit for this seat. Risk: card is research-y; confirm it emits valid tool calls and JSON. |
| 2 | `mistralai/Ministral-3-3B-Instruct-2512-GGUF` — Q4_K_M | 2048 MiB | 262144 | ✅ **native function calling + JSON** | 40k dl / 100 | Card claims "best-in-class agentic capabilities with native function calling and JSON outputting" — exactly the architect's envelope shape. Arch `mistral3` ✅. Cheapest strong candidate. |
| 3 | `ibm-granite/granite-4.1-3b-GGUF` — Q4_K_M | 2100 MiB | 131072 | ✅ card lists "Function-calling tasks" | 7.0k dl / 14 | The **4.1** generation (different from the ❌ 4.2). Arch `granite` ✅. Official quants. Direct comparison against granite-4.2-3b being ❌. |
| 4 | `ibm-granite/granite-4.1-8b-GGUF` — Q4_K_M | 5100 MiB | 131072 | ✅ (same family) | 5.8k dl / 12 | Same generation, 8B. Fits only if the coder is stopped (~5.1 GiB). Try after the 3B. |
| 5 | `LiquidAI/LFM2.5-8B-A1B-GGUF` — Q4_K_M | 4917 MiB | 128000 | ⚠️ MoE sibling of a ❌ | 246k dl / 323 | **MoE, 8B total / ~1B active** → 8B capacity at small-model speed. Arch `lfm2moe` ✅. Risk: trial 7 showed the dense **2.6B** LFM2.5 fails architect planning — but this is a different, larger MoE; judge it on its own. |
| 6 | `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` — Q8_0 (or F16) | 1189 MiB (F16 2235) | 128000 | ✅ card documents "Tool Use" | 346k dl / 229 | **User-requested.** Native 128K ctx, fast. The GGUFs live in the **-Instruct** repo (the plain `LFM2.5-1.2B` has none). Cheapest real candidate; temper expectations given the 2.6B result. |
| 7 | `unsloth/Qwen3.5-2B-GGUF` — Q6_K | 1502 MiB | 262144 | ✅ family | 387k dl / 164 | Same family as the incumbent, one size down — a cheap "is 4B even necessary?" probe. |
| 8 | `LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF` — Q8_0 | 1301 MiB | 65536 | ✅ "Agentic tool use" | 4.0k dl / 48 | Reasoning + non-reasoning modes in one model; arch `exaone4` ✅. Under-downloaded but well-documented. |
| 9 | `unsloth/SmolLM3-3B-GGUF` — Q4_K_M | 1827 MiB | 65536 | ✅ tool calling (xml_tools) | 16k dl / 33 (unsloth) | Already **on disk** (Q4_K_M) — zero download. Hybrid reasoning; tool calls are XML-wrapped JSON, which may or may not match the harness. |
| 10 | `unsloth/gemma-4-E2B-it-GGUF` — Q4_K_M | 2963 MiB | 131072 | ⚠️ verify | 390k dl / 337 | `gemma4` ✅. Widely deployed; small. |
| 11 | `unsloth/gemma-4-E4B-it-GGUF` — Q4_K_M | 4747 MiB | 131072 | ⚠️ verify | 592k dl / 654 | Already on disk as **Q3_K_M** (untrialled here). Card does not advertise function calling in the lines found. |
| 10= | `MaziyarPanahi/NVIDIA-Nemotron-Nano-12B-v2-GGUF` — Q3_K_M | 5744 MiB | **UNKNOWN** | ⚠️ verify | 52k dl / 4 | 12B "Nano" v2; arch `nemotron_h` ✅ (assumed — verify at load). Config did not parse via API. Big and tight; try late. |
| 11 | `unsloth/Qwen3.5-9B-GGUF` — Q4_K_M | 5417 MiB | 262144 | ✅ family | 1.23M dl / 1000 | Same family as the coder — and the box already has `Qwen3.5-9B` Q3_K_M/Q4_K_M on disk (MTP variant). Zero-download option, but makes architect == coder. |
| 12 | `unsloth/Qwen3.5-0.8B-GGUF` — Q8_0 | 1919 MiB | 262144† | ✅ family | 230k dl / 240 | Floor/speed probe only. Unlikely to plan well; useful to bound the family's size curve. |

## Ruled out (for this box / seat)

| Candidate | Reason |
|---|---|
| `unsloth/Qwen3.5-35B-A3B-GGUF` | Q4_K_M = 21 GiB — far past 12 GiB. |
| `ggml-org/NVIDIA-Nemotron-3.5-Lightning-30B-A3B-GGUF` | Only Q8_0 (32 GiB) published; no small quant. |
| `unsloth/gpt-oss-20B` | MXFP4 ≈ 12 GiB — cannot co-reside with the coder (and the box has no second GPU). |
| `granite-4.2-3b` / `granite-4.2-8b` | Already ❌ (trials 4, 6). |
| Falcon3 / Hunyuan / InternLM3 / command-r7b / Yi | Arch strings (`falcon_h1`, `hunyuan`, `internlm3`, `command-r`) are **not** in this `libllama.so` — treat as unloadable here. |
| `OLMo-2-13B` | `olmo2` ✅ but Q4 ≈ 8 GiB > free. |

## How to try one on the pipeline

1. **Fetch** into `models/` (gitignored), naming `<owner>_<repo>_<file>.gguf` to match the existing
   convention, e.g.
   `models/mistralai_Ministral-3-3B-Instruct-2512-GGUF_Ministral-3-3B-Instruct-2512-Q4_K_M.gguf`.
   (For a durable stack, add it to `.devcontainer/llm-lab-models.json` + `stack.json` instead — the
   `models` feature owns those — and let `scripts/auto-startup.sh` serve it.)
2. **Serve ad-hoc on `:8089`** (the architect slot), mirroring the launcher's flags:
   ```sh
   llama-server -m models/<file>.gguf --host 0.0.0.0 --port 8089 --jinja \
     --ctx-size 32768 --alias <name> --parallel 1 \
     --n-gpu-layers 99 --cache-type-k q8_0 --cache-type-v q8_0
   ```
   Confirm it actually loaded the arch (`llama-server --list-devices`, and no "unknown architecture"
   in the log).
3. **Flip the seat**: `.agents.architect.model` in `opencode.json` → `local-<provider>/<model>-s0`
   (matching the bifrost provider id), and `.devcontainer/llm-lab-roles.json` for the other roles.
4. **Verify routing before judging the model** — a misroute looks exactly like a model failure:
   ```sh
   curl -s :8082/v1/chat/completions -d '{"model":"<id>-s0","max_tokens":8,
     "messages":[{"role":"user","content":"hi"}]}' | jq .extra_fields.routing_info
   ```
   `routing_info.provider` must be the provider you expect. See
   `BIFROST-CONFIG-SYNC-ISSUE.md` — stale providers will silently serve the **wrong model**.
5. **Push a real task through the loop** (the only honest test): architect plan → fact-checker →
   approval → coder → reviewer. Record the verdict in `MODEL-JOURNAL.md`.
6. **Stop the ad-hoc server when done** so the port is free — otherwise the next
   `scripts/auto-startup.sh` finds `:8089` busy and the weak candidate is shadowed (the trap this
   session's LFM2.5 trial hit).

## Trial record (fill in as we go)

| Candidate | Quant | Loaded? | Routing OK? | Plan shape | Tool calls | JSON | Verdict |
|---|---|---|---|---|---|---|---|
| Qwen3.5-4B | Q4_K_M | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ trial 8 |
| Nemotron-Orchestrator-8B | Q4_K_M | | | | | | |
| Ministral-3-3B-Instruct-2512 | Q4_K_M | | | | | | |
| granite-4.1-3b | Q4_K_M | | | | | | |
| granite-4.1-8b | Q4_K_M | | | | | | |
| LFM2.5-8B-A1B | Q4_K_M | | | | | | |
| LFM2.5-1.2B-Instruct | Q8_0 | | | | | | |
| Qwen3.5-2B | Q6_K | | | | | | |
| EXAONE-4.0-1.2B | Q8_0 | | | | | | |
| SmolLM3-3B | Q4_K_M | | | | | | |
| gemma-4-E4B-it | Q3_K_M (on disk) | | | | | | |
