#!/usr/bin/env bash
set -euo pipefail

# run-evaluate.sh — convenience runner for the `evaluate` orchestrator
#
# Purpose:
#   Invoke the `gh-cleanup` `evaluate` orchestrator in dry-run mode using a
#   repository input list. This wrapper is for local testing and CI smoke runs.
#
# Usage:
#   ./scripts/run-evaluate.sh [input-file] [out-dir] [out-prefix]
#
# Defaults:
#   input-file=active-sample-repos.json
#   out-dir=$(pwd)/generated/gh-cleanup-evaluate
#   out-prefix=evaluate-dryrun

INPUT_FILE=${1:-active-sample-repos.json}
OUT_DIR=${2:-$(pwd)/generated/gh-cleanup-evaluate}
OUT_PREFIX=${3:-evaluate-dryrun}

mkdir -p "$OUT_DIR"

# If a root .env exists, load it into the environment (export vars).
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ROOT_DIR/.env"
  set +a
fi

node packages/gh-cleanup/dist/bin/cli.js evaluate --input="$INPUT_FILE" --out="$OUT_DIR" --out-prefix="$OUT_PREFIX" --dry-run
