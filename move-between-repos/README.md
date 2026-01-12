# Move Files Between Repositories

A standalone TypeScript tool for moving files and folders from one GitHub repository to another with support for custom destination paths.

## Features

- Move individual files or entire folders between repositories
- Specify custom destination paths for each file/folder
- Automatically create target repository if it doesn't exist
- Support for both public and private repositories
- Dry-run mode to preview changes before execution
- Option to preserve git history (experimental)
- Simple JSON configuration for file mappings

## Prerequisites

- Node.js >= 20
- Git CLI installed
- GitHub personal access token with appropriate permissions (see below)

## Installation

```bash
cd move-between-repos
npm install
npm run build
```

## GitHub Token Configuration

### Setting the Token

Set your GitHub token as an environment variable:

```bash
export GH_TOKEN="your_github_token_here"
# or
export GITHUB_TOKEN="your_github_token_here"
```

Alternatively, pass it directly using the `--token` flag.

### Required Permissions

**For Classic Personal Access Tokens:**
- `repo` - Full control of private repositories (includes read/write access)
- `public_repo` - Access to public repositories (if working with public repos only)
- `delete_repo` - Only if you plan to delete repositories (not required for moving files)

**For Fine-grained Personal Access Tokens:**
- **Repository access**: Select the repositories you want to work with
- **Repository permissions**:
  - Contents: Read and write
  - Metadata: Read-only
  - Administration: Read and write (only if creating new repositories)

### Files List Format

The JSON file supports multiple formats for specifying files to move:

**Simple array (files keep same path):**
```json
[
  "README.md",
  "src/utils/helper.ts",
  "docs/",
  "config/settings.json"
]
```

**With custom destination paths:**
```json
[
  "README.md",
  { "from": "src/utils/", "to": "lib/utilities/" },
  { "from": "docs/old-guide.md", "to": "documentation/guide.md" },
  "LICENSE"
]
```

**Object wrapper format:**
```json
{
  "files": [
    "README.md",
    { "from": "src/", "to": "lib/" }
  ]
}
```

**Key points:**
- String entries use the same path in source and target
- Object entries with `from` and `to` allow custom destination paths
- Omitting `to` defaults to the same path as `from`
- Paths are relative to repository root
- Use forward slashes `/` for paths
- Folders can include or omit trailing slash

## Usage

### Basic Usage

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

**With explicit token:**
```bash
npm start -- \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json \
  --token ghp_your_token_here
```

**With history preservation (experimental):**
```bash
npm start -- \
  --source owner/source-repo \
  --target owner/target-repo \
  --files files-list.json \
  --preserve-history
```

**Using built CLI directly:**
```bash
node dist/cli.js \
  --source dfberry/old-repo \
  --target dfberry/new-repo \
  --files migrations/files.json
```

## CLI Options

| Option | Description | Required |
|--------|-------------|----------|
| `--source <repo>` | Source repository (format: `owner/repo`) | Yes |
| `--target <repo>` | Target repository (format: `owner/repo`) | Yes |
| `--files <path>` | Path to JSON file with list of files/folders | Yes |
| `--input <path>` | Alias for `--files` | No |
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

### Example 2: Move and reorganize source code

**modules.json:**
```json
{
  "files": [
    { "from": "src/auth/", "to": "lib/authentication/" },
    { "from": "src/utils/logger.ts", "to": "lib/logging/logger.ts" },
    { "from": "tests/auth.test.ts", "to": "test/authentication.test.ts" }
  ]
}
```

**Command:**
```bash
npm start -- \
  --source myorg/monorepo \
  --target myorg/auth-service \
  --files modules.json
```

### Example 3: Mix of same-path and custom-path moves

**migration.json:**
```json
[
  "LICENSE",
  "README.md",
  { "from": "old-docs/", "to": "documentation/" },
  { "from": "src/legacy/", "to": "lib/" }
]
```

**Command:**
```bash
npm start -- \
  --source dfberry/old-project \
  --target dfberry/new-project \
  --files migration.json \
  --dry-run
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

**Error: Invalid file entry**
- Check JSON syntax in your files list
- Ensure objects have a `from` property
- Use proper JSON format with quotes around strings

## Development

### Build

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
│   ├── cli.ts          # CLI entry point and argument parsing
│   └── index.ts        # Core migration logic
├── example-files.json  # Example file mappings
├── package.json
├── tsconfig.json
└── README.md
```

## Contributing

When contributing:
1. Test with dry-run mode first
2. Update documentation for any changes
3. Test with various file/folder combinations and path mappings
4. Ensure TypeScript builds without errors

## License

See the main repository license.

## Support

For issues or questions:
- Check existing GitHub issues
- Review troubleshooting section above
- Create a new issue with details about your use case
