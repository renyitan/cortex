# Spec: Cortex lossless memory formation diagnostic · 2026-08-28

> **Refines:** the
> [lossless-alternative investigation stage](../../../../../docs/investigation/04-lossless-alternative.md)
> and the
> [formation-use causal ablation](../../../../results/formation-use-ablation/README.md)

## Why

Cortex currently persists one flat semantic record containing `id`, `kind`, `text`, one evidence
reference, and source. In the completed multi-hop diagnostic, the current acquisition path
compressed 26,156-136,564 source characters into 311-1,111 semantic characters per store. Both
semantic-memory arms scored 0/60, while exact raw memory with direct use scored 48/60.

That result rejects lossy chunk summarization. It does not answer whether cognition can improve
evolving memory by preserving every observation while adding useful structure for changes, scope,
and supersession.

This diagnostic affects Cortex research and, only after a measured win, future Cortex users. The
desired behavior is:

1. preserve each observation verbatim and content-address it;
2. derive atomic claims without exposing future evaluation tasks;
3. bind every claim to the exact observation that supports it;
4. represent scope and supersession without deleting or rewriting evidence;
5. improve later current-state decisions under the same direct answer reader.

The work is timely because the end-to-end pilot and formation-use ablation rejected the current
accuracy claim. No further holdout or production work is justified until memory formation itself
demonstrates value.

## Done criteria

The diagnostic is complete when 12 independently reviewed evolving-memory streams produce 36
hidden answer tasks, a frozen three-condition by three-repetition plan executes or retains every
planned trial, and one machine-readable decision reports `formation_supported`,
`formation_not_supported`, `instrument_invalid`, or `inconclusive`.

`formation_supported` requires all of the following:

1. `model_enriched_direct` beats `raw_direct` in each of three repetitions.
2. Its aggregate paired accuracy gain is at least 5 percentage points.
3. The lower bound of the stream-clustered 95% interval for that gain is above zero.
4. It does not regress aggregate accuracy for decisions, procedures, or scoped preferences.
5. An outcome-blind audit finds every formed claim supported by its bound observation, with correct
   kind, scope, effective time, and supersession semantics.
6. Exact-observation digests, claim evidence bindings, chronology, and supersession validation all
   pass with no lifecycle or write-integrity error.
7. The run remains within its frozen cost cap, and token, latency, acquisition-cost, and amortized
   read-cost deltas are reported.

No partial gate counts as a win. A failed gate ends this treatment without prompt tuning.

## In scope

### MVP milestone

1. Define a diagnostic-only lossless bundle containing immutable observations and additive derived
   claims. Do not change the production `MemoryRecord` or `AtomicMemoryStore` schema.
2. Author 12 fictional streams:
   - four evolving project or team decisions;
   - four changed operating procedures;
   - four scoped preferences.
3. Give every stream exactly 12 chronological observations:
   - three observations form the target evolution chain;
   - nine are realistic, topically mixed distractors;
   - all observations remain visible in every answer condition.
4. Give every stream three hidden tasks:
   - one current in-scope request;
   - one adjacent-scope boundary request;
   - one historical `as of` request.
5. Use five visible synthetic action IDs per stream and deterministic required/prohibited action
   gold. Answer prose is retained but not scored.
6. Generate a 72-entry blind review packet containing neutral raw and oracle-enriched views of all
   36 tasks. An independent reviewer must agree with source gold, find every entry unambiguous, and
   judge each raw/oracle pair behaviorally equivalent before freezing.
7. Generate a separate neutral claim-review packet covering all 144 evaluator-authored claims.
   Every claim's statement, kind, subject, scope, effective time, evidence binding, and
   supersession must be independently supported by its observation before freezing.
8. Freeze three answer conditions:
   - `raw_direct`: exact observations plus an empty derived-claim array;
   - `oracle_enriched_direct`: the same observations plus evaluator-authored gold claims;
   - `model_enriched_direct`: the same observations plus claims formed by the diagnostic cognition
     lifecycle.
9. Run each answer condition three times in a frozen task order. Rotate raw/oracle order within the
   instrument stage, then use the same per-repetition task order for the later model-enriched stage.
   Run model formation once per stream and repetition, then share that frozen enriched bundle
   across the stream's three hidden tasks.
10. Produce item-level, per-memory-type, per-query-type, per-repetition, aggregate, integrity,
   telemetry, claim-fidelity, and paired-contrast reports.

