# Release reference

Version `0.33.0` is the reviewed Cortex release.

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

## Run the release

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

## Consumer pins

At session start, `cortex-mount` compares the reviewed manifest with the consumer repository's
`.cortex-version`.

- First use writes `.cortex-version`.
- A version change moves the prior value to `.cortex-version.previous`.
- The current value is written to `.cortex-version` and reported on stderr.

These files are declarations and local diagnostics. They do not change which payload Copilot
loads; the `--plugin-dir` argument does.
