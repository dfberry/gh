#!/usr/bin/env bash
set -euo pipefail

# Determine refs to compare. The CI workflow should set BASE_REF and HEAD_REF.
BASE_REF=${BASE_REF:-origin/main}
HEAD_REF=${HEAD_REF:-HEAD}

# Ensure we have the base ref
git fetch --no-tags origin "+refs/heads/*:refs/remotes/origin/*" >/dev/null 2>&1 || true

# Compute changed files between base and head
if git rev-parse --verify "origin/${BASE_REF}" >/dev/null 2>&1; then
  CHANGED=$(git diff --name-only "origin/${BASE_REF}...${HEAD_REF}")
else
  CHANGED=$(git diff --name-only "${BASE_REF}...${HEAD_REF}" 2>/dev/null || true)
fi

echo "Changed files:" >&2
echo "$CHANGED" >&2

# Filter for command files under packages/gh-cleanup/src/commands/
CMD_FILES=$(printf "%s
" "$CHANGED" | grep -E '^packages/gh-cleanup/src/commands/.+\.(ts|js)$' || true)
if [ -z "$(echo "$CMD_FILES" | tr -d '[:space:]')" ]; then
  echo "No command files changed; skipping docs verification."
  exit 0
fi

MISSING=0
for f in $CMD_FILES; do
  name=$(basename "$f")
  cmd=${name%%.*}
  echo "Verifying docs mention for command: $cmd"
  if ! grep -R --line-number --no-messages "$cmd" README.md packages/**/README.md docs || true; then
    echo "Docs do not reference command '$cmd' in README.md or package READMEs or docs/" >&2
    MISSING=1
  fi
done

if [ "$MISSING" -ne 0 ]; then
  echo "Documentation verification failed: missing references for one or more commands." >&2
  exit 1
fi

echo "Documentation verification passed."
