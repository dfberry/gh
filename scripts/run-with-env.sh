#!/usr/bin/env bash
set -euo pipefail

# Source repo root .env if present and export variables, then exec the given command.
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$REPO_ROOT/.env"
  set +a
fi

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 2
fi

exec "$@"
