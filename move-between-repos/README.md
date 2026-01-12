# Move Files Between Repositories

A standalone tool for moving files and folders from one GitHub repository to another. This tool supports both TypeScript/Node.js and BASH implementations.

## Features

- Move individual files or entire folders between repositories
- Automatically create target repository if it doesn't exist
- Support for both public and private repositories
- Dry-run mode to preview changes before execution
- Option to preserve git history (experimental)
- Simple JSON configuration for file lists

## Prerequisites

### For TypeScript version:
- Node.js >= 22
- GitHub personal access token with repo permissions

### For BASH version:
- Bash shell
- Git CLI
- jq (for JSON parsing)
- curl
- GitHub personal access token with repo permissions

## Installation

### TypeScript Version

```bash
cd move-between-repos
npm install
npm run build
```

### BASH Version

No installation needed. The script is ready to use directly.

## Configuration

### GitHub Token

Set your GitHub token as an environment variable:

```bash
export GH_TOKEN="your_github_token_here"
# or
export GITHUB_TOKEN="your_github_token_here"
```

Alternatively, pass it directly using the `--token` flag.

### Files List Format

Create a JSON file listing the files and folders to move:

**Simple array format:**
```json
[
  "README.md",
  "src/utils/helper.ts",
  "docs/",
  "config/settings.json"
]
```

**Object format:**
```json
{
  "files": [
    "README.md",
    "src/utils/helper.ts",
    "docs/",
    "config/settings.json"
  ]
}
```

## Usage

### TypeScript/Node.js Version

**Dry run (preview changes):**
```bash
npm start -- \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json \
  --dry-run
```

**Execute migration:**
```bash
npm start -- \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json
```

**With history preservation (experimental):**
```bash
npm start -- \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json \
  --preserve-history
```

**Using built CLI:**
```bash
node dist/cli.js \
  --source dfberry/old-repo \
  --target dfberry/new-repo \
  --files migrations/files.json
```

### BASH Version

**Dry run:**
```bash
./move-files.sh \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json \
  --dry-run
```

**Execute migration:**
```bash
./move-files.sh \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json
```

**With explicit token:**
```bash
./move-files.sh \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json \
  --token ghp_your_token_here
```

## CLI Options

| Option | Description | Required |
|--------|-------------|----------|
| `--source <repo>` | Source repository (format: `owner/repo`) | Yes |
| `--target <repo>` | Target repository (format: `owner/repo`) | Yes |
| `--files <path>` | Path to JSON file with list of files/folders | Yes |
| `--input <path>` | Alias for `--files` (TypeScript only) | No |
| `--token <token>` | GitHub personal access token | No* |
| `--preserve-history` | Preserve git history (experimental) | No |
| `--dry-run` | Preview changes without executing | No |
| `--help` | Show help message | No |

\* Token is required but can be provided via `GH_TOKEN` or `GITHUB_TOKEN` environment variable

## How It Works

1. **Validation**: Validates input parameters and file list
2. **Clone Source**: Clones the source repository to a temporary directory
3. **Verify Files**: Checks that all specified files/folders exist in source
4. **Prepare Target**: Clones existing target repository or creates new one
5. **Copy Files**: Copies specified files/folders to target repository
6. **Commit & Push**: Commits changes and pushes to target repository
7. **Cleanup**: Removes temporary directories

## Examples

### Example 1: Move documentation files

**files.json:**
```json
[
  "README.md",
  "docs/",
  "LICENSE"
]
```

**Command:**
```bash
npm start -- \
  --source dfberry/old-docs \
  --target dfberry/new-docs \
  --files files.json
```

### Example 2: Move source code modules

**modules.json:**
```json
{
  "files": [
    "src/auth/",
    "src/utils/logger.ts",
    "tests/auth.test.ts"
  ]
}
```

**Command:**
```bash
./move-files.sh \
  --source myorg/monorepo \
  --target myorg/auth-service \
  --files modules.json
```

### Example 3: Dry run before migration

```bash
# Preview what will be moved
npm start -- \
  --source dfberry/source \
  --target dfberry/target \
  --files migration-plan.json \
  --dry-run

# If preview looks good, execute
npm start -- \
  --source dfberry/source \
  --target dfberry/target \
  --files migration-plan.json
```

## Notes and Limitations

### History Preservation

The `--preserve-history` flag is experimental. Full git history preservation is complex and requires:

- Using `git filter-branch` or `git filter-repo`
- Careful handling of file paths and commits
- Potential repository size implications

For production use cases requiring full history, consider using specialized tools like:
- `git filter-repo`
- `git subtree split`
- Manual git operations with history rewriting

### File Paths

- Use forward slashes (`/`) for paths in the JSON file
- Folder paths can end with or without trailing slash
- Paths are relative to repository root

### Repository Creation

When the target repository doesn't exist:
- A new private repository is created
- Repository is initialized with the migrated files
- Main branch is used by default

### Permissions Required

Your GitHub token must have:
- `repo` scope for private repositories
- `public_repo` scope for public repositories
- Create repository permissions if target doesn't exist

### Security Considerations

**Token Handling:**
- Tokens are passed to git commands in URLs for authentication
- This is visible in process lists and git configuration during execution
- Tokens are cleared when temporary directories are removed
- For enhanced security in production environments, consider:
  - Using SSH keys instead of HTTPS with tokens
  - Implementing Git credential helpers
  - Using temporary/scoped tokens with minimal permissions
  - Running in isolated/secure environments

**Best Practices:**
- Use tokens with minimum required scopes
- Rotate tokens after migrations
- Consider using `--dry-run` first to validate
- Review the files list before executing
- Ensure source and target repositories are correct

## Troubleshooting

**Error: "GitHub token is required"**
- Set `GH_TOKEN` or `GITHUB_TOKEN` environment variable
- Or pass token with `--token` flag

**Error: "File or folder not found in source"**
- Verify file paths in your JSON file
- Ensure paths are relative to repository root
- Check for typos in file names

**Error: "Failed to clone repository"**
- Verify repository exists and you have access
- Check that token has correct permissions
- Ensure repository name format is `owner/repo`

**Error: "jq: command not found" (BASH version)**
- Install jq: `sudo apt-get install jq` (Ubuntu/Debian)
- Or use TypeScript version which doesn't require jq

## Development

### Build TypeScript Version

```bash
npm run build
```

### Run Tests

```bash
npm test
```

### Project Structure

```
move-between-repos/
├── src/
│   ├── cli.ts          # CLI entry point
│   └── index.ts        # Core migration logic
├── move-files.sh       # BASH alternative
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

When contributing:
1. Test with dry-run mode first
2. Verify both TypeScript and BASH versions work
3. Update documentation for any changes
4. Test with various file/folder combinations

## License

See the main repository license.

## Support

For issues or questions:
- Check existing GitHub issues
- Review troubleshooting section above
- Create a new issue with details about your use case
