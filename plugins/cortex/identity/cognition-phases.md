# cortex cognition phase runtime contract

> Canonical lifecycle and recovery contract for observable `WAKE`, `WORK`, `SLEEP`, and `CURATE` phase
> execution. The event log is evidence; removable state only makes current work efficient.

## Identity

One helper command owns one `run_id`. Multi-command lifecycle identity is separate:

- `expect` creates an `expectation_id`.
- `start` creates a `phase_instance_id`; its command `run_id` is recorded as
  `phase_start_run_id`.
- Exact terminal and effect events repeat the lifecycle identifier and parent their command run to
  `phase_start_run_id`.
- Pre-P1 events remain valid without phase identifiers. The meaning of `run_id` does not change.

All lifecycle IDs are opaque UUID-like values. A phase may link one compatible pending expectation
in its lane. Timing alone never creates an exact link.

## Lanes, owners, and nesting

The harness may pass an explicit lane and UUID owner through arguments or
`CORTEX_PHASE_LANE_ID` and `CORTEX_PHASE_OWNER_ID`. The first successful lifecycle command creates
an unguessable UUID-like owner receipt under `.cortex/cognition-phase/owners/`, returns its token,
and stores the lane, owner, hashes, and lease in that mode-0600 local file. Later natural skill calls
pass only `--receipt-id` or `CORTEX_PHASE_RECEIPT_ID`; the helper resolves lane and owner locally.
Events contain only lane and owner hashes. They never contain the receipt token or raw identity.

The default lease is 30 minutes from the latest lifecycle or exactly parented mechanism event.
Tests may set `CORTEX_PHASE_LEASE_SECONDS` from 1 through 1800. A second owner cannot merge into the
lane; a new owner uses a new lane. The helper returns advisory `concurrent_lane` and leaves the
primary caller free to continue.

One lane has one active root phase. A nested start is accepted only with
`--parent-phase-instance-id` naming an active phase in that lane. No command infers nesting from
time, process ancestry, or another lane.

## Commands

```text
cognition-phase expect
cognition-phase start
cognition-phase complete
cognition-phase skip
cognition-phase finalize --session-ended
cognition-phase status
cognition-phase reconcile
```

`expect --if-absent` lets a runtime trigger adopt one compatible pending harness expectation or
reuse one compatible pending runtime expectation. It emits no duplicate denominator event. Initial
`expect` returns `receipt_id` and
`CORTEX_PHASE_RECEIPT_ID`. Every command accepts that receipt instead of raw lane and owner.
`start` links one exact pending expectation when available and returns the receipt plus exact phase
environment for runtime tools. `complete --receipt-id ...` may omit `--phase-instance-id`; it then
selects the single active leaf phase in that receipt's lane. Zero leaves returns
`active_phase_not_found`, and multiple leaves return `active_phase_ambiguous`. `complete` accepts
only `ok` or `failed`. `skip` requires a bounded reason code.

`finalize --session-ended` immediately emits `phase.missed` for every pending expectation and
`phase.abandoned` for every active phase. Required and offered expectations retain their distinct
requirements. `reconcile` performs the same terminals after lease expiry. Duplicate or conflicting
terminals remain named ordering errors.

Every JSON response is deterministic. `status`, `reconcile`, and `finalize` also support Markdown
output. Invalid CLI values exit nonzero. Observability, ownership, state, and event-sink failures are
advisory: the helper exits successfully with `ok:false`, emits a bounded warning reason, and never
changes canonical Markdown.

## Authoritative log and recoverable cache

The append-only cognition event log is authoritative. `.cortex/cognition-phase/state.json` is a
mode-0600 cache.

Each mutation:

1. takes the phase-state lock;
2. rebuilds and validates lifecycle state from the event log;
3. validates owner, ordering, and explicit parent;
4. appends the lifecycle event while still holding the phase lock;
5. updates the cache and owner receipt.

This fixes lock order as phase state before event append. If a process stops after step 4,
`reconcile` reconstructs the missing cache change. Cache entries without valid events are discarded
and reported. Valid terminal events defeat stale active cache state. Conflicting valid terminals
remain an error rather than being rewritten.

State, locks, receipts, and event paths must be repository-relative, descriptor-opened without
following symlinks, and private to the user. Canonical memory and workspace Markdown are outside the
helper's write authority. Receipt filenames are UUID-like tokens, not lane hashes. Invalid, missing,
or lane/owner-mismatched receipts fail with bounded reasons. Mutating commands reject stale receipts;
`status`, `reconcile`, and session finalization may resolve one only to inspect or terminalize its
expired lane.

## Exact runtime parenting

`cognition-phase start` returns these explicit values:

```text
CORTEX_PHASE_RECEIPT_ID
CORTEX_PHASE_INSTANCE_ID
CORTEX_PHASE_START_RUN_ID
CORTEX_PHASE_NAME
CORTEX_PHASE_SKILL
```

Natural runtime emitters receive `CORTEX_PHASE_RECEIPT_ID`, not raw lane or owner. Harness callers
may still pass explicit lane and owner. The event emitter resolves and validates the receipt and
exact active phase under the state lock, parents the mechanism event to its invocation run, repeats
the phase instance, and renews the lease. It does not inspect ambient active phases across lanes.
Mechanism events with absent, incomplete, or stale context still stand on their own with
unavailable correlation.

Consolidation accepts the same receipt as its complete phase context. It resolves the single active
leaf from authoritative events, verifies any supplied phase fields against that record, and emits
exactly parented mechanism and committed-effect events. Raw phase, start-run, lane, and owner fields
remain supported for controlled harnesses.

## Durable effects

The consolidation transaction is the authoritative emitter for its durable effects. After all
target writes succeed and the mode-0600 completed receipt is durable, it may emit exactly correlated
`phase.effect_committed` events for `memory_write` and `intake_transition`. Missing exact phase
context emits no effect claim. Event failure reports a bounded warning and never rolls back the
completed transaction.
