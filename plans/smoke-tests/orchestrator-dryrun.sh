#!/usr/bin/env bash
set -euo pipefail

# Smoke test: run orchestrators in dry-run mode against the active-sample-repos.json example
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SAMPLE="$ROOT/../active-sample-repos.json"
OUT_DIR=$(mktemp -d)

echo "Using sample: $SAMPLE"

node "$ROOT/../packages/gh-cleanup/dist/bin/cli.js" active --input "$SAMPLE" --out "$OUT_DIR" --out-prefix smoke-active --dry-run
node "$ROOT/../packages/gh-cleanup/dist/bin/cli.js" maintenance --input "$SAMPLE" --out "$OUT_DIR" --out-prefix smoke-maintenance --dry-run

ls -l "$OUT_DIR"
jq -e '.steps' "$OUT_DIR/smoke-active-summary.json"
jq -e '.steps' "$OUT_DIR/smoke-maintenance-summary.json"

echo "Smoke tests passed (dry-run)"
