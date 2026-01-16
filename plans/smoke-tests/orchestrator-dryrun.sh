#!/usr/bin/env bash
set -euo pipefail

# Smoke test: run orchestrators in dry-run mode against the active-sample-repos.json example
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SAMPLE="$ROOT/../active-sample-repos.json"
OUT_DIR=$(mktemp -d)

echo "Using sample: $SAMPLE"

node "$ROOT/../packages/gh-cleanup/dist/bin/cli.js" gather --input "$SAMPLE" --out "$OUT_DIR" --out-prefix smoke-gather --dry-run
node "$ROOT/../packages/gh-cleanup/dist/bin/cli.js" change --input "$SAMPLE" --out "$OUT_DIR" --out-prefix smoke-change --dry-run

ls -l "$OUT_DIR"
jq -e '.steps' "$OUT_DIR/smoke-gather-summary.json"
jq -e '.steps' "$OUT_DIR/smoke-change-summary.json"

echo "Smoke tests passed (dry-run)"
