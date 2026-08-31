# Contributing

This investigation is complete and the repository is archived. It does not accept feature
requests, pull requests, compatibility work, or requests to tune the published experiments.

You may fork and adapt the code under the [MIT License](LICENSE). If you publish a derivative, make
its maintenance status and evidence boundaries clear. Do not imply that Cortex `v0.33.0`
established behavioral improvement beyond the conclusions in
[`docs/findings.md`](docs/findings.md), and do not erase the negative results when adapting the
implementation.

The checked-in validation commands are:

```bash
scripts/cortex-lint
for test in tests/test-*; do "$test"; done
```
