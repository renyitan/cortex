# Cortex formation-use causal ablation

> **Status:** complete
> **Run:** `2026-08-28T06-34-46-745Z-842efa85`
> **Model:** `gpt-5-mini`, low thinking
> **Evidence mode:** diagnostic, using previously exposed questions

## Result

Both tested Cortex components reduced multi-hop accuracy. The current semantic acquisition path was
the dominant failure: it reduced direct-use accuracy from 48/60 to 0/60. With the exact raw store
held fixed, the enforced answer path reduced accuracy from 48/60 to 29/60.

This locates two deficits in the tested Cortex package. It does not prove that semantic memory in
general is harmful, isolate a single enforced phase, or justify a production change.

| arm | correct | accuracy | errors | answer cost |
|---|---:|---:|---:|---:|
| `raw-direct` | 48/60 | 80.0% | 0 | $0.198918 |
| `semantic-direct` | 0/60 | 0.0% | 0 | $0.042507 |
| `raw-enforced` | 29/60 | 48.3% | 0 | $0.396645 |
| `semantic-enforced` | 0/60 | 0.0% | 0 | $0.128530 |

Shared semantic acquisition cost $0.202726. Total recorded cost was $0.969325 for 5,476,402 tokens
and 1,942,331 ms of accumulated model latency.

## Frozen protocol

- two FactConsolidation multi-hop streams: 6K and 32K;
- 10 previously exposed questions per stream;
- three repetitions;
- six semantic acquisitions, one per source and repetition;
- four answer arms and 240 planned answer evaluations;
- complete frozen memory and no retrieval evidence at answer time;
- byte-identical serialized input stores across paired direct and enforced arms;
- fresh executor, model conversation, cloned store, and artifact context for every answer;
- prohibited answer writes and deterministic zero-model empty `SLEEP`;
- all failures retained in planned denominators;
- `$4.00` hard cost cap.

