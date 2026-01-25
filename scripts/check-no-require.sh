#!/usr/bin/env bash
set -euo pipefail

# Check for require(...) usage in source files under packages/*/src
EXCLUDES=(--exclude-dir=.git --exclude-dir=node_modules --exclude-dir=dist)

echo "Scanning source files for require(...) usage..."
matches=$(git grep -n -E "require\(" -- 'packages/*/src' || true)
if [ -n "$matches" ]; then
  echo "Found require(...) in source files:";
  echo "$matches";
  exit 1;
fi

echo "No require(...) found in source files."
