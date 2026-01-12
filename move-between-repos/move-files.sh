#!/usr/bin/env bash
set -euo pipefail

# move-files.sh - Move files and folders between GitHub repositories
#
# Usage:
#   ./move-files.sh --source owner/repo --target owner/repo --files files.json [options]
#
# Options:
#   --source REPO         Source repository (format: owner/repo)
#   --target REPO         Target repository (format: owner/repo)
#   --files PATH          Path to JSON file with list of files to move
#   --token TOKEN         GitHub token (or use GH_TOKEN env var)
#   --preserve-history    Preserve git history (not implemented)
#   --dry-run             Show what would be done without making changes
#   --help                Show this help message

usage() {
  cat << EOF
Usage: move-files.sh --source owner/repo --target owner/repo --files files.json [options]

Options:
  --source REPO         Source repository (format: owner/repo)
  --target REPO         Target repository (format: owner/repo)
  --files PATH          Path to JSON file with list of files to move
  --token TOKEN         GitHub token (or use GH_TOKEN env var)
  --preserve-history    Preserve git history (experimental)
  --dry-run             Show what would be done without making changes
  --help                Show this help message

Example files JSON format:
  ["path/to/file.txt", "path/to/folder/", "another/file.md"]

Environment variables:
  GH_TOKEN or GITHUB_TOKEN - GitHub personal access token
EOF
}

# Parse arguments
SOURCE_REPO=""
TARGET_REPO=""
FILES_PATH=""
TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}"
PRESERVE_HISTORY=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --source)
      SOURCE_REPO="$2"
      shift 2
      ;;
    --target)
      TARGET_REPO="$2"
      shift 2
      ;;
    --files)
      FILES_PATH="$2"
      shift 2
      ;;
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --preserve-history)
      PRESERVE_HISTORY=true
      shift
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --help)
      usage
      exit 0
      ;;
    *)
      echo "Error: Unknown option $1"
      usage
      exit 1
      ;;
  esac
done

# Validate required arguments
if [[ -z "$SOURCE_REPO" ]]; then
  echo "Error: --source is required"
  usage
  exit 1
fi

if [[ -z "$TARGET_REPO" ]]; then
  echo "Error: --target is required"
  usage
  exit 1
fi

if [[ -z "$FILES_PATH" ]]; then
  echo "Error: --files is required"
  usage
  exit 1
fi

if [[ -z "$TOKEN" ]]; then
  echo "Error: GitHub token is required (use --token or set GH_TOKEN/GITHUB_TOKEN env var)"
  exit 1
fi

if [[ ! -f "$FILES_PATH" ]]; then
  echo "Error: Files list not found: $FILES_PATH"
  exit 1
fi

# Check for jq command
if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed. Please install jq to parse JSON files."
  exit 1
fi

echo "=== Move Files Between Repositories ==="
echo "Source: $SOURCE_REPO"
echo "Target: $TARGET_REPO"
echo "Files list: $FILES_PATH"
echo "Preserve history: $PRESERVE_HISTORY"
echo "Dry run: $DRY_RUN"
echo

# Parse files list from JSON
FILES=$(jq -r '.[] // . | if type == "array" then .[] else . end' "$FILES_PATH" 2>/dev/null || jq -r '.files[]' "$FILES_PATH" 2>/dev/null)

if [[ -z "$FILES" ]]; then
  echo "Error: Could not parse files from $FILES_PATH"
  echo "Expected format: [\"file1\", \"file2\"] or {\"files\": [\"file1\", \"file2\"]}"
  exit 1
fi

echo "Files to move:"
echo "$FILES" | while read -r file; do
  echo "  - $file"
done
echo

if [[ "$DRY_RUN" == "true" ]]; then
  echo "✓ Dry run mode - no changes will be made"
  exit 0
fi

# Create temporary directories
TMP_BASE=$(mktemp -d)
SOURCE_DIR="$TMP_BASE/source"
TARGET_DIR="$TMP_BASE/target"

cleanup() {
  echo
  echo "Cleaning up temporary files..."
  rm -rf "$TMP_BASE"
  echo "✓ Cleanup complete"
}

trap cleanup EXIT

# Clone source repository
echo "Cloning source repository: $SOURCE_REPO..."
SOURCE_URL="https://${TOKEN}@github.com/${SOURCE_REPO}.git"
git clone "$SOURCE_URL" "$SOURCE_DIR" 2>&1 | grep -v "Cloning into" || true
echo "✓ Source repository cloned"

# Verify files exist in source
echo
echo "Verifying files exist in source repository..."
echo "$FILES" | while read -r file; do
  if [[ ! -e "$SOURCE_DIR/$file" ]]; then
    echo "Error: File or folder not found in source: $file"
    exit 1
  fi
  echo "  ✓ $file"
done

# Check if target repository exists
echo
echo "Checking if target repository exists: $TARGET_REPO..."
TARGET_EXISTS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/$TARGET_REPO")

if [[ "$TARGET_EXISTS" != "200" ]]; then
  echo "Target repository does not exist. Creating..."
  
  # Extract owner and repo name
  IFS='/' read -r OWNER REPO_NAME <<< "$TARGET_REPO"
  
  # Determine if owner is user or org
  REPO_URL="https://api.github.com/user/repos"
  
  curl -s -X POST "$REPO_URL" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$REPO_NAME\",\"private\":true,\"auto_init\":false}" > /dev/null
  
  echo "✓ Target repository created"
  sleep 2  # Give GitHub a moment to initialize the repo
else
  echo "✓ Target repository exists"
fi

# Clone or initialize target repository
echo
echo "Preparing target repository..."
TARGET_URL="https://${TOKEN}@github.com/${TARGET_REPO}.git"

if [[ "$TARGET_EXISTS" == "200" ]]; then
  git clone "$TARGET_URL" "$TARGET_DIR" 2>&1 | grep -v "Cloning into" || true
  echo "✓ Target repository cloned"
else
  git init "$TARGET_DIR"
  cd "$TARGET_DIR"
  git remote add origin "$TARGET_URL"
  git checkout -b main
  cd - > /dev/null
  echo "✓ Target repository initialized"
fi

if [[ "$PRESERVE_HISTORY" == "true" ]]; then
  echo
  echo "=== Preserving git history ==="
  echo "Note: Full history preservation requires advanced git operations."
  echo "Current implementation copies files without full history."
  echo "For complete history preservation, consider using git-filter-repo or manual git subtree."
fi

# Copy files to target repository
echo
echo "Copying files to target repository..."
echo "$FILES" | while read -r file; do
  SOURCE_PATH="$SOURCE_DIR/$file"
  TARGET_PATH="$TARGET_DIR/$file"
  
  if [[ -e "$SOURCE_PATH" ]]; then
    # Create parent directory if needed
    mkdir -p "$(dirname "$TARGET_PATH")"
    
    # Copy file or directory
    cp -r "$SOURCE_PATH" "$TARGET_PATH"
    echo "  ✓ Copied: $file"
  fi
done

# Commit and push changes
echo
echo "Committing changes to target repository..."
cd "$TARGET_DIR"
git add .

if git diff --cached --quiet; then
  echo "No changes to commit (files may already exist in target)"
else
  git commit -m "Migrate files from $SOURCE_REPO"
  echo "✓ Changes committed"
  
  echo
  echo "Pushing to target repository..."
  git push -u origin main
  echo "✓ Changes pushed"
fi

echo
echo "✓ Migration completed successfully"
