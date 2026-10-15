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
