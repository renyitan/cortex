# Cortex sealed repeated-pilot results

**Status as of 2026-08-27:** Complete. Valid as a repeated instrumentation pilot, not
confirmatory evidence.

## Bottom line

The accepted Cortex treatment completed the frozen repeated pilot with zero execution errors, but
it did not improve delayed-task accuracy over regular use of the same retrieved evidence.

| Condition | Correct | Accuracy | Errors | Cost |
|---|---:|---:|---:|---:|
| Regular | 254/300 | 84.7% | 0 | `$2.032833` |
| Pi-enforced Cortex | 246/300 | 82.0% | 0 | `$4.066855` |
| Advisory | 235/300 | 78.3% | 2 | `$3.614943` |

Scores use the frozen 300-question denominator per condition, so the two retained advisory errors
count against advisory accuracy. Cortex trailed regular by 2.7 percentage points:

| Comparison | Difference | Clustered 95% interval |
|---|---:|---:|
| Cortex minus regular | -2.7 points | -6.3 to +0.3 points |
| Cortex minus advisory | +3.7 points | -0.7 to +8.7 points |

The frozen positive-result rule was not met. The observed result does not establish that Cortex
improves accuracy over either control. It also does not prove that regular will always outperform
Cortex: the interval includes a small Cortex advantage, and the pilot sampled 20 of 100 questions
per stream rather than running the full confirmatory question set.

## Run identity

| Field | Value |
|---|---|
| Cortex commit | `42529d995768db7885abc46586cfe2dd68587651` |
| Manifest | `mab-prepilot-holdout-100-v10.json` |
| Manifest SHA-256 | `1727f0bda30ca3e4a59c3d30a14411e3969c8bf8f16c5e096e0bbee9077bed5a` |
| Ordered question SHA-256 | `36536564ba995cca38b3a1803960ab2bab7fd91eb57866cd7d1329be1408da83` |
| Owner-only run artifacts | Not published; the frozen manifest and ordered-question hashes are retained above |
| Evidence mode | Instrumentation |
| Design | 5 streams x 3 conditions x 3 repetitions x 20 questions |
| Model | GitHub Copilot `gpt-5-mini`, low reasoning |
| Started | 2026-08-28 02:01:37 UTC |
| Completed | 2026-08-28 04:54:04 UTC |
| Wall time | About 2 hours 52 minutes |
| Cost cap | `$15` |
| Recorded cost | `$9.714631` |

The final schema-v10 manifest was regenerated from the same four exposed selection sets used to
seal the original v7 holdout. Programmatic comparison confirmed that all 100 selected question IDs
were identical and in the same order. No question content or ID was displayed before treatment
freeze. The v10 manifest was bound to a clean accepted Cortex checkout.

## Stability across repetitions

| Repetition | Regular | Advisory | Cortex | Cortex minus regular |
|---:|---:|---:|---:|---:|
| 1 | 82/100 | 81/100, 1 error | 83/100 | +1 |
| 2 | 86/100 | 78/100 | 82/100 | -4 |
| 3 | 86/100 | 76/100, 1 error | 81/100 | -5 |

Cortex beat regular by one answer in the first repetition, then lost by four and five. Regular's
aggregate lead therefore did not come from one isolated run. Cortex itself varied from 83 to 81,
which confirms the earlier warning that single-run differences should not be treated as causal
evidence.

## Results by source

| Source | Regular | Advisory | Cortex | Cortex minus regular |
|---|---:|---:|---:|---:|
| Banking77 | 56/60 | 57/60 | 56/60 | 0 |
| FactConsolidation multi-hop 6K | 49/60 | 43/60, 2 errors | 44/60 | -5 |
| FactConsolidation multi-hop 32K | 33/60 | 20/60 | 29/60 | -4 |
| FactConsolidation single-hop 6K | 60/60 | 59/60 | 60/60 | 0 |
| FactConsolidation single-hop 32K | 56/60 | 56/60 | 57/60 | +1 |

The eight-answer aggregate deficit came from multi-hop consolidation. Cortex lost nine answers to
regular across the two multi-hop streams, tied both Banking77 and single-hop 6K, and recovered one
answer on single-hop 32K. The accepted structured competing-evidence instruction and enforced
phase sequence did not establish a multi-hop advantage on this holdout.

This is a treatment-level observation. The experiment deliberately holds deterministic BM25
retrieval common across conditions, so it cannot establish that one retriever is better.

## Reliability and integrity

The batch completed all 45 planned condition-stream-repetition arms and stayed below its cost cap.

| Check | Result |
|---|---|
| Run complete | Yes |
| Requested model matched | Yes |
| Shared evidence access matched | Yes |
| Cortex execution errors | 0/300 |
| Regular execution errors | 0/300 |
| Advisory execution errors | 2/300 |
| Failure-rate threshold | Met |
| Cost limit | Met |

Both advisory errors occurred on multi-hop 6K when the model failed to submit a completion receipt
after two bounded attempts. They were retained in the denominator and were not retried or removed.

