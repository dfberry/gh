# Move Between Repos - Quick Start

This tool allows you to move files and folders from one GitHub repository to another.

## Location

`/move-between-repos/`

## Quick Usage

### TypeScript Version
```bash
cd move-between-repos
npm install
npm run build
npm start -- --source owner/source-repo --target owner/target-repo --files files.json --dry-run
```

### Bash Version
```bash
cd move-between-repos
./move-files.sh --source owner/source-repo --target owner/target-repo --files files.json --dry-run
```

## Files List Format

Create a JSON file with the files/folders to move:
```json
[
  "README.md",
  "src/utils/",
  "docs/"
]
```

## Full Documentation

See [move-between-repos/README.md](move-between-repos/README.md) for complete documentation.
