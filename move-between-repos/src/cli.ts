#!/usr/bin/env node
/**
 * CLI for moving files and folders between GitHub repositories
 */

import { moveFilesBetweenRepos } from './index.js';
import { parseArgs } from 'node:util';

const usage = `
Usage: move-between-repos --source <repo> --target <repo> --files <path> [options]

Options:
  --source <repo>       Source repository (format: owner/repo)
  --target <repo>       Target repository (format: owner/repo)
  --files <path>        Path to JSON file with list of files/folders to move
  --input <path>        Alias for --files
  --token <token>       GitHub token (or use GH_TOKEN env var)
  --preserve-history    Preserve git history (default: false)
  --dry-run             Show what would be done without making changes
  --help                Show this help message

Files JSON format examples:
  ["file.txt", "folder/"]
  [{"from": "src/", "to": "lib/"}, "README.md"]

Environment variables:
  GH_TOKEN or GITHUB_TOKEN - GitHub personal access token
`;

interface CliArgs {
  source?: string;
  target?: string;
  files?: string;
  input?: string;
  token?: string;
  'preserve-history'?: boolean;
  'dry-run'?: boolean;
  help?: boolean;
}

async function main() {
  try {
    const { values } = parseArgs({
      options: {
        source: { type: 'string' },
        target: { type: 'string' },
        files: { type: 'string' },
        input: { type: 'string' },
        token: { type: 'string' },
        'preserve-history': { type: 'boolean', default: false },
        'dry-run': { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    }) as { values: CliArgs };

    if (values.help) {
      console.log(usage);
      process.exit(0);
    }

    const source = values.source;
    const target = values.target;
    const filesPath = values.files || values.input;
    const token = values.token || process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const preserveHistory = values['preserve-history'] || false;
    const dryRun = values['dry-run'] || false;

    if (!source) {
      console.error('Error: --source is required');
      console.log(usage);
      process.exit(1);
    }

    if (!target) {
      console.error('Error: --target is required');
      console.log(usage);
      process.exit(1);
    }

    if (!filesPath) {
      console.error('Error: --files or --input is required');
      console.log(usage);
      process.exit(1);
    }

    if (!token) {
      console.error('Error: GitHub token is required (use --token or set GH_TOKEN/GITHUB_TOKEN env var)');
      process.exit(1);
    }

    await moveFilesBetweenRepos({
      source,
      target,
      filesPath,
      token,
      preserveHistory,
      dryRun,
    });

    console.log('\n✓ Migration completed successfully');
  } catch (error) {
    console.error('\n✗ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
