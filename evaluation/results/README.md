# Evaluation results

These reports tell the Cortex investigation in experimental order.

| Result | Decision |
|---|---|
| [`repeated-pilot/`](repeated-pilot/) | The complete treatment did not establish better accuracy than direct evidence use |
| [`formation-use-ablation/`](formation-use-ablation/) | Both current semantic formation and the combined enforced-use path reduced multi-hop accuracy |
| [`lossless-formation/`](lossless-formation/) | The oracle reader failed the frozen reliability floor, so formation remained untested |

## Publication boundary

The reports preserve aggregate outcomes, frozen rules, limitations, and source artifact hashes.
Private model traces, credentials, downloaded benchmark data, and manifests containing
machine-local paths are not published.

The lossless result includes public cell outcomes containing synthetic fixture identifiers, model
events, and telemetry. One provider-controlled HTML error body is deterministically redacted; its
original hash and length are published beside the reports.
