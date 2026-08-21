# Contributing

This repository does not accept feature requests, pull requests, or compatibility work.

You may fork and adapt the code under the [MIT License](LICENSE). If you publish a derivative, make
its maintenance status and evidence boundaries clear, and do not imply that Cortex `v0.33.0`
established behavioral improvement beyond the conclusions in
[`docs/findings.md`](docs/findings.md).

The checked-in validation commands are:

```bash
scripts/cortex-lint
for test in tests/test-*; do "$test"; done
```
