# Stage 2: repeated comparison

## Question

When evidence access is held constant, does the complete enforced Cortex treatment improve
delayed-task accuracy over using the same evidence directly?

## Result

No demonstrated advantage was found.

| Condition | Correct | Accuracy | Recorded cost |
|---|---:|---:|---:|
| Direct evidence use | 254/300 | 84.7% | `$2.0328` |
| Enforced Cortex | 246/300 | 82.0% | `$4.0669` |
| Advisory guidance | 235/300 | 78.3% | `$3.6149` |

Cortex completed all 300 evaluations without lifecycle or citation errors and prevented
unconfirmed answer-time memory writes. It nevertheless used 1.95 times the direct condition's
tokens and twice its recorded cost without improving aggregate accuracy.

## Decision

The planned larger confirmatory run was stopped. The next useful question was causal: whether the
loss came from semantic formation, enforced use, or their interaction.

See the [full repeated-pilot report](../../evaluation/results/repeated-pilot/README.md).
