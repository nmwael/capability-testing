# TRIAL-RANKING.md — architect-seat model ranking

Date: 2026-10-15

## Results so far (trials 8–12)
| Trial | Model | Quant | Size | Verdict | Notes |
|---|---|---|---|---|---|
| 8 | unsloth/Qwen3.5-4B-GGUF | Q4_K_M | 2.55 GiB | ✅ works | Incumbent; structured plan, follows envelope, no tool calls, well under budget. |
| 9 | unsloth/SmolLM3-3B-GGUF | Q4_K_M | 1.83 GiB | ✅ works (smoke) | Structured plan, file scopes, checks; compact. |
| 11 | mistralai/Ministral-3-3B-Instruct-2512-GGUF | Q4_K_M | 2.05 GiB | ✅ works (smoke) | Strongest "agentic" fit (native function-calling claim); clean envelope. |
| 12 | unsloth/Qwen3.5-2B-GGUF | Q6_K | 1.50 GiB | ⚠️ partial (caveats) | Structure OK; example checks had minor non-conforming flag (`bats --dry-run`). |
| 10 | LiquidAI/LFM2.5-1.2B-Instruct-GGUF | Q8_0 | 1.19 GiB | ❌ bad (architect) | Missed required file paths/success criteria per subtask; failed envelope. |

## Ranking (smoke-test basis)
| Rank | Model | Verdict | Rationale |
|---|---|---|---|
| 1 | qwen3.5-4B (incumbent) | ✅ | Proven end-to-end; fits co-resident; clean envelope. |
| 2 | Ministral-3-3B-Instruct-2512 | ✅ (smoke) | Best agentic/tool-calling claim; envelope-compliant; small (2GB). |
| 3 | SmolLM3-3B | ✅ (smoke) | Compact, clean; already on disk. |
| 4 | Qwen3.5-2B | ⚠️ partial | Envelope mostly OK but minor command-slip; very small (1.5GB). |
| 5 | LFM2.5-1.2B-Instruct | ❌ | Failed envelope; not usable for architect. |

| 6 | EXAONE-4.0-1.2B | ❌ | Failed envelope structure (no file paths/success criteria). |

## Notes
- Excluded the two largest candidates (Nemotron-Orchestrator-8B Q4 4.8GB, LFM2.5-8B-A1B Q4 4.9GB) per instruction.
- EXAONE-4.0-1.2B Q8 failed envelope structure.
- LFM2.5-1.2B-Instruct Q8 failed envelope structure.
- Qwen3.5-2B Q6 is usable with minor caveats.
- Best performers (smoke): qwen3.5-4B (incumbent), Ministral-3B-Instruct, SmolLM3-3B.

## Updates
- gemma-4-E2B Q4_K_M failed to load (tensor bounds error, appears corrupted/incomplete). Removed.
- Nemotron-Orchestrator-8B Q4_K_M failed to load (tensor bounds error). Removed.
- Remaining: LFM2.5-8B-A1B Q4_K_M not tested (skipped as requested).

Final working smoke set under 5GB: 1) qwen3.5-4B, 2) Ministral-3B, 3) SmolLM3-3B. Qwen3.5-2B usable with caveats.

## Additional notes (extended trials)
- Nemotron variants attempted (Orchestrator 8B Q4_K_M, Nano 12B Q2_K) failed to load with "tensor data not within file bounds / incomplete/corrupted" on this build; removed.
