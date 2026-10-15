# MODEL-JOURNAL.md — local model trials by role

**Purpose.** A running, append-only record of which local GGUF models have been tried in the
`architect` seat — and, later, other roles — the profile/config each was tried under, and the
observed outcome. `PLAN.md` is forward-looking and deliberately journal-free (see its line 12,
"No journaling here"); this file is the journal that belongs beside it.

**How to read.** One row per *(model, role, profile)* trial. A verdict is recorded only from direct
observation or an explicit user report; anything else stays `?`. Newest evidence goes in the dated
*Evidence log* below.

## Status legend

- ✅ **works** — produced usable plans without a hard failure
- ⚠️ **partial** — produced some usable output but with notable failures
- ❌ **bad** — did not produce usable plans
- ? **unrecorded** — tried (a profile exists / weights are on disk) but no verdict captured yet

## Current assignment (2026-10-15)

| Source | architect model |
|---|---|
| live `stack.json` (what `scripts/auto-startup.sh` reads) | `qwen3.5-9b-mtp` **slot 1** — served on `:8090` (user directive 2026-10-15) |
| `opencode.json` → `.agents.architect.model` | `local-qwen3.5-9b-mtp/qwen3.5-9b-mtp-s1` |
| `.devcontainer/llm-lab-roles.json` | `qwen3.5-9b-mtp`, slot 1 |
| `.devcontainer/llm-lab-models.json` | `qwen3.5-9b-mtp` on `:8090`, ctx 131072, parallel 2 |
| `.devcontainer/active-profile` | `q4` |

The stack is now a **single model**: `qwen3.5-9b-mtp` (Q3_K_M) on `:8090` with `parallel=2`
(2 slots × 65536 ctx). Slot 0 serves the coder; slot 1 serves every non-coder role
(architect, researcher, reviewer, fact-checker, build, ui, artist, title). Both `SmolLM3-3B`
(**dead end**, trial 9) and `Ministral-3-3B` (fails the tool-driving flow, trial 11) are retired
from the seat. This replaced the earlier 2-model stack.

**Why one model.** Neither small model could hold the architect job: smol misidentified its own
role and dropped plan halves; ministral's chat template refuses the tool-driving message flow the
architect needs. The 9B is the one capable model on the box and is **hybrid** — only 8 of 32 layers
are full attention — so its KV is ~1 GiB at 64k and a second slot costs almost nothing (measured:
dropping the 3B frees 4188 MiB; 2 slots × 64k leaves ~3 GiB free).


✅ **Runtime (2026-10-15).** The stack now serves `qwen3.5-4b` end to end. `bash scripts/auto-startup.sh`
brought up `qwen3.5-4b` on `:8089` (ctx 32768), the coder `qwen3.5-9b-mtp` on `:8090` (ctx 65536) and
bifrost on `:8082`; `:8091` is no longer held by the orphaned `granite-4.2-8b`. **bifrost was still
misrouting**, though (see trial 8): its sqlite config store carried two stale `granite-4.2-*` providers
whose key hijacked unqualified model ids — `qwen3.5-9b-mtp-s0` was silently served by `:8089` (the 4B)
and `qwen3.5-4b-s0` resolved to nothing at all. Deleting the two stale providers fixed both. The
trial-7 LFM2.5 test below was loaded ad-hoc on `:8089` beside the coder on `:8090`.

## Trials

### Architect role

