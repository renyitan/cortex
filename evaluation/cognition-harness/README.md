# Cognition harness

This evaluation-only TypeScript harness was used to test Cortex mechanisms and behavioral claims.
It is not part of the distributed plugin.

## Capabilities

- Enforce bounded `WAKE`, `WORK`, and `SLEEP` phase receipts.
- Compare regular, advisory, and Cortex treatments with retained failures.
- Run adapted MemoryAgentBench conditions with frozen manifests.
- Evaluate additive lossless claims against exact raw observations.
- Record tokens, cost, latency, errors, and integrity checks.

## Validate

```bash
npm ci --ignore-scripts
npm run check
```

The required runtime is Node.js 22.19.0 or later.

## Local data

The following paths are intentionally gitignored:

- `auth.json`
- `data/`
- `runs/`

They may contain downloaded benchmark data, credentials, provider traces, machine-local paths, or
other non-public execution artifacts.

## Lossless fixture

The exact public fixture package is under
[`fixtures/lossless-formation/`](fixtures/lossless-formation/). It contains synthetic observations
and actions only. Its generator verifies the frozen source, outcome-blind review packets, labels,
adjudications, and hashes.

Live lossless commands require explicit `--fixture`, `--manifest`, and run paths. Read
[`fixtures/lossless-formation/artifacts/spec.md`](fixtures/lossless-formation/artifacts/spec.md)
before using them. The published result stopped at the oracle/raw gate and made no model-formation
calls.