The oracle condition is an instrument ceiling, not a deployable treatment. The model-enriched
condition is the only candidate treatment.

## NOT in scope

- **Production schema migration:** the diagnostic sidecar must earn this through measured benefit.
- **Enforced answer use:** test only after enriched formation passes every retention gate.
- **Recurring operational lessons:** induction from examples is a separate milestone with different
  ambiguity and scoring risks.
- **Dense arbitrary fact compression:** already rejected by the prior diagnostic.
- **Retrieval, ranking, packing, embeddings, or context budgets:** every exact observation fits and
  remains visible.
- **Model-driven WAKE or SLEEP:** the first proof isolates formation rather than phase-call ceremony.
- **CURATE:** no deletion, merge, or lossy rewrite is permitted in this proof.
- **Real tools, private data, or side effects:** all cases and actions are fictional.
- **Prompt tuning after treatment results:** any repair creates a versioned replacement instrument
  and invalidates the previous run as efficacy evidence.
- **Cross-model, public-benchmark, or production efficacy claims:** this is a one-model development
  diagnostic.

## Affected code

### Existing Cortex code to reuse, not change

- `evaluation/cognition-harness/src/pi-agent-runner.ts:12-32,86-225` provides bounded, telemetry-aware
  model execution with one host-defined completion tool.
- `evaluation/cognition-harness/src/artifacts.ts` provides owner-only JSON and JSONL artifact writes.
- `evaluation/cognition-harness/src/telemetry.ts` provides error-safe telemetry aggregation.

The prototype must not modify:

- `evaluation/cognition-harness/src/types.ts:8-31`, whose flat production memory types remain
  unchanged;
- `evaluation/cognition-harness/src/memory-store.ts:6-133`, whose schema-v1 insert-only store remains
  unchanged;
- `evaluation/cognition-harness/src/controller.ts:246-399`, whose production lifecycle semantics
  remain unchanged.

### New local diagnostic code

Create a clean local Cortex worktree from `main` and add:

- `evaluation/cognition-harness/src/lossless-memory.ts` for bundle types, parsing, canonical
  serialization, digests, and structural validation;
- `evaluation/cognition-harness/src/lossless-formation-executor.ts` for the structured WORK tool and
  host-enforced WAKE/SLEEP formation lifecycle;
- `evaluation/cognition-harness/src/lossless-formation-eval.ts` for fixture loading, immutable
  manifests, condition execution, deterministic grading, cost limits, clustered contrasts, and
  reports;
- a local write-once helper that combines same-directory temporary writing, file sync, exclusive
  publication, and directory sync; neither existing JSON helper alone provides both atomic
  publication and no-replacement semantics;
- diagnostic `mab`-independent CLI commands in `evaluation/cognition-harness/src/cli.ts`;
- `evaluation/cognition-harness/test/lossless-memory.test.ts`;
- `evaluation/cognition-harness/test/lossless-formation-eval.test.ts`.

Keep the branch local and unpushed until the formation gate passes. Do not cherry-pick the prior
MemoryAgentBench causal runner; reuse only established main-branch executor, artifact, telemetry,
and validation patterns.

### New Faber artifacts

Place the research source of truth beside this spec:

- `artifacts/fixture-source.json`;
- `artifacts/fixture-review-packet.md`;
- `artifacts/fixture-review-labels.blind.json`;
- `artifacts/fixture-review-adjudication.json`;
- `artifacts/fixture-claim-review-packet.md`;
- `artifacts/fixture-claim-review-labels.blind.json`;
- `artifacts/fixture-claim-review-adjudication.json`;
- `artifacts/fixture-manifest.json`;
- `artifacts/formed-claim-review-packet.md` after model formation;
- `artifacts/formed-claim-review-adjudication.json` after the outcome-blind claim audit;
- `artifacts/formation-results.json` after execution and claim audit;
- `artifacts/formation-results.md` after execution.

The Cortex run manifest records hashes of the frozen fixture inputs and the local Cortex commit.
Post-formation audit and result files bind the run-manifest hash and their own input hashes. No
model-visible artifact contains gold.

## Approach

### 1. Lossless bundle

The bundle is diagnostic schema version 1:

