# Final research snapshot

Version `0.33.0` is the final reviewed plugin payload. Repository documentation and evaluation
evidence continued after that payload froze, and product development was parked on 2026-08-31.

The public repository is a completed research record, not an actively supported release channel.

## Version sources

The plugin version appears in:

- `plugins/cortex/plugin.json`;
- `plugins/cortex/.claude-plugin/plugin.json`;
- `.claude-plugin/marketplace.json`.

`scripts/cortex-lint` verifies that these values agree and that shipped plugin changes include a
version change.

## Validate the release

```bash
scripts/cortex-lint
for test in tests/test-*; do "$test"; done
sh -n install.sh try-cortex.sh
bash -n \
  plugins/cortex/bin/cortex-bind \
  plugins/cortex/bin/cortex-capture-check \
  plugins/cortex/bin/cortex-mount \
  scripts/cortex-lint \
  tests/test-*
```

## Explore the release

The top-level Copilot CLI accepts `--plugin-dir`, so the reviewed tag can be used as a source
baseline without registering or updating a remote plugin:

```bash
git clone https://github.com/renyitan/cortex.git
cd cortex
git checkout v0.33.0
./try-cortex.sh
```

`copilot plugin install` and `copilot plugin update` do not accept a local filesystem path or a
release-tag selector. The tag is therefore a source and audit baseline, not a version selector for
the plugin manager.

## Final publication procedure

Before making the repository public and archiving it:

```bash
scripts/cortex-lint
for test in tests/test-*; do "$test"; done

cd evaluation/cognition-harness
npm ci --ignore-scripts
npm run check

cd fixtures/lossless-formation
python3 code/build_fixture_artifacts.py --check
python3 code/test_build_fixture_artifacts.py
```

Also confirm:

- all Markdown links resolve;
- no tracked file or reachable commit contains credentials or machine-local private paths;
- public result reports match their recorded hashes;
- the archival `research/formation-use-ablation` branch resolves to commit `c44a198`;
- the README states that development is parked and no behavioral advantage was established;
- GitHub issues, pull requests, discussions, and security support expectations match the archived
  status.

The final GitHub release should use tag `v0.33.0` and describe it as the final plugin payload plus
the completed investigation record. Archive the repository after the release is visible.

## Historical consumer pins

At session start, `cortex-mount` compares the reviewed manifest with the consumer repository's
`.cortex-version`.

- First use writes `.cortex-version`.
- A version change moves the prior value to `.cortex-version.previous`.
- The current value is written to `.cortex-version` and reported on stderr.

These files are declarations and local diagnostics. They do not change which payload Copilot
loads; the `--plugin-dir` argument does. No future compatibility updates are planned.
