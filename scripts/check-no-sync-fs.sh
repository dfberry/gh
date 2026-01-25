#!/usr/bin/env bash
set -euo pipefail

# Check for synchronous fs usage across the repository
# Scans common source folders and scripts for calls to Node's sync fs APIs

EXCLUDE_DIRS=(.git node_modules dist generated)

# By default ignore the scripts/ directory (scripts often intentionally use sync calls).
# Set INCLUDE_SCRIPTS=1 or pass --include-scripts to scan scripts/ as well.
INCLUDE_SCRIPTS=0
if [ "${1-}" = "--include-scripts" ]; then
  INCLUDE_SCRIPTS=1
fi

PATTERN="readFileSync|writeFileSync|existsSync|statSync|readdirSync|mkdtempSync|rmSync|mkdirSync|cpSync|appendFileSync|unlinkSync|rmdirSync|lstatSync|accessSync"

echo "Scanning repository for sync fs usage... (include scripts: ${INCLUDE_SCRIPTS})"

matches=""

SCRIPT_REL=./scripts/check-no-sync-fs.sh

if command -v git >/dev/null 2>&1; then
  set +e
  if [ "$INCLUDE_SCRIPTS" -eq 1 ]; then
    # scan packages, solutions, and scripts
    matches=$(git grep -n -E "$PATTERN" -- 'packages/*' 'solutions/*' 'scripts' || true)
  else
    # scan only packages and solutions
    matches=$(git grep -n -E "$PATTERN" -- 'packages/*' 'solutions/*' || true)
  fi
  set -e
fi

if [ -z "$matches" ]; then
  set +e
  if [ "$INCLUDE_SCRIPTS" -eq 1 ]; then
    matches=$(grep -R -nE --exclude-dir=".git" --exclude-dir=".github" --exclude-dir="node_modules" --exclude-dir="dist" --exclude-dir="generated" "$PATTERN" packages solutions scripts . || true)
  else
    matches=$(grep -R -nE --exclude-dir=".git" --exclude-dir=".github" --exclude-dir="node_modules" --exclude-dir="dist" --exclude-dir="generated" --exclude-dir="scripts" "$PATTERN" packages solutions . || true)
  fi
  set -e
fi

# Filter out matches that reference this check script itself and deduplicate
if [ -n "$matches" ]; then
  # Remove lines that reference this script file
  filtered=$(printf "%s\n" "$matches" | grep -v "^${SCRIPT_REL}:" | awk '!seen[$0]++')
  if [ -n "$filtered" ]; then
    echo "Found synchronous fs usages (please convert to async fs/promises):"
    echo
    echo "$filtered"
    echo
    echo "If any of these are false-positives, document and/or exclude them in this script or run with --include-scripts."
    exit 1
  else
    echo "No sync fs usages found in scanned locations (ignoring scripts/ and this checker)."
    exit 0
  fi
else
  echo "No sync fs usages found in scanned locations."
  exit 0
fi
