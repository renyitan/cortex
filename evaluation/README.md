# Evaluation

This directory contains the model-backed research harness and the public evidence used to decide
whether Cortex should continue as a product.

## Contents

| Path | Purpose |
|---|---|
| [`cognition-harness/`](cognition-harness/) | TypeScript controller, model runners, evaluation-only stores, graders, and tests |
| [`cognition-harness/fixtures/lossless-formation/`](cognition-harness/fixtures/lossless-formation/) | Exact synthetic fixture source, blind-review artifacts, generator, tests, and frozen specification |
| [`results/`](results/) | Human-readable reports and sanitized machine-readable outcomes |

## Evidence boundary

The deterministic repository tests establish local mechanism behavior. The model-backed reports
measure bounded treatments under their named fixtures and models. Neither should be generalized to
all agents, models, tasks, or memory systems.

Private provider traces, credentials, benchmark source downloads, and machine-local paths are
gitignored and not part of the public evidence package.

## Validate the harness

Requirements:

- Node.js 22.19.0
- npm
- Python 3.10 or later for the fixture generator

```bash
cd evaluation/cognition-harness
npm ci --ignore-scripts
npm run check

cd fixtures/lossless-formation
python3 code/build_fixture_artifacts.py --check
python3 code/test_build_fixture_artifacts.py
```

The harness can make paid model calls. Do not run a live command until you have read the applicable
frozen specification, configured private credentials, and understood its cost cap.