| # | Model (exact tag) | User's name | Profile / config | Verdict | Notes |
|---|---|---|---|---|---|
| 1 | `microsoft_Phi-4-mini-instruct` (IQ4_XS) | "phi" | `profiles/roles-cap.json`, `combo-cap.json` | ? | earliest profile family; weights on disk 2026-10-09 |
| 2 | `Qwen3-8B` (Q4_K_M) | "qwen3-8b" | `profiles/roles-q.json`, `combo-q.json` | ? | paired with `qwen2.5-coder-7b` for the coder |
| 3 | `google_gemma-4-E4B-it` (Q3_K_M) | "gemma" | `profiles/roles-gemma.json`, `combo-gemma.json` | ? | |
| 4 | `granite-4.2-3b` (Q4_K_M) | **"granite 4b"** | `profiles/roles-granite.json`, `combo-granite.json` | ❌ **bad** | user report 2026-10-15 |
| 5 | `Qwen3.5-4B` (Q4_K_M) | **"qwen 4b"** | profile `q4` (`.devcontainer/active-profile`, `llm-lab-roles.json`) | ✅ **works (partial)** | user report 2026-10-15: "did work and gave some results" |
| 6 | `granite-4.2-8b` (Q3_K_M) | **"granite 8b"** | live `stack.json`, `opencode.json` | ❌ **bad** | user report 2026-10-15; also observed this session — architect returned no text response, and an earlier call failed at `35015 tokens` vs `32768` context |
| 7 | `LiquidAI/LFM2.5-2.6B-GGUF` (Q8_0) | **"lfm2.5 2.6b"** | ad-hoc load on `:8089`, `--ctx-size 131072` | ❌ **bad (architect)** | 2026-10-15, this session: loads at full **128K** ctx, **~155 tok/s** decode, and tool-calling is correct *when tools are supplied* — but on codebase-planning prompts it replays memorized tool calls (`<|tool_call_start|>[read(path='/home/gibbon/synthtraces/…')]<|tool_call_end|>`) instead of writing a plan, and over-runs the reasoning budget to `finish=length` with empty content. See evidence log. |
| 8 | `unsloth/Qwen3.5-4B-GGUF` (Q4_K_M) | **"qwen 4b"** | live `stack.json` + `opencode.json`, served on `:8089`, routed via bifrost `:8082` | ✅ **works** | 2026-10-15, this session: smoke-tested through the real path (opencode → bifrost → `:8089`). Returned the requested 3 atomic subtasks with file paths and success criteria, no tool calls, well under budget. The earlier "failures" in this seat were **not** the model — trial 6 (granite) was a real model failure, but the first qwen3.5-4b attempt failed on bifrost's stale-provider misrouting, not on plan quality. |
| 9 | `unsloth/SmolLM3-3B-GGUF` (Q4_K_M) | **"smollm3 3b"** | live `stack.json` + `opencode.json`, served on `:8089`, routed via bifrost `:8082` | ❌ **bad (architect) — DEAD END** | 2026-10-15, this session: first smoke test (ad-hoc) looked fine (3 subtasks, file scopes, checks) — so it was moved into the live architect seat. **Real-pipeline use then failed badly**: called itself a "researcher", dropped the frontend half of a plan, invented a non-existent `test_script.sh`, and suggested `npx tsc` to check a POSIX-shell task. A 3B model cannot hold the architect plan envelope on a multi-step task. Precision is not the cause (BF16 won't fit and wouldn't fix reasoning); the **size** is. Retired from this seat. |
| 10 | `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` (Q8_0) | **"lfm2.5 1.2b"** | ad-hoc load on `:8089` | ❌ **bad (architect)** | 2026-10-15: loaded 1.19 GiB Q8_0; returned 3 steps but failed to follow the required structure (missing explicit file paths and verifiable success criteria per subtask). Structurally weak for the plan envelope. |
| 11 | `mistralai/Ministral-3-3B-Instruct-2512-GGUF` (Q4_K_M) | **"ministral 3b"** | live seat `:8089` → then failed | ❌ **bad (architect) — fails tool-driving flow** | 2026-10-15: moved into the live seat on the strength of a plan-only smoke test (✅ 3 atomic subtasks, file paths, success criteria). **Then it failed the real job:** every prompt that told it to *use its `subagent` tool* — the core architect duty — threw `Jinja Exception: conversation roles must alternate user and assistant roles` from Mistral's chat template (5× in the server log, both foreground and backgrounded). A medium prompt also self-identified as "researcher". Short/medium plan-only prompts still worked, but the envelope-with-tools flow it needs is exactly what its template rejects. Retired from this seat. |
| 12 | `unsloth/Qwen3.5-2B-GGUF` (Q6_K) | **"qwen3.5 2b"** | ad-hoc load on `:8089` | ⚠️ **partial (works with caveats)** | 2026-10-15: loaded 1.50 GiB Q6_K; mostly followed the required structure (3 atomic subtasks, file scopes). Example checks included a minor non-conforming flag (`bats --dry-run`) — acceptable for smoke test but not clean for the strict envelope. |
| 13 | `LGAI-EXAONE/EXAONE-4.0-1.2B-GGUF` (Q8_0) | **"exaone4 1.2b"** | ad-hoc load on `:8089` | ❌ **bad (architect)** | 2026-10-15: loaded 1.30 GiB Q8_0; produced 3 steps but failed to follow the required envelope (missing explicit file paths and verifiable success criteria per subtask). |
| 14 | `unsloth/Qwen3.5-9B-MTP-GGUF` (Q3_K_M) | **"qwen 9b (shared)"** | **single-model stack**: `:8090`, ctx 131072, `parallel=2` (2×64k slots); slot 0 = coder, slot 1 = all non-coder roles | ✅ **works (architect)** | 2026-10-15, this session: dropped the small model entirely; the 9B serves both roles from one server. Architect smoke through the real path returned a **clean, complete envelope** — 3 atomic subtasks, real file paths (`scripts/fetch.sh`, `test/fetch.bats`), verifiable checks, and a genuine out-of-scope line (`backend/*`, `frontend/*`) — none of the smol/ministral failure modes. It is a **reasoning model** (~1450 chars of thinking, ~500 completion tokens even for "2+2"); opencode's `reasoning.max_tokens` covers it. Same model as the coder, so no second-class seat. |

