# cortex cognition event contract

> Canonical schema for content-minimal evidence emitted by cortex runtime tools. Events make
> mechanism execution inspectable without turning private work or memory into telemetry.

## Storage and ownership

The default sink is `.cortex/cognition-events.jsonl` in the consumer repository. It is:

- local and gitignored;
- append-only during normal operation;
- serialized through a local file lock;
- removable without loss of canonical state;
- disabled with `CORTEX_EVENTS=off`;
- redirected within the repository with
  `CORTEX_EVENTS_FILE=<repository-relative-path>`.

Absolute paths, parent traversal, and symlinked sink directories are rejected. The repository root
and every sink directory are descriptor-pinned before the file is opened, so a path swap cannot
redirect an append outside the repository.

Failure to append an event must not change the primary operation's result. A tool may report an
event-write warning on stderr, but it must not claim that the primary operation failed.

## Envelope

Each line is one UTF-8 JSON object:

```json
{
  "schema_version": "1",
  "event_id": "019...",
  "timestamp": "2026-07-01T12:00:00Z",
  "event_type": "retrieval.search",
  "repo_id": "<sha256>",
  "episode_id": null,
  "run_id": "019...",
  "turn_id": null,
  "parent_run_id": null,
  "component": "retrieval",
  "status": "ok",
  "duration_ms": 14,
  "attributes": {
    "counts": {"returned": 1},
    "hashes": {"query_sha256": "..."},
    "mode": "bm25",
    "scope": "global"
  },
  "artifact_refs": ["memory/learnings.md::search-before-building"],
  "capability_manifest_hash": "<sha256>"
}
```

Every envelope carries the fields shown above. Empty causal IDs are `null`; empty attributes and
artifact refs remain empty containers. Timestamps are UTC RFC 3339 values. `run_id` correlates events
from one command; it is not a user, session, or host identity. `repo_id` is a hash, never a path.

Tests may inject `CORTEX_EVENT_TIME` and `CORTEX_EVENT_RUN_ID`. Production callers omit both.
`run_id` remains the identity of one helper or runtime command. A phase spanning several commands
uses `expectation_id` and `phase_instance_id`; it never reuses the invocation command's `run_id` as
the phase identity.

## Initial event vocabulary

| Event | Status values | Minimum useful evidence |
| --- | --- | --- |
| `retrieval.ensure` | `ok`, `degraded`, `failed` | changed flag, mode, indexed count, duration |
| `retrieval.rebuild` | `ok`, `failed` | mode, indexed count, duration |
| `retrieval.search` | `ok`, `degraded`, `failed` | query hash, scope, returned count, mode |
| `retrieval.fetch` | `ok`, `not_found`, `failed` | requested ref, returned count |
| `retrieval.expand` | `ok`, `partial`, `not_found`, `failed` | start refs, hops, returned count |
| `intake.capture_nudge` | `nudged` | active track count, quiet-turn estimate |
| `intake.drain_nudge` | `nudged` | open count, oldest age bucket |
| `intake.drain_outcome` | `effective`, `ineffective`, `unknown` | before and after counts |
| `consolidation.plan_validated` | `ok` | plan hash, operation and target counts |
| `consolidation.plan_rejected` | `rejected` | plan hash and bounded reason code |
| `consolidation.apply_started` | `ok` | plan hash and target count |
| `consolidation.apply_completed` | `ok` | plan hash, transaction ID, target counts |
| `consolidation.apply_partial` | `partial` | plan hash, transaction ID, target counts |
| `consolidation.apply_failed` | `failed` | plan hash, transaction ID, target counts |
| `phase.expected` | `due` | phase, skill, trigger, expectation, lane |
| `skill.loaded` | `observed` | skill, correlation, lane; phase only when exact |
| `phase.invoked` | `started` | phase instance, invocation run, expectation when exact |
| `phase.completed` | `ok`, `failed` | phase instance and invocation parent |
| `phase.skipped` | `skipped` | expectation and bounded reason |
| `phase.missed` | `missed` | expectation, requirement, bounded reason |
| `phase.effect_committed` | `ok` | exact phase instance, receipt ref, named effect |
| `phase.abandoned` | `abandoned` | expired phase instance and invocation parent |

The phase vocabulary is locked:

```text
phase:       wake | work | sleep | curate
skill:       recall | consolidate | curate | encode | ambient
trigger:     session_start | work_boundary | episode_done | iteration_done |
             recurrence | operator_request | curate_debt | structural_change |
             audit_failure
origin:      runtime | harness
requirement: required | offered
enforcement: enforced | nudged | model_owned | operator_invoked | unknown
correlation: exact | temporal | unavailable
effect:      none | memory_write | intake_transition | skill_change |
             episode_archive | index_refresh | report_write
```

`expectation_id` and `phase_instance_id` are UUID-like opaque values. `phase_start_run_id` is the
command-scoped `run_id` of `phase.invoked`. `lane_id_hash` and `owner_id_hash` are SHA-256 values.
Raw lane, owner, and `CORTEX_PHASE_RECEIPT_ID` values never enter the event log. Runtime lifecycle
events carry the bounded lease duration used by their lane; an uncorrelated host `skill.loaded`
observation need not.

An exact terminal repeats the phase instance and start-run identifiers and sets `parent_run_id` to
`phase_start_run_id`. `phase.effect_committed` may precede `phase.completed` because a durable
transaction receipt can exist before the cognition procedure exits.

Existing runtime events may receive exact phase context through explicit harness lane/owner
arguments or the opaque `CORTEX_PHASE_RECEIPT_ID` and phase environment returned by
`cognition-phase start`. The emitter resolves the receipt locally and validates the exact lane,
owner, active phase, and start run while holding the phase-state lock before taking the event append
lock. It then adds the exact parent and renews the lease. It never searches other lanes or selects
an active phase by timing. Incomplete or stale context leaves the mechanism event intact with
unavailable correlation.

`degraded` means the command completed through its documented fallback. `partial` means some named
targets or graph edges could not be produced and the result says which ones.

## Privacy floor

Events must not contain:

- query text, prompts, responses, intake notes, record bodies, or evidence prose;
- credentials, environment-variable values, absolute home paths, or remote URLs with tokens;
- user, operator, machine, repository names, or repository paths; `repo_id` is a one-way hash;
- arbitrary exception text that may echo content.

Use hashes, counts, stable record references, bounded enums, durations, and reason codes. A query
hash is SHA-256 over the exact UTF-8 query and supports same-input correlation only.

Reason codes are stable identifiers such as `sidecar_missing`, `sqlite_unavailable`,
`stale_projection`, `ref_not_found`, `preimage_mismatch`, and `event_write_failed`. Human-readable
diagnostics belong on stderr, with content still redacted.

## Interpretation boundary

```text
+-------------+    emits evidence    +-------------------+
| Cortex tool +--------------------->| Local event file  |
+------+------+                      +---------+---------+
       |                                       |
       | returns result                        | inspect/export explicitly
       v                                       v
+------+------+                      +---------+---------+
| Caller      |                      | Optional adapter  |
+-------------+                      +-------------------+
```

The event proves only that the emitting code path observed the named mechanism state. Without a
verified host adapter, it does not prove that:

- retrieved content entered model context;
- the model attended to or used the content;
- a nudge caused capture or consolidation;
- cognition quality improved.

An OpenTelemetry GenAI adapter may map this envelope into spans or events. The local JSONL contract
remains canonical, and OpenTelemetry is never required for cortex to operate.
