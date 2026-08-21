# cortex memory visibility contract

> Canonical reference for memory tiers, persistence, retrieval, promotion, and review state.
> Visibility describes what can be inspected. It does not claim that a model received the content.

## Tiers

| Tier | Canonical location | Persistence | Retrieval surface | Write authority |
| --- | --- | --- | --- | --- |
| Resident cognition | Generated host entrypoint | Until regenerated | Host instruction loading | `cortex-bind` from identity plus persona |
| Semantic memory | `memory/learnings.md`, `memory/decisions.md` | Git history | Direct read or `recall-index` | Validated consolidation or explicit edit |
| Episodic work | `workspace/<track>/` | Git history | Direct read and track navigation | Active agent work |
| Intake | `workspace/<track>/intake.md` | Git history | Recall debt scan and direct read | Append during `WORK`; drain during `SLEEP` |
| Procedural memory | Shipped `skills/*/SKILL.md` | Plugin release history | Host-native skill invocation | Cortex source change and release |
| Retrieval projection | `memory/cortex-index.db` | Local, gitignored | `recall-index` | `WAKE` ensure or explicit rebuild from semantic memory |
| Cognition trace | `.cortex/cognition-events.jsonl` | Local, gitignored | Direct inspection | Content-minimal event append |
| Transaction evidence | `.cortex/consolidation/`, `.cortex/transactions/` | Local, gitignored | Preview, receipt, reconciliation | Consolidation transaction tool |

The sidecar and operational evidence are projections. Deleting them must not delete memory.

## State and promotion

An observation does not become durable semantic memory merely because it appeared in conversation.

```text
                         recurrence or durable value
+------------+  capture  +---------+  validated proposal  +-----------+
| Experience +---------->| Intake  +--------------------->| Semantic  |
+------------+           +----+----+                      | memory    |
                              |                           +-----+-----+
                              | reject                          |
                              v                                 | bake in
                         +----+-----+                           v
                         | Drained  |                     +-----+-----+
                         | evidence |                     | Skill or  |
                         +----------+                     | identity  |
                                                          +-----------+
```

Intake statuses mean:

- `open`: captured but not reviewed;
- `proposed`: mapped to a candidate durable change;
- `accepted`: approved for an exact transaction;
- `rejected`: reviewed and retained with a reason;
- `drained`: applied or otherwise resolved, with a provenance link where applicable.

Imported records remain provisional until observed work confirms them. Operator and observed
evidence outrank imported evidence in a conflict. Decisions are superseded, never silently erased.

## Retrieval visibility

The canonical retrieval reference is:

```text
<repo-relative-store>::<record-key>
```

Example:

```text
memory/learnings.md::search-before-building
```

A stable reference identifies a Markdown record. It does not identify a sidecar row permanently;
the sidecar is rebuildable and may assign different internal row IDs.

Retrieval operations expose different evidence:

| Operation | Evidence produced | What it does not prove |
| --- | --- | --- |
| `search` | Ranked references and record summaries | Model delivery or use |
| `fetch` | Exact canonical record for one reference | Relevance to the current task |
| `expand` | One- or two-hop provenance and association neighbors | Causal influence |
| `status` | Projection availability, mode, count, and degradation | Freshness unless audit passes |
| `audit` | Canonical/projected record agreement | Behavioral quality |

Scope selectors are semantic:

- `global` matches records whose stored `scope:` is `global`;
- `track:<slug>` matches records whose stored `scope:` is `<slug>`;
- `all` disables scope filtering.

No selector implies an active track automatically. A caller must provide that meaning explicitly.

## Provenance and graph visibility

`derives-from:` is a hard provenance edge. Both endpoints must exist, and retrieval traverses it in
both directions so a source can find its synthesis and a synthesis can find its sources.

`see-also:` is a soft association. Retrieval traverses it in both directions, but a missing target is
an advisory defect rather than proof that the record itself is invalid.

Operational events and transaction receipts may name stable references. They must not duplicate
private record text. Canonical content stays in Markdown and is fetched only when explicitly asked.