Also on disk with no recorded architect trial: `LFM2.5-2.6B` F16 (not downloaded — Q8_0 chosen), and `gemma-4-E4B-it`, `phi-4-mini`, `Qwen3-8B` from the early profiles.

### Other roles (context only)

- `coder`: `qwen3.5-9b-mtp` pinned throughout the recent history; earlier `qwen2.5-coder-7b` / `qwen3-8b`.
- `researcher`, `reviewer`, `build`, `ui`, `artist`: follow the architect's model in every recorded profile.

## Evidence log

- **2026-10-15** — User: *"we have tried granite 4b, 8b and both were bad. we also tried qwen 4b
  which did work and gave some results."*
- **2026-10-15** — Session observation: with the architect pinned to `granite-4.2-8b-s0`, a
  subagent call returned **no text response**; an earlier directive failed with
  `request (35015 tokens) exceeds the available context size (32768 tokens)`.
- **2026-10-15** — Filesystem: `.devcontainer/active-profile` = `q4`; `llm-lab-roles.json` non-coder
  roles → `qwen3.5-4b`; but `llm-lab-models.json` and `stack.json` list only `qwen3.5-9b-mtp` +
  `granite-4.2-8b` (the drift above).
- **2026-10-15** — LFM2.5-2.6B (Q8_0) trial, this session. Verified real and runnable:
  `LiquidAI/LFM2.5-2.6B-GGUF` ships F16/BF16 (5.40 GB), Q8_0 (2.87 GB) and smaller; local
  `llama-server` build 11223 (lib 0.5.0) contains the `lfm2` arch and an `LFM2.5` chat template, and
  the GGUF header declares `general.architecture=lfm2`, `lfm2.context_length=131072`. Loaded Q8_0 on
  `:8089` with `--ctx-size 131072` (log confirms `n_ctx_slot = 131072`); decode ~**155 tok/s** on CPU.
  Architect-style behaviour: (a) plain Q&A fine; (b) codebase planning ⇒ raw
  `<|tool_call_start|>…<|tool_call_end|>` naming a memorized `/home/gibbon/synthtraces/repos/…` path,
  even when told "do not call tools"; (c) two planning prompts over-ran the token budget with
  `finish=length` and empty `content`; (d) tool-calling is correct when a `tools` array is supplied
  (`finish=tool_calls`, clean `arguments`); (e) valid JSON when asked, but fenced ```json and role
  `developer` (not `coder`/`researcher`/…).
- **2026-10-15** — Platform (**corrected**): the box **does have a GPU** —
  `llama-server --list-devices` reports `CUDA0: NVIDIA GeForce RTX 5070 (12226 MiB, … free)`. The
  `/dev/dri` `faux_driver` is only the WSL virtual display; CUDA runs through `/usr/lib/wsl/lib`
  (there is no `/dev/nvidia*` and no `nvidia-smi`, which is why the first read looked CPU-only). So
  `--n-gpu-layers 99` is live, and "full precision fp16" is a **VRAM** question: F16 ≈ 5.03 GiB
  weights; KV ≈ 12 KiB/token (≈ 0.4 GiB @32K, 1.5 GiB @128K at f16), against **12226 MiB total VRAM**
  with ~5.4 GiB already held by the coder (`:8090`, `Qwen3.5-9B-Q3_K_M`). `llama-server --list-devices`
  reports ~6.8 GiB free with the current stack up.
- **2026-10-15** — **bifrost misrouting bug (found + fixed), this session.** The architect subagent
  failed with `no keys found for provider: granite-4.2-8b and model: qwen3.5-4b-s0`. Root cause: the
  bifrost config file (`/usr/local/share/llm-lab/bifrost/config/bifrost.json`) is correct (two qwen
  providers), but the bind-mounted sqlite store at `config.db` still held **four** providers from the
  granite era. The only *enabled* key in `config_keys` belonged to `granite-4.2-3b` (`base_url :
  8089`) and listed the coder's ids, so an unqualified `qwen3.5-9b-mtp-s0` request resolved to
  provider `granite-4.2-3b` → **`:8089`** and came back `model: qwen3.5-4b` — i.e. the **coder was
  silently talking to the 4B model**, while `qwen3.5-4b-s0` had no enabled key and fell through to a
  default (`granite-4.2-8b`) with no key. Fix (operational, via bifrost's dashboard API on `:8082`,
  `X-Bifrost-Setup-Token`): `DELETE /api/providers/granite-4.2-3b` and
  `DELETE /api/providers/granite-4.2-8b`, leaving exactly `qwen3.5-4b` → `:8089` and
  `qwen3.5-9b-mtp` → `:8090`. Re-verified: `qwen3.5-4b-s0` → provider `qwen3.5-4b`;
  `qwen3.5-9b-mtp-s0` → provider `qwen3.5-9b-mtp`. Root cause is that `write-bifrost-config.sh`
  only writes the JSON file and never reconciles the sqlite store, so **any model swap leaves stale
  providers behind** — worth fixing in the `bifrost-gateway` feature (a startup reconcile or a DB
  prune), not in this repo.
- **2026-10-15** — Architect smoke test **PASS** (trial 8). Through the real path
  (opencode → bifrost → `:8089`), `qwen3.5-4b` answered a plan request with 3 numbered atomic
  subtasks, `path:line`-style file scopes and verifiable success criteria, no tool calls, ~120 words.
- **2026-10-15** — **Seat moved to `smollm3-3b`** (user directive). `stack.json`, `opencode.json`,
  `llm-lab-roles.json` and `llm-lab-models.json` now point the non-coder roles at `smollm3-3b`
  (provider `local-smollm3-3b`, served on `:8089`); coder stays `qwen3.5-9b-mtp` on `:8090`. Stack
  relaunched: `smollm3-3b` ready on `:8089`.
- **2026-10-15** — **bifrost stale-provider bug reproduced on this swap (2nd occurrence).** After the
  `qwen3.5-4b` → `smollm3-3b` swap, `config.db` held three providers (`qwen3.5-9b-mtp`, stale
  `qwen3.5-4b`, `smollm3-3b`). All three keys were named `local`; the **stale** `qwen3.5-4b` key was
  `enabled=true` and carried the *live coder ids* `["qwen3.5-9b-mtp","qwen3.5-9b-mtp-s0"]`, so
  `qwen3.5-9b-mtp-s0` was routed to provider `qwen3.5-4b` → `:8089` and answered by `smollm3-3b`
  (wrong model, silently). `smollm3-3b-s0`/`qwen3.5-9b-mtp-s0` both resolved correctly after
  `DELETE /api/providers/qwen3.5-4b` (dashboard API + `X-Bifrost-Setup-Token`); re-verified
  `routing_info.provider` = `smollm3-3b` / `qwen3.5-9b-mtp` respectively. This is the same defect
  filed upstream as issue #5 (`BIFROST-CONFIG-SYNC-ISSUE.md`).
- **2026-10-15** — Note on trial 9 (`SmolLM3-3B`): the smoke test earlier this session produced a
  reasonable 3-subtask plan; a later re-run through the same prompt produced weaker output (invented
  `test_script.sh`, `npx tsc` check for a POSIX-shell task). Treat `smollm3-3b` as usable-but-noisy in
  the architect seat; the real arbiter is a full pipeline run.
- **2026-10-15** — **`SmolLM3-3B` retired: DEAD END (user verdict).** The full-pipeline run confirmed
  it: the architect seat (smol) misidentified its own role ("I am a researcher"), returned a thin
  backend-only plan and dropped the frontend half entirely, and on re-ping invented a
  `test_script.sh` + `npx tsc` check for a POSIX-shell task. A 3B model cannot hold the architect
  plan envelope on a multi-step task. Asked whether fp16 would rescue it: **no** — the failure is
  reasoning/size, not quantization, and `SmolLM3-3B-BF16` (6.16 GB) also exceeds the ~6.8 GiB free
  VRAM budget beside the coder. Seat moved to `mistral-3-3b` (trial 11 ✅) per user.
- **2026-10-15** — **Seat moved to `ministral-3-3b`** (user directive). `stack.json`, `opencode.json`,
  `llm-lab-roles.json` and `llm-lab-models.json` repointed to `mistralai/Ministral-3-3B-Instruct-2512-GGUF`
  (Q4_K_M, provider `local-ministral-3-3b`, `:8089`); coder stays `qwen3.5-9b-mtp` on `:8090`. The same
  bifrost stale-provider reconcile must be re-run after this swap (see bug above — it recurs every time).
- **2026-10-15** — **Ministral-3B re-verified through the real path (3rd occurrence of the bifrost bug,
  fixed).** After the swap, `config.db` carried a stale `smollm3-3b` provider still pointing at `:8089`;
  this time it owned no key (the enabled keys correctly belonged to `ministral-3-3b` and
  `qwen3.5-9b-mtp`), so no hijack — deleted it anyway via `DELETE /api/providers/smollm3-3b`.
  Re-verified `routing_info.provider` = `ministral-3-3b` / `qwen3.5-9b-mtp`. Architect smoke test then
  returned **3 atomic subtasks with real file paths** (`scripts/fetch.sh`, `test/fetch.bats`) and concrete
  check commands — structured, no role confusion, no invented files (all of which sank smol). One
  envelope miss: the "files NOT in scope" line returned a *constraint* instead of naming files. Verdict
  holds: **✅ works (smoke)**, and materially more stable than `smollm3-3b` in this seat.
- **2026-10-15** — **`Ministral-3B` retired: fails the tool-driving flow.** The plan-only pass above was
  necessary but not sufficient. Every prompt that asked ministral to *use its `subagent` tool* — the
  architect's core duty — failed at chat-template render time: `Jinja Exception: After the optional
  system message, conversation roles must alternate user and assistant roles except for tool calls and
  results` (Mistral's template; 5 occurrences in `/tmp/llama-server-ministral-3-3b.log`, both foreground
  and backgrounded). Short/medium plan-only prompts still worked; a medium prompt self-identified as
  "researcher" again. Not usable as an architect. Verdict corrected: ❌ bad (trial 11).
- **2026-10-15** — **Seat moved to a single-model stack: `qwen3.5-9b-mtp` shared, 2 slots (user
  directive).** Rather than trial a fourth small model, the box now runs one model for everything.
  Measured the trade directly first: the 3B (ministral) footprint was **4188 MiB** (13:38 stop/start
  delta), and `qwen3.5-9b-mtp` is a **hybrid** arch (`qwen35`: only blocks 3/7/11/15/19/23/27/31 are
  full attention — 8 of 32), so its KV is **~17 KiB/token (~1.1 GiB at 64k)**, not the ~4.3 GiB a dense
  9B would need. Config: `stack.json`/`llm-lab-models.json` → one model, `context 131072`, `parallel 2`;
  `opencode.json` → provider `local-qwen3.5-9b-mtp` gains `-s1`, non-coder agents pinned to
  `qwen3.5-9b-mtp-s1`, ministral provider + policy entry removed; `llm-lab-roles.json` → non-coder
  slot 1. Restart: `:8090` reports `n_slots=2, n_ctx_slot=65536`; VRAM 2973 MiB free. **4th bifrost
  stale-provider recurrence (hijack variant)**: the store kept a dead `ministral-3-3b` at `:8089` whose
  key listed `qwen3.5-9b-mtp` + `-s0`; deleted it, after which the single key correctly lists `-s0`
  *and* `-s1`, and both routes resolve to the provider. Architect smoke on slot 1 returned a **clean,
  complete envelope** (3 atomic subtasks, real paths, verifiable checks, a real out-of-scope line) —
  no template error, no role confusion, no invented files. Trial 14: ✅.



## Where the architect model is configured

- `opencode.json` → `.agents.architect.model` (plus top-level `.model` and the `.experimental.policies`
  `provider.use` allow-list).
- `/usr/local/share/llm-lab/stack.json` → `.roles.architect` — owned by the `models` feature; what
  `scripts/auto-startup.sh` actually launches.
- `.devcontainer/llm-lab-models.json` (models), `llm-lab-roles.json` (roles), `active-profile` (name).
- `profiles/` — historical role/combo snapshots (`cap`=phi, `q`=qwen3-8b, `gemma`, `granite`).

## Candidate list — next architect trials (2026-10-15)

Trial 8 clears `qwen3.5-4b`, so this is a *keep-researching* list, not a fire drill. Constraint: the
architect shares one **12 GB RTX 5070** with the coder (`qwen3.5-9b-mtp` Q3_K_M ≈ 4.5 GiB), leaving
**≈ 6.8 GiB free**; the seat needs plan-shaped output, strict JSON, and tool-call discipline.

| Rank | Candidate (HF repo) | Quants | Weight on disk | Rationale |
|---|---|---|---|---|
| — | `unsloth/Qwen3.5-4B-GGUF` | Q4_K_M | 2.55 GiB | **current, ✅ trial 8.** Baseline to beat. |
| 1 | `LiquidAI/LFM2.5-1.2B-Instruct-GGUF` | Q8_0 1.19 GiB · F16 2.24 GiB · Q4_K_M 697 MB | not downloaded | **user-requested.** Native **128K** ctx, 16 layers/2048 hidden, ~fast. NOTE: the *Instruct* repo is the one with GGUFs (`LFM2.5-1.2B` base has no GGUF). Trial 7 showed the 2.6B sibling fails architect planning, so expect the 1.2B to be weaker — but it's cheap (Q8_0 ≈ 1.2 GiB) and worth one honest trial. |
| 2 | `LiquidAI/LFM2.5-8B-A1B-GGUF` | Q4_K_M 4.92 GiB · Q5_K_M 5.75 GiB | not downloaded | MoE: **8B total, ~1B active** → 8B-class capacity at small-model speed, and it *fits* the ~6.8 GiB budget. The most interesting swap if the 4B ceiling bites. |
| 3 | `unsloth/SmolLM3-3B-GGUF` | Q4_K_M | 1.78 GiB (on disk) | Already present; hybrid reasoning + tool modes. Free to try. |
| 4 | `ibm-granite/granite-4.1-*` (3b/8b GGUF) | Q4_K_M | not downloaded | The **4.1** generation, tool-call focused — a different family from the ❌ 4.2. Only worth a trial if LFM2.5-8B-A1B disappoints. |
| 5 | `google/gemma-4-E4B-it` | Q3_K_M 4.56 · Q4_K_M 5.03 GiB | on disk | Last of the early-profile weights not yet trialled in this seat. |

Fetching: `/usr/local/share/llm-lab/models/fetch-models.sh` iterates `stack.json`; for a one-off
candidate, download straight into `models/` (gitignored) with the same naming convention
(`<owner>_<repo>_<file>.gguf`) and load it ad-hoc on `:8089` — **stop the ad-hoc server afterwards**
so the port is not silently shadowed by the next `auto-startup.sh` (this session's LFM2.5 trial did
exactly that).

## Open questions

1. **Settle the architect model.** `qwen3.5-4b` is now ✅ (trial 8, smoke-tested end to end) and is the
   incumbent; `LFM2.5-2.6B` (trial 7) is ❌ for the architect despite running fast at a native 128K
   context. Trial 8 was a *smoke* test — the real test is the next actual task run through the
   pipeline. Candidates above are queued.
2. **Fix bifrost's stale-provider misrouting for real.** The API delete fixed this box, but the cause
   is that `write-bifrost-config.sh` never reconciles the sqlite config store, so **every model swap
   silently leaves stale providers** (and can silently serve the *wrong model*, as it did to the
   coder). Owner is the `bifrost-gateway` feature, not this repo.
3. **`coder` is not on the model anyone thinks.** Flowing from (2): the coder's `qwen3.5-9b-mtp-s0`
   requests were answered by `:8089` (the 4B). Any result from the recent coder era should be treated
   as *4B-authored* until re-run post-fix.
4. **Scope.** Keep this journal architect-only, or grow a section per role?

## Pipeline run — underway issues (2026-10-15, autonomous)

Running the single-9B seat through the full HITL pipeline against `PLAN.md` while the human is away.
Issues surfaced **so far**, recorded as they happen (not a post-mortem):

1. **Stale-plan premise (caught by the fact-checker).** The first architect plan assumed
   `AlertRouteResource.java` referenced a cross-module `CapValidator.CAP_NAMESPACE` at lines 80/104.
   The fact-checker read the file: it **already has its own** `private static final String CAP_NAMESPACE`
   at **line 26**, used at lines 82/106; there is **no** `CapValidator` reference anywhere in
   `backend/alerting`. The "backend compile error" carried in from the prior session was **stale** — the
   file had since been rewritten. Lesson: the architect must be given **freshly read** ground truth, not a
   summary from an earlier turn.
2. **Plan wrote invalid Java.** That same plan rendered the constant value as
   `"urn:oasis:names:tc:emergency:cap:1.2;` — a stray semicolon *inside* the string literal. Would not
   have compiled. The fact-checker flagged it `high`.
