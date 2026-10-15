# TRIAL-RANKING.md — architect-seat model ranking

Date: 2026-10-15 (updated after the SmolLM3-3B dead end and the move to Ministral-3B)

## Results so far (trials 8–12 + 14)
| Trial | Model | Quant | Size | Verdict | Notes |
|---|---|---|---|---|---|
| **14** | **unsloth/Qwen3.5-9B-MTP-GGUF** | **Q3_K_M** | **4.50 GiB** | **✅ works (architect) — CHOSEN** | **The seat now.** Single-model stack: one 9B on `:8090`, `parallel=2` (2×64k slots); slot 0 coder, slot 1 all non-coder roles. Clean, complete envelope on the real path (3 atomic subtasks, real file paths, verifiable checks, real out-of-scope line) — no template error, no role confusion, no invented files. Reasoning model (~500 completion tokens even for trivial prompts). Hybrid arch (8/32 full-attention) → tiny KV, so the 2nd slot is nearly free. |
| 8 | unsloth/Qwen3.5-4B-GGUF | Q4_K_M | 2.55 GiB | ✅ works | Proven; structured plan, follows envelope, no tool calls, well under budget. **The fallback if the shared-9B seat ever needs replacing.** |
| 9 | unsloth/SmolLM3-3B-GGUF | Q4_K_M | 1.83 GiB | ❌ **bad (architect) — DEAD END** | Smoke looked fine, but the **real pipeline sank it**: role confusion ("I am a researcher"), returned a backend-only plan and dropped the frontend half, invented a `test_script.sh`, and suggested `npx tsc` for a POSIX-shell task. A 3B cannot hold the plan envelope. fp16 ruled out (reasoning/size, not quantization; BF16 won't fit). |
| 11 | mistralai/Ministral-3-3B-Instruct-2512-GGUF | Q4_K_M | 2.05 GiB | ⚠️ **in seat — smoke ✅, caveat found** | Moved into the live architect seat. Strong "agentic"/tool-calling claim and clean envelope on **short/medium** prompts. **But the chat template throws `conversation roles must alternate` on the long, tool-driving prompts the pipeline needs**, and a medium prompt again self-identified as "researcher". End-to-end delegation test pending. |
| 12 | unsloth/Qwen3.5-2B-GGUF | Q6_K | 1.50 GiB | ⚠️ partial (caveats) | Structure OK; example checks had a minor non-conforming flag (`bats --dry-run`). |
| 10 | LiquidAI/LFM2.5-1.2B-Instruct-GGUF | Q8_0 | 1.19 GiB | ❌ bad (architect) | Missed required file paths/success criteria per subtask; failed envelope. |
| — | LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF | Q8_0 | ~1.2 GiB | ❌ bad (architect) | Failed envelope structure (no file paths/success criteria). |

## Ranking (current state)
| Rank | Model | Verdict | Rationale |
|---|---|---|---|
| 1 | **qwen3.5-9B-MTP (shared, 2 slots)** | ✅ **CHOSEN** | The one capable model on the box; serves every role from a single server. Hybrid arch (8/32 full-attention) makes a 2nd slot nearly free. Produced a clean envelope on the real path. |
| 2 | qwen3.5-4B | ✅ proven | Clean end-to-end; co-resident; **the fallback** if the shared-9B seat ever needs replacing. |
| 3 | Qwen3.5-2B | ⚠️ partial | Envelope mostly OK but minor command-slip; very small (1.5 GB). |
| 4 | Ministral-3-3B-Instruct-2512 | ❌ **fails tool-driving flow** | Plan-only smoke passed, but its chat template rejects the `subagent`/delegation message flow — the architect's core duty. |
| 5 | SmolLM3-3B | ❌ **dead end** | Real-pipeline failure (role confusion, dropped plan halves, invented files). |
| 6 | LFM2.5-1.2B-Instruct | ❌ | Failed envelope; not usable for architect. |
| 7 | EXAONE-4.0-1.2B | ❌ | Failed envelope structure (no file paths/success criteria). |

## Current assignment (2026-10-15)
- **Single-model stack: `qwen3.5-9b-mtp` on `:8090`, `parallel=2` (2 slots × 65536 ctx).**
  - **Slot 0 → coder** (`local-qwen3.5-9b-mtp/qwen3.5-9b-mtp-s0`).
  - **Slot 1 → every non-coder role** (architect, researcher, reviewer, fact-checker, build, ui, artist, title) (`.../qwen3.5-9b-mtp-s1`).
- No small model. `SmolLM3-3B` (dead end) and `Ministral-3-3B` (no tool-driving) both retired.
- Measured: dropping the 3B freed 4188 MiB; the 2-slot 9B leaves ~3 GiB free (2973 MiB observed).

## Notes
- Excluded the two largest candidates (Nemotron-Orchestrator-8B Q4 4.8 GB, LFM2.5-8B-A1B Q4 4.9 GB) per instruction.
- EXAONE-4.0-1.2B Q8 failed envelope structure.
- LFM2.5-1.2B-Instruct Q8 failed envelope structure.
- Qwen3.5-2B Q6 is usable with minor caveats.
- **The only end-to-end-proven model remains qwen3.5-4B.** Smoke passes are necessary but not sufficient — SmolLM3-3B passed smoke and then failed the real pipeline.

## Updates
- gemma-4-E2B Q4_K_M failed to load (tensor bounds error, appears corrupted/incomplete). Removed.
- Nemotron-Orchestrator-8B Q4_K_M failed to load (tensor bounds error). Removed.
- Remaining: LFM2.5-8B-A1B Q4_K_M not tested (skipped as requested).
- **SmolLM3-3B moved from "✅ works (smoke)" to "❌ dead end" after a real-pipeline run** (trial 9).
- **Seat moved SmolLM3-3B → Ministral-3B** (user directive). Configs repointed: `stack.json`, `opencode.json`, `.devcontainer/llm-lab-models.json`, `.devcontainer/llm-lab-roles.json`. Third recurrence of the bifrost stale-provider bug pruned after the swap; both routes re-verified.
- **Ministral caveat discovered:** the Mistral chat template rejects the harness's long tool-driving message flow (`conversation roles must alternate`); short and medium prompts work. An end-to-end `subagent` delegation run is the deciding test.

## Additional notes (extended trials)
- Nemotron variants attempted (Orchestrator 8B Q4_K_M, Nano 12B Q2_K) failed to load with "tensor data not within file bounds / incomplete/corrupted" on this build; removed.
