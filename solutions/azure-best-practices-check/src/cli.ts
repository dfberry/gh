#!/usr/bin/env node

/**
 * CLI entry point for azure-best-practices-check.
 *
 * Usage: azure-best-practices-check [--input <repos.json>] [--out <dir>]
 *        [--format json|markdown|both] [--verbose] [--dry-run]
 *
 * Environment Variables:
 *   GITHUB_TOKEN - Required (primary)
 *   GH_TOKEN     - Fallback if GITHUB_TOKEN not set
 */

import { checkReposBestPractices, generateMarkdownReport } from './index.js';
import type { PipelineError } from './types.js';
import { GitHubClient } from 'github-rest';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const DEFAULT_OUTPUT_DIR = 'generated/azure-best-practices';

export interface CliArgs {
  input?: string;
  out?: string;
  format?: 'json' | 'markdown' | 'both';
  verbose?: boolean;
  dryRun?: boolean;
}

/** Parse process.argv-style arguments */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    switch (flag) {
      case '--input':
        args.input = argv[++i];
        break;
      case '--out':
        args.out = argv[++i];
        break;
      case '--format': {
        const f = argv[++i];
        if (f === 'json' || f === 'markdown' || f === 'both') {
          args.format = f;
        } else {
          console.error(`Error: Invalid format "${f}". Must be json, markdown, or both.`);
          process.exit(1);
        }
        break;
      }
      case '--verbose':
        args.verbose = true;
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        // Handle --key=value style
        if (flag.startsWith('--input=')) {
          args.input = flag.slice('--input='.length);
        } else if (flag.startsWith('--out=')) {
          args.out = flag.slice('--out='.length);
        } else if (flag.startsWith('--format=')) {
          const f = flag.slice('--format='.length);
          if (f === 'json' || f === 'markdown' || f === 'both') {
            args.format = f;
          } else {
            console.error(`Error: Invalid format "${f}". Must be json, markdown, or both.`);
            process.exit(1);
          }
        } else {
          console.error(`Error: Unknown argument "${flag}"`);
          printUsage();
          process.exit(1);
        }
        break;
    }
  }

  return args;
}

function formatErrorLog(solutionName: string, errors: PipelineError[]): string {
  let output = `Pipeline Error Log — ${solutionName}\n`;
  output += `Generated: ${new Date().toISOString()}\n\n`;
  for (const err of errors) {
    const tag = err.category.toUpperCase();
    output += `[${tag}] ${err.repo}\n`;
    output += `  Error: ${err.message}\n`;
    output += `  Fix: ${err.suggestion}\n\n`;
  }
  return output;
}

