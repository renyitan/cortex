# Stage 4: lossless alternative

## Question

Could Cortex improve evolving decisions, procedures, and scoped preferences by preserving every
observation while adding structured claims, provenance, scope, time, and supersession?

## Gate

Before allowing model formation, the frozen instrument tested a stronger oracle condition. The
oracle used exact-copy evaluator-authored claims with correct structure. It had to score at least
35/36 in each of three repetitions, beat raw each time, and gain at least five points overall.

## Result

| Condition | Repetition 1 | Repetition 2 | Repetition 3 | Aggregate |
|---|---:|---:|---:|---:|
| Raw direct | 15/36 | 13/36 | 16/36 | 44/108 |
| Oracle enriched direct | 22/36 | 25/36 | 22/36 | 69/108 |

The oracle beat raw by 23.1 points overall, but it missed the absolute reliability floor in every
repetition. The direct reader still made scope-boundary, stale-value, and historical-state errors
when given perfect structured claims.

## Decision

The result was `instrument_invalid`. Model formation, claim review, and treatment answer calls were
not run. This does not establish that lossless formation fails. It establishes that this frozen
instrument could not answer the question reliably.

See the [full instrument report](../../evaluation/results/lossless-formation/README.md).
