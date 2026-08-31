# Cortex investigation

## Research question

Cortex asked whether a structured cognition lifecycle could help a long-running agent remember,
apply, and maintain durable knowledge better than simpler context use.

The investigation moved from mechanism feasibility to repeated comparison, causal diagnosis, and a
lossless alternative. Each stage narrowed the claim instead of treating a working mechanism as
proof of better behavior.

| Stage | Question | Result | Evidence |
|---|---|---|---|
| 1 | Can a controller enforce `WAKE -> WORK -> SLEEP`? | Yes, in a synthetic feasibility trial | [Lifecycle feasibility](01-lifecycle-feasibility.md) |
| 2 | Does the complete Cortex treatment improve delayed-task accuracy? | No demonstrated advantage | [Repeated comparison](02-repeated-comparison.md) |
| 3 | Was the deficit caused by memory formation or enforced use? | Both tested components reduced accuracy | [Causal diagnosis](03-causal-diagnosis.md) |
| 4 | Can evidence-preserving structured memory provide a better path? | The evaluation instrument was not reliable enough to answer | [Lossless alternative](04-lossless-alternative.md) |

## Why the investigation stopped

The strongest valid comparison gave the same retrieved evidence to both conditions:

- direct evidence use scored 254/300;
- Cortex scored 246/300;
- Cortex used 1.95 times the tokens and twice the recorded cost.

The causal follow-up then found that current semantic formation reduced 48/60 direct answers to
0/60, while the combined enforced-use path reduced the same exact raw memory from 48/60 to 29/60.

The lossless alternative could not be tested fairly because its perfect oracle condition still
failed the frozen reader-reliability gate. Continuing to tune the same package after seeing these
results would turn a controlled investigation into an open-ended search for a win.

See the [final conclusion](conclusion.md).

## Evidence policy

- Negative and invalid outcomes remain visible.
- A mechanism test is not presented as behavioral efficacy.
- Development screens are separated from repeated frozen comparisons.
- Model failures remain in the planned denominator.
- Private provider traces and machine-local paths are not published.
- Public result reports identify the source artifact hashes when the exact private manifest cannot
  be published safely.
