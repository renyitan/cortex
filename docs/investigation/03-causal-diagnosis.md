# Stage 3: causal diagnosis

## Question

Did the multi-hop deficit come from Cortex's semantic memory formation, its enforced answer path,
or both?

## Result

Both tested components reduced accuracy.

| Formation | Use | Correct |
|---|---|---:|
| Exact raw evidence | Direct | 48/60 |
| Current semantic memory | Direct | 0/60 |
| Exact raw evidence | Enforced Cortex path | 29/60 |
| Current semantic memory | Enforced Cortex path | 0/60 |

The semantic stores were not empty. They compressed dense factual sources so aggressively that the
needed facts were lost. The byte-identical raw comparison separately showed that the combined
enforced-use path also performed worse than direct reading.

## Decision

Do not add more lifecycle machinery to rescue the current package. The only remaining formation
idea worth a bounded test was additive, evidence-preserving structure that never replaced source
observations.

See the [full causal-ablation report](../../evaluation/results/formation-use-ablation/README.md).