Cortex's zero errors show that the evaluation-only Pi controller can enforce the bounded
`WAKE -> WORK -> SLEEP` procedure, bind evidence and memory identities in host code, and complete
the tested delayed-use workload. It does not establish equivalent enforcement by every Cortex host
adapter or production reliability.

## Cost and work

| Condition | Total tokens | Model latency | Attempts | Turns | Cost |
|---|---:|---:|---:|---:|---:|
| Regular | 7,907,421 | 27.9 min | 300 | 300 | `$2.032833` |
| Advisory | 13,397,627 | 60.4 min | 451 | 478 | `$3.614943` |
| Cortex | 15,422,361 | 83.7 min | 1,023 | 1,029 | `$4.066855` |

Cortex used 1.95 times regular's tokens, 3.00 times its model latency, 3.41 times its attempts, and
2.00 times its recorded cost. The accepted pre-pilot efficiency changes reduced avoidable work, but
the remaining enforced lifecycle still cost materially more than direct evidence use without
establishing higher accuracy.

Provider cache billing varied across separately timed development runs, so the matched token
reductions from the pre-pilot ablations remain the cleaner causal evidence for those optimizations.

## Memory behavior

Across the 15 acquisition arms per condition:

| Condition | Acquisition records | Evidence documents |
|---|---:|---:|
| Regular raw persistence | 141 | 141 |
| Advisory semantic memory | 405 | 141 |
| Cortex semantic memory | 147 | 141 |

The accepted answer-time write prohibition worked:

| Condition | Questions that added answer-time memory | Records added |
|---|---:|---:|
| Regular | 0/300 | 0 |
| Advisory | 0/298 completed | 0 |
| Cortex | 0/300 | 0 |

This fixes the earlier treatment's most obvious memory-quality problem. That treatment wrote after
95 of 100 delayed questions even though no external feedback confirmed that the answer-specific
content deserved long-term storage.

## Pre-pilot change disposition

The final Cortex checkout contained only changes that passed their named retention gates:

| Change | Disposition | Evidence |
|---|---|---|
| Reject unconfirmed delayed-answer writes | Kept | Deterministic tests and 0/300 answer-time writes |
| Freeze disjoint question sets | Kept | 225 exposed IDs excluded; sealed ordered hash preserved |
| Suppress unsaveable answer-time candidates | Kept | Deterministic tests; no answer-time candidate/write path |
| Compare competing evidence during WORK | Kept | Improved the exposed Cortex screen, but pilot efficacy remains unsupported |
| Replace guaranteed no-op answer SLEEP model calls | Kept | Deterministic zero-model receipt tests |
| Constrain WAKE to mounted active IDs | Kept | Controller and executor rejection/repair tests |
| Make WAKE selection govern delayed WORK | Kept | 60 matched exposed questions preserved correctness; Banking77 tokens fell 2.9% and 3.0% |
| Naive example-level BM25 | Rejected | Lost answer-bearing multi-hop evidence |
| Concrete-only acquisition memory | Rejected | Reduced accuracy, increased cost, and introduced a WAKE error |
| Two-stage evidence path | Rejected | Fell from 8/10 to 7/10 and increased tokens by 47.0% |
| Equal-guidance fairness prompt | Diagnostic only | Regular remained 8/10; prompt-only explanation not supported, causality unresolved |

No rejected or diagnostic-only source was merged into Cortex `main`.

## Comparison with the earlier pilot

The corrected preliminary run on a different exposed 100-question selection scored regular 85%,
Cortex 83%, and advisory 74%. This sealed repeated pilot scored regular 84.7%, Cortex 82.0%, and
advisory 78.3%. The two samples preserve the same ordering: regular first, Cortex second, advisory
third.

The current pilot adds stronger reliability evidence and confirms one behavior improvement:

- Cortex completed 300 delayed evaluations with zero lifecycle or citation errors.
- Cortex added no answer-time memory, versus writes after 95 of 100 questions in the earlier
  treatment.

The first result extends the same zero-error behavior from the earlier 100-question pilot to a
larger repeated sample; it is not an improved error rate. The second is a demonstrated memory-safety
improvement. Neither is an accuracy improvement.

## Decision

Do not claim that Cortex improves delayed-task accuracy over regular evidence use. Do not start the
4,500-evaluation confirmatory run with this treatment: two distinct 100-question samples now place
regular ahead, and the repeated sealed pilot shows that the package incurred extra work without
establishing a positive aggregate effect.

The bounded public finding is:

> In an evaluation-only Pi harness with matched deterministic evidence access, the enforced Cortex
> treatment completed reliably and prevented unconfirmed answer-time writes, but a frozen repeated
> adapted MemoryAgentBench pilot did not establish better delayed-task accuracy than both controls.

The result does not establish beneficial `CURATE`, general coding-task improvement, cross-model
generalization, or standard MemoryAgentBench leaderboard performance. It also does not establish
enforcement by current host adapters, superior retrieval efficacy, or production reliability.

Any future accuracy work should begin as a new treatment with a causal hypothesis about the
multi-hop deficit, use only fresh development questions, and pass a matched ablation before another
holdout. The current negative result must remain the baseline rather than being tuned away.