3. **Wrong role assignment.** F4 (implement `AlertRuleDesigner.tsx`, a React/TSX component) was assigned
   to the `ui` agent. Per `AGENTS.md`, TypeScript/React implementation is the **coder**'s job (`ui` is
   HTML/CSS). Fact-checker flagged it `high`.
4. **Per-subtask check diverged from the gate.** The plan's per-subtask check
   (`mvn -B clean test -pl alerting -am`) is narrower than the statement's full-lane
   `mvn -B clean test`; a targeted module check does not prove the whole backend lane is green.
5. **The real backend failure is a *test* failure, not a compile error.** `AlertRouteCucumberTest`
   fails **5 of 11** scenarios in `features/alerting/alert-route.feature` (lines 14, 20, 31, 36, 40):
   two scenarios get HTTP **400** where 200 is expected, plus the area-scoped channel, the test-channel,
   and the fired-rule scenarios. `publication` was **skipped** in that run (reactor short-circuited on
   `alerting`), so its state is still unverified.
6. **Frontend lane confirmed.** `tsc --noEmit` → 9 errors (side-effect CSS import, unused `fireEvent`/`vi`/
   `setSelected`/`AlertFlow`, `never[]` inference on `useNodesState`/`useEdgesState`). `vitest` →
   **30 failed / 14 passed**: `AlertRuleDesigner.test.tsx` 21/24, `AlertRuleEdit.test.tsx` 6/8,
   `AlertFlow.test.tsx` 2/10, `smoke.test.tsx` 1/2. `AlertRuleDesigner.tsx` is still a ~2-line stub.