```text
LosslessMemoryBundle {
  schemaVersion: 1
  streamId: string
  observations: Observation[]
  claims: DerivedClaim[]
  observationSetSha256: sha256
  claimSetSha256: sha256
}

Observation {
  id: string
  authoredAt: canonical ISO-8601 UTC timestamp
  text: non-empty string
  sha256: sha256(authoredAt + "\n" + text)
}

DerivedClaim {
  id: string
  kind: "decision" | "procedure" | "preference"
  subjectKey: canonical kebab-case string
  statement: non-empty string
  scope: {
    level: "global" | "organization" | "team" | "project" | "workflow"
    key: string | null
  }
  effectiveAt: canonical ISO-8601 UTC timestamp
  evidenceIds: [observationId]
  supersedesClaimIds: string[]
}
```

Observations are canonical fixture data. Formation may only append claims. It cannot alter
observation order, timestamps, text, or digests.

Every fixture change takes effect immediately when its observation is authored. Future-dated and
retroactive changes are prohibited in this MVP. The host therefore binds `effectiveAt` to the
currently processed observation's `authoredAt` and `evidenceIds` to that observation's ID; the
model never supplies either value. The host also generates each claim ID deterministically from the
stream ID, observation ordinal, and candidate ordinal.

The model supplies only:

- claim kind;
- a stable subject key identifying the decision, procedure, or preference being described;
- atomic statement;
- structured scope;
- zero or more earlier claim IDs that the candidate supersedes.

The scope and state-resolution contract is:

1. `global` requires `key: null`; every other level requires a trimmed, canonical, non-empty key.
2. Every task supplies a frozen scope path containing its applicable organization, team, project,
   and workflow keys. A claim applies only when it is global or its exact level/key occurs in that
   path.
3. Claims are comparable only when `kind` and `subjectKey` match. Unrelated subjects coexist.
4. For comparable claims, applicability precedence is
   `workflow > project > team > organization > global`. The most specific applicable claim governs
   only that task's path; a narrower claim never changes a broader claim outside its scope.
5. `supersedesClaimIds` may reference only earlier claims with the same kind, subject key, and exact
   scope level/key. Cross-scope exceptions coexist rather than supersede one another.
6. At a query time, ignore claims and supersession edges effective after that time. Among comparable
   claims at the same exact scope, the latest claim not superseded by another claim effective at or
   before the query time governs.

Claim kinds use this operational rubric:

- `decision`: the observation records an explicit resolution, approval, adoption, or selection
  choosing one rule or option over alternatives;
- `procedure`: the observation specifies a required step, sequence, prerequisite, or method for
  carrying out work;
- `preference`: the observation states an explicit desired format, channel, style, or behavior as a
  preference rather than a mandatory process step.

An explicit want, dislike, or style preference remains `preference` even when it names the selected
option. Use `decision` only when the observation frames the act as a resolution, approval, adoption,
or selection over alternatives.

Every observation must independently support its claim kind through its wording. Stream metadata
balances the fixture set but cannot determine a claim's kind by itself.

The direct-reader prompt, oracle authoring, model validator, blind review, and gold generator must
use this one resolution contract. A new claim never updates, deletes, or removes an old claim or
its evidence.

The WORK tool permits at most eight candidates per observation. `subjectKey` must match
`[a-z0-9]+(?:-[a-z0-9]+)*` and be at most 64 UTF-8 bytes. Each statement is at most 512 UTF-8 bytes,
each non-null scope key at most 128 UTF-8 bytes, and each candidate may supersede at most four
claims. A stream may contain at most 96 model-formed claims and its canonical serialized bundle
must be at most 64 KiB. Before any answer call, preflight the complete rendered request, without
truncation, against the resolved model context limit. Formation overflow fails that stream's
treatment; it must never cause truncation or observation removal. An empty candidate list is valid.

### 2. Formation lifecycle

Process the 12 observations chronologically. Future tasks and gold remain withheld throughout.

For each observation:

1. **WAKE, deterministic:** validate the existing sidecar and mount all prior observations and
   claims. No model call and no selection.
2. **WORK, model-backed:** receive all prior observations and claims plus the new observation,
   which is marked only as the current evidence. Propose structured atomic claims and supersession
   links through one constrained completion tool. No future observation is present.
3. **SLEEP, host-enforced:** validate and append every schema-valid candidate exactly as bound by the
   tool. If any candidate is invalid, reject the entire observation batch; do not partially write.

