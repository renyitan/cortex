# cortex consolidation transaction contract

> Canonical reference for turning a model-judged memory proposal into exact, reviewable writes.
> The model owns synthesis. The tool owns validation, preview, pre-image checks, replacement, and
> receipts.

## Boundary

The transaction tool may change only:

- `memory/learnings.md`;
- `memory/decisions.md`;
- `workspace/<track>/intake.md`.

Skill and identity proposals remain ordinary git-reviewed source changes. The transaction tool cannot
approve its own plan, delete a record, write outside the repository, or make a cross-file atomicity
claim.

Plans and receipts are local operational evidence:

```text
.cortex/consolidation/<plan>.json
.cortex/transactions/<transaction-id>.json
```

They may contain proposed record text, so they stay gitignored and private.

## Flow

```text
intake + evidence
        |
        | model judgment
        v
+------------------+    invalid    +------------------+
| draft JSON plan  +-------------->| rejected reason  |
+--------+---------+               +------------------+
         |
         | prepare hashes
         v
+--------+---------+    stale      +------------------+
| exact diff       +-------------->| recompute plan   |
+--------+---------+               +------------------+
         |
         | explicit approval
         v
+--------+---------+
| verify preimages |
+--------+---------+
         |
         | compute all outputs first
         v
+--------+---------+    later file fails    +----------------------+
| atomic replace   +----------------------->| partial receipt      |
| one file at time |                        | reconcile, then resume|
+--------+---------+                        +----------------------+
         |
         | all targets replaced
         v
+--------+---------+
| complete receipt |
+------------------+
```

## Plan

Schema: `cortex.consolidation-plan/v1`.

Required metadata:

- `transaction_id`, `created_at`, `proposer`, `origin`, and `run_kind`;
- unique `candidate_refs` and `evidence_refs`;
- `approval.status` plus `approval.approver_class` when approved;
- ordered operations whose `index` matches their array position;
- one target contract per target path, with memory targets before intake targets and
  first-operation order preserved within each class.

`prepare` computes each target's SHA-256 pre-image and proposed result hash after folding every
same-file operation in order. `validate`, `preview`, and `apply` reject a changed pre-image or result
hash.

Supported operations:

| Operation | Required behavior |
| --- | --- |
| `append_record` | Append one valid, atomic record to the named memory store |
| `replace_record` | Replace one exact stable ref without changing its key |
| `intake_status` | Move one hashed `open` or `proposed` line to `drained` or `rejected` |

A drained intake operation requires `derives_to`, which must resolve uniquely in the computed
post-image memory stores. A rejected operation requires a one-line reason.
The original note remains in the file in both cases.

Minimal draft shape:

```json
{
  "schema": "cortex.consolidation-plan/v1",
  "transaction_id": "sleep-20260701-01",
  "created_at": "2026-07-01T12:00:00Z",
  "proposer": "model",
  "origin": "episode:example",
  "run_kind": "done",
  "candidate_refs": [
    "workspace/example/intake.md::line-sha256:<sha256>"
  ],
  "evidence_refs": [
    "workspace/example/episode.md"
  ],
  "approval": {
    "status": "pending",
    "approver_class": null
  },
  "operations": [
    {
      "index": 0,
      "op": "append_record",
      "target": "memory/learnings.md",
      "record": "### example ...\n"
    },
    {
      "index": 1,
      "op": "intake_status",
      "target": "workspace/example/intake.md",
      "candidate_ref": "workspace/example/intake.md::line-sha256:<sha256>",
      "from": "open",
      "to": "drained",
      "derives_to": "example"
    }
  ]
}
```

The `record` value contains the complete canonical Markdown record with escaped newlines. `prepare`
adds `targets` with pre-image and result hashes.

Validation rejects path traversal, symlink targets, missing candidates or evidence, duplicate keys,
unresolved `derives-from:` parents, drained links without a post-image memory record, malformed
fields, non-atomic added or replaced insights, invalid tags on added or replaced records, ambiguous
ordering, unapproved apply, stale intake state, and delete-shaped operations.

Unchanged legacy records do not block an otherwise valid transaction solely because their insight
or tag count predates the current quality rules. Required fields, types, scopes, dates, keys, and
derivation links remain validated globally. The moment a transaction adds or replaces a record,
that record must satisfy the current atomicity and tag rules.

## Commands

```bash
.cortex/bin/consolidate-transaction inspect-intake \
  workspace/<track>/intake.md --json

.cortex/bin/consolidate-transaction prepare \
  .cortex/consolidation/draft.json \
  --output .cortex/consolidation/prepared.json

.cortex/bin/consolidate-transaction validate \
  .cortex/consolidation/prepared.json --json

.cortex/bin/consolidate-transaction preview \
  .cortex/consolidation/prepared.json

.cortex/bin/consolidate-transaction apply \
  .cortex/consolidation/prepared.json --json

.cortex/bin/consolidate-transaction reconcile \
  .cortex/transactions/<transaction-id>.json --json
```

The approver changes the prepared plan from `pending` to `approved` and names `operator` or
`self_authorized_agent`. Run validation and preview again after that edit, then apply.

## Application and recovery

The tool serializes apply and reconciliation with a repository-wide lock held across pre-image
validation, replacement, and receipt updates. It computes every post-image before writing, writes a
temporary file beside each target, flushes it, and atomically replaces that one file. It records each
completed replacement in the receipt before proceeding. Memory targets are always replaced before
intake targets, regardless of operation order, so a partial transaction cannot mark an intake note
drained before its named durable record exists.

There is no cross-file transaction primitive. If a later replacement fails, the receipt says
`partial`. `reconcile` compares every target's current hash with its planned pre-image and result:

- `partial_ready`: applied files match results and pending files match pre-images; rerun `apply`;
- `complete`: every file matches its result;
- `not_applied`: every file still matches its pre-image;
- `conflict`: at least one file matches neither; stop and resolve it explicitly.

A reconciliation persists each observed target state back into the receipt. This closes the crash
window where a replacement reached disk but the following receipt update did not: a result-hash
target becomes `applied`, and the next `apply` resumes only the remaining `pending` targets.

A complete receipt makes a repeated apply idempotent. A transaction ID cannot be reused for a
different plan hash. If a pending plan was applied and rejected, or a plan became stale, its
replacement uses a new transaction ID so the earlier receipt remains intact.

Git remains the durable audit and rollback layer. Before reverting a partially applied change,
reconcile its receipt so every changed target is known.
