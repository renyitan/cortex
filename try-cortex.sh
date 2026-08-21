#!/bin/sh
# Create and launch a starter Cortex agent from this reviewed checkout.
set -eu

ROOT="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
TARGET="${1:-"$ROOT/../example-agent"}"
PLUGIN_DIR="$ROOT/plugins/cortex"

die() {
  printf 'try-cortex: %s\n' "$*" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || die "Git is required."
command -v copilot >/dev/null 2>&1 || die "GitHub Copilot CLI is required."

if [ -e "$TARGET" ] && [ ! -d "$TARGET" ]; then
  die "target exists and is not a directory: $TARGET"
fi

if [ -d "$TARGET" ] && [ ! -e "$TARGET/.git" ] \
   && [ -n "$(find "$TARGET" -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  die "target is not empty or a Git repository: $TARGET"
fi

mkdir -p "$TARGET"
[ -e "$TARGET/.git" ] || git -C "$TARGET" init --quiet

"$ROOT/install.sh" \
  --plugin-dir "$PLUGIN_DIR" \
  --dir "$TARGET" \
  --name scribe \
  --description "A research and writing agent with durable local memory." \
  --yes

cd "$TARGET"
exec copilot --plugin-dir "$PLUGIN_DIR" --agent scribe
