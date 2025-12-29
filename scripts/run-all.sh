#!/usr/bin/env bash
set -euo pipefail

# Root runner for repository-cleanup tasks. By default this performs safe dry-runs
# and writes outputs to `generated/`. Pass `--apply` to perform destructive actions
# (deletions/archiving) — use with caution.

ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
OUT_DIR="$ROOT_DIR/generated"
mkdir -p "$OUT_DIR"

APPLY=false
for arg in "$@"; do
  case "$arg" in
    --apply) APPLY=true ;;
    --help|-h) echo "Usage: run-all.sh [--apply]"; exit 0 ;;
    *) ;;
  esac
done

echo "Running repository-cleanup pipeline (apply=$APPLY)" >&2
TS=$(date -u +"%Y-%m-%dT%H%M%SZ")

# Load a root .env file if present (export KEY=VALUE lines, ignore comments)
if [ -f "$ROOT_DIR/.env" ]; then
  echo "Loading environment from $ROOT_DIR/.env" >&2
  # shellcheck disable=SC1090
  while IFS= read -r line || [ -n "$line" ]; do
    # strip leading/trailing whitespace
    line=$(printf "%s" "$line" | sed -e 's/^\s*//' -e 's/\s*$//')
    [ -z "$line" ] && continue
    case "$line" in
      \#*) continue ;;
    esac
    key=${line%%=*}
    val=${line#*=}
    # remove surrounding quotes if present
    val=$(printf "%s" "$val" | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")
    export "$key"="$val"
  done < "$ROOT_DIR/.env"
fi

# Ensure GH_TOKEN available warning
if [ -z "${GH_TOKEN:-}" ]; then
  echo "Warning: GH_TOKEN is not set. Interactive or CI runs may fail without it." >&2
fi
if [ -z "${GH_USER:-}" ]; then
  echo "Warning: GH_USER is not set. Some outputs may lack actor context." >&2
fi

run_cmd(){
  echo "\n==> $*" >&2
  eval "$*"
}

# 1) Initial summary run (produces active list and initial summary)
run_cmd "npm run start -w gh-cleanup -- summary --output=md --out=\"$OUT_DIR/initial-active.md\" --summary-out=\"$OUT_DIR/initial-summary.md\""

# 2) Categorize repos (fetch languages + README) -> catalog.md
run_cmd "npm run start -w gh-cleanup -- categorize-repos --fetch --output=md --out=\"$OUT_DIR/catalog.md\""

# 3) Find empty repos (dry-run to JSON)
if [ "$APPLY" = true ]; then
  run_cmd "npm run start -w gh-cleanup -- delete-empty-repos --yes --out=\"$OUT_DIR/delete-empty.json\""
else
  run_cmd "npm run start -w gh-cleanup -- delete-empty-repos --out=\"$OUT_DIR/delete-empty.json\""
fi

# 4) Remove forks (dry-run unless --apply)
if [ "$APPLY" = true ]; then
  run_cmd "npm run start -w gh-cleanup -- remove-forks --yes --out=\"$OUT_DIR/remove-forks.json\""
else
  run_cmd "npm run start -w gh-cleanup -- remove-forks --out=\"$OUT_DIR/remove-forks.json\""
fi

# 5) Archive stale repos (dry-run unless --apply)
if [ "$APPLY" = true ]; then
  run_cmd "npm run start -w gh-cleanup -- archive-stale-repos --yes --out=\"$OUT_DIR/stale.json\""
else
  run_cmd "npm run start -w gh-cleanup -- archive-stale-repos --out=\"$OUT_DIR/stale.json\""
fi

run_cmd "npm run start -w gh-cleanup -- summary --output=json --out=\"$OUT_DIR/active.json\""


# 6) Final log of activity
# 5b) Final summary run after all operations (refresh active list + summary)
run_cmd "npm run start -w gh-cleanup -- summary --output=md --out=\"$OUT_DIR/summary-active.md\" --summary-out=\"$OUT_DIR/summary-report.md\""

echo "\nPipeline finished at: $(date -u --iso-8601=seconds)" >&2
echo "Generated outputs:" >&2
ls -lah "$OUT_DIR" || true

echo "Summary (files and sizes):" >&2
find "$OUT_DIR" -maxdepth 1 -type f -printf "%s bytes\t%p\n" | sort -nr | awk '{printf "%10s %s\n", $1, $2}'

echo "\nTo push generated files to a site repo, see .github/workflows/update-site.yml and set secrets TARGET_REPO and TARGET_REPO_TOKEN." >&2

exit 0