No model decides whether SLEEP should persist a valid WORK candidate. Candidate utility is measured
by hidden downstream behavior rather than another model opinion.

One fresh model conversation is used for every observation with `maxAttempts: 1`. The tool accepts
one completion receipt; multiple receipts or no valid receipt fail that observation. The sidecar is
the only state carried between observations. A fresh formation run is created for each stream and
repetition.

### 3. Fixture contract

Every fictional stream contains:

- a five-action catalog;
- 12 timestamped natural-language observations;
- hidden canonical claims and supersession relations;
- three delayed tasks and deterministic action gold;
- metadata containing memory type, query type, provenance, review status, and split.

The three-observation target chain must require at least one update and one scope or historical
distinction. Distractors must be plausible but must not create a second reasonable interpretation.
No visible text may use evaluator labels such as `gold`, `target`, `distractor`, `applicable`,
`oracle`, or condition names.

For the evaluator-authored instrument only, each claim's `statement` is the exact text of its bound
observation. The oracle adds kind, subject, scope, effective time, evidence binding, and
supersession structure without paraphrasing, summarizing, or dropping any source wording. This
fixture rule does not require model-formed statements to be verbatim; those are judged by the
separate outcome-blind fidelity audit.

Every task's gold partitions all five catalog actions into `requiredActionIds` and
`prohibitedActionIds`; no action may be unclassified. Expected action order is not semantically
meaningful, so grading compares an order-insensitive set.

The task families are balanced across:

- action substitution versus require/prohibit reversal;
- global or organization rules versus team, project, or workflow scope;
- current-state, adjacent-scope, and historical queries;
- decisions, procedures, and preferences;
- target-chain position within the 12-observation sequence.

### 4. Blind review and freeze

Generate two neutrally labeled entries for every hidden task:

- the exact raw observations with no derived claims;
- the same observations with evaluator-authored claims.

Randomize entry labels and order. Omit source gold, memory type, query type, expected governing
claim, and condition identity. The reviewer records required/prohibited actions, whether the entry
is ambiguous, and whether each pair requires identical behavior.

Present all 72 independently shuffled entries first. Only after every entry has been labeled,
present a separately shuffled neutral pair map for the 36 equivalence judgments. Do not place paired
raw and enriched views next to each other during entry labeling.

Each blind-label artifact must record the exact SHA-256 of the UTF-8 packet bytes the reviewer saw.
Adjudication must reject labels whose recorded packet hash differs from the packet being
adjudicated, even when all neutral IDs and judgments remain schema-valid.

The packet begins with the same gold-free reader protocol later used for answer execution:

1. use only information effective at or before `queryAt`;
2. compare guidance only when it concerns the same subject; guidance about different subjects
   coexists and cannot override it;
3. apply only scopes present in `scopePath`, with precedence
   `workflow > project > team > organization > global`;
4. for the same subject and exact scope, use the latest effective state and honor explicit
   supersession;
5. treat derived claims as additive organization, while exact observations remain authoritative;
6. call an action only when the request explicitly asks for it or governing standing guidance
   requires or prefers it;
7. governing guidance overrides a conflicting request, and an explicit prohibition or explicit
   desire not to use an action means it must not be called;
8. do not call unrelated catalog actions.

Any disagreement requires editing the canonical source, regenerating all derived files, and
repeating the complete review. Freeze only after all 72 entries pass.

Generate a separate neutrally ordered entry for every evaluator-authored claim. Show only the bound
observation, the claim, and any earlier claim and observation it supersedes. Hide stream, task,
outcome, and condition metadata. The claim packet includes this gold-free review contract:

1. a subject key must concisely name the subject expressed by its bound observation;
2. `global` requires a null key and explicit universal wording; every non-global key must be
   established by the bound observation;
3. `effectiveAt` and the sole evidence ID must equal the bound observation's time and neutral ID;
4. future-dated and retroactive changes are prohibited;
5. supersession may reference only an earlier claim with the same kind, subject key, and exact
   scope;
6. cross-scope guidance coexists and must not be linked as supersession.

The reviewer records whether the observation supports the statement, kind, subject key, exact
scope, effective time, evidence binding, and supersession relation. Any
disagreement requires correcting the canonical source and repeating both complete reviews. Freeze
only after all 144 claim entries pass.

