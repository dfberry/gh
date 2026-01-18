#!/usr/bin/env node
/**
 * CLI for moving files and folders between GitHub repositories
 */

import { moveFilesBetweenRepos } from './index.js';
import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf-8')
);
const version = packageJson.version;

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
  --create-pr           Create a pull request instead of pushing to main
  --pr-branch <name>    Branch name for PR (default: migrate-files)
  --pr-title <title>    PR title (default: auto-generated)
  --pr-body <body>      PR description (default: "Automated file migration")
  --upstream <repo>     Create PR to upstream repo (for forks, format: owner/repo)
  --version             Show version number
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
  'create-pr'?: boolean;
  'pr-branch'?: string;
  'pr-title'?: string;
  'pr-body'?: string;
  upstream?: string;
  help?: boolean;
  version?: boolean;
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
        'create-pr': { type: 'boolean', default: false },
        'pr-branch': { type: 'string' },
        'pr-title': { type: 'string' },
        'pr-body': { type: 'string' },
        upstream: { type: 'string' },
        help: { type: 'boolean', default: false },
        version: { type: 'boolean', default: false },
      },
      allowPositionals: false,
    }) as { values: CliArgs };

    if (values.version) {
      console.log(version);
      process.exit(0);
    }

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
    const createPR = values['create-pr'] || false;
    const prBranch = values['pr-branch'];
    const prTitle = values['pr-title'];
    const prBody = values['pr-body'];
    const upstream = values.upstream;

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
      createPR,
      prBranch,
      prTitle,
      prBody,
      upstream,
    });

    console.log('\n✓ Migration completed successfully');
  } catch (error) {
    console.error('\n✗ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
