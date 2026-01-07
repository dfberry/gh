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

# Discover all command files in the gh-cleanup commands directory and verify docs
CMD_INDEX="packages/gh-cleanup/src/bin/commands.ts"
echo "Loading command index: $CMD_INDEX" >&2
if [ -f "$CMD_INDEX" ]; then
  # Extract command keys from the commands object. Handles quoted keys and
  # unquoted identifier keys (e.g. summary: async ...)
  mapfile -t CMD_NAMES < <(sed -n -e "s/^[[:space:]]*'\([^']\+\)'[[:space:]]*:[[:space:]]*async.*/\1/p" -e "s/^[[:space:]]*\([a-zA-Z0-9_-]\+\)[[:space:]]*:[[:space:]]*async.*/\1/p" "$CMD_INDEX" | sort -u)
  if [ ${#CMD_NAMES[@]} -eq 0 ]; then
    echo "No commands found in $CMD_INDEX; falling back to scanning command files." >&2
  else
    echo "Commands found (${#CMD_NAMES[@]}):" >&2
    for cmd in "${CMD_NAMES[@]}"; do
      echo "- $cmd" >&2
    done
  fi
fi

# If no commands found via index, fall back to scanning the commands directory
if [ -z "${CMD_NAMES[*]:-}" ]; then
  CMD_DIR="packages/gh-cleanup/src/commands"
  if [ ! -d "$CMD_DIR" ]; then
    echo "Command directory not found: $CMD_DIR" >&2
    exit 0
  fi
  mapfile -t CMD_FILES < <(find "$CMD_DIR" -maxdepth 1 -type f \( -name '*.ts' -o -name '*.js' \) -print | sort)
  if [ ${#CMD_FILES[@]} -eq 0 ]; then
    echo "No command source files found in $CMD_DIR; skipping docs verification." >&2
    exit 0
  fi
  echo "Commands found (${#CMD_FILES[@]}):" >&2
  for f in "${CMD_FILES[@]}"; do
    name=$(basename "$f")
    cmd=${name%%.*}
    echo "- $cmd" >&2
    CMD_NAMES+=("$cmd")
  done
fi

MISSING_COUNT=0
MISSING_LIST=()
echo >&2
echo "Verifying docs for each command..." >&2
for cmd in "${CMD_NAMES[@]}"; do
  echo "Checking: $cmd" >&2

  # Build a safe list of search paths to avoid grep failing on missing globs
  SEARCH_PATHS=()
  [ -f README.md ] && SEARCH_PATHS+=("README.md")
  while IFS= read -r p; do SEARCH_PATHS+=("$p"); done < <(find packages -maxdepth 3 -type f -name README.md 2>/dev/null || true)
  [ -d docs ] && SEARCH_PATHS+=("docs")
  if [ ${#SEARCH_PATHS[@]} -eq 0 ]; then
    # Fallback to repo README if nothing else exists
    SEARCH_PATHS+=("README.md")
  fi

  # First try an exact backticked match (e.g. `summary`) using fixed-string search
  if output=$(grep -R --line-number --no-messages -F "\`$cmd\`" "${SEARCH_PATHS[@]}" 2>/dev/null); then
    echo "FOUND (backtick): $cmd" >&2
    echo "$output" | sed 's/^/  /' >&2
  else
    status=$?
    if [ $status -eq 2 ]; then
      echo "ERROR searching docs for '$cmd' (grep exit status: $status)" >&2
      echo "Please ensure the docs directories are readable and patterns are valid." >&2
      MISSING_COUNT=$((MISSING_COUNT+1))
      MISSING_LIST+=("$cmd (error)")
      echo >&2
      continue
    fi

    # Fallback to a word match
    if output=$(grep -R --line-number --no-messages -w -- "$cmd" "${SEARCH_PATHS[@]}" 2>/dev/null); then
      echo "FOUND (word): $cmd" >&2
      echo "$output" | sed 's/^/  /' >&2
    else
      status=$?
      if [ $status -eq 1 ]; then
        echo "MISSING: $cmd (no matches in README.md, packages/**/README.md or docs/)" >&2
        MISSING_COUNT=$((MISSING_COUNT+1))
        MISSING_LIST+=("$cmd")
      else
        echo "ERROR searching docs for '$cmd' (grep exit status: $status)" >&2
        MISSING_COUNT=$((MISSING_COUNT+1))
        MISSING_LIST+=("$cmd (error)")
      fi
    fi
  fi
  echo >&2
done

if [ $MISSING_COUNT -ne 0 ]; then
  echo "Documentation verification: FAILED — $MISSING_COUNT missing or errored." >&2
  echo "Missing commands:" >&2
  for m in "${MISSING_LIST[@]}"; do
    echo "- $m" >&2
  done
  exit 1
fi

echo "Documentation verification: PASSED — all ${#CMD_NAMES[@]} commands referenced in docs." >&2