The owner-only manifest SHA-256 is
`b6db5d8c2140471dfd145955082333fcb26b094adf28eba34091ec4044411653`. The final batch report
SHA-256 is `47704ed311b44bd7db93daa04fe50c23a364f6569c0955d2b3355bd5824572f5`.
The run is bound to Cortex commit
[`c44a19854eb60096a116ad904d1511bf6516226c`](https://github.com/renyitan/cortex/commit/c44a19854eb60096a116ad904d1511bf6516226c),
published on the archival `research/formation-use-ablation` branch.

The selected questions were all present in the exposed-source manifest and had zero overlap with
the forbidden sealed-pilot manifest. No question ID or content is reproduced here.

## Results by source

| source | `raw-direct` | `semantic-direct` | `raw-enforced` | `semantic-enforced` |
|---|---:|---:|---:|---:|
| multi-hop 6K | 25/30 | 0/30 | 21/30 | 0/30 |
| multi-hop 32K | 23/30 | 0/30 | 8/30 | 0/30 |

The enforced-use loss was concentrated at 32K: 23/30 with direct use versus 8/30 with the enforced
package. The same direction appeared at 6K, where the comparison was 25/30 versus 21/30.

## Results by repetition

| repetition | `raw-direct` | `semantic-direct` | `raw-enforced` | `semantic-enforced` |
|---:|---:|---:|---:|---:|
| 1 | 16/20 | 0/20 | 9/20 | 0/20 |
| 2 | 17/20 | 0/20 | 9/20 | 0/20 |
| 3 | 15/20 | 0/20 | 11/20 | 0/20 |

The formation and use directions were consistent in all three repetitions.

## Paired contrasts

Intervals use the six source-by-repetition blocks as clusters. Each contrast used an independently
seeded 10,000-sample bootstrap, so the endpoints are Monte Carlo approximations. Algebraically
mirrored contrasts can therefore differ slightly rather than producing exact sign-reversed bounds.

| contrast | difference | clustered 95% interval |
|---|---:|---:|
| semantic formation under direct use | -80.0 pp | [-85.0, -75.0] |
| enforced use on raw memory | -31.7 pp | [-46.7, -16.7] |
| enforced use on semantic memory | 0.0 pp | [0.0, 0.0] |
| formation-use interaction | +31.7 pp | [+15.0, +48.3] |

The zero enforced-use contrast on semantic memory is a floor effect, not evidence that enforcement
is harmless with semantic memory. Both semantic arms scored zero. The positive interaction is the
same floor effect expressed arithmetically and should not be interpreted as a beneficial mechanism.

## What failed

Semantic acquisition completed all 30 source chunks across the six acquisition blocks and produced
2-3 records for each 6K store and eight records for each 32K store. The failure was not an empty
store or provider error.

The stores were instead extremely lossy:

- 26,156 raw characters became 311-396 semantic characters at 6K;
- 136,564 raw characters became 736-1,111 semantic characters at 32K;
- semantic stores retained only 0.20-0.69% of distinct raw lexical tokens;
- semantic stores retained only 0.35-1.54% of distinct raw numeric tokens;
- 55/60 semantic-direct answers and 51/60 semantic-enforced answers explicitly reported that the
  answer could not be determined.

Lexical overlap alone is not a memory-quality metric. Coupled with complete task failure, repeated
refusals, and successful raw-memory controls, it shows that the current chunk-level acquisition
contract discarded the dense fact structure needed by these questions.

The raw-store comparison separately shows that the accepted enforced-use package also lost useful
information or reasoning capacity relative to a direct read. This diagnostic does not retain a
structured WAKE-selection trace, so it cannot distinguish WAKE selection, prompt overhead, or
other enforced-path effects inside that package.

## Integrity

All run checks passed:

- input-store file and record digests matched across paired use arms;
- no answer retrieval evidence was supplied;
- no answer-time memory write occurred;
- all 240 answer evaluations completed with zero execution errors;
- model, repository, Cortex source, runtime, and frozen benchmark checksums matched;
- the failure-rate and cost gates passed.

Before freezing, two production-bug reviews found and fixed manifest-provenance, budget-reservation,
duplicate-ID, runtime-binding, redaction, and invalid-exit-status defects. The Node 22 typecheck and
all 69 deterministic tests passed on the final diagnostic commit.

## Adjudication

This diagnostic found two negative package-level contrasts under the tested conditions:

1. The current semantic-formation path scored 0/60 under both use modes, versus 48/60 for raw-direct.
2. The current enforced-use package scored 29/60 versus 48/60 for direct use when both received the
   exact raw store.
3. The sealed end-to-end pilot and this diagnostic point in the same direction: lifecycle
   enforcement worked mechanically but did not improve delayed-task accuracy.

At the time of this result, no diagnostic source or treatment was eligible for Cortex `main`. The
follow-on directly justified by these findings was a fresh, separately frozen development
experiment that tested:

- source-preserving memory, where semantic metadata indexes exact evidence instead of replacing it;
- a direct fast path when the complete bounded store fits, avoiding model-driven WAKE selection;
- each change alone and together, with repeated paired multi-hop accuracy, lifecycle errors, tokens,
  latency, and cost reported.

That follow-on used a different synthetic instrument and preserved exact source observations. It
stopped as `instrument_invalid` before model formation because the oracle reader missed its frozen
reliability floor. See the
[lossless-formation result](../lossless-formation/README.md).

## Limits

- Only 20 distinct, previously exposed questions were used, each repeated three times.
- Only two FactConsolidation multi-hop streams and one model were tested.
- The semantic arm represents Cortex's current chunk-level acquisition contract, not all possible
  learned-memory designs.
- The enforced arm represents the accepted combined answer package, not a pure estimate for WAKE,
  WORK, or lifecycle enforcement individually.
- The clustered intervals contain only six source-by-repetition blocks.
- Independently seeded bootstrap streams add small simulation differences between interval
  endpoints, including contrasts that are algebraic mirrors in this run.
- This is diagnostic evidence and is not a full MemoryAgentBench, confirmatory, or cross-model
  result.

The sealed end-to-end baseline remains the
[repeated-pilot result](../repeated-pilot/README.md).