7. **4th bifrost stale-provider recurrence (hijack variant).** On the seat swap, the live store kept a
   dead `ministral-3-3b` provider at `:8089` whose key listed `qwen3.5-9b-mtp` + `-s0` — i.e. it could
   have captured coder traffic and served a dead port. Deleted it; the single remaining key now lists
   `-s0` **and** `-s1`.
8. **The frontend unit specs are over-constrained — this is the biggest open issue.** Measured, not
   guessed (temporary `zz-probe.test.tsx`, deleted after use):
   - `@testing-library`'s `getByText` **throws `Found multiple elements`** when >1 element matches, so
     *every* regex must match **exactly one** leaf element (its own direct text node — parent text does
     not count).
   - `features/frontend/*` give `AlertRuleDesigner`+`AlertRuleEdit` **32 regexes** whose alternatives
     *share words*: `json`∈{name/edges, save/post}, `save`∈{save/post, round-trip}, `reopen`∈{saved/
     restore, round-trip}, `saved`∈{saved/restore, tornado/saved/edit}, `edge`∈{rule path, remove/edge/
     node, cycle/refuse, rename/edge, name/edges}, `orphan`∈{orphan/invalid, orphan/connect, delete/
     dangling/orphan}, `condition`∈{condition, condition/value/severity, delete/dangling/orphan}. Those
     word-chains force most of the 32 into **one** leaf element — i.e. a word-salad "legend", which no
     coherent palette/canvas UI can produce. `condition` is additionally forced to be the *clickable*
     element (one test clicks `/condition/i` then expects `/condition node/i`), which also forces
     `severity/urgency/certainty` to sit in that same button and forbids `delete/dangling/orphan`
     anywhere else.
   - **ReactFlow cannot appear in the designer at all**: it always injects two `display:none` a11y divs
     (`react-flow__node-desc-1`, `react-flow__edge-desc-1`) whose text contains `node`/`remove`/`select`/
     `edge`. Measured with ReactFlow mounted: `/remove|edge|node/`→**2 matches** and
     `/keyboard|focus|select/`→**2 matches** *before the component adds any text of its own*. These divs
     are rendered unconditionally (only their wording swaps under `disableKeyboardA11y`), and can only
     be silenced by overriding the `ariaLabelConfig` prop — i.e. by neutering real a11y copy to dodge
     assertions. `AlertFlow` is unaffected (its regexes never touch `node/edge/remove/select`).
   - `AlertFlow.test.tsx` has no fetch mock (`vite.config.ts` `test` block has no `setupFiles`), so all
     its cases observe the `loading` state; test 7 asserts `/sirens|broadcast/i` with **no** `|Loading`
     fallback while its e2e twin uses `/sirens|broadcast|Loading/i` — an internal inconsistency.
   - Also: `@xyflow/react` **throws `ResizeObserver is not defined`** under jsdom, so *any* ReactFlow
     render needs `ResizeObserver` + `DOMMatrixReadOnly` polyfills in a vitest setup file.
   - **Options for the human:** (a) implement a real canvas and correct the defective assertions
     (use `getAllByText`/add the missing `|Loading`), (b) ship a legend-style designer that satisfies the
     letters of all 32 without touching tests, or (c) override `ariaLabelConfig` + no-ReactFlow designer.
     I am proceeding with the least-gamey option that still lands a real canvas, and will list every
     test touched here for review.
