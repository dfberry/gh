#!/usr/bin/env bash
set -euo pipefail

# verify-github-rest.sh
# ---------------------
# Purpose:
#   CI and local helper that scans the repository for direct HTTP usage
#   (e.g. `client.get|post|patch|del`, `fetch(...)`, or local wrappers like
#   `fetchFn(...)`) and enforces a project policy: all GitHub API requests
#   should go through the centralized `packages/github-rest/src/endpoints`
#   helpers. This keeps networking, authentication, retry, and mocking
#   behavior consistent across packages.
#
# Scope & behavior:
#   - Runs on PRs (via .github workflow) and can be run locally.
#   - Only reports violations occurring inside `packages/gh-cleanup` by
#     default; calls inside `packages/github-rest` internals and test files
#     are ignored.
#   - Detects common patterns, including wrapper assignments like
#     `const fetchFn = (globalThis as any).fetch` and subsequent calls to
#     the wrapper (e.g. `fetchFn(...)`).
#
# Whitelisting / Exceptions:
#   - If a package must perform low-level fetches for a good reason, add a
#     short code comment and update this script to allow that specific case,
#     or move the helper into `packages/github-rest`.
#
# How to fix a violation:
#   - Move the request into `packages/github-rest/src/endpoints` as a helper
#     and call that helper from the caller; or use the exported `GitHubClient`
#     or `createGitHubClient` factory from `github-rest`.

echo "Scanning repository for direct client.* and fetch calls..."

EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist)

matches_client=$(grep -RInP ${EXCLUDES[@]} "client\\.(get|post|patch|del)\\s*\\(" --binary-files=without-match || true)
matches_fetch=$(grep -RInP ${EXCLUDES[@]} "\\bfetch\\s*\\(|globalThis\\.fetch\\s*\\(" --binary-files=without-match || true)

matches=""
if [ -n "$matches_client" ]; then
  matches+="$matches_client\n"
fi
if [ -n "$matches_fetch" ]; then
  matches+="$matches_fetch\n"
fi

# Detect wrapper assignments like: const fetchFn = (globalThis as any).fetch
# and then search for calls to those wrapper names (e.g. fetchFn(...)).
wrapper_names=$(grep -RIP -o -h ${EXCLUDES[@]} "^(?:\s*)(?:const|let|var)\s+\K([A-Za-z_$][\\w$]*)(?=\s*=\s*[^\\n]*globalThis[^\\n]*\\.fetch)" --binary-files=without-match || true)
if [ -n "$wrapper_names" ]; then
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    # find calls to the wrapper name (respect excludes)
    wrapper_calls=$(grep -RIn ${EXCLUDES[@]} -E "\b${name}\s*\(" --binary-files=without-match || true)
    if [ -n "$wrapper_calls" ]; then
      matches+="$wrapper_calls\n"
    fi
  done <<< "$wrapper_names"
fi

# Deduplicate matches (preserve first-seen order) to avoid duplicate reports
if [ -n "$matches" ]; then
  matches=$(printf '%s\n' "$matches" | awk '!seen[$0]++')
fi

if [ -z "${matches// /}" ]; then
  echo "No direct client.* or fetch calls found."
  exit 0
fi

violations=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  file=$(printf '%s' "$line" | cut -d: -f1)
  # Only enforce in the gh-cleanup package; ignore other packages
  if [[ "$file" != packages/gh-cleanup/* ]]; then
    # still allow github-rest internals and test files anywhere
    if [[ "$file" == packages/github-rest/src/endpoints/* || "$file" == packages/github-rest/src/core/* ]]; then
      continue
    fi
    if [[ "$file" =~ \.test\.|/__tests__/ ]]; then
      continue
    fi
    continue
  fi
  echo "Violation: $line"
  violations=$((violations+1))
done <<< "$matches"

if [ "$violations" -gt 0 ]; then
  echo "$violations violations found. Direct GitHubClient/fetch calls must be wrapped in packages/github-rest/src/endpoints."
  exit 1
fi

echo "No violations found."
exit 0


# Deduplicate matches (preserve first-seen order) to avoid duplicate reports
if [ -n "$matches" ]; then
  matches=$(printf '%s\n' "$matches" | awk '!seen[$0]++')
fi

# Detect wrapper assignments like: const fetchFn = (globalThis as any).fetch
# and then search for calls to those wrapper names (e.g. fetchFn(...)).
wrapper_names=$(grep -RIP -o -h ${EXCLUDES[@]} "^(?:\s*)(?:const|let|var)\s+\K([A-Za-z_$][\\w$]*)(?=\s*=\s*[^\\n]*globalThis[^\\n]*\\.fetch)" --binary-files=without-match || true)
if [ -n "$wrapper_names" ]; then
  while IFS= read -r name; do
    [ -z "$name" ] && continue
    # find calls to the wrapper name
    wrapper_calls=$(grep -RIn --exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist -E "\b${name}\s*\(" || true)
    if [ -n "$wrapper_calls" ]; then
      matches+="$wrapper_calls\n"
    fi
  done <<< "$wrapper_names"
fi

if [ -z "${matches// /}" ]; then
  echo "No direct client.* or fetch calls found."
  exit 0
fi

violations=0
while IFS= read -r line; do
  [ -z "$line" ] && continue
  file=$(printf '%s' "$line" | cut -d: -f1)
  # Only enforce in the gh-cleanup package; ignore other packages
  if [[ "$file" != packages/gh-cleanup/* ]]; then
    wrapper_calls=$(grep -RIn ${EXCLUDES[@]} -E "\b${name}\s*\(" --binary-files=without-match || true)
    if [[ "$file" == packages/github-rest/src/endpoints/* || "$file" == packages/github-rest/src/core/* ]]; then
      continue
    fi
    if [[ "$file" =~ \.test\.|/__tests__/ ]]; then
      continue
    fi
    continue
  fi
  echo "Violation: $line"
  violations=$((violations+1))
done <<< "$matches"

if [ "$violations" -gt 0 ]; then
  echo "$violations violations found. Direct GitHubClient/fetch calls must be wrapped in packages/github-rest/src/endpoints."
  exit 1
fi

echo "No violations found."
exit 0
