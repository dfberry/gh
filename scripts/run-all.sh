#!/usr/bin/env bash

# run-all.sh — repository-cleanup pipeline runner
#
# Purpose:
#   Orchestrates the gh-cleanup CLI commands to produce repository reports
#   and (optionally) perform destructive actions (delete/archive/patch).
#
# Key behaviors:
#   - Builds workspace packages, runs summary/categorize/delete-empty/remove-forks/
#     archive-stale/describe-repos commands in sequence and writes outputs to
#     `generated/` by default.
#   - Default mode is safe/dry-run; pass `--apply` to forward destructive flags
#     (e.g., `--yes`) to commands to actually perform deletions/archives/patches.
#   - Supports debug capture for LLM-driven steps via `--debug` and `--debug-dir`.
#
# Usage:
#   ./scripts/run-all.sh [--apply]
#   npm run run-all:apply  # wrapper creates ./generated and captures logs
#
# Safety:
#   - This script uses `set -euo pipefail` so failures stop early.
#   - Ensure `GH_TOKEN` has appropriate scopes before using `--apply`.

# Fail fast: exit on error, treat unset variables as errors, and propagate pipe failures.
# This makes the script safer in CI and local runs so failures stop the pipeline early.
set -euo pipefail

# Root runner for repository-cleanup tasks.
# - Run this from the repository root (script resolves ROOT_DIR relative to its location).
# - Requires `node`/`npm` on PATH to run package CLIs via `npm run start -w <pkg>`.
# - By default the pipeline performs dry-runs and writes outputs to `generated/`.
# - Pass `--apply` to forward destructive flags to commands (deletes/archives/patches).
#   Use with caution and ensure `GH_TOKEN` has appropriate scopes in CI.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="$ROOT_DIR/generated"
mkdir -p "$OUT_DIR"

# Helper to run and echo commands for visibility.
run_cmd(){
  # Print the command for visibility, then execute it.
  # We use `eval` so complex quoted commands run as expected.
  echo "\n==> $*" >&2
  eval "$*"
}

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --help|-h) echo "Usage: run-all.sh [--apply]"; exit 0 ;;
    *) ;;
  esac
done

echo "Running repository-cleanup pipeline (apply=$APPLY)" >&2
TS=$(date -u +"%Y-%m-%dT%H%M%SZ")

# Build all workspace packages once to avoid repeated builds per command.
run_cmd "npm run build"

# Load a root .env file if present (simple KEY=VALUE parser).
# Supported format:
# - Lines with KEY=VALUE, optionally quoted with single or double quotes.
# - Blank lines and lines starting with `#` are ignored.
# - Values are exported into the environment and will override existing vars for this run.
if [ -f "$ROOT_DIR/.env" ]; then
  echo "Loading environment from $ROOT_DIR/.env" >&2
  # shellcheck disable=SC1090
  while IFS= read -r line || [ -n "$line" ]; do
    # strip leading/trailing whitespace
    line=$(printf "%s" "$line" | sed -e 's/^\s*//' -e 's/\s*$//')
    [ -z "$line" ] && continue
    case "$line" in
      \#*) continue ;;
    esac
    key=${line%%=*}
    val=${line#*=}
    # remove surrounding quotes if present
    val=$(printf "%s" "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    export "$key"="$val"
  done < "$ROOT_DIR/.env"
fi

# Ensure GH_TOKEN available warning
if [ -z "${GH_TOKEN:-}" ]; then
  echo "Warning: GH_TOKEN is not set. Interactive or CI runs may fail without it." >&2
  echo "  Note: for destructive operations the token should have delete_repo/admin scopes." >&2
fi
if [ -z "${GH_USER:-}" ]; then
  echo "Warning: GH_USER is not set. Some outputs may lack actor context." >&2
fi

# Run the `all` commandgroup (maintenance -> active -> evaluate) so grouped
# steps are produced as part of the pipeline. The `all` commandgroup will
# invoke the individual commands internally; the script no longer runs them
# separately.
run_cmd "node \"$ROOT_DIR/packages/gh-cleanup/dist/bin/cli.js\" all --out=\"$OUT_DIR\" --debug --debug-dir=\"$OUT_DIR/debug\""

echo "\nPipeline finished at: $(date -u --iso-8601=seconds)" >&2
echo "Generated outputs:" >&2
ls -lah "$OUT_DIR" || true

echo "Summary (files and sizes):" >&2
find "$OUT_DIR" -maxdepth 1 -type f -printf "%s bytes\t%p\n" | sort -nr | awk '{printf "%10s %s\n", $1, $2}'

echo "\nTo push generated files to a site repo, see .github/workflows/update-site.yml and set secrets TARGET_REPO and TARGET_REPO_TOKEN." >&2

# Notes on failure behavior:
# - The script uses `set -euo pipefail`, so any command that exits non-zero will stop the pipeline.
# - `generated/` may contain partial outputs if a later step fails; consider using a temporary directory
#   and promoting results atomically in CI if atomicity is required.

exit 0
