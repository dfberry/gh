#!/usr/bin/env bash
set -euo pipefail

# Configure git global identity if environment variables are provided
if [ -n "${GIT_COMMITTER_NAME:-}" ] && [ -n "${GIT_COMMITTER_EMAIL:-}" ]; then
  git config --global user.name "$GIT_COMMITTER_NAME" || true
  git config --global user.email "$GIT_COMMITTER_EMAIL" || true
  # Also write repository-local config (used when git is run with
  # user.useConfigOnly=true and ignores global config). This keeps the
  # identity available for commits created inside the workspace.
  if [ -d "/workspace/.git" ]; then
    git -C /workspace config user.name "$GIT_COMMITTER_NAME" || true
    git -C /workspace config user.email "$GIT_COMMITTER_EMAIL" || true
  fi
fi

# Install TypeScript CLI globally if npm is available
if command -v npm >/dev/null 2>&1; then
  npm install -g typescript
fi

# Ensure project scripts are executable if present
if [ -d "/workspace/scripts" ]; then
  chmod +x /workspace/scripts/* 2>/dev/null || true
fi

# Make workspace files owned by vscode where possible; ignore failures when mounted from host
sudo chown -R vscode:vscode /workspace 2>/dev/null || true

echo "post-create tasks finished"