After model formation, generate a separate claim-review packet containing every formed claim, its
bound observation, its declared kind and scope, and any claim it supersedes. Omit hidden tasks,
gold actions, answer outputs, condition scores, and aggregate results. An independent reviewer
records whether the observation entails the statement and whether kind, scope, effective time, and
subject key and supersession are correct under the frozen resolution contract. Review disagreements
are adjudicated against source text without changing the formed bundle. The audit covers every
persisted claim, including claims from a formation run that later failed. It finishes before answer
outputs or scores are exposed to its reviewer. Any unsupported or semantically misclassified claim
makes the result `formation_not_supported`; missing or malformed audit entries make it
`instrument_invalid`.

The immutable run manifest uses exclusive creation and includes:

- canonical fixture, review-adjudication, and fixture-manifest hashes;
- ordered stream and task hashes without printing IDs or content;
- exact observation and oracle-claim digests;
- formation prompt, direct-reader prompt, tool-schema, grader, state-resolution, claim-review, and
  task/condition-order hashes;
- requested and resolved model IDs, low reasoning effort, context/output limits, attempts, turns,
  timeout, rates, and maximum invocation reservation;
- Cortex commit and clean-worktree state;
- hashes of only the diagnostic and reused source files executed by the run, plus the runtime
  snapshot;
- three repetitions, bootstrap algorithm and seed, 10,000 samples, failure denominators, exact
  decision rules, and `$4.00` cost cap.

### 5. Answer conditions

All conditions use one identical direct-reader system prompt, user prompt, tool schema, model, and
task order. The prompt always includes these fields:

```text
actions
observations
derivedClaims
scopePath
queryAt
conversation
targetQuery
```

`raw_direct` receives an empty `derivedClaims` array. The two enriched conditions receive either
oracle or model-formed claims. Conditions are not named or described in model-visible input.

The model emits the existing strict event shape:

```json
{
  "events": [
    {"event": "action_call", "action_id": "available_action_id"},
    {"event": "final_answer", "content": "Brief answer"}
  ]
}
```

A deterministic grader requires exactly one final answer, rejects unknown or unauthorized actions,
and requires it to be the final event. Action calls must contain no duplicates, and their
order-insensitive ID set must equal `requiredActionIds` exactly. Because every other catalog action
is prohibited, any extra action fails the trial. Answer wording is not scored.

### 6. Execution and statistics

- Run the 108 oracle cells and 108 raw cells before model formation. Oracle must score at least
  35/36 in every repetition, beat raw in every repetition, and exceed raw by at least 5 percentage
  points across all 108 paired cells. If any headroom gate fails, stop with `instrument_invalid`;
  do not run or interpret model formation and do not tune the frozen instrument.
- Run model formation and the 108 model-enriched answer cells only after the instrument gate.
- Share one frozen model-formed bundle across the three tasks for its stream and repetition.
- Retain unsuccessful model outputs as incorrect planned cells. Invalid formation content after the
  single frozen attempt is a treatment failure, not an instrument failure. A harness that accepts
  structurally invalid data, or a write-integrity, provenance, or manifest mismatch, is
  `instrument_invalid`.
- The execution-failure denominator is the 324 planned answer cells: 108 oracle, 108 raw, and 108
  model-enriched. A cell has an infrastructure execution failure only when its answer operation, or
  its shared formation run, cannot complete because of provider/service failure after the frozen
  attempt. One failed formation run therefore marks its three dependent cells as infrastructure
  failures and incorrect. If more than 6 of 324 cells fail this way, return `inconclusive`.
  Invalid/missing tool receipts and semantically bad claims remain condition failures, not
  infrastructure failures.
- Cluster paired accuracy differences by stream. Each of the 12 independent clusters contains all
  three tasks and all three repetitions for that stream.
- Freeze a 32-bit bootstrap seed in the manifest. Use Mulberry32 to generate one common sequence of
  10,000 bootstrap samples; each sample draws 12 stream clusters with replacement and carries all
  nine paired cells for every selected stream. Compute the paired mean percentage-point difference
  per sample and the two-sided 95% percentile interval using linear type-7 quantiles. Reuse the
  exact sampled stream indices for every reported contrast.
- Report exact McNemar discordant counts in addition to the clustered interval; do not call this a
  confirmatory significance test.

Report separately:

