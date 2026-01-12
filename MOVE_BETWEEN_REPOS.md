# Move Between Repos - Quick Start

A TypeScript tool that moves files and folders from one GitHub repository to another with support for custom destination paths.

## How It Works

This tool automates the process of moving files between GitHub repositories by:

1. **Cloning** the source repository to a temporary directory
2. **Verifying** that all specified files exist in the source
3. **Preparing** the target repository (clones existing or creates new)
4. **Copying** files/folders to the target with optional path remapping
5. **Committing** and pushing changes to the target repository
6. **Cleaning up** temporary directories

### Tools Used

- **Node.js/TypeScript** - Core implementation language
- **Git CLI** - Repository cloning and operations
- **GitHub REST API** - Repository creation and validation
- **Native Node.js fs APIs** - File system operations (secure, no shell injection)

## Prerequisites

**What You Need to Provide:**
- GitHub personal access token with `repo` permissions
- Source repository (must exist and be accessible)
- JSON file listing files to move with optional path mappings
- Node.js >= 20 installed

**What the Tool Provides:**
- Automatic target repository creation (if needed)
- Path remapping capabilities
- Dry-run mode for previewing changes
- Error handling and validation
- Temporary workspace management

## Location

`/move-between-repos/`

## Quick Usage

### Setup
```bash
cd move-between-repos
npm install
npm run build
export GH_TOKEN="your_github_token"
```

### Create Files List

**Simple format (same paths):**
```json
[
  "README.md",
  "src/utils/",
  "docs/"
]
```

**With path remapping:**
```json
[
  "LICENSE",
  { "from": "src/old/", "to": "lib/new/" },
  { "from": "docs/guide.md", "to": "documentation/getting-started.md" }
]
```

### Run Migration

**Preview first (dry run):**
```bash
npm start -- --source owner/source-repo --target owner/target-repo --files files.json --dry-run
```

**Execute migration:**
```bash
npm start -- --source owner/source-repo --target owner/target-repo --files files.json
```

## Common Options

- `--dry-run` - Preview what will be moved without making changes
- `--token <token>` - Provide GitHub token directly (alternative to env var)
- `--preserve-history` - Experimental git history preservation
- `--help` - Show all available options

## Full Documentation

See [move-between-repos/README.md](move-between-repos/README.md) for complete documentation including:
- Detailed token permissions (classic vs fine-grained)
- Advanced file mapping examples
- Troubleshooting guide
- Security considerations
