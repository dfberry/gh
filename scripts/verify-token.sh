#!/usr/bin/env bash
set -euo pipefail

# Load root .env if present so CI/dev can store token there
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -f "$REPO_ROOT/.env" ]; then
  # shellcheck disable=SC1090
  set -a
  . "$REPO_ROOT/.env"
  set +a
fi

GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
if [ -z "$GH_TOKEN" ]; then
  echo "ERROR: GH_TOKEN or GITHUB_TOKEN is not set. Export it and retry." >&2
  exit 2
fi

# Optional repo argument: owner/repo. If not provided, uses REPO env var.
REPO_ARG="${1:-${REPO:-}}"
if [ -z "$REPO_ARG" ]; then
  echo "No repo provided; only validating token against /user endpoint."
  HTTP_CODE=$(curl -sS -o /dev/null -w "%{http_code}" \
    -H "Authorization: token ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    https://api.github.com/user)
  case "$HTTP_CODE" in
    200)
      echo "OK: GH_TOKEN is valid for authenticated user.";
      exit 0
      ;;
    401)
      echo "INVALID: unauthorized (401) — token is invalid or revoked." >&2
      exit 1
      ;;
    403)
      echo "FORBIDDEN: (403) — token may lack required scopes or is rate-limited." >&2
      exit 3
      ;;
    *)
      echo "ERROR: unexpected response HTTP $HTTP_CODE" >&2
      exit 4
      ;;
  esac
else
  TMP_RESP=$(mktemp)
  HTTP_CODE=$(curl -sS -w "%{http_code}" -o "$TMP_RESP" \
    -H "Authorization: token ${GH_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO_ARG}")
  case "$HTTP_CODE" in
    200)
      echo "OK: repository ${REPO_ARG} accessible.";
      cat "$TMP_RESP";
      rm -f "$TMP_RESP";
      exit 0
      ;;
    401)
      echo "INVALID: unauthorized (401) — token is invalid or revoked." >&2
      rm -f "$TMP_RESP"; exit 1
      ;;
    403)
      echo "FORBIDDEN: (403) — token may lack required scopes or is rate-limited." >&2
      rm -f "$TMP_RESP"; exit 3
      ;;
    404)
      echo "NOT FOUND: repository ${REPO_ARG} (404)." >&2
      rm -f "$TMP_RESP"; exit 4
      ;;
    *)
      echo "ERROR: unexpected response HTTP $HTTP_CODE" >&2
      cat "$TMP_RESP" >&2; rm -f "$TMP_RESP"; exit 5
      ;;
  esac
fi