9. **The 9B coder burned its whole 100-step budget on one combined backend directive.** The directive
   bundled "fix the URI typo + wire area channels + add a missing @When step". It landed *partial* work
   — added the missing `@When("an alert with urgency {string} is received")` step (now
   `AlertRouteSteps.java:91`) and added an `areaChannels` field + `setAreaChannels` seam to
   `AlertRouteResource.java:31,39`, and reworked `defaultChannels(String area)` — but **did not apply
   the actual typo fix**, and left `channelsForAreas` as a no-op comment. Lesson: for this seat, one
   surgical literal per directive, with the exact file+line inlined; a multi-edit directive makes it
   re-hunt and exhaust its budget.
10. **I misattributed the typo's file to the architect — the 9B followed my error.** I told the architect
    the `http://xml.org.sax/...` typo was in `AlertRouteSteps.java`. It is actually in
    **`AlertRouteResource.java:90`** (inside the resource's own `parseAlert`, next to a *correct* line 89
    `http://xml.org/sax/features/external-general-entities`). Because the coder was pointed at the wrong
    file, the single change that unblocks the two `expected 200 but was 400` scenarios was never made.
    The backend still fails on exactly this line.
11. **A `publication` syntax error was *masked* until alerting went green.** Maven's reactor short-circuits
    at the first failing module, so `publication` had never been compiled in the failing runs. The moment
    alerting's 5 cucumber scenarios passed, the reactor reached `publication` and stopped at
    `RuleDesignResource.java:[209,102] illegal character: '\'` — a mangled string concatenation in
    `compileToDrl()` (line 209 splices `.append(field)` *inside* a string literal instead of closing the
    literal first, unlike the correct sibling on line 211). So "backend green" was always two bugs behind
    one another. Lesson: treat `mvn -B clean test` from `backend/` as the only backend gate — a module- or
    test-scoped run hides downstream modules entirely.
