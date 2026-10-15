# TRIAL-RANKING.md — architect-seat model ranking

Date: 2026-10-15 (updated after the SmolLM3-3B dead end and the move to Ministral-3B)

## Results so far (trials 8–12 + 14)
| Trial | Model | Quant | Size | Verdict | Notes |
|---|---|---|---|---|---|
| 8 | unsloth/Qwen3.5-4B-GGUF | Q4_K_M | 2.55 GiB | ✅ works | Proven; structured plan, follows envelope, no tool calls, well under budget. **Now the fallback if the current seat fails end-to-end.** |
| 9 | unsloth/SmolLM3-3B-GGUF | Q4_K_M | 1.83 GiB | ❌ **bad (architect) — DEAD END** | Smoke looked fine, but the **real pipeline sank it**: role confusion ("I am a researcher"), returned a backend-only plan and dropped the frontend half, invented a `test_script.sh`, and suggested `npx tsc` for a POSIX-shell task. A 3B cannot hold the plan envelope. fp16 ruled out (reasoning/size, not quantization; BF16 won't fit). |
| 11 | mistralai/Ministral-3-3B-Instruct-2512-GGUF | Q4_K_M | 2.05 GiB | ⚠️ **in seat — smoke ✅, caveat found** | Moved into the live architect seat. Strong "agentic"/tool-calling claim and clean envelope on **short/medium** prompts. **But the chat template throws `conversation roles must alternate` on the long, tool-driving prompts the pipeline needs**, and a medium prompt again self-identified as "researcher". End-to-end delegation test pending. |
| 12 | unsloth/Qwen3.5-2B-GGUF | Q6_K | 1.50 GiB | ⚠️ partial (caveats) | Structure OK; example checks had a minor non-conforming flag (`bats --dry-run`). |
| 10 | LiquidAI/LFM2.5-1.2B-Instruct-GGUF | Q8_0 | 1.19 GiB | ❌ bad (architect) | Missed required file paths/success criteria per subtask; failed envelope. |
| — | LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF | Q8_0 | ~1.2 GiB | ❌ bad (architect) | Failed envelope structure (no file paths/success criteria). |

## Ranking (current state)
| Rank | Model | Verdict | Rationale |
|---|---|---|---|
| 1 | Ministral-3-3B-Instruct-2512 | ⚠️ in seat (smoke ✅) | Best agentic/tool-calling claim; envelope-compliant on short/medium prompts; small (2 GB). **Caveat: long tool-driving prompts hit a chat-template error; role self-id wobbles.** End-to-end verdict pending. |
| 2 | qwen3.5-4B | ✅ proven | The only model with a clean end-to-end pass; co-resident; clean envelope. **Fallback if the current seat fails.** |
| 3 | Qwen3.5-2B | ⚠️ partial | Envelope mostly OK but minor command-slip; very small (1.5 GB). |
| 4 | SmolLM3-3B | ❌ **dead end** | Real-pipeline failure (see trial 9). Retired from the seat. |
| 5 | LFM2.5-1.2B-Instruct | ❌ | Failed envelope; not usable for architect. |
| 6 | EXAONE-4.0-1.2B | ❌ | Failed envelope structure (no file paths/success criteria). |

## Current assignment (2026-10-15)
- **Architect seat (all non-coder roles): `ministral-3-3b`** — provider `local-ministral-3-3b`, served on `:8089`, Q4_K_M.
- **Coder: `qwen3.5-9b-mtp`** on `:8090`.
- 2-model stack: `ministral-3-3b` (all non-coder roles) + `qwen3.5-9b-mtp` (coder).
- `SmolLM3-3B` retired (**dead end**, trial 9).

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
