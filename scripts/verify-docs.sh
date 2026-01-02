#!/usr/bin/env bash
set -euo pipefail

# Determine refs to compare. The CI workflow should set BASE_REF and HEAD_REF.
BASE_REF=${BASE_REF:-origin/main}
HEAD_REF=${HEAD_REF:-HEAD}

# Ensure we have the base and head refs available locally. Try a few fetch strategies
# to handle shallow or detached checkouts in CI.
git fetch --no-tags origin "+refs/heads/*:refs/remotes/origin/*" >/dev/null 2>&1 || true
git fetch --no-tags origin "${BASE_REF}" >/dev/null 2>&1 || true
git fetch --no-tags origin "${HEAD_REF}" >/dev/null 2>&1 || true

# If the above didn't populate origin refs, try fetching specific refs into remotes/origin
git fetch --no-tags origin "refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}" >/dev/null 2>&1 || true
git fetch --no-tags origin "refs/heads/${HEAD_REF}:refs/remotes/origin/${HEAD_REF}" >/dev/null 2>&1 || true

# Resolve base and head refs to use in diff
BASE_REF_REF="origin/${BASE_REF}"
HEAD_REF_REF="origin/${HEAD_REF}"
if ! git rev-parse --verify --quiet "$BASE_REF_REF" >/dev/null 2>&1; then
  # fall back to the literal base ref
  BASE_REF_REF="$BASE_REF"
fi
if ! git rev-parse --verify --quiet "$HEAD_REF_REF" >/dev/null 2>&1; then
  HEAD_REF_REF="$HEAD_REF"
fi

# Compute changed files between base and head
CHANGED=$(git diff --name-only "${BASE_REF_REF}...${HEAD_REF_REF}" 2>/dev/null || true)

echo "Changed files:" >&2
echo "$CHANGED" >&2

# Filter for command files under packages/gh-cleanup/src/commands/
CMD_FILES=$(printf '%s\n' "$CHANGED" | grep -E '^packages/gh-cleanup/src/commands/.+\.(ts|js)$' || true)
if [ -z "$(echo "$CMD_FILES" | tr -d '[:space:]')" ]; then
  echo "No command files changed; skipping docs verification."
  exit 0
fi

MISSING=0
for f in $CMD_FILES; do
  name=$(basename "$f")
  cmd=${name%%.*}
  echo "Verifying docs mention for command: $cmd"
  if grep -R --line-number --no-messages "$cmd" README.md packages/**/README.md docs; then
    # Command is referenced in the docs; nothing to do.
    :
  else
    status=$?
    if [ "$status" -eq 1 ]; then
      # No matches found: treat as missing documentation.
      echo "Docs do not reference command '$cmd' in README.md or package READMEs or docs/" >&2
      MISSING=1
    else
      # grep encountered an actual error (e.g., unreadable files, invalid pattern).
      echo "Error while searching docs for command '$cmd' (grep exit status: $status)" >&2
      exit "$status"
    fi
  fi
done

if [ "$MISSING" -ne 0 ]; then
  echo "Documentation verification failed: missing references for one or more commands." >&2
  exit 1
fi

echo "Documentation verification passed."