/** Run the CLI with parsed arguments */
export async function runCli(args: CliArgs): Promise<void> {
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    console.error('Error: GITHUB_TOKEN or GH_TOKEN environment variable is required');
    console.error('Set it in your .env file or export it in your shell');
    process.exit(1);
  }

  const inputPath = args.input ?? 'active-sample-repos.json';
  const outputDir = args.out ?? DEFAULT_OUTPUT_DIR;
  const format = args.format ?? 'both';
  const verbose = args.verbose ?? false;

  try {
    if (verbose) console.log(`Reading repositories from: ${inputPath}`);

    const inputContent = await readFile(inputPath, 'utf-8');
    const repos = JSON.parse(inputContent);

    if (!Array.isArray(repos)) {
      console.error('Error: Input file must contain a JSON array of repository names');
      process.exit(1);
    }

    if (repos.length === 0) {
      console.error('Error: Input file contains no repositories');
      process.exit(1);
    }

    if (args.dryRun) {
      console.log(`\n🔍 Azure Best Practices Check (DRY RUN) for ${repos.length} repositories`);
      console.log(`Would check: ${repos.join(', ')}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(`Format: ${format}`);
      return;
    }

    console.log(`\n🔍 Azure Best Practices Check for ${repos.length} repositories`);
    console.log(`Output: ${outputDir}`);
    console.log(`Format: ${format}\n`);

    // Ensure output directory exists
    await mkdir(outputDir, { recursive: true });

    // Clean up previous error log
    const errorLogPath = join(outputDir, 'azure-best-practices-errors.log');
    try {
      await unlink(errorLogPath);
    } catch {
      // File doesn't exist — that's fine
    }

    const client = new GitHubClient({ token });
    const report = await checkReposBestPractices(client, repos, { verbose });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Write JSON
    if (format === 'json' || format === 'both') {
      const jsonPath = join(outputDir, `${timestamp}-azure-bp.json`);
      await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
      console.log(`\n✓ JSON report written to: ${resolve(jsonPath)}`);
    }

    // Write Markdown
    if (format === 'markdown' || format === 'both') {
      const mdPath = join(outputDir, `${timestamp}-azure-bp.md`);
      const markdown = generateMarkdownReport(report);
      await writeFile(mdPath, markdown, 'utf-8');
      console.log(`✓ Markdown summary written to: ${resolve(mdPath)}`);
    }

    // Console summary
    console.log('\n' + '='.repeat(60));
    console.log('AZURE BEST PRACTICES SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total Repositories:    ${report.summary.totalRepos}`);
    console.log(`Average Score:         ${report.summary.avgScore}/100 (${report.summary.avgGrade})`);
    console.log(`Weakest Dimension:     ${report.summary.worstDimension}`);
    console.log(`Critical Findings:     ${report.summary.criticalFindings}`);
    console.log('='.repeat(60) + '\n');

    // Highlight repos needing attention
    const struggling = report.repos
      .filter(r => r.score < 55)
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);

    if (struggling.length > 0) {
      console.log('⚠️  ATTENTION NEEDED (lowest scores):');
      for (const r of struggling) {
        console.log(`   ${r.owner}/${r.repo}: ${r.score}/100 (${r.grade})`);
      }
      console.log('');
    }

    // Write error log if any repos failed
    if (report.errors && report.errors.length > 0) {
      await writeFile(errorLogPath, formatErrorLog('azure-best-practices-check', report.errors), 'utf-8');
      console.log(`⚠️ ${report.errors.length} error(s) logged — see ${errorLogPath}`);
    }
  } catch (error) {
    if (error instanceof Error) {
      console.error(`\nError: ${error.message}`);

      if (error.message.includes('ENOENT')) {
        console.error('\nFile not found. Check that the input file path is correct.');
      } else if (error.message.includes('JSON')) {
        console.error('\nInvalid JSON format. Check that the input file is properly formatted.');
      } else if (error.message.includes('401')) {
        console.error('\nAuthentication failed. Check that your GITHUB_TOKEN is valid.');
      } else if (error.message.includes('403')) {
        console.error('\nAccess forbidden. Check that your GITHUB_TOKEN has required permissions.');
      }

      if (verbose && error.stack) {
        console.error('\nStack trace:');
        console.error(error.stack);
      }
    } else {
      console.error('\nUnexpected error:', error);
    }

    process.exit(2);
  }
}

function printUsage() {
  console.log(`
Azure Best Practices Check for GitHub Repositories

Usage: azure-best-practices-check [options]

Options:
  --input <path>   Path to JSON file with repo names (default: active-sample-repos.json)
  --out <path>     Output directory (default: generated/azure-best-practices)
  --format <type>  Output format: json, markdown, or both (default: both)
  --verbose        Enable verbose logging
  --dry-run        Show what would be checked without making API calls
  --help, -h       Show this help message

Environment Variables:
  GITHUB_TOKEN     Required: GitHub personal access token (primary)
  GH_TOKEN         Fallback if GITHUB_TOKEN is not set

Example:
  azure-best-practices-check --input repos.json --out reports --format both --verbose

Dimensions (100 points total):
  Azure SDK Usage        (25 pts) — @azure/identity, modern SDKs, deprecated packages
  Infrastructure as Code (25 pts) — Bicep/Terraform presence, secrets, parameterization
  CI/CD Patterns         (20 pts) — Federated auth, hardcoded creds, action versions
  Configuration          (15 pts) — azure.yaml, .env.example, SECURITY.md
  Security Patterns      (15 pts) — Connection strings, managed identity docs

Grades: A (85-100), B (70-84), C (55-69), D (40-54), F (0-39)

Output:
  Generates timestamped files:
  - {timestamp}-azure-bp.json    (structured report data)
  - {timestamp}-azure-bp.md      (human-readable summary)
`);
}

// Run the CLI when executed directly (not imported by tests)
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  runCli(args).catch((err) => {
    console.error(err.message ?? err);
    process.exit(1);
  });
}
