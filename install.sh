#!/bin/sh
# cortex install.sh — stand up a cortex-powered agent from a reviewed checkout.
#
#   git clone https://github.com/renyitan/cortex.git
#   cd cortex && less install.sh
#   ./install.sh --dir ../example-agent --name scribe --description "A local agent."
#
# What it does: uses the plugin payload in this checkout to scaffold an agent in another directory
# (persona + memory + workspace) and generate its Copilot entrypoint.
#
# Run the result with the same reviewed payload:
#   copilot --plugin-dir /path/to/cortex/plugins/cortex --agent scribe
#
# Non-interactive / CI:
#   ./install.sh --dir ../example-agent --name scribe --description "..." --yes
#
# Flags:
#   --name NAME            agent name (kebab-case). Prompted if omitted.
#   --description TEXT     one-line description. Prompted if omitted (a default is offered).
#   --dir DIR             target repo dir (default: current directory).
#   --plugin-dir DIR       reviewed local plugin payload (default: this checkout's plugins/cortex).
#   --yes                  accept defaults, no prompts.
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
NAME=""
DESCRIPTION=""
DIR="$PWD"
PLUGIN_DIR="$SCRIPT_DIR/plugins/cortex"
ASSUME_YES=0

c_bold=""; c_dim=""; c_grn=""; c_red=""; c_rst=""
if [ -t 1 ]; then c_bold="$(printf '\033[1m')"; c_dim="$(printf '\033[2m')"; c_grn="$(printf '\033[32m')"; c_red="$(printf '\033[31m')"; c_rst="$(printf '\033[0m')"; fi
say()  { printf '%s\n' "$*"; }
step() { printf '%s==>%s %s\n' "$c_grn" "$c_rst" "$*"; }
die()  { printf '%scortex install:%s %s\n' "$c_red" "$c_rst" "$*" >&2; exit 1; }
usage() {
  sed -n '2,/^set -eu$/p' "$0" | sed '$d'
}

# Use the controlling terminal for prompts even when stdin is redirected.
TTY=""
[ -e /dev/tty ] && TTY=/dev/tty
ask() { # ask <var> <prompt> <default>
  _p="$2"; _d="${3:-}"
  if [ "$ASSUME_YES" -eq 1 ] || [ -z "$TTY" ]; then printf '%s' "$_d"; return; fi
  if [ -n "$_d" ]; then printf '%s %s[%s]%s ' "$_p" "$c_dim" "$_d" "$c_rst" >/dev/tty; else printf '%s ' "$_p" >/dev/tty; fi
  IFS= read -r _ans <"$TTY" || _ans=""
  [ -n "$_ans" ] && printf '%s' "$_ans" || printf '%s' "$_d"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --name) shift; NAME="${1:-}" ;;
    --name=*) NAME="${1#--name=}" ;;
    --description) shift; DESCRIPTION="${1:-}" ;;
    --description=*) DESCRIPTION="${1#--description=}" ;;
    --dir) shift; DIR="${1:-}" ;;
    --dir=*) DIR="${1#--dir=}" ;;
    --plugin-dir) shift; PLUGIN_DIR="${1:-}" ;;
    --plugin-dir=*) PLUGIN_DIR="${1#--plugin-dir=}" ;;
    --yes|-y) ASSUME_YES=1 ;;
    -h|--help) usage; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

command -v copilot >/dev/null 2>&1 || die "GitHub Copilot CLI not found. Install it first: https://docs.github.com/copilot/how-tos/set-up/install-copilot-cli"
[ -d "$PLUGIN_DIR" ] || die "local plugin directory not found: $PLUGIN_DIR"

say ""
say "${c_bold}cortex${c_rst} — create an agent from this reviewed local checkout."
say "${c_dim}It will: use the reviewed plugin checkout · scaffold an agent · generate its Copilot entrypoint.${c_rst}"
say ""

# 1. resolve the engine from the reviewed local payload ------------------------------------------
MOUNT="$PLUGIN_DIR/bin/cortex-mount"
[ -x "$MOUNT" ] || die "cortex-mount is not executable in: $PLUGIN_DIR"

# 2. identity of the new agent ------------------------------------------------------------------
[ -n "$NAME" ] || NAME="$(ask NAME "Agent name (kebab-case, e.g. scribe):" "")"
[ -n "$NAME" ] || die "an agent name is required (--name NAME)"
case "$NAME" in *[!a-z0-9-]*|"") die "name must be kebab-case (lowercase letters, numbers, hyphens): got '$NAME'" ;; esac

DEF_DESC="$NAME — a personal agent that inherits the cortex cognition substrate (WAKE -> WORK -> SLEEP -> CURATE) and keeps its memory as plain markdown in this repo."
[ -n "$DESCRIPTION" ] || DESCRIPTION="$(ask DESCRIPTION "One-line description:" "$DEF_DESC")"

TITLE="$(printf '%s' "$NAME" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')"
mkdir -p "$DIR/agents"
PERSONA="$DIR/agents/$NAME.md"

# 3. scaffold a starter persona (only if absent — never clobber the dev's own) -------------------
if [ ! -f "$PERSONA" ]; then
  step "Scaffolding agent persona ($PERSONA)"
  cat > "$PERSONA" <<PERSONA_EOF
---
description: "$DESCRIPTION"
---
# $TITLE — agent persona

> The instance layer. $TITLE inherits the cortex substrate (identity · skills · cognition cycle) as
> an installed Copilot CLI plugin, and overlays its own persona below. Edit this file to make $TITLE
> yours — the cognition underneath is cortex's; the personality is yours.

## Who
- **Name — $TITLE.**
- **Owner — you.**
- **Domain — describe what $TITLE is for.**

## Voice
- Lead with why it matters; warm and plain; no hype, no emoji.

## How $TITLE works
- Runs cortex's cognition cycle (WAKE -> WORK -> SLEEP -> CURATE) over its own work.
- State is plain markdown in this repo: \`memory/\` (what it knows) and \`workspace/\` (the work).
PERSONA_EOF
else
  step "Using existing persona ($PERSONA)"
fi

# 4. mount: compose the agent entrypoint + scaffold memory/workspace (the engine does it all) ----
step "Binding $TITLE to cortex"
COPILOT_PROJECT_DIR="$DIR" COPILOT_PLUGIN_ROOT="$PLUGIN_DIR" "$MOUNT"

say ""
say "${c_grn}${c_bold}Done.${c_rst} $TITLE is mounted on cortex."
say ""
say "  ${c_bold}cd $(printf '%s' "$DIR" | sed "s|$HOME|~|")${c_rst}"
say "  ${c_bold}copilot --plugin-dir $(printf '%s' "$PLUGIN_DIR" | sed "s|$HOME|~|") --agent $NAME${c_rst}"
say ""
say "${c_dim}Edit agents/$NAME.md to shape the persona. Keep using this reviewed plugin directory;${c_rst}"
say "${c_dim}Cortex does not fetch remote code or update this checkout automatically.${c_rst}"