12. **Once `publication` finally compiled, it turned out the module was ~half-written, and the "failures"
    are almost all unfinished *glue*, not broken production code.** With the app booting, the single
    `AlertPublishCucumberTest` runs **all 34 publication scenarios** (I had wrongly assumed a runner was
    needed per feature — `quarkus-cucumber` discovers every `*.feature` on the classpath from one
    `CucumberQuarkusTest`). 12 fail, in three families — and, tellingly, **five of the twelve are
    cucumber "undefined step" failures, not assertions**:
    - **alert-flow (5):** every `@Given` in `AlertFlowSteps` is an empty stub (`alertPublished` literally
      has the body `// Alert is stored via AlertResource`), so no alert is ever stored, the GET 404s, and
      `lastDistribution` stays null → 3 NPEs + 2 "expected 200 but was 404". The `readDistributionTwice`
      step also never sets `lastDistribution`.
    - **alert-rule-design (5):** 3 × "expected 400 but was 200" + 2 undefined steps. The `@Given` steps
      only set a `graphName` string and `saveGraph()` unconditionally calls `buildGraph()` — the
      already-written helpers `buildOrphanGraph()`, `buildDuplicateIdGraph()`, `buildCycleGraph()` are
      **dead code**, so the invalid graphs are never actually submitted. Two step definitions
      (`the graph {string} has a condition on severity {string}`) are missing entirely.
    - **alert-rule-edit (2):** 1 undefined step + 1 × "expected 404 but was 200". `RuleEditResource.save`
      computes `boolean isCreate` and never uses it — the "an edit for a graph that was never stored is
      refused" 404 case was simply never implemented, and the glue's `postEdit` calls the same `save` as
      the create path, so it cannot be distinguished.
    Reflection: the specs (`features/*.feature`) were frozen and mostly fine; the rot is in the **glue and
    the thin resource bodies behind it**. Worth checking dead/unused helpers and empty-method stubs in any
    lane that "compiles but fails" — that pattern flagged most of this without reading a single assertion.
