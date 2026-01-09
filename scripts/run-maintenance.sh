#!/usr/bin/env bash
set -euo pipefail

# run-maintenance.sh — convenience runner for the `maintenance` orchestrator
#
# Purpose:
#   Invoke the `gh-cleanup` `maintenance` orchestrator using a repository
#   input list. This is a lightweight wrapper intended for local testing and
#   CI smoke runs. Note: the script calls the CLI with `--yes --force` by
#   default so actions run non-interactively (no typed confirmation).
#
# Key behaviors:
#   - Invokes the `maintenance` orchestrator with `--yes --force` so it will
#     perform actions non-interactively (no typed confirmation).
#   - To run as a safe dry-run, omit the `--yes` flag when calling this script.
#   - Accepts an `--input` file (JSON array or newline list) and forwards it
#     to the `maintenance` orchestrator.
#   - Writes per-step outputs into the provided `--out` directory with the
#     `--out-prefix` applied.
#
# Usage:
#   ./scripts/run-maintenance.sh [input-file] [out-dir] [out-prefix]
#
# Defaults:
#   input-file=active-sample-repos.json
#   out-dir=./generated
#   out-prefix=maintenance
#   Note: this script adds `--yes --force` to the CLI invocation by default.

INPUT_FILE=${1:-active-sample-repos.json}
# Default outputs to repository generated folder when no OUT_DIR provided
OUT_DIR=${2:-$(pwd)/generated}
OUT_PREFIX=${3:-maintenance}

mkdir -p "$OUT_DIR"

# If a root .env exists, load it into the environment (export vars).
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

node packages/gh-cleanup/dist/bin/cli.js maintenance --out="$OUT_DIR" --out-prefix="$OUT_PREFIX" --yes --force --debug --debug-dir="$OUT_DIR/debug-maintenance"
