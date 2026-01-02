#!/usr/bin/env bash
set -euo pipefail

# run-maintenance.sh — convenience runner for the `maintenance` orchestrator
#
# Purpose:
#   Invoke the `gh-cleanup` `maintenance` orchestrator in dry-run mode using a
#   repository input list. This is a lightweight wrapper intended for
#   local testing and CI smoke runs.
#
# Key behaviors:
#   - Defaults to `--dry-run` so no destructive actions are performed.
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
#   out-dir=/tmp/gh-cleanup-maintenance
#   out-prefix=maintenance-dryrun

INPUT_FILE=${1:-active-sample-repos.json}
# Default outputs to repository generated folder when no OUT_DIR provided
OUT_DIR=${2:-$(pwd)/generated/gh-cleanup-maintenance}
OUT_PREFIX=${3:-maintenance-dryrun}

mkdir -p "$OUT_DIR"

# If a root .env exists, load it into the environment (export vars).
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

node packages/gh-cleanup/dist/bin/cli.js maintenance --input "$INPUT_FILE" --out "$OUT_DIR" --out-prefix "$OUT_PREFIX" --dry-run
