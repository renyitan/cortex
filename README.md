# cortex

[![Project status: active](https://img.shields.io/badge/status-active-2ea44f)](https://github.com/renyitan/cortex)
[![CI](https://github.com/renyitan/cortex/actions/workflows/ci.yml/badge.svg)](https://github.com/renyitan/cortex/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> [!NOTE]
> **Cortex is under active development.** Version `0.33.0` remains the latest reviewed plugin
> baseline while newer evaluation and lifecycle work evolves on `main`.

Cortex is a cognition framework for long-running coding agents. It packages a memory
model, five procedural skills, and a small host adapter that binds those instructions to an agent's
own persona. The agent's memory and work stay as Markdown in the agent's repository.

The project is useful as a concrete design reference for three ideas:

1. durable agent state should remain readable and owned by its operator;
2. rebuildable indexes should be separated from noncanonical but irrecoverable audit evidence;
3. lifecycle claims should distinguish what a host enforces from what the model is merely asked to
   do.

## Runtime model

![Cortex `cognition cycle` showing `WAKE`, `WORK`, `SLEEP`, and `CURATE` with their shipped enforcement boundaries](docs/diagrams/cognition-cycle.png)

Cortex organizes cognition into four semantic responsibilities:

- `WAKE` mounts state and recalls relevant memory.
- `WORK` grounds decisions and captures candidates.
- `SLEEP` consolidates durable records.
- `CURATE` reviews memory quality.

The cycle describes responsibilities, not four guaranteed host callbacks. Mounting is host-enforced
in the verified adapter, while recall, consolidation, and curation remain model- or operator-owned.

## What the release contains

| Part | Role |
|---|---|
| `plugins/cortex/identity/` | Host-neutral cognition, authority, memory, and observability contracts |
| `plugins/cortex/skills/` | Cognition procedures for recall, consolidation, curation, work tracking, and filing |
| `plugins/cortex/bin/` | Agent projection and session-start mounting |
| `plugins/cortex/tools/` | Local retrieval, event, phase, reference, and transaction helpers |
| `.claude-plugin/marketplace.json` | Marketplace entry for the committed plugin |
| `scripts/` | Repository maintenance utilities |
| `tests/` | Deterministic regression tests for local mechanisms and state contracts |

The verified adapter is for GitHub Copilot CLI. `cortex-bind` can also generate a Claude Code
entrypoint, but Cortex does not claim equivalent lifecycle enforcement there.

## What the evidence supports

The checked-in tests cover manifest consistency, binding, state scaffolding, bounded retrieval
projection, fallback behavior, content-minimal events, phase accounting, and validated
consolidation writes.

They do **not** establish that an LLM attended to recalled memory, that the full `cognition cycle` ran
automatically, or that Cortex improved task quality in general. The host can run a mount hook and
record an expectation. Recall, consolidation, and curation still depend partly or entirely on model
or operator judgment.

See [Findings and limitations](docs/findings.md) for the concise evidence boundary.

## Run Cortex

Requirements:

- Git
- Python 3.10 or later
- Bash
- [GitHub Copilot CLI](https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli)

Clone Cortex:

```bash
git clone https://github.com/renyitan/cortex.git
cd cortex
```

Cortex runs as a local Copilot CLI plugin from the checked-out source. Create and launch a starter
agent in a separate repository:

```bash
./try-cortex.sh
```

The script creates `../example-agent` as a Git repository, scaffolds the agent, and launches it with
the plugin from this checkout. Pass another destination as its only argument, for example
`./try-cortex.sh ../my-agent`.

The underlying installer creates an agent persona, `memory/`, `workspace/`, generated host
instructions, local tool links under `.cortex/`, and a version pin. It does not register, install,
or update a remote plugin. Run it only where those changes are expected. Cortex tools inherit your
filesystem permissions; they are not a sandbox.

### How Cortex loads into an agent

![Cortex session-start flow from the reviewed plugin through the enforced host callback and mount to canonical Markdown, the generated entrypoint, rebuildable projections, irrecoverable local evidence, and the ready session](docs/diagrams/runtime-flow.png)

At session start, the Copilot hook runs `cortex-mount`. In a repository containing
`agents/*.md`, it:

1. records a best-effort `WAKE` expectation;
2. creates missing Markdown state homes;
3. regenerates host instructions from Cortex identity plus the local persona;
4. exposes plugin tools through gitignored local links;
5. ensures the rebuildable retrieval index is usable, falling back to grep when needed;
6. reconciles the local Cortex version pin.

This is loading and observability, not proof that recalled content reached or changed the model.
The full data flow and failure behavior are documented in [Architecture](docs/architecture.md).

## Tests

From the Cortex source checkout, run the repository linter and deterministic regression tests:

```bash
scripts/cortex-lint
for test in tests/test-*; do "$test"; done
```

These tests cover Cortex's local mechanisms and state contracts. They do not evaluate model
behavior or task quality.

## Repository guide

| Path | Read this for |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Implemented components, startup flow, state ownership, and failure boundaries |
| [`docs/findings.md`](docs/findings.md) | Current evidence boundaries, including the reviewed `v0.33.0` baseline |
| [`plugins/cortex/identity/capabilities.md`](plugins/cortex/identity/capabilities.md) | Enforcement levels and authority boundaries |
| [`plugins/cortex/identity/memory-visibility.md`](plugins/cortex/identity/memory-visibility.md) | Canonical memory, projections, and retrieval visibility |
| [`plugins/cortex/identity/cognition-events.md`](plugins/cortex/identity/cognition-events.md) | Local event schema and privacy floor |
| [`CHANGELOG.md`](CHANGELOG.md) | Historical release notes |
| [`RELEASING.md`](RELEASING.md) | Release validation and source baseline |

## License and citation

Forks and adaptations are permitted under the [MIT License](LICENSE). Review the
[`SECURITY.md`](SECURITY.md) boundary before adoption. Citation metadata is available in
[`CITATION.cff`](CITATION.cff).
