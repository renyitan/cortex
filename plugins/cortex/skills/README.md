# Cortex skills

These five `SKILL.md` files are the procedural instructions shipped by the Cortex plugin. GitHub
Copilot CLI is the verified host. The files use a flat, host-discovered directory layout; `family`
and phase metadata are documentation aids, not nested runtime namespaces.

Other hosts may be able to read the Markdown, but Cortex does not claim equivalent skill discovery,
invocation, lifecycle hooks, or enforcement outside the verified adapter.

## Cognition procedures

| Skill | Phase | Responsibility |
|---|---|---|
| **recall** | `WAKE` / `WORK` | Surface a bounded memory set at session start and retrieve targeted candidates before non-trivial work |
| **consolidate** | `SLEEP` | Mine completed evidence, propose durable records, and apply approved memory changes through the validated transaction path |
| **curate** | `CURATE` | Audit memory quality and propose reviewed deduplication, repair, demotion, or retirement |

`WORK` is a resident instruction rather than a separate skill. Grounding and capture remain
model-owned; the `Stop` hook can nudge attention but cannot make the judgment or complete `SLEEP`.

## Work-state procedures

| Skill | Responsibility |
|---|---|
| **encode** | Keep one bounded episode resumable from intake through completion, then require the model-owned `SLEEP` handoff |
| **filing** | Give tracks, episodes, and artifacts one canonical home under `workspace/` |

## Enforcement boundary

Loading a skill proves only that the host returned its procedure. It does not prove that the model
followed the procedure, that retrieved content reached model context, or that behavior improved.
Executable enforcement is limited to the mechanisms named in
[`../identity/capabilities.md`](../identity/capabilities.md).
