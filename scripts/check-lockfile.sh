#!/usr/bin/env bash
set -eu

echo "Checking package-lock.json is up to date..."

npm --version

# Save committed lockfile
if git show HEAD:package-lock.json > package-lock.committed.json 2>/dev/null; then
  echo "Saved committed lockfile"
else
  echo "No committed package-lock.json found; continuing check against empty baseline"
  echo '{}' > package-lock.committed.json
fi

# Generate the lockfile only
npm install --package-lock-only --ignore-scripts --no-audit --no-fund

node ./scripts/compare-lockfiles.js package-lock.committed.json package-lock.json || (
  echo "ERROR: package-lock.json is out of sync with package.json or workspace packages (ignoring harmless metadata)."
  echo "Run 'npm install' at the repository root and commit the updated package-lock.json."
  echo "Sanitized lockfile differences written to package-lock.sanitized.*.json"
  exit 1
)
