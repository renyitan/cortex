# Lossless-formation fixture

This is the exact synthetic fixture package used by the final Cortex investigation.

## Contents

- `artifacts/fixture-source.json`: 12 streams, 144 observations, and 36 hidden tasks.
- `artifacts/fixture-manifest.json`: frozen hashes, counts, review status, and mappings.
- `artifacts/fixture-review-*`: outcome-blind behavior review packet, labels, and adjudication.
- `artifacts/fixture-claim-review-*`: outcome-blind claim review packet, labels, and adjudication.
- `artifacts/spec.md`: frozen experimental contract.
- `code/build_fixture_artifacts.py`: deterministic generator and validator.
- `code/test_build_fixture_artifacts.py`: regression tests.

All cases, organizations, teams, projects, workflows, actions, and conversations are fictional.

## Validate

```bash
python3 code/build_fixture_artifacts.py --check
python3 code/test_build_fixture_artifacts.py
```

The source SHA-256 is
`15b349136bdc9f5eca6a8b2560cb64de9e726a9ef0760fd0c0a3606946924a87`.
