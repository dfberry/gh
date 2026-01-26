#!/usr/bin/env bash
set -euo pipefail

# unset GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL

# export GIT_COMMITTER_NAME="dfberry"
# export GIT_COMMITTER_EMAIL="dinaberry@outlook.com"

# grep -Hn 'GIT_COMMITTER_NAME\|GIT_COMMITTER_EMAIL\|GIT_AUTHOR_NAME\|GIT_AUTHOR_EMAIL' ~/.bashrc ~/.profile ~/.zshrc 2>/dev/null
# # If matches look correct, delete those lines:
# sed -i '/GIT_COMMITTER_NAME/d; /GIT_COMMITTER_EMAIL/d; /GIT_AUTHOR_NAME/d; /GIT_AUTHOR_EMAIL/d' ~/.bashrc ~/.profile ~/.zshrc 2>/dev/null

# If vars are set but empty, unset them so they don't override git
# if [ "${GIT_COMMITTER_NAME+set}" = "set" ] && [ -z "${GIT_COMMITTER_NAME:-}" ]; then
#   unset GIT_COMMITTER_NAME GIT_COMMITTER_EMAIL GIT_AUTHOR_NAME GIT_AUTHOR_EMAIL || true
# fi

# # Configure git global identity if environment variables are provided
# if [ -n "${GIT_COMMITTER_NAME:-}" ] && [ -n "${GIT_COMMITTER_EMAIL:-}" ]; then
#   git config --global user.name "$GIT_COMMITTER_NAME" || true
#   git config --global user.email "$GIT_COMMITTER_EMAIL" || true
#   if [ -d "/workspace/.git" ]; then
#     git -C /workspace config user.name "$GIT_COMMITTER_NAME" || true
#     git -C /workspace config user.email "$GIT_COMMITTER_EMAIL" || true
#   fi
# fi

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
