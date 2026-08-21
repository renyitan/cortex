# cortex capability and authority contract

> Canonical reference for what cortex means, what a host can enforce, and who may change state.
> The `cognition cycle` is host-neutral. Enforcement is adapter-specific and must never be inferred.

## Semantic stages are not lifecycle callbacks

`WAKE`, `WORK`, `SLEEP`, and `CURATE` name cognition responsibilities. They do not prove that a host exposes
the event needed to run them automatically.

| Stage | Semantic responsibility | Required evidence for "enforced" | Honest degradation |
| --- | --- | --- | --- |
| `WAKE` | Surface relevant memory and open work | A verified start or resume callback invokes recall | The model invokes recall; stores remain readable |
| `WORK` | Ground before work and capture as experience surfaces | Verified pre-work and post-turn callbacks cover both reflexes | The model owns both reflexes |
| `SLEEP` | Validate and promote eligible observations | A verified lifecycle callback invokes consolidation | Intake debt stays visible until consolidation runs |
| `CURATE` | Protect precision through review and pruning | A verified callback invokes an operator-approved review | Operator invokes curation explicitly |

Use these enforcement labels:

- **enforced**: a verified adapter callback invokes the behavior on every claimed event;
- **nudged**: a callback can force attention, but judgment or completion remains model-owned;
- **model-owned**: resident instructions require the behavior without a host callback;
- **operator-invoked**: the operator explicitly starts the behavior;
- **unknown**: the host capability has not been verified.

`unknown` is not `unsupported`. It is a stop against inventing a capability claim.

## Current Copilot CLI adapter

This matrix describes the shipped adapter, not every possible host.

| Event or behavior | Mechanism | Level | What it does not prove |
| --- | --- | --- | --- |
| Session start | `SessionStart` runs `cortex-mount`, creates or reuses a `WAKE` expectation, and injects an opaque owner receipt | enforced | Recall ran or reached model context |
| Agent projection refresh | `cortex-mount` runs `cortex-bind` on drift | enforced | The current session reloaded the new projection |
| Retrieval projection readiness | `cortex-mount` runs non-downloading `recall-index ensure` | enforced | Retrieved content reached model context |
| Cognition skill loading | `postToolUse` observes a successful formal skill-tool result | observed | The skill procedure began, completed, or affected behavior |
| Capture attention | `Stop` runs `cortex-capture-check` | nudged | A worthy observation existed or was captured |
| Drain attention | `Stop` runs `cortex-capture-check` | nudged | Consolidation completed or memory changed |
| Ground before work | Resident `WORK` instruction | model-owned | A query reached the model |
| Consolidation | `consolidate` skill plus operator/model judgment | model-owned | A host lifecycle callback ran it |
| Curation | `curate` skill plus operator approval | operator-invoked | A periodic host callback exists |
| Before compaction | No verified callback | unknown | `SLEEP` ran before context loss |
| After compaction | No verified callback | unknown | `WAKE` ran after context restoration |

The adapter may write content-minimal events defined in `identity/cognition-events.md`. Phase
identity, lane ownership, reconciliation, and honest correlation are defined in
`identity/cognition-phases.md`. An event is
evidence that the named tool path ran. It is not evidence that retrieved content entered model
context or changed behavior.

## Authority and containment

There are three authority classes:

| State | Canonical owner | Permitted automated action | Approval boundary |
| --- | --- | --- | --- |
| `memory/*.md` | Agent and operator through git | Validate and apply an exact approved plan | Lossy, behavior-changing, or ambiguous writes require operator approval |
| `workspace/**/*.md` | Active agent work | Append intake and update explicit episode state | Deletion, demotion, or unrelated rewrites require operator approval |
| `.cortex/**` | Runtime projection tools | Rebuild, append, replace, or remove projections | No approval when canonical Markdown is unchanged |
| Generated host entrypoints | `cortex-bind` from identity plus persona | Replace only when derived content drifts | Source identity or persona changes remain git-reviewed |
| Skills and identity | Cortex source repository | No runtime self-rewrite | Changes require a git commit and release |

The runtime boundary is intentionally narrow:

```text
+---------------------- CANONICAL, GIT-REVIEWED ----------------------+
| identity + skills       memory/*.md       workspace/**/*.md         |
+-----------+-------------------+-------------------+------------------+
            | derive            | index             | validate plan
            v                   v                   v
+-----------+-------------------+-------------------+------------------+
| generated entrypoint    recall sidecar     transaction preview      |
|                         cognition events                            |
+---------------------- REMOVABLE .cortex/ ---------------------------+
```

Runtime tools:

- inherit the invoking process's filesystem permissions; cortex claims no sandbox;
- must not discover, copy, or log credentials;
- must not require network access for ordinary search, status, fetch, expand, validation, or apply;
- may read only the paths named by their contract;
- may write canonical memory only through a validated transaction with recorded pre-images;
- must keep projections removable and rebuildable from canonical Markdown.

## Adapter checklist

Before documenting a host as enforced:

1. Identify the exact callback and the executable it invokes.
2. Verify the callback's timing, retry behavior, and failure semantics.
3. Record whether output reaches the model, the operator, or neither.
4. Emit an observable event only for behavior the adapter can actually see.
5. Label unavailable or unverified capabilities `unknown`.

The host-neutral semantic contract survives when an adapter has fewer callbacks. What changes is the
enforcement label, not the meaning of the cognition stage.
