#!/usr/bin/env bash
set -euo pipefail

# Simple, extensible verification script for packages/gh-cleanup
# - Current checks: ensure exactly one `new GitHubClient` exists in source
# - Extend by adding functions named check_* and adding them to the `checks` array

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

echo "verify-gh-cleanup: running checks for packages/gh-cleanup"

errors=0

check_new_githubclient() {
  echo " - check: single 'new GitHubClient' in packages/gh-cleanup/src"
  # search source files, ignore typical build/output dirs
  matches=$(grep -nR --exclude-dir={dist,node_modules} -E "new GitHubClient" packages/gh-cleanup/src || true)
  # filter out empty lines and count non-empty lines
  count=$(printf "%s\n" "$matches" | grep -cve '^$' || true)
  count=${count:-0}
  echo "   found: $count"
  if [ "$count" -ne 1 ]; then
    echo "ERROR: expected exactly 1 occurrence of 'new GitHubClient' in packages/gh-cleanup/src, found $count"
    if [ -n "$matches" ]; then
      echo "--- matches ---"
      echo "$matches"
      echo "--- end matches ---"
    fi
    return 1
  fi
  echo "   ok"
  return 0
}

# Add other checks here and include their function names in the checks array
checks=(
  check_new_githubclient
)

for chk in "${checks[@]}"; do
  if ! $chk; then
    errors=$((errors+1))
  fi
done

if [ "$errors" -ne 0 ]; then
  echo "verify-gh-cleanup: FAILED ($errors failed checks)"
  exit 1
fi

echo "verify-gh-cleanup: OK"
exit 0
