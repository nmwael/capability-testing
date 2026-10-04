# capability-testing
Capability testing framework for BDD with Cucumber/Gherkin, backed by Quarkus and React.

## Stack
- BDD: Cucumber, Gherkin
- Backend: Quarkus (Java)
- Frontend: React
- Testing: Quarkus Cucumber (io.quarkiverse.cucumber:quarkus-cucumber)

## Local LLM stack (profile q)

The box runs the local `q` profile (from agentic-code-box):

- **qwen3-8b** (Q4_K_M) — llama-server on :8089, context 16384, slot 0; serves architect, researcher, reviewer, build, ui, artist, ai-researcher
- **qwen2.5-coder-7b** (Q4_K_M) — llama-server on :8090, context 8192, slot 0; serves the coder role
- Expect ~9 GiB weights / ~10.9 GiB VRAM — a >=12 GiB GPU is required
- Routing: llama-server -> bifrost gateway :8082 -> opencode :4096

Lifecycle:
- `bash scripts/post-create.sh` — verify the box and scaffold the agent payload (postCreateCommand)
- `bash scripts/auto-startup.sh` — start the llama-server(s), bifrost and opencode serve (postStartCommand)
- `bash scripts/fetch-models.sh` — download GGUF weights into `models/`

Note: `.devcontainer/llm-lab-{models,roles}.json` are build-time inputs for the `models` feature — changing the profile requires `devcontainer up --workspace-folder .`.