- strict behavior accuracy and paired differences;
- stale-value, scope-boundary, and historical-state errors;
- structural claim validity and evidence coverage;
- independent semantic claim-fidelity judgments;
- claims and supersession edges per observation and stream;
- answer and formation tokens, latency, errors, and cost;
- answer input-token overhead from derived claims;
- amortized total cost at 1, 10, and 100 delayed reads per formed stream.

### 7. Decision

Use this order:

1. Before calls, return `instrument_invalid` for fixture review, provenance, schema,
   write-integrity, manifest, or source-hash failure.
2. At any point, return `inconclusive` if the cost cap prevents a planned call or more than 6 of
   324 answer cells have infrastructure execution failures.
3. After oracle and raw, return `instrument_invalid` if any absolute or relative instrument
   headroom gate fails.
4. After treatment execution, return `instrument_invalid` if the claim audit is incomplete or
   malformed.
5. Return `formation_supported` only if every Done-criteria gate passes. For the no-regression gate,
   model-enriched accuracy must be greater than or equal to raw accuracy within each of the three
   36-cell memory-type groups.
6. Otherwise return `formation_not_supported`.

Do not inspect subgroup results to create a narrower post-hoc win. Subgroups explain a frozen
aggregate decision but cannot replace it.

## Edge cases & failure modes

- **Model emits an unknown or ineligible superseded-claim ID:** reject the complete observation
  write.
- **Model links a claim to itself, a later claim, or creates a cycle:** reject the complete
  observation write.
- **Model emits a semantically wrong `kind`, scope, statement, or supersession:** persist it only if
  structurally valid. The outcome-blind audit marks it unsupported, which prevents
  `formation_supported`. The host must not silently correct model meaning.
- **Model emits no claims:** persist the unchanged bundle and retain later answer outcomes.
- **One observation fails:** mark that formation run failed and retain all three dependent
  model-enriched answer tasks as incorrect; other streams and repetitions continue.
- **Raw or enriched answer fails:** retain the planned trial as incorrect and continue.
- **Oracle or relative headroom fails:** stop before model formation; the instrument lacks a
  demonstrated ceiling.
- **Cost reservation would cross the cap:** stop before the call, retain all remaining planned
  outcomes, and report `inconclusive`.
- **Fixture or manifest content changes after freeze:** refuse execution.
- **Partial or duplicate file write:** use the diagnostic's tested owner-only, write-once atomic
  publication helper.
- **Unexpected production-code dependency:** stop and revise the spec rather than modifying the core
  store or controller inside the diagnostic.

Rollback is deletion of the disposable local worktree after its commit and report are recorded.
Cortex `main` remains unchanged. Negative and invalid results remain in the Faber episode rather
than being erased.

## Open questions

None.

## Tasks

1. **MVP — Author and validate the fixture source.** Create 12 balanced streams and 36 hidden tasks
   with deterministic action gold.
2. **MVP — Generate and complete blind review.** Produce 72 neutral entries, independently review
   them, and resolve every ambiguity before freeze.
3. **MVP — Implement the lossless sidecar.** Add canonical types, parsing, digests, append-only
   validation, chronology checks, and supersession-cycle rejection in a local Cortex worktree.
4. **MVP — Implement formation execution.** Add deterministic full-state WAKE, one constrained
   model-backed WORK per observation, and atomic host-enforced SLEEP.
5. **MVP — Implement direct answer execution and grading.** Keep prompts and tools identical across
   raw, oracle-enriched, and model-enriched conditions.
6. **MVP — Implement manifest and report logic.** Bind all sources, schedules, runtime state, cost,
   failures, shared bootstrap samples, and decision gates.
7. **MVP — Add deterministic tests.** Cover exact observation preservation, host-bound provenance,
   whole-batch rejection, no future-task leakage, fresh conversations, bundle sharing, condition
   blindness, strict grading, failure retention, cost stopping, manifest immutability, common
   resampling, and every decision state.
8. **MVP — Review before model calls.** Run full checks and a production-bug review; fix verified
   defects and lock a local diagnostic commit.
9. **MVP — Freeze and execute.** Run oracle and raw first. Only if the instrument gate passes, run
   model formation, complete the outcome-blind claim audit, and execute model-enriched answers.
10. **MVP — Report and adjudicate.** Publish the machine-readable decision and complete positive,
    negative, invalid, or inconclusive report. Open an enforced-use follow-on only after
    `formation_supported`.